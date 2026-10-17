/**
 * Knowledge search (knowledge-repo.md §8): a DETERMINISTIC scorer over the
 * mirrored corpus (the clone is the corpus — it holds local + pulled files),
 * packed to a token budget the AGENT chooses (it knows its window; we
 * measure with the project's one estimator). No model in the loop, ever —
 * reproducible, inspectable, and free.
 */
import fs from 'node:fs'
import path from 'node:path'
import { entryFromChapter, type IndexEntry } from './indexing.ts'
function entryBody(text: string): string {
  const i = text.indexOf('\n---\n')
  return i === -1 ? '' : text.slice(i + 5).trim()
}

import { estimateTokens } from './render.ts'
import { collectMirrorRules } from './rules.ts'
import { stitchFragments } from './indexing.ts'

export interface SearchResult {
  score: number
  date: string
  kind: 'chapter' | 'rule' | 'plan'
  title: string
  path: string
  /** S5 stitch view: every member file behind a coherented entry. */
  paths?: string[]
  topics: string[]
}

export interface SearchOutcome {
  results: SearchResult[]
  /** Every match found (results may be a packed prefix of this). */
  total: number
  shown: number
  budget: { requested: number; used: number; remaining: number }
  line: string
}

const DAY = 24 * 60 * 60 * 1000

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9/._-]+/).filter((t) => t.length >= 2 && t !== 'the' && t !== 'and')

const recencyBonus = (mtime: number | undefined, now: number): number => {
  if (mtime === undefined) return 0
  const ageDays = (now - mtime) / DAY
  if (ageDays <= 30) return 1
  if (ageDays <= 180) return 0.5
  return 0
}

/** Term-hit score: topic hits 2x, title 1x, summary 1x. Zero = no match, full stop. */
export function baseScore(entry: IndexEntry, terms: readonly string[], summary: string): number {
  let score = 0
  for (const t of terms) {
    if (entry.topics.some((topic) => topic.toLowerCase().includes(t))) score += 2
    if (entry.category !== undefined && entry.category.toLowerCase().includes(t)) score += 1.5
    if (entry.title.toLowerCase().includes(t)) score += 1
    if (summary.toLowerCase().includes(t)) score += 1
  }
  return score
}

/**
 * The full score: term hits plus a recency tie-break. Recency ONLY breaks
 * ties between real matches — a fresh mtime must never rank an entry that
 * matches no term (that would surface unrelated fresh files on any query).
 */
export function scoreEntry(entry: IndexEntry, terms: readonly string[], now: number, summary: string): number {
  const base = baseScore(entry, terms, summary)
  return base === 0 ? 0 : base + recencyBonus(entry.mtime, now)
}

/**
 * CodeGraph symbol boost: when a search query contains tokens matching
 * symbols stored in a chapter's frontmatter, add a bounded bonus. This
 * breaks ties toward structurally-relevant chapters without ever ranking
 * a non-matching entry above a matching one.
 *
 * @param bonusPerMatch — per-symbol bonus (default 0.2, capped at 1.0 total)
 */
export function codegraphBoost(entry: IndexEntry, terms: readonly string[], bonusPerMatch = 0.2): number {
  if (entry.codegraphSymbols === undefined || entry.codegraphSymbols.length === 0) return 0
  if (terms.length === 0) return 0
  let matched = 0
  for (const t of terms) {
    for (const sym of entry.codegraphSymbols) {
      // Case-insensitive substring match: query term "auth" matches symbol "authenticate".
      if (sym.toLowerCase().includes(t) || t.includes(sym.toLowerCase())) {
        matched++
        break // one match per term
      }
    }
  }
  return Math.min(matched * bonusPerMatch, 1.0)
}

