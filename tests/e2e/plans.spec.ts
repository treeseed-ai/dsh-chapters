import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { openApp, localModelUp, currentSessionId, sessionLogTextById, logEvents, typeComposer, ROOT } from './session.ts'

/**
 * A SESSION PLAN, carried: plan mode in the browser, a real `exit_plan_mode`
 * submission, the host's own review card answered by a click, a fork — and the
 * child's own log calling that plan out while its full bytes sit on disk.
 *
 * The acceptance row for docs/plans-carriage.md § 4/§ 5, and the ONLY layer that
 * exercises the host's review exchange (the deterministic plane reads log-shaped
 * fixtures; this makes the harness write them).
 *
 * CLIENT-PLANE FACTS, MEASURED — not guessed:
 *  - plan-mode chip accessible names: `@deepseek-ai/dsh-client-ui-plan/lib/client.js:61-98`
 *    ("Plan mode off, press to turn on" / "Plan mode on, press to turn off");
 *  - the review question and its two labels: `@deepseek-ai/dsh-plan-mode/lib/index.js:259-276`
 *    ("Approve this plan and leave plan mode?" / "Approve" / "Keep planning");
 *  - options render as buttons named by their label
 *    (`@deepseek-ai/dsh-client-ui-user-questions/lib/client.js:276, 601`);
 *  - the chapters fork action: `button[aria-label="Fork with chapters"]`, measured
 *    live in fork-button.spec.ts.
 *
 * WHY THE TURN IS DRIVEN BY HAND (and not with newSessionWithTurn): the review is
 * AWAITED inside the tool call, so `turn/end` cannot arrive until a human answers.
 * The helper therefore waits for the card, clicks, and only then waits for the
 * turn to close — the shape the host actually produces.
 *
 * THE MODEL IS A SCRIPTED UPSTREAM on this box (tests/e2e/stub-model.ts): the wire
 * format is copied from recorded llama.cpp traffic, so the harness's provider, the
 * tool runtime, the review channel and the durable log are all REAL; only the
 * decision to submit a plan is scripted. What this journey therefore proves is the
 * carriage, not model behaviour — and the GPU box can re-record the same project
 * from the live model, which retires the stub (docs/plans-carriage.md § Tapes).
 * Assertions read the DURABLE plane: files on disk and the child's own log,
 * addressed by the identity localStorage reports.
 */

const storeRoot = path.join(ROOT, '.dsh-chapters')

