/**
 * The plan detector (docs/plans-carriage.md § 1): a session plan is ONE thing in the
 * durable log — a `tool/call` for `exit_plan_mode` whose `arguments.plan` carries the
 * complete markdown, answered by a `tool/result` that carries the human verdict.
 * There is no plan document event and no plan store: reading those two events is the
 * whole job, and it must be read identically by the renderer, the segmentation tool
 * and the notice builder.
 *
 * Host facts this mirrors, cited so an upgrade can re-verify them:
 * - parameters `{ plan: string, required }` — `@deepseek-ai/dsh-plan-mode`
 *   `lib/index.js:232-236`; the plan must start with a `#` heading (`:256`).
 * - an approved review returns the canonical `{ approved: true }` plus the fixed
 *   render text (`:237-251`).
 * - "Keep planning" throws carrying the feedback; a dismissed review throws naming
 *   the takeover (`:277-289`).
 * - state is a log-only `plan/mode { active }` event appended at the NEXT accepted
 *   in-turn pre-step (`:374, 389`), so the RESULT — not the mode event — is the
 *   primary verdict. An approved exit narrates silently (`pendingIntents narrate:false`),
 *   so the mode event may not exist at all by archive time.
 * - a freshly created agent begins with plan mode INACTIVE and cannot inherit the
 *   parent's `plan/mode` events (package README § Known Limitations), which is why the
 *   notice has to carry this text at all.
 *
 * Verdict classes, and why `failed` exists: the host also throws when the review never
 * opened (no user-questions channel, the service reloaded mid-review, the call ran
 * outside plan mode, the markdown had no heading). Those carry NO human verdict, so
 * labelling them `rejected` would invent one. (`docs/plans-carriage.md` § 1 amendment,
 * 2026-10-09: `failed` is the fifth status; the record's four were the ones a human
 * answered.)
 *
 * Pure module: no cordis, no fs, no DSH imports, no hash/token helpers (the renderer
 * owns those, so this file cannot form an import cycle with it).
 */
import type { NoticePlan, PlanFact, PlanStatus, SessionEventLike } from './types.ts'
import { callArg, callArgsText, lastResultFor, resultCallId, toolResultIsError, toolResultText } from './log-shape.ts'
import { stripReminderSpans } from './injections.ts'

export const PLAN_TOOL = 'exit_plan_mode'

/**
 * Why a child exists. `continue` extends the SAME stream of work (the tool
 * `chapters_continue`), so the operative plan stays a live directive — and plan mode
 * can be seeded so the gate survives the boundary, which is what keeps the agent
 * anchored to the task across compactions (decision 2026-10-10). `branch` splits a
 * NEW direction off the history (`chapters_fork`, `/chapters-fork`), so plans are
 * history: cited, never re-asserted, never seeded.
 */
export type PlanIntent = 'continue' | 'branch'
export const PLAN_MODE_EVENT = 'plan/mode'

export type { NoticePlan, PlanFact, PlanStatus }

/** A plan as the log states it. Never model-authored (invariant 4). */
export interface PlanDoc {
  /** The `tool/call` event seq — the plan's identity in the log. */
  seq: number
  /** The verdict result seq, or null when the review was never answered. */
  resultSeq: number | null
  callId: string
  /** First heading of the plan (the host requires an H1; any level is accepted). */
  title: string
  status: PlanStatus
  /** The plan markdown, injected spans screened out. Full bytes — never clipped here. */
  text: string
  bytes: number
  /** H2/H3 outline, in document order, fenced code excluded. */
  outline: string[]
  /** The verdict text as logged (feedback, dismissal reason, service fault), or null. */
  verdict: string | null
  /** False when `seq` is above the archive ceiling: an unfinished turn, parent log only. */
  archived: boolean
}

export interface ModeFlip { seq: number; active: boolean }

export interface PlanScan {
  plans: PlanDoc[]
  /** Every `plan/mode` event in the scanned range, oldest first. */
  flips: ModeFlip[]
  /** Last logged value wins (the host projection rule). Null when no event exists. */
  modeActive: boolean | null
}