/** Load the corpus from a clone directory: chapters + rules, frontmatter-parsed. */
export function loadCorpus(cloneDir: string): { entries: IndexEntry[]; summaries: Map<string, string> } {
  const entries: IndexEntry[] = []
  const summaries = new Map<string, string>()
  // rel paths mirror the REPO layout (chapters/<key>/…, rules/<key>/…) so
  // search results are directly readable paths and project scoping is a
  // prefix match on the second path segment.
  const collect = (top: string, kind: 'chapter' | 'rule') => {
    const root = path.join(cloneDir, top)
    if (!fs.existsSync(root)) return
    const walk = (dir: string, rel: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { walk(p, rel === '' ? e.name : path.join(rel, e.name)); continue }
        if (e.name.endsWith('.md')) {
          const relPath = rel === '' ? e.name : path.join(rel, e.name)
          const text = fs.readFileSync(p, 'utf8')
          const entry = entryFromChapter(path.join(top, relPath), text, fs.statSync(p).mtimeMs)
          // A plan document declares its own kind in frontmatter and lives in the
          // chapters/ tree — the directory must not flatten it back to 'chapter',
          // or "search the plans" would be impossible (plans-carriage § 11).
          entries.push({ ...entry, kind: entry.kind === 'plan' ? 'plan' : kind })
          const fm = /^---[\s\S]*?summary:\s*(.*)$/m.exec(text)
          if (fm !== null) summaries.set(entry.path, fm[1]!.trim().replace(/^"|"$/g, ''))
          // P3: rules carry no summary field — their BODY is the scannable
          // surface; score terms against it like a chapter's summary
          else if (entry.kind === 'rule') summaries.set(entry.path, entryBody(text).slice(0, 500))
        }
      }
    }
    walk(root, '')
  }
  collect('chapters', 'chapter')
  collect('rules', 'rule')
  return { entries: stitchFragments(entries), summaries } // S5: search sees stitched views too
}

/**
 * The search itself: score, sort (score desc, then path for determinism),
 * format lines `score | date | kind | title | path (topics: …)`, and pack
 * lines to the requested token budget. The agent sees `total` vs `shown` so
 * it can re-request with a larger budget — no silent truncation.
 */
export function searchKnowledge(
  cloneDir: string,
  query: string,
  maxTokens: number,
  opts: { now?: number; projectKey?: string; harnessId?: string; rulesCoreBonus?: number } = {},
): SearchOutcome {
  const now = opts.now ?? Date.now()
  const terms = tokenize(query)
  // P3 §8: rules that THIS machine approved get a small, explicit bonus —
  // computed here (per-machine), never baked into the shared index shards.
  let coreRuleIds: Set<string> | null = null
  if (opts.harnessId !== undefined && opts.rulesCoreBonus !== undefined && opts.rulesCoreBonus > 0) {
    try {
      coreRuleIds = new Set(collectMirrorRules(cloneDir, opts.projectKey ?? '', opts.harnessId)
        .filter((r) => r.status === 'core').map((r) => r.relPath))
    } catch { coreRuleIds = null }
  }
  if (terms.length === 0) {
    return { results: [], total: 0, shown: 0, budget: { requested: maxTokens, used: 0, remaining: maxTokens }, line: '' }
  }
  const { entries, summaries } = loadCorpus(cloneDir)
  const scoped = opts.projectKey !== undefined
    ? entries.filter((e) => e.path.startsWith(`chapters/${opts.projectKey}`) || e.path.startsWith(`rules/${opts.projectKey}`))
    : entries
  return rankEntries(scoped, summaries, terms, now, coreRuleIds, opts.rulesCoreBonus ?? 0, maxTokens)
}

/**
 * The ranking and packing shared by BOTH corpora — the pool mirror and the local
 * store. Kept as one function on purpose: two scorers is how a "works in the pool,
 * empty at home" divergence would be born, and the only difference between the two
 * doors is where the entries came from.
 */