const walkMd = (dir: string): string[] => {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkMd(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

/**
 * Chapters carrying a Plans block, SCOPED to one session tree. Scoping is not
 * tidiness: the store accumulates across specs and across re-runs of this one, and
 * an unscoped scan lets a PREVIOUS run's plan satisfy the assertion — a green that
 * proves nothing. `rootSession` is the id this spec just created through the real
 * UI, so anything found under it was written by this journey.
 */
const archivedPlans = (rootSession: string): Array<{ chapter: string; blob: string; bytes: number; text: string }> => {
  const found: Array<{ chapter: string; blob: string; bytes: number; text: string }> = []
  const tree = path.join(storeRoot, rootSession)
  if (!fs.existsSync(tree)) return found
  for (const file of walkMd(tree)) {
    const text = fs.readFileSync(file, 'utf8')
    if (!text.includes('## Plans in this chapter')) continue
    const m = /full text: `artifacts\/([0-9a-f]{2})\/([0-9a-f]{64})\.txt`/.exec(text)
    if (m === null) continue
    // the blob sits beside the chapter's session tree: <store>/<root>/artifacts/…
    const blob = path.join(tree, 'artifacts', m[1]!, `${m[2]}.txt`)
    if (fs.existsSync(blob)) found.push({ chapter: file, blob, bytes: fs.statSync(blob).size, text })
  }
  return found
}

/**
 * The plan text the model submitted, read back out of its own durable log.
 * `arguments` arrives as an object or a JSON string depending on host version —
 * the same both-shapes rule `src/log-shape.ts` handles on the plugin side, so the
 * test must not assume the one it happened to see first.
 */
function planSubmission(log: string): string {
  for (const e of logEvents(log)) {
    if (e.type !== 'tool/call') continue
    try {
      const d = JSON.parse(e.raw).data as { name?: string; arguments?: unknown }
      if (d.name !== 'exit_plan_mode') continue
      const args = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : d.arguments
      const plan = (args as { plan?: unknown } | undefined)?.plan
      if (typeof plan === 'string' && plan.trim() !== '') return plan
    } catch { /* partial line or unexpected shape: keep looking */ }
  }
  return ''
}

/** All text inside a serialized event, unescaped — the payload is JSON-in-JSON. */
function eventText(raw: string): string {
  try {
    const e = JSON.parse(raw)
    const content = (((e?.data ?? {}) as Record<string, unknown>).message as Record<string, unknown> | undefined)?.content
    if (!Array.isArray(content)) return raw
    return content.map((b) => {
      const inner = (b as { content?: unknown })?.content
      if (typeof inner === 'string') return inner
      if (Array.isArray(inner)) return inner.map((c) => (c as { text?: string })?.text ?? '').join('\n')
      return JSON.stringify(b)
    }).join('\n')
  } catch { return raw }
}

/** The child's own seeded TOC notice text, parsed out of its durable log. */
function planNoticeText(sessionId: string): string {
  for (const e of logEvents(sessionLogTextById(sessionId))) {
    if (e.type !== 'user/message' || !e.raw.includes('chapters:toc')) continue
    try {
      const content = JSON.parse(e.raw).data?.content
      if (Array.isArray(content) && typeof content[0]?.text === 'string') return content[0].text as string
    } catch { /* partial line */ }
  }
  return ''
}

/** Create a session and wait only for its identity (no turn is expected yet). */
async function newSession(page: Page): Promise<string> {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-label="New session"]'))
      .find((b) => /New Session/i.test(b.textContent ?? '')) as HTMLButtonElement | undefined
    btn?.click()
  })
  let sid: string | null = null
  for (let i = 0; i < 15 && sid === null; i += 1) {
    await page.waitForTimeout(1000)
    sid = await currentSessionId(page)
  }
  if (sid === null) throw new Error('new-session click never set dsh.sessions.current')
  return sid
}

