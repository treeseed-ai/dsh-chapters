/**
 * Optional CodeGraph integration (runtime discovery, zero dependency).
 *
 * dsh-chapters NEVER depends on @colbymchenry/codegraph or dsh-codegraph.
 * This module probes for the `codegraph` CLI at activation time and exposes
 * a thin query interface that every integration point checks before acting.
 * All failures are silent no-ops — the deterministic path is the product;
 * CodeGraph is garnish.
 *
 * Design parallels dsh-codegraph's own lazy executor resolution: the
 * subprocess service may mount after this plugin, so resolution happens
 * on first use, not at apply time.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

/** Resolved executable are cached per-process to avoid repeated spawns. */
let resolvedExe: string | null | undefined = undefined // undefined = not yet attempted

/** Code-shaped token pattern: file paths with code extensions, camelCase,
 *  PascalCase, snake_case. The path alternative handles multi-segment paths
 *  like src/auth/session.ts. */
const CODE_TOKEN_RE = /(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|kt|kts|java|py|go|rs|swift|vue|ets|cs|rb|php|c|cc|cpp|h|hpp)\b|[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|kt|kts|java|py|go|rs|swift|vue|ets|cs|rb|php|c|cc|cpp|h|hpp)\b|[a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+|[A-Z][a-zA-Z0-9]*[a-z][a-zA-Z0-9]*|[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g

export interface SubprocessLike {
  resolveExecutable(name: string): Promise<string>
  spawn(opts: {
    argv: string[]
    cwd: string
    stdio: { stdin: string; stdout: { maxBytes: number }; stderr: { maxBytes: number } }
    graceMs: number
    signal?: AbortSignal
  }): { done: Promise<{ exitCode: number }>; collected: { stdout?: { readFrom(n: number): { text: string } }; stderr?: { readFrom(n: number): { text: string } } } }
}

/**
 * Resolve the codegraph CLI executable. Returns null if unavailable.
 * Cached after first attempt — call freely.
 */
export async function resolveCodegraph(subprocess: SubprocessLike | undefined): Promise<string | null> {
  if (resolvedExe !== undefined) return resolvedExe
  if (subprocess === undefined) { resolvedExe = null; return null }
  try {
    resolvedExe = await subprocess.resolveExecutable('codegraph')
    return resolvedExe
  } catch {
    resolvedExe = null
    return null
  }
}

/** Reset the cached resolution (test seam only). */
export function resetCodegraphResolution(): void { resolvedExe = undefined }

/** Check whether a project has a CodeGraph index at or above the given path. */
export function hasCodegraphIndex(cwd: string): boolean {
  let dir = cwd
  for (let i = 0; i < 12 && dir; i++) {
    if (existsSync(join(dir, '.codegraph'))) return true
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return false
}

/** Find the nearest indexed ancestor directory. */
export function findCodegraphRoot(cwd: string): string | undefined {
  let dir = cwd
  for (let i = 0; i < 12 && dir; i++) {
    if (existsSync(join(dir, '.codegraph'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** Extract code-shaped tokens from text (file names, camelCase, PascalCase, snake_case). */
export function extractCodeTokens(text: string, limit = 5): string[] {
  const tokens = new Set<string>()
  let m: RegExpExecArray | null
  CODE_TOKEN_RE.lastIndex = 0
  while ((m = CODE_TOKEN_RE.exec(text)) !== null) tokens.add(m[0])
  return [...tokens].slice(0, limit)
}

interface RunResult { text: string; ok: boolean }

/**
 * Run a codegraph CLI command. Returns empty text on any failure — callers
 * treat failure as "no data", never as an error.
 */
export async function runCodegraphQuiet(
  subprocess: SubprocessLike | undefined,
  argv: string[],
  cwd: string,
  timeoutMs: number,
): Promise<RunResult> {
  const exe = await resolveCodegraph(subprocess)
  if (exe === null) return { text: '', ok: false }
  try {
    const proc = subprocess!.spawn({
      argv: [exe, ...argv],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 4 * 1024 * 1024 },
        stderr: { maxBytes: 1 * 1024 * 1024 },
      },
      graceMs: 2000,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const outcome = await proc.done
    if (outcome.exitCode !== 0) return { text: '', ok: false }
    const out = proc.collected.stdout?.readFrom(0)
    return { text: out?.text ?? '', ok: true }
  } catch {
    return { text: '', ok: false }
  }
}

/**
 * Query CodeGraph for symbols matching a token. Returns symbol names that
 * exist in the index. Fire-and-forget friendly — errors return [].
 */
export async function querySymbols(
  subprocess: SubprocessLike | undefined,
  root: string,
  token: string,
  limit = 5,
  timeoutMs = 5000,
): Promise<string[]> {
  const { text, ok } = await runCodegraphQuiet(
    subprocess,
    ['query', '--json', '--path', root, '-l', String(limit), token],
    root,
    timeoutMs,
  )
  if (!ok || !text.trim()) return []
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((n: unknown): n is { name?: string } => typeof n === 'object' && n !== null && typeof (n as Record<string, unknown>).name === 'string')
      .map((n) => n.name!)
      .filter((n) => n.length > 0)
  } catch {
    return []
  }
}

/**
 * Extract CodeGraph symbols from a set of events by verifying code-shaped
 * tokens against the project index. Budget: max 3 queries, 5s each.
 * Returns [] on any failure — callers treat this as optional enrichment.
 */
export async function extractCodegraphSymbolsFromEvents(
  subprocess: SubprocessLike | undefined,
  cwd: string,
  events: readonly { type?: string; data?: Record<string, unknown> }[],
  limit = 10,
): Promise<string[]> {
  const root = findCodegraphRoot(cwd)
  if (root === undefined) return []
  const exe = await resolveCodegraph(subprocess)
  if (exe === null) return []

  // Gather text from user/assistant messages in the events.
  const texts: string[] = []
  for (const ev of events) {
    if (ev.type !== 'user/message' && ev.type !== 'assistant/message') continue
    const data = (ev.data ?? {}) as Record<string, unknown>
    const message = (data.message ?? data) as Record<string, unknown>
    const content = Array.isArray(message.content) ? message.content as { type?: string; text?: string }[] : []
    for (const b of content) {
      if (b.type === 'text' && b.text) texts.push(b.text)
    }
  }
  const allText = texts.join('\n')
  const tokens = extractCodeTokens(allText, 5)
  if (tokens.length === 0) return []

  const verified: string[] = []
  const seen = new Set<string>()
  let queries = 0
  for (const token of tokens) {
    if (queries >= 3 || verified.length >= limit) break
    queries++
    try {
      const symbols = await querySymbols(subprocess, root, token, 5, 5000)
      for (const s of symbols) {
        if (!seen.has(s)) { seen.add(s); verified.push(s) }
      }
    } catch { /* skip */ }
  }
  return verified
}

/**
 * Run codegraph explore and return the raw text output. Capped and
 * fire-and-forget — errors return ''.
 */
export async function exploreCodegraph(
  subprocess: SubprocessLike | undefined,
  root: string,
  query: string,
  maxChars = 800,
  timeoutMs = 15000,
): Promise<string> {
  const { text, ok } = await runCodegraphQuiet(
    subprocess,
    ['explore', '--path', root, query],
    root,
    timeoutMs,
  )
  if (!ok || !text.trim()) return ''
  const trimmed = text.trim()
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) + ' …[truncated]' : trimmed
}
