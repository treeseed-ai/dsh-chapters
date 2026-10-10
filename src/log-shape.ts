/**
 * Event-shape readers — the single place that knows how DSH nests payloads in
 * the durable log.
 *
 * Extracted from `render.ts` (docs/plans-carriage.md § 1: the chapter renderer and the plan detector
 * must agree on which `tool/result` answers which `tool/call`, or a plan's verdict could be read
 * differently in two places). Shapes here were MEASURED from real logs, never guessed — see
 * tests/unit/render.test.ts:18-22 for the fixture mirror and spikes/probe/FINDINGS.md.
 *
 * Pure module: no cordis, no fs, no DSH imports.
 */
import type { ContentBlock, SessionEventLike } from './types.ts'

export const blocksOf = (value: unknown): ContentBlock[] =>
  Array.isArray(value) ? value as ContentBlock[] : []

export const textOfBlocks = (value: unknown): string =>
  blocksOf(value)
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text?: string }).text ?? '')
    .join('\n')

/**
 * Flatten a tool-result payload, which nests a content array inside a tool-result block.
 * REAL shape (measured e2e, 2026-09-19): `message.content` blocks are
 * `{ type: 'tool-result', toolCallId, isError, content: [{ type:'text', text }] }`.
 */
export function toolResultText(data: Record<string, unknown>): string {
  const message = data.message as Record<string, unknown> | undefined
  const inner = blocksOf(message?.content ?? data.content)
  const parts: string[] = []
  for (const block of inner) {
    if (block.type === 'text') parts.push((block as { text?: string }).text ?? '')
    else if (block.type === 'tool-result') {
      const nested = (block as { content?: unknown }).content
      parts.push(typeof nested === 'string' ? nested : textOfBlocks(nested))
    }
  }
  return parts.filter((p) => p.length > 0).join('\n')
}

/** True when the paired tool-result carries an error flag (a failed call). */
export function toolResultIsError(data: Record<string, unknown>): boolean {
  const message = data.message as Record<string, unknown> | undefined
  const inner = blocksOf(message?.content ?? data.content)
  return inner.some((b) => (b as { isError?: boolean }).isError === true)
}

/** The callId a `tool/result` answers (measured: it rides on `message.source.callId`). */
export function resultCallId(ev: SessionEventLike): string | undefined {
  const msg = (ev.data as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined
  const cid = (msg?.source as Record<string, unknown> | undefined)?.callId
  if (typeof cid === 'string') return cid
  const flat = (ev.data as Record<string, unknown> | undefined)?.callId
  return typeof flat === 'string' ? flat : undefined
}

/** The callId a `tool/call` carries. */
export const callIdOf = (ev: SessionEventLike): string | undefined => {
  const cid = (ev.data as Record<string, unknown> | undefined)?.callId
  return typeof cid === 'string' ? cid : undefined
}

/** Does this result answer this call? Both sides must name a callId — never guess by adjacency. */
export function sameCall(call: SessionEventLike, result: SessionEventLike): boolean {
  const cid = callIdOf(call)
  const rcid = resultCallId(result)
  return cid !== undefined && rcid !== undefined && String(cid) === String(rcid)
}

/**
 * The LAST result event for one callId, over an already-range-filtered list.
 * Host redelivery is real (measured 2026-09-28: 25 calls carried TWO tool/result
 * events), so the newest copy is the authoritative verdict.
 */
export function lastResultFor(results: readonly SessionEventLike[], callId: string): SessionEventLike | undefined {
  let last: SessionEventLike | undefined
  for (const ev of results) if (resultCallId(ev) === callId) last = ev
  return last
}

/** `tool/call` arguments as one serialized string (object or pre-serialized string both occur). */
export function callArgsText(data: Record<string, unknown>): string {
  const args = data.arguments
  if (typeof args === 'string') return args
  try { return JSON.stringify(args ?? {}) } catch { return String(args) }
}

/** One named argument from either shape (string JSON or object). */
export function callArg(data: Record<string, unknown>, name: string): string | undefined {
  const args = data.arguments
  let obj: Record<string, unknown> | undefined
  if (typeof args === 'string') {
    try { obj = JSON.parse(args) as Record<string, unknown> } catch { obj = undefined }
  } else if (args !== null && typeof args === 'object') {
    obj = args as Record<string, unknown>
  }
  const value = obj?.[name]
  return typeof value === 'string' ? value : undefined
}