test('an approved plan is archived whole and called out in the child that continues it', async ({ page }) => {
  test.setTimeout(1_500_000)

  const upstreamLive = await localModelUp()
  if (!upstreamLive) {
    // Loud, never vacuous: a skipped journey reads as green to anything that
    // only counts failures (measured 2026-09-19: a run asserted against an
    // agent transcript because a skip was quiet).
    throw new Error('plans.spec: nothing answers http://localhost:8080 — start the scripted upstream (node tests/e2e/stub-model.ts) or the live Local model. This journey must RUN.')
  }

  await openApp(page)
  const sid = await newSession(page)
  const preSeq = Math.max(0, ...sessionLogTextById(sid).split('\n')
    .map((l) => { try { const e = JSON.parse(l); return typeof e.seq === 'number' ? e.seq : -1 } catch { return -1 } })
    .filter((n) => n >= 0))

  // `/plan <message>` is the ENTRY door: the host appends `plan/mode {active:true}`
  // immediately (no turn is open yet) and steers the text as one ordinary user
  // message. The chip is NOT one — `PlanModeControl` renders only while mode is
  // already active (`plan.pending ? !plan.active : plan.active`, client.js:39-41):
  // it is the EXIT control. Measured the hard way, one 40-minute timeout.
  //
  // The model's exit_plan_mode call then opens the host's review, which BLOCKS the
  // turn — so waiting for the card is the correct wait, not a deadline.
  // Tool-free IN WORDS THE MODEL OBEYS (the RR2 lesson, and the cause of attempt 4's
  // failure: asked to plan, a real model correctly explored the repo first — glob,
  // grep — and the follow-up request TIMED OUT before it ever reached the plan).
  // The journey wants one turn to a submission, so it must forbid exploration as
  // loudly as it asks for the plan.
  await typeComposer(page, '/plan Which file defines the chapter renderer? Answer from what you already know — do not read, list, search, or open any file, and do not run any tool except the plan tool. Present your plan with the exit_plan_mode tool now; if you need a fact, state it as an assumption.')

  // The review renders as a REGION named by the question, with the plan text
  // inside it and an "Approve" button (measured from the failure snapshot of the
  // first recording run: `region "Approve this plan and leave plan mode?"` →
  // `paragraph: An approved session plan survives…` → `button "Approve"`).
  // A `text=` locator on the question hung for 20 minutes: the substring exists
  // only inside that region's accessible name, not as matchable element text.
  const card = page.getByRole('region', { name: /Approve this plan and leave plan mode/ })
  await expect(card, 'the host opens its plan review').toBeVisible({ timeout: 900_000 })

  // Read what the model ACTUALLY submitted out of the durable log, and hold the
  // review to THOSE bytes. Deriving the expectation from the log rather than
  // hard-coding it is what lets one spec serve both upstreams: a scripted plan and
  // a live model's own plan must be carried identically — the carriage claim has to
  // hold for text nobody wrote in this repo.
  const submitted = planSubmission(sessionLogTextById(sid))
  expect(submitted.length, 'the parent log carries an exit_plan_mode submission').toBeGreaterThan(40)
  const planTitle = (/^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(submitted)?.[1] ?? '').trim()
  expect(planTitle.length, 'the submission opens with a heading (the host requires one)').toBeGreaterThan(0)

  const cardText = await card.innerText()
  expect(cardText, 'the human reviews the plan the model sent').toContain(planTitle)
  // The card is showing the plan, not a summary of it: a body line from the middle
  // of the submission must be present too.
  // Compared with markdown emphasis stripped from BOTH sides: the card renders the
  // plan, so `**bold**` on disk is `bold` on screen — a literal substring test
  // would fail for a reason that has nothing to do with carriage.
  const stripMd = (t: string): string => t.replace(/[*_`>]+/g, '').replace(/\s+/g, ' ').trim()
  const bodyLine = (submitted.split('\n').map((l) => l.trim())
    .filter((l) => stripMd(l).length > 24 && !l.startsWith('#')).pop() ?? '')
  expect(bodyLine.length, 'the submission has body text to check').toBeGreaterThan(24)
  expect(stripMd(cardText), 'and the body is on screen, not just the title').toContain(stripMd(bodyLine))

  await card.getByRole('button', { name: 'Approve' }).click()

  // Now the turn can close.
  await expect.poll(() => {
    const evs = sessionLogTextById(sid).split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((e): e is { seq: number; type: string } => e !== null && typeof e.seq === 'number')
    const approved = evs.some((e) => e.type === 'tool/result' && e.seq > preSeq)
    return approved && evs.some((e) => e.type === 'turn/end' && e.seq > preSeq)
  }, { timeout: 900_000, intervals: [3000] }, 'the approved review and turn/end are durable in the log').toBe(true)

  const parentLog = sessionLogTextById(sid)
  // Determinism GUARD, learned the hard way: the hosted runner measured this
  // session's header a little differently, crossed 0.9 × the pinned 32K window,
  // and fired a plot-elicitation call that no tape had ever seen — a MISS that
  // only a CI machine could produce. Silence about it is not acceptable twice, so
  // the journey now asserts its own precondition: nothing compacted here. If a
  // future change makes pressure arrive mid-journey, this fails HERE, in words,
  // instead of surfacing as an unmatchable request on someone else's hardware.
  const compacted = logEvents(parentLog).filter((e) => e.type.startsWith('compaction/'))
  expect(compacted.length, 'this journey must never trigger compaction — its tape has no such turn').toBe(0)
  expect(parentLog).toContain('"exit_plan_mode"', 'the submission is in the durable log')
  expect(parentLog).toContain('"plan/mode"', 'and the mode flip is a durable event of its own')

  // ============================ LEG 1: a CONTINUATION extends the same work ======
  // The distinction the second round exists for (docs/plans-carriage.md § 12): a
  // continuation gets `## Active plan` and, while the parent is still planning, a
  // seeded `plan/mode`; a BRANCH gets zero plan bytes. Asserting only one of them
  // would leave the whole decision untested in the browser plane.
  const parentPreContinue = logEvents(sessionLogTextById(sid)).length
  await typeComposer(page, 'Continue this work in a fresh session: call chapters_segment, then call chapters_continue with the ranges it reports.')
  await expect.poll(() => {
    const evs = logEvents(sessionLogTextById(sid))
    return evs.length > parentPreContinue && evs.some((e) => e.type === 'turn/end' && e.seq > parentPreContinue)
  }, { timeout: 900_000, intervals: [3000] }, 'the continuation turn closed').toBe(true)

  // The tool result names the child it created — read it from the log, not the DOM.
  // NOTE: the JSONL escapes the payload's quotes, so a regex over the raw LINE never
  // matches (`\"childSessionId\"`). Parse the event and read the text (measured on
  // this run: both legs completed, the assertion alone was blind).
  const continuedId = (() => {
    for (const e of logEvents(sessionLogTextById(sid)).reverse()) {
      if (e.type !== 'tool/result') continue
      const m = /"childSessionId"\s*:\s*"(ch-[^"]+)"/.exec(eventText(e.raw))
      if (m !== null) return m[1]
    }
    return ''
  })()
  // If it refused, the reason is sitting in that same tool result — so carry it into
  // the failure instead of reporting a bare zero and letting someone re-derive it
  // from a 5 MB artifact (measured: the 0.1.9–0.1.12 CI runs each cost a round trip
  // because this line said only "0").
  if (continuedId.length === 0) {
    const refusal = (() => {
      for (const e of logEvents(sessionLogTextById(sid)).reverse()) {
        if (e.type !== 'tool/result') continue
        // The reason is JSON too — capture across escaped quotes, or the report ends
        // at the first backslash and says as much as "chapter 0 (" did on 0.1.12.
        const m = /"reason"\s*:\s*"((?:\\.|[^"\\]){0,300})/.exec(eventText(e.raw))
        if (m !== null) return m[1].replace(/\\"/g, '\"')
      }
      return '(no refusal reason found in the parent log — the tool produced no child and said nothing)'
    })()
    throw new Error(`chapters_continue created no child. Its stated reason: ${refusal}`)
  }
  const continuedSeed = planNoticeText(continuedId)
  expect(continuedSeed).toContain('## Active plan', 'a continuation gets the directive section')
  expect(continuedSeed).toContain(`ACTIVE PLAN: "${planTitle}" — APPROVED`)
  expect(continuedSeed).toContain('chapters_artifact')
  // The plan was approved, so plan mode was LEFT: seeding must NOT happen. Getting
  // this backwards would gate a child whose only job is to implement.
  expect(continuedSeed, 'an approved plan means no seeded gate').not.toMatch(/Plan mode is ACTIVE in this session/)
  expect(continuedSeed).toMatch(/ACTIVE PLAN: "[^"]+" — APPROVED \(ch\. \d+ .*plan document: /, 'and it cites the searchable plan document too')

  // ============================ LEG 2: a BRANCH splits a new direction ==========
  const fork = page.locator('button[aria-label="Fork with chapters"]').first()
  await expect(fork, 'the chapters fork action survives a plan turn').toBeVisible({ timeout: 120_000 })
  await fork.click()

  // A branch must carry NO plan directive — its plans are history (decision 3).
  // The switch to the branch is async (the same race fork-button.spec.ts documents),
  // so the id AND its seed are polled together instead of read once.
  let branchSeed = ''
  let branchId = ''
  await expect.poll(async () => {
    const id = await currentSessionId(page)
    if (id === null || id === sid) return ''
    branchId = id
    branchSeed = planNoticeText(id)
    return branchSeed.length
  }, { timeout: 120_000, intervals: [2000] }, 'the branch child opened with its seeded notice').toBeGreaterThan(40)
  expect(branchSeed.includes('## Active plan'), 'a branch gets no directive section').toBe(false)
  expect(branchSeed.includes('ACTIVE PLAN'), 'and no call-out either').toBe(false)
  // It is still a real continuation of the archive — chapters cited, ancestry named —
  // which is what "the plans are history" has to mean to be true rather than empty.
  expect(branchSeed).toMatch(/chapters|Ancestry/, 'the archive is still cited to the branch')

  // ---- durable plane: chapter carries the block, blob carries the bytes.
  await expect.poll(() => archivedPlans(sid).length, { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(0)
  const [plan] = archivedPlans(sid)
  expect(plan!.bytes).toBeGreaterThan(60, 'a plan is more than its printed head')
  const blob = fs.readFileSync(plan!.blob, 'utf8')
  // THE load-bearing assertion of the whole feature: the stored bytes ARE the
  // submission. Redaction is the one authorised difference (the § 9 chokepoint
  // rewrites credential shapes on the way to disk), and it announces itself with a
  // ⟦redacted:credential …⟧ marker — so: byte-identical when nothing was redacted,
  // and provably only-redacted otherwise. A silent mismatch would be data loss.
  const redactionMarkers = blob.match(/⟦redacted:credential sha256=[0-9a-f]+⟧/g) ?? []
  if (redactionMarkers.length === 0) {
    expect(blob, 'every byte the model submitted is in the artifact').toBe(submitted.trim())
  } else {
    const skeleton = (t: string): string[] => t.split('\n').filter((l) => !l.includes('⟦redacted:credential'))
    expect(skeleton(blob).length, 'redaction rewrote lines, it did not drop them').toBeGreaterThanOrEqual(skeleton(submitted.trim()).length - redactionMarkers.length)
    expect(blob, 'and it starts where the plan starts').toContain(planTitle.slice(0, 40))
  }
  expect(plan!.text).toContain(`### Plan — "${planTitle}" — APPROVED`, 'and the block names it by its own title')
  // MEASURED, not assumed (this run's first attempt expected 'active' and the
  // product said otherwise): approving a plan EXITS plan mode, so the last logged
  // `plan/mode` in the archived span is inactive. Both flips print, and the fold
  // is the last one — exactly the host projection rule the record describes.
  expect(plan!.text).toMatch(/- plan mode ACTIVE from seq \d+ \(log event plan\/mode\)/, 'entry recorded')
  expect(plan!.text).toMatch(/- plan mode inactive from seq \d+ \(log event plan\/mode\)/, 'the approved exit recorded')
  expect(plan!.text).toMatch(/^planMode: inactive$/m, 'and the fold takes the last value')
  expect(plan!.text).toMatch(/^plans: \[\d+:approved:[0-9a-f]{8}\]$/m, 'frontmatter declares what the block claims')

  // ---- the plan is QUERYABLE AS A PLAN: its own document, byte-identical.
  const tree = path.join(storeRoot, sid, 'chapters')
  const docFiles = fs.existsSync(tree) ? fs.readdirSync(tree).filter((f) => f.startsWith('plan-')) : []
  expect(docFiles.length, 'a kind: plan document exists beside the chapter').toBeGreaterThan(0)
  const docText = fs.readFileSync(path.join(tree, docFiles[0]!), 'utf8')
  expect(docText).toMatch(/^---\nkind: plan\n/, 'the kind leads the frontmatter')
  expect(docText).toMatch(/^status: approved$/m, 'with its verdict')
  expect(docText).toContain(planTitle, 'and the plan itself')

  // ---- invariant 2, both children: one seeded message, no parent history copied.
  for (const childId of [continuedId, branchId]) {
    const seeded = logEvents(sessionLogTextById(childId)).filter((e) => e.type === 'user/message' && e.raw.includes('"plugin":"dsh-chapters"'))
    expect(seeded.length, `${childId} inherits exactly one synthetic notice`).toBe(1)
  }
  expect(branchSeed).toMatch(/Ancestry:/, 'and both cite the archive they were born from')
})