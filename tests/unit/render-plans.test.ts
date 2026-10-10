/**
 * Plans in the rendered chapter (docs/plans-carriage.md § 2/§ 3): the block, its
 * frontmatter, its artifact, and the zero-bytes rule that keeps a plan-less
 * session byte-identical to before the feature existed.
 *
 * Result fixtures use the REAL nesting (a tool-result wrapper whose content array
 * holds the text), and verdict strings are the host's own — see
 * tests/unit/plans.test.ts for why the shapes are copied, not invented.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderChapter, sha256 } from '../../src/render.ts'
import type { RenderConfig, SessionEventLike } from '../../src/types.ts'

const CONFIG: RenderConfig = { toolResultDeferFloorTokens: 200, chapterTokenTarget: 4000 }

const msg = (seq: number, role: 'user' | 'assistant', text: string): SessionEventLike => ({
  type: `${role}/message`, seq, time: 0, surfaceOp: 'append',
  data: { id: `m${seq}`, role, source: { kind: 'user' }, content: [{ type: 'text', text }] },
})
const planCall = (seq: number, plan: string, callId = `c${seq}`): SessionEventLike => ({
  type: 'tool/call', seq, data: { callId, name: 'exit_plan_mode', arguments: { plan } },
})
const verdict = (seq: number, text: string, callId: string, isError = false): SessionEventLike => ({
  type: 'tool/result', seq,
  data: {
    message: {
      source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, isError, content: [{ type: 'text', text }] }],
    },
  },
})
const APPROVE = '{"approved":true} Plan approved — plan mode exited; carry out the plan starting with your next step.'
const PLAN = '# Do the thing\n\n## Goal\nOne sentence.\n\n## Tests\nRun them.\n'
const RANGE = { title: 'Planning', summary: 's', startSeq: 0, endSeq: 3 }

// ------------------------------------------------------------------ the block

test('a chapter that carries a plan gets a Plans block with verdict, artifact and outline', () => {
  const chapter = renderChapter(
    [msg(0, 'user', 'design it'), planCall(1, PLAN), verdict(2, APPROVE, 'c1'), msg(3, 'assistant', 'ok')],
    RANGE, CONFIG,
  )
  assert.match(chapter.markdown, /## Plans in this chapter/)
  assert.match(chapter.markdown, /### Plan — "Do the thing" — APPROVED/)
  assert.match(chapter.markdown, /- verdict: submitted seq 1 → answered seq 2/)
  assert.match(chapter.markdown, /Plan approved/)
  assert.match(chapter.markdown, /- outline: Goal · Tests/)
  // full text is a reference, and the reference is content-addressed
  const fact = chapter.stats.plans?.[0]
  assert.ok(fact, 'stats.plans carries the fact')
  assert.equal(fact.status, 'approved')
  assert.equal(fact.resultSeq, 2)
  assert.match(chapter.markdown, new RegExp(`full text: \\\`${fact.artifactPath}\\\``))
  const written = chapter.artifacts.find((a) => a.sha256 === fact.sha256)
  assert.ok(written, 'the plan blob is among the artifacts to write')
  assert.equal(written.content, PLAN.trim(), 'every byte of the plan is stored, not just the head')
  assert.equal(fact.sha256, sha256(PLAN.trim()), 'the fact hash is the hash of those bytes')
  assert.match(fact.artifactPath, /^artifacts\/[0-9a-f]{2}\/[0-9a-f]{64}\.txt$/, 'content-addressed path')
})

test('the block sits AFTER the verbatim transcript, never inside it', () => {
  const chapter = renderChapter(
    [msg(0, 'user', 'design it'), planCall(1, PLAN), verdict(2, APPROVE, 'c1'), msg(3, 'assistant', 'ok')],
    RANGE, CONFIG,
  )
  const body = chapter.markdown.slice(chapter.markdown.indexOf('---\n', 4) + 4)
  const transcript = body.indexOf('**User:**')
  const planLine = body.indexOf('- ↳ **exit_plan_mode**')
  const block = body.indexOf('## Plans in this chapter')
  assert.ok(transcript < planLine && planLine < block, 'transcript, invocation line, then the block')
  assert.match(body.slice(planLine, block), /in the Plans section below/, 'the transcript line points at the block')
})

test('a pending plan says plainly that nobody approved it (verify.md P2)', () => {
  const chapter = renderChapter([planCall(1, PLAN)], { ...RANGE, startSeq: 1, endSeq: 1 }, CONFIG)
  assert.match(chapter.markdown, /NO RESULT: the review was never answered \(pending\)/)
  assert.equal(chapter.stats.plans?.[0].status, 'pending')
})

test('a rejected plan is never dressed up as an approval', () => {
  const chapter = renderChapter(
    [planCall(1, PLAN), verdict(2, 'The user chose to keep planning; their feedback: add rollback.', 'c1', true)],
    RANGE, CONFIG,
  )
  assert.match(chapter.markdown, /— REJECTED — the user sent it back with feedback|### Plan — "Do the thing" — REJECTED/)
  assert.match(chapter.markdown, /add rollback/)
})

test('a same-titled re-submission marks the earlier one superseded', () => {
  const revised = '# Do the thing\n\n## Goal\nOne sentence, now with rollback.\n'
  const chapter = renderChapter([
    planCall(1, PLAN, 'c1'), verdict(2, 'The user chose to keep planning; revise and present again.', 'c1', true),
    planCall(3, revised, 'c3'),
  ], { ...RANGE, endSeq: 3 }, CONFIG)
  const statuses = chapter.stats.plans?.map((p) => p.status)
  assert.deepEqual(statuses, ['superseded', 'pending'])
  assert.match(chapter.markdown, /superseded by a later one of the same plan/)
})

// ------------------------------------------------------------------ pairing across a boundary

test('a verdict that lands past the range still pairs (the scan is not range-local)', () => {
  const chapter = renderChapter(
    [planCall(1, PLAN), verdict(99, APPROVE, 'c1')],
    { title: 'Planning', summary: 's', startSeq: 0, endSeq: 10 }, CONFIG,
  )
  assert.equal(chapter.stats.plans?.[0].status, 'approved')
})

// ------------------------------------------------------------------ plan/mode events

test('a mode flip renders — it is no longer an unrendered hole (verify.md P4)', () => {
  const events: SessionEventLike[] = [
    msg(0, 'user', 'plan this'),
    { type: 'plan/mode', seq: 1, data: { active: true } },
    msg(2, 'assistant', 'planning'),
  ]
  const chapter = renderChapter(events, { title: 'T', summary: 's', startSeq: 0, endSeq: 2 }, CONFIG)
  assert.deepEqual(chapter.stats.unrenderedSeqs, [], 'plan/mode is a named case now')
  assert.match(chapter.markdown, /- plan mode ACTIVE from seq 1 \(log event plan\/mode\)/)
  assert.match(chapter.markdown, /- plan mode at chapter end: active/)
  assert.equal(chapter.stats.planMode, 'active')
  assert.match(chapter.markdown, /planMode: active/)
  assert.ok(!/^plans: \[/m.test(chapter.markdown), 'no submission means no plans: line')
})

test('an unknown event type is still disclosed as a hole', () => {
  const chapter = renderChapter(
    [msg(0, 'user', 'x'), { type: 'mystery/event', seq: 1, data: {} } as SessionEventLike],
    { title: 'T', summary: 's', startSeq: 0, endSeq: 1 }, CONFIG,
  )
  assert.deepEqual(chapter.stats.unrenderedSeqs, [1])
})

test('last logged mode wins, so an approve-then-off session is not read as still planning', () => {
  const events: SessionEventLike[] = [
    { type: 'plan/mode', seq: 1, data: { active: true } },
    planCall(2, PLAN, 'c2'), verdict(3, APPROVE, 'c2'),
    { type: 'plan/mode', seq: 4, data: { active: false } },
  ]
  const chapter = renderChapter(events, { title: 'T', summary: 's', startSeq: 1, endSeq: 4 }, CONFIG)
  assert.equal(chapter.stats.planMode, 'inactive')
})

// ------------------------------------------------------------------ zero bytes (P8)

test('a plan-less chapter gains ZERO plan bytes, and its frontmatter has no new lines', () => {
  const events = [msg(0, 'user', 'hello'), msg(1, 'assistant', 'hi'), msg(2, 'user', 'bye')]
  const chapter = renderChapter(events, { title: 'T', summary: 's', startSeq: 0, endSeq: 2 }, CONFIG)
  assert.ok(!chapter.markdown.includes('Plans in this chapter'), 'no block')
  assert.ok(!/^plans: /m.test(chapter.markdown), 'no plans: frontmatter line')
  assert.ok(!/^planMode: /m.test(chapter.markdown), 'no planMode: frontmatter line')
  assert.deepEqual(chapter.stats.plans, [])
})

test('the frontmatter anchor still hashes the body exactly as written', () => {
  // The T9 lesson: enrichment's guard re-hashes what parseChapterFile returns.
  // Adding a Plans block must not break that convention.
  const chapter = renderChapter(
    [msg(0, 'user', 'go'), planCall(1, PLAN), verdict(2, APPROVE, 'c1')],
    { title: 'T', summary: 's', startSeq: 0, endSeq: 2 }, CONFIG,
  )
  const declared = /^sha256: ([0-9a-f]+)$/m.exec(chapter.markdown)?.[1]
  assert.ok(declared)
  const body = chapter.markdown.slice(chapter.markdown.indexOf('---\n', 4) + 4)
  assert.equal(sha256(body), declared, 'parsed body (trailing newline included) hashes to the anchor')
})

// ------------------------------------------------------------------ economy, not exemption

test('planInlineChars bounds the printed head while the artifact keeps every byte', () => {
  const long = `# Big plan\n\n## Goal\n${'detail words '.repeat(400)}\n`
  const chapter = renderChapter(
    [planCall(0, long), verdict(1, APPROVE, 'c0')],
    { title: 'T', summary: 's', startSeq: 0, endSeq: 1 }, { ...CONFIG, planInlineChars: 120 },
  )
  const fact = chapter.stats.plans?.[0]
  assert.ok(fact)
  assert.ok(fact.estTokens > 300, 'the plan is large, and still COUNTED — no measurement exemption')
  const written = chapter.artifacts.find((a) => a.sha256 === fact.sha256)
  assert.equal(written?.content, long.trim(), 'full bytes in the artifact')
  const headMatch = /- head \(first 120 chars, verbatim\):\n\n```/.exec(chapter.markdown)
  assert.ok(headMatch, 'the head is labelled with its bound')
  assert.ok(chapter.markdown.indexOf(long.trim().slice(0, 100)) < chapter.markdown.length)
  const body = chapter.markdown.slice(chapter.markdown.indexOf('---\n', 4) + 4)
  assert.ok(body.length < long.length + 2000, 'the chapter body does not carry the whole plan')
})

test('planInlineChars: 0 keeps the pointer and drops the head', () => {
  const chapter = renderChapter(
    [planCall(0, PLAN), verdict(1, APPROVE, 'c0')],
    { title: 'T', summary: 's', startSeq: 0, endSeq: 1 }, { ...CONFIG, planInlineChars: 0 },
  )
  assert.ok(!chapter.markdown.includes('head (first'), 'no head at all')
  assert.match(chapter.markdown, /full text: `artifacts\//, 'the reference still points the way')
  // 2 artifacts: the plan, and the verdict result — results are artifact-backed
  // whether or not they print inline, which is what makes deferral lossless.
  assert.equal(chapter.artifacts.length, 2)
})

test('redaction runs over plan bytes too — a token pasted into a plan never ships', () => {
  const dirty = `# Ship it\n\n## Goal\nUse ghp_abcdefghijklmnopqrstuvwx as the credential.\n`
  const chapter = renderChapter(
    [planCall(0, dirty), verdict(1, APPROVE, 'c0')],
    { title: 'T', summary: 's', startSeq: 0, endSeq: 1 }, CONFIG,
  )
  assert.ok(!chapter.markdown.includes('ghp_abcdefghijklmnopqrstuvwx'), 'body is redacted')
  const fact = chapter.stats.plans?.[0]
  const written = chapter.artifacts.find((a) => a.sha256 === fact?.sha256)
  assert.ok(written && !written.content.includes('ghp_abcdefghijklmnopqrstuvwx'), 'artifact is redacted')
  assert.match(written?.content ?? '', /⟦redacted:credential/)
})

// ------------------------------------------------------------------ invocation artifacts

test('callArgArtifactTokens off (the default) leaves argument heads exactly as before', () => {
  const big = 'x'.repeat(9000)
  const chapter = renderChapter(
    [msg(0, 'user', 'write it'), { type: 'tool/call', seq: 1, data: { callId: 'w1', name: 'write', arguments: { file_path: 'a.ts', content: big } } } as SessionEventLike],
    { title: 'T', summary: 's', startSeq: 0, endSeq: 1 }, CONFIG,
  )
  assert.equal(chapter.stats.invocationArtifacts, 0)
  assert.equal(chapter.artifacts.length, 0, 'no artifact for arguments when the floor is off')
  assert.match(chapter.markdown, /↳ \*\*write\*\* `\{.*` … \(seq 1\)$/m, 'bounded head + ellipsis, as it has always been')
  assert.ok(!chapter.markdown.includes('full arguments'), 'and no artifact claim')
})

test('callArgArtifactTokens on makes the bounded head artifact-backed', () => {
  const big = 'CONTENT-'.repeat(900)
  const chapter = renderChapter(
    [{ type: 'tool/call', seq: 1, data: { callId: 'w1', name: 'write', arguments: { file_path: 'a.ts', content: big } } } as SessionEventLike],
    { title: 'T', summary: 's', startSeq: 1, endSeq: 1 }, { ...CONFIG, callArgArtifactTokens: 600 },
  )
  assert.equal(chapter.stats.invocationArtifacts, 1)
  assert.match(chapter.markdown, /— full arguments: \d+ B ≈ \d+ tok, `[0-9a-f]{7}…` → `artifacts\//)
  const stored = chapter.artifacts[0]
  assert.ok(stored.content.includes('CONTENT-'), 'the full arguments are retrievable after all')
})
