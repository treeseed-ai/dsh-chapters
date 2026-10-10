/**
 * Plans as segmentation facts (docs/plans-carriage.md § 6): a submission is the
 * strongest topic boundary a log contains — the chapter that carries one ENDS
 * there, and the plan's own H1 titles it. Both deterministic segmenters are
 * pinned (the composer over stored turn signatures, and the size-based fallback
 * the fork button uses), and both must still tile contiguously: an overlap would
 * duplicate archived text, which validateRanges refuses on purpose.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeChapters } from '../../src/compose.ts'
import { deriveRanges } from '../../src/continue-core.ts'
import { validateRanges } from '../../src/render.ts'
import type { CollectionSignature } from '../../src/signature.ts'
import type { SessionEventLike } from '../../src/types.ts'

const msg = (seq: number, role: 'user' | 'assistant', text: string): SessionEventLike => ({
  type: `${role}/message`, seq, data: { id: `m${seq}`, role, source: { kind: 'user' }, content: [{ type: 'text', text }] },
})
const turnEnd = (seq: number): SessionEventLike => ({ type: 'turn/end', seq, data: { turn: seq } })
const planCall = (seq: number, plan: string, callId = `c${seq}`): SessionEventLike => ({
  type: 'tool/call', seq, data: { callId, name: 'exit_plan_mode', arguments: { plan } },
})
const mode = (seq: number, active: boolean): SessionEventLike => ({ type: 'plan/mode', seq, data: { active } })

const PLAN = '# The migration plan\n\n## Goal\nMove the store.\n'
const PLAN2 = '# The rollback plan\n\n## Goal\nUndo it safely.\n'
const FILLER = 'x'.repeat(400)

/** Three turns, all touching the same primary file, with a plan in the middle one. */
const EVENTS: SessionEventLike[] = [
  msg(0, 'user', 'start the store work'), msg(1, 'assistant', FILLER), turnEnd(2),
  mode(3, true), planCall(4, PLAN), msg(5, 'assistant', 'plan presented'), turnEnd(6),
  msg(7, 'user', 'implement it'), msg(8, 'assistant', FILLER), turnEnd(9),
]

const collection = (seqs: number[], paths: string[]): CollectionSignature => ({
  seqs, paths, commands: [], terms: [], size: seqs.length * 40, by: 'deterministic',
})

// ------------------------------------------------------------------ composer

test('a plan closes the chapter that carries it; the next turn opens the next', () => {
  // Same primary path in every collection: without the plan rule these merge into
  // one chapter, and the decision would be buried mid-span.
  const collections = [collection([0, 1, 2], ['src/store.ts']), collection([3, 4, 5, 6], ['src/store.ts']), collection([7, 8, 9], ['src/store.ts'])]
  const out = composeChapters(EVENTS, 0, 9, collections, { mergeThreshold: 0.3, chapterLimit: 100000 })
  const spans = out.chapters.map((c) => `${c.startSeq}-${c.endSeq}`)
  assert.deepEqual(spans, ['0-6', '7-9'], 'the plan collection ends chapter one')
  assert.match(out.chapters[0]!.title, /The migration plan/, 'titled by the plan it concludes')
  assert.equal(out.chapters[1]!.title, 'implement it')
  validateRanges(out.chapters, 9) // still ascending, non-overlapping, inside the ceiling
})

test('a lone collection holding a plan still closes exactly once', () => {
  const out = composeChapters(EVENTS.slice(3, 7), 3, 6, [collection([3, 4, 5, 6], ['src/store.ts'])], { mergeThreshold: 0.3, chapterLimit: 100000 })
  assert.deepEqual(out.chapters.map((c) => `${c.startSeq}-${c.endSeq}`), ['3-6'])
})

test('no plan means the composer merges exactly as before (no behavior drift)', () => {
  const plainEvents = EVENTS.filter((e) => e.type !== 'tool/call' && e.type !== 'plan/mode')
  const collections = [collection([0, 1, 2], ['src/store.ts']), collection([3, 5, 6], ['src/store.ts']), collection([7, 8, 9], ['src/store.ts'])]
  const out = composeChapters(plainEvents, 0, 9, collections, { mergeThreshold: 0.3, chapterLimit: 100000 })
  assert.equal(out.chapters.length, 1, 'all three merge on the shared primary path')
})

test('a plan that would exceed the chapter limit does not merge past the boundary', () => {
  const collections = [collection([0, 1, 2], ['src/a.ts']), collection([3, 4, 5, 6], ['src/a.ts'])]
  const out = composeChapters(EVENTS, 0, 9, collections, { mergeThreshold: 0.99, chapterLimit: 50 })
  assert.equal(out.chapters.length, 2, 'the size cap splits first; the plan rule then closes the second')
})

// ------------------------------------------------------------------ size-based fallback

test('deriveRanges cuts at the first turn/end AT OR AFTER a plan, never inside the turn', () => {
  // target is generous, so the ONLY reason a cut lands at 6 is the plan at 4.
  const { chapters, notes } = deriveRanges(EVENTS, 9, 100000)
  assert.deepEqual(chapters.map((c) => `${c.startSeq}-${c.endSeq}`), ['0-6', '7-9'])
  assert.match(chapters[0]!.title, /The migration plan/)
  assert.deepEqual(notes, [], 'the anchor IS a boundary, so nothing to report')
  validateRanges(chapters, 9)
})

test('the plan title survives the segment-index suffix the fork path appends', () => {
  const { chapters } = deriveRanges(EVENTS, 9, 100000)
  assert.match(chapters[0]!.title, /^The migration plan \(1\)$/)
})

test('a second plan retitles the segment that carries it, without inventing a mid-turn cut', () => {
  // Cuts land ONLY on turn/end: the plan at seq 11 cannot open a boundary inside
  // its own turn, so the segment [7..12] closes at 12 — and is TITLED by the plan
  // it concludes. That is the rule the record states, honored at turn granularity.
  const withTwo = [...EVENTS, msg(10, 'user', 'now plan the rollback'), planCall(11, PLAN2), turnEnd(12)]
  const { chapters } = deriveRanges(withTwo, 12, 100000)
  assert.deepEqual(chapters.map((c) => `${c.startSeq}-${c.endSeq}`), ['0-6', '7-12'])
  assert.match(chapters[1]!.title, /^The rollback plan \(2\)$/)
})

test('a session with no plan segments on size alone — the rules above are conditional (verify.md P8)', () => {
  const plain: SessionEventLike[] = [msg(0, 'user', 'one'), msg(1, 'assistant', FILLER), turnEnd(2), msg(3, 'user', 'two'), msg(4, 'assistant', FILLER), turnEnd(5)]
  const { chapters } = deriveRanges(plain, 5, 100000)
  assert.deepEqual(chapters.map((c) => `${c.startSeq}-${c.endSeq}`), ['0-5'], 'one chapter, no plan-forced cut')
  assert.equal(chapters[0]!.title, 'one (1)')
})