const RE_APPROVED = /(?:\{\s*"?approved"?\s*:\s*true)|(?:plan approved\b)/i
const RE_DISMISSED = /dismissed the plan review|to speak instead/i
const RE_KEEP_PLANNING = /keep planning/i

/**
 * The first markdown heading at any level, or '' when the payload has none. The
 * DISPLAY title is bounded: a plan whose H1 is a 4KB paragraph would otherwise be
 * printed in full in every chapter that carries it and again in every child notice
 * built from that path. Bounded here, not at the call sites — and the artifact keeps
 * the untouched heading, because the artifact keeps every byte.
 */
export const PLAN_TITLE_MAX = 120

export function planTitleOf(text: string): string {
  for (const line of text.split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (m === null) continue
    const title = m[1]!.replace(/\s+#+\s*$/, '') // closed ATX heading: "# Title #"
    return title.length > PLAN_TITLE_MAX ? `${title.slice(0, PLAN_TITLE_MAX - 1).trimEnd()}…` : title
  }
  return ''
}

/** Outline budget: entries × chars. An outline is an INDEX, not the document — the
 * full heading map with line numbers is one `chapters_artifact toc` call away, so
 * printing 24 unbounded headings per plan (a 4 KB H2 is a real thing people write)
 * would repeat the 0.1.8 mistake at a smaller scale. */
export const PLAN_OUTLINE_MAX_ENTRIES = 12
export const PLAN_OUTLINE_TITLE_MAX = 60

/**
 * The plan's own table of contents: H2/H3 headings in document order, with fenced
 * blocks excluded so a `# comment` inside a code sample never poses as a heading
 * (the same discipline `artifact-query.buildToc` applies to stored blobs). Each
 * entry is bounded; when entries are dropped a trailing `+N more` says so — a
 * silently shortened index is the lie this codebase exists to avoid.
 */
export function planOutlineOf(text: string, maxEntries = PLAN_OUTLINE_MAX_ENTRIES): { outline: string[]; levels: number[] } {
  const outline: string[] = []
  const levels: number[] = []
  let truncated = false
  let inFence = false
  let fenceChar = ''
  for (const line of text.split('\n')) {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.test(line)
    if (fence) {
      const marker = line.trim().slice(0, 3)
      if (!inFence) { inFence = true; fenceChar = marker[0] as string }
      else if (marker[0] === fenceChar) inFence = false
      continue
    }
    if (inFence) continue
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (m === null) continue
    if (outline.length >= maxEntries) { truncated = true; break }
    const heading = m[2]!.replace(/\s+#+\s*$/, '')
    outline.push(heading.length > PLAN_OUTLINE_TITLE_MAX ? `${heading.slice(0, PLAN_OUTLINE_TITLE_MAX - 1).trimEnd()}…` : heading)
    levels.push(m[1]!.length)
  }
  if (truncated) outline.push(`+more (chapters_artifact 'toc' lists every heading)` )
  return { outline, levels }
}

/**
 * One verdict, from the result the host logged. Order matters: a dismissed or
 * keep-planning failure text can contain the word "approved" only as a quote, so
 * the non-approval shapes are tested before the approval shape, and `isError`
 * decides when the prose is ambiguous.
 */
export function classifyVerdict(resultText: string, isError: boolean): PlanStatus {
  if (RE_DISMISSED.test(resultText)) return 'dismissed'
  if (RE_KEEP_PLANNING.test(resultText)) return 'rejected'
  if (!isError && RE_APPROVED.test(resultText)) return 'approved'
  if (isError) return 'failed'
  // A success that says nothing recognizable is NOT an approval: refuse to invent one.
  return 'failed'
}

/** Plan submissions paired with their verdicts, in log order, over ANY event list. */
export function detectPlans(
  events: readonly SessionEventLike[],
  opts: { ceiling?: number } = {},
): PlanScan {
  const ceiling = opts.ceiling ?? Number.POSITIVE_INFINITY
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const results = sorted.filter((e) => e.type === 'tool/result')

  const plans: PlanDoc[] = []
  for (const call of sorted) {
    if (call.type !== 'tool/call') continue
    const data = (call.data ?? {}) as Record<string, unknown>
    if (String(data.name ?? '') !== PLAN_TOOL) continue
    const callId = typeof data.callId === 'string' ? data.callId : ''
    const raw = callArg(data, 'plan') ?? callArgsText(data)
    // Screened at the source (a plan is model-authored bytes, but an injected span
    // riding inside it is host state — same reasoning as injections.ts:62-70).
    const text = stripReminderSpans(raw).text.trim()
    const answer = callId === '' ? undefined : lastResultFor(results, callId)
    let status: PlanStatus = 'pending'
    let verdict: string | null = null
    let resultSeq: number | null = null
    if (answer !== undefined) {
      resultSeq = answer.seq
      const ad = (answer.data ?? {}) as Record<string, unknown>
      verdict = stripReminderSpans(toolResultText(ad)).text.trim() || null
      status = classifyVerdict(verdict ?? '', toolResultIsError(ad))
    }
    const { outline } = planOutlineOf(text)
    plans.push({
      seq: call.seq,
      resultSeq,
      callId,
      title: planTitleOf(text),
      status,
      text,
      bytes: Buffer.byteLength(text, 'utf8'),
      outline,
      verdict,
      archived: call.seq <= ceiling,
    })
  }

  // Same-title re-submission: the newest is operative; everything earlier in the
  // group is superseded, whatever its own verdict was. Deterministic, no judgement.
  const byTitle = new Map<string, PlanDoc[]>()
  for (const p of plans) {
    const key = p.title.trim().toLowerCase()
    if (key === '') continue
    const group = byTitle.get(key) ?? []
    group.push(p)
    byTitle.set(key, group)
  }
  for (const group of byTitle.values()) {
    if (group.length < 2) continue
    for (const earlier of group.slice(0, -1)) earlier.status = 'superseded'
  }

  const flips: ModeFlip[] = []
  for (const ev of sorted) {
    if (ev.type !== PLAN_MODE_EVENT) continue
    const active = (ev.data as { active?: unknown } | undefined)?.active
    if (typeof active === 'boolean') flips.push({ seq: ev.seq, active })
  }
  return { plans, flips, modeActive: flips.length > 0 ? flips[flips.length - 1]!.active : null }
}

/** True when the range carries at least one plan submission (composer split test). */
export function planCallSeqs(events: readonly SessionEventLike[]): number[] {
  return detectPlans(events).plans.map((p) => p.seq)
}

/**
 * `PlanFact` (the chapter/registry machine facts) and `NoticePlan` (the flat notice
 * row) are declared in types.ts and re-exported above, so the renderer, the zod
 * schema and the notice builder cannot drift into three shapes.
 */
const STATUS_WORD: Record<PlanStatus, string> = {
  approved: 'APPROVED',
  rejected: 'REJECTED — the user sent it back with feedback',
  dismissed: 'DISMISSED — the user took over the conversation',
  pending: 'PENDING — the review was never answered',
  superseded: 'SUPERSEDED by a later submission',
  failed: 'NOT ACCEPTED — the review could not be opened',
}

const shorterSha = (sha: string): string => sha.slice(0, 7)

/**
 * The `## Plans` block of the continuation notice (docs/plans-carriage.md § 4).
 * EMPTY when the path holds no plans, so a session that never planned contributes
 * zero injected bytes — the property that keeps the model tapes matching.
 *
 * Flat, in the CAUSAL order the caller supplies (never re-sorted by `seq` — different
 * sessions own different seq spaces): the model never traverses.
 * `estTokens` arrives only from the caller's own measurement — this file owns no
 * token maths, so the notice can never disagree with the budget gate.
 */
export function buildPlansSection(
  plans: readonly NoticePlan[],
  opts: { modeActive?: boolean | null; intent?: PlanIntent; seeded?: boolean } = {},
): string {
  if (plans.length === 0) return ''
  // A BRANCH splits off a new direction, so its plans are history: they already sit
  // in the chapters the TOC cites, and a call-out would tell the child to keep
  // working a directive it just chose to leave behind (decision, 2026-10-10).
  if (opts.intent === 'branch') return ''
  // CAUSAL order is the caller's, not something this function can reconstruct: an
  // ancestor path's rows come from DIFFERENT sessions, each with its own seq space
  // (a child's seq 3 is not "before" a root's seq 40). The notice builder therefore
  // hands rows in reading order — chapters root-first, plans within a chapter by
  // seq, then the caller's unarchived tail — which is exactly the flattening rule
  // the chapter list follows. Sorting by seq here would order two sessions' plans
  // by unrelated counters and crown the wrong plan operative.
  const sorted = [...plans]
  const operative = sorted[sorted.length - 1]!
  const counts = new Map<PlanStatus, number>()
  for (const p of sorted) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)
  const tally = [...counts.entries()].map(([s, n]) => `${n} ${s}`).join(', ')
  const previous = sorted.slice(0, -1)
  const lines: string[] = [
    `## Active plan`,
    `(this continuation keeps the same stream of work: ${sorted.length} plan(s) submitted on the path — ${tally})`,
    '',
  ]
  const ref = (p: NoticePlan): string => {
    const bits: string[] = []
    if (p.chapterPath !== undefined) {
      bits.push(`ch. ${p.chapterNumber ?? '?'} ${p.chapterPath}`)
    } else {
      bits.push(`NOT ARCHIVED — parent log seq ${p.seq} only`)
    }
    if (p.artifactPath !== undefined) bits.push(`full text: ${p.artifactPath}`)
    if (p.docPath !== undefined) bits.push(`plan document: ${p.docPath}`)
    if (p.sha256 !== undefined) bits.push(`sha ${shorterSha(p.sha256)}…`)
    if (p.estTokens !== undefined) bits.push(`~${p.estTokens} tok`)
    return bits.join(' · ')
  }
  lines.push(`- ACTIVE PLAN: "${operative.title}" — ${STATUS_WORD[operative.status]} (${ref(operative)})`)
  if (operative.status !== 'approved') {
    lines.push('  This plan was never approved: do NOT implement it. Ask the user, or keep planning.')
  } else {
    lines.push('  Read the full text with chapters_artifact (toc | search | read) before implementing.')
    lines.push('  Do NOT re-plan from recall: the bytes are in the store.')
  }
  if (previous.length > 0) {
    lines.push('', '## Previous plans on this path', '(history — cited for evolution and status, not directives)')
    for (const p of previous) {
      if (p.status === 'superseded' && p.title === operative.title) continue
      lines.push(`- "${p.title}" — ${STATUS_WORD[p.status]} (${ref(p)})`)
    }
  }
  if (opts.seeded === true) {
    lines.push('', 'Plan mode is ACTIVE in this session — the directive above is live, not history. Keep')
    lines.push('planning until a plan is approved; implementation begins only after that approval.')
  } else if (opts.modeActive === true) {
    lines.push('', 'Plan mode was ACTIVE at the end of the archived span, and a created session does not')
    lines.push('inherit it: this child starts OUTSIDE plan mode. Ask the user whether to keep planning or act.')
  }
  return lines.join('\n')
}


/**
 * The in-place checkpoint's plan carriage (the PLOT mechanism, applied to plans —
 * docs/plans-carriage.md § 9). Shadowing a region can hide the chapter that carries a
 * plan, and a directive that only survives in a file the child may never open is a
 * directive the agent drifts from. So the OPERATIVE plan travels in the checkpoint
 * text itself, bounded, with its citation and the sha that still resolves the whole.
 *
 * "Operative" is session-level, not region-level — the newest submission on the log,
 * whatever region it happened to fall in — because that is what "the current task"
 * means to the agent reading the checkpoint.
 */
export function carryActivePlan(
  plans: readonly PlanDoc[],
  opts: { maxChars: number },
): string | null {
  const operative = plans[plans.length - 1]
  if (operative === undefined) return null
  const title = operative.title === '' ? '(untitled plan)' : operative.title
  const body = operative.text.replace(/^#{1,6}\s+.+\n/, '').trim()
  const clipped = body.length > opts.maxChars ? `${body.slice(0, opts.maxChars).trimEnd()}…` : body
  return [
    `ACTIVE PLAN: "${title}" — ${STATUS_WORD[operative.status]} (submitted seq ${operative.seq}`
      + (operative.resultSeq !== null ? `, answered seq ${operative.resultSeq}` : ', no verdict yet') + ')',
    '',
    clipped,
    ...(body.length > opts.maxChars
      // No hash claimed: at summarize time the chapter does not exist yet, and a
      // sha we cannot verify would be a citation to nothing.
      ? ['', '(carried truncated — the archive chapter holding this plan cites its complete text)']
      : []),
  ].join('\n')
}


/**
 * Topics for a plan DOCUMENT: the file paths the plan names, plus its most
 * characteristic terms. Same vocabulary as the transcript's index floor
 * (`signature.chapterTopics`), deliberately re-derived here rather than imported —
 * a plan is prose the agent wrote on purpose, so its own path mentions are the
 * strongest signal about what it changes, and they must land in the same topic
 * namespace the chapter index already uses.
 */
export function planTopicsOf(planText: string, maxTerms = 8): string[] {
  const paths = new Set<string>()
  for (const m of planText.matchAll(/([\w@.\-/]+\.[A-Za-z]{1,6})\b/g)) {
    const p = m[1]!
    if (p.length > 3 && !p.startsWith('http')) paths.add(p)
  }
  const stop = new Set(['plan', 'goal', 'tests', 'criteria', 'changes', 'subsystem', 'steps', 'summary', 'overview', 'context', 'assumptions', 'risks', 'rollback', 'acceptance', 'success', 'approach', 'implementation'])
  const terms = new Map<string, number>()
  for (const raw of planText.toLowerCase().split(/[^a-z0-9_+.\-/]+/)) {
    const t = raw.replace(/^[.+\-/]+|[.+\-/]+$/g, '')
    if (t.length < 4 || t.length > 28 || stop.has(t) || /^\d+$/.test(t)) continue
    terms.set(t, (terms.get(t) ?? 0) + 1)
  }
  const top = [...terms.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, maxTerms).map(([t]) => t)
  return [...paths, ...top]
}