export function rankEntries(
  entries: IndexEntry[],
  summaries: Map<string, string>,
  terms: string[],
  now: number,
  coreRuleIds: Set<string> | null,
  rulesCoreBonus: number,
  maxTokens: number,
): { results: SearchResult[]; total: number; shown: number; budget: { requested: number; used: number; remaining: number }; line: string } {
  const scored = entries
    .map((e) => ({
      e,
      score: scoreEntry(e, terms, now, summaries.get(e.path) ?? '')
        + (coreRuleIds !== null && e.kind === 'rule' && coreRuleIds.has(e.path) ? rulesCoreBonus : 0)
        + codegraphBoost(e, terms),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.e.path < b.e.path ? -1 : 1))
  const results: SearchResult[] = scored.map((x) => ({
    score: Number(x.score.toFixed(2)),
    date: x.e.mtime !== undefined ? new Date(x.e.mtime).toISOString().slice(0, 10) : '----',
    kind: x.e.kind,
    title: x.e.title,
    path: x.e.path,
    ...(x.e.paths !== undefined ? { paths: x.e.paths } : {}),
    topics: x.e.topics,
  }))
  const lines: string[] = []
  let used = 0
  for (const r of results) {
    const line = `${r.score.toFixed(2)} | ${r.date} | ${r.kind} | ${r.title} | ${r.path}${r.paths !== undefined && r.paths.length > 1 ? ` [+${r.paths.length - 1} stitched part(s)]` : ''}${r.topics.length > 0 ? ` (topics: ${r.topics.join(', ')})` : ''}`
    const cost = estimateTokens(line)
    if (lines.length > 0 && used + cost > maxTokens) break
    lines.push(line)
    used += cost
  }
  return {
    results: results.slice(0, lines.length),
    total: results.length,
    shown: lines.length,
    budget: { requested: maxTokens, used, remaining: Math.max(0, maxTokens - used) },
    line: lines.join('\n'),
  }
}

/**
 * The SAME corpus read straight off the workspace store, for the case that matters
 * most and was previously unanswered: a project with NO pool linked. Every chapter,
 * every `kind: plan` document and every rule already exists under the store root —
 * indexed by nothing but their own frontmatter — and until now `chapters_search`
 * returned an empty list there, so a session that asked "what did we plan about X"
 * was told to go link a remote instead of being told the truth it already had.
 *
 * Paths come back relative to the workspace (`<storeRoot>/<session>/chapters/…`), so
 * a result opens with the `read` tool with no translation, which is the whole point
 * of a citation. Scope is stated by the caller, not assumed: this is this machine's
 * store, not the shared pool, and the result note says so.
 */
export function buildLocalCorpus(storeRoot: string): { entries: IndexEntry[]; summaries: Map<string, string> } {
  const entries: IndexEntry[] = []
  const summaries = new Map<string, string>()
  if (!fs.existsSync(storeRoot)) return { entries, summaries }
  const addFile = (abs: string, rel: string): void => {
    let text: string
    try { text = fs.readFileSync(abs, 'utf8') } catch { return }
    const entry = entryFromChapter(rel, text, fs.statSync(abs).mtimeMs)
    entries.push(entry)
    const fm = /^---[\s\S]*?summary:\s*(.*)$/m.exec(text)
    if (fm !== null) summaries.set(entry.path, fm[1]!.trim().replace(/^"|"$/g, ''))
    else if (entry.kind !== 'chapter') summaries.set(entry.path, entryBody(text).slice(0, 500))
  }
  const walk = (dir: string, rel: string, leaf: string): void => {
    let items: fs.Dirent[]
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of items) {
      const abs = path.join(dir, e.name)
      const r = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.isDirectory()) { walk(abs, r, leaf); continue }
      if (e.name.endsWith('.md')) addFile(abs, path.posix.join(leaf, r))
    }
  }
  for (const top of fs.readdirSync(storeRoot, { withFileTypes: true })) {
    if (!top.isDirectory()) continue
    if (top.name === 'artifacts') continue // blobs are queried by chapters_artifact, not indexed twice
    const abs = path.join(storeRoot, top.name)
    if (top.name === 'rules') { walk(abs, '', 'rules'); continue }
    // a session tree: chapters/ holds transcript chapters AND plan documents
    const chapters = path.join(abs, 'chapters')
    if (fs.existsSync(chapters)) walk(chapters, '', path.posix.join(top.name, 'chapters'))
    const rules = path.join(abs, 'rules')
    if (fs.existsSync(rules)) walk(rules, '', path.posix.join(top.name, 'rules'))
  }
  return { entries, summaries }
}

/**
 * Search THIS machine's store (no pool required). Returns the same shape as
 * `searchKnowledge`, plus `empty` so the caller can tell "nothing matched" apart
 * from "nothing to match against" — those two feel identical to a session and are
 * completely different facts about the workspace.
 */
export function searchLocalStore(
  storeRoot: string,
  query: string,
  maxTokens: number,
  opts: { rulesCoreBonus?: number } = {},
): { results: SearchResult[]; total: number; shown: number; budget: { requested: number; used: number; remaining: number }; line: string; documents: number; empty: boolean } {
  const { entries, summaries } = buildLocalCorpus(storeRoot)
  const terms = tokenize(query)
  if (terms.length === 0) {
    return { results: [], total: 0, shown: 0, budget: { requested: maxTokens, used: 0, remaining: maxTokens }, line: '', documents: entries.length, empty: entries.length === 0 }
  }
  const ranked = rankEntries(entries, summaries, terms, Date.now(), null, opts.rulesCoreBonus ?? 0, maxTokens)
  return { ...ranked, documents: entries.length, empty: entries.length === 0 }
}
