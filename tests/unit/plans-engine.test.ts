/**
 * Plans on the ENGINE path (in-place compaction), which renders chapters through
 * the same renderer but reaches them from the durable log by citation, and whose
 * records round-trip through the registry's zod schema. The continuation path is
 * pinned by tests/integration/plans-carriage.test.ts; this is the other half —
 * pressure compaction must not be the place where a plan quietly disappears.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinalizedChapter, buildFinalizedChapters, deriveIdentity, engineRecord, type EngineSession, type EngineSessionEvent } from '../../src/engine-core.ts'
import { ENGINE_CONFIG_DEFAULTS } from '../../src/engine-core.ts'
import { makeDomainStore, parseSessionState } from '../../src/store.ts'
import { freshSession, appendChapters } from '../../src/registry.ts'
import type { SummarizePlan } from '../../src/engine-core.ts'

const cfg = { ...ENGINE_CONFIG_DEFAULTS, planInlineChars: 900, callArgArtifactTokens: 0 }

const ev = (seq: number, type: string, data: Record<string, unknown> = {}): EngineSessionEvent =>
  ({ seq, type, data } as EngineSessionEvent)
// The renderer reads MESSAGE payloads (content blocks), so the fake carries the
// real shape; deriveEventMessage below only needs data.text to do region mapping.
const dmsg = (seq: number, text: string, role = 'user'): EngineSessionEvent =>
  ev(seq, role === 'user' ? 'user/message' : 'assistant/message', {
    text, role, id: `m${seq}`, source: { kind: 'user' }, content: [{ type: 'text', text }],
  })
const mapSession = (events: EngineSessionEvent[]): EngineSession => ({
  id: 's-1',
  seq: Math.max(-1, ...events.map((e) => e.seq)) + 1,
  eventAt: (seq: number) => events.find((e) => e.seq === seq),
  surface: { nodes: events.map((e) => ({ seq: e.seq })) },
  deriveEventMessage: (e: EngineSessionEvent) => typeof e.data?.text === 'string'
    ? { role: String(e.data.role ?? 'user'), content: [{ type: 'text', text: String(e.data.text) }] }
    : null,
} as unknown as EngineSession)

const PLAN = '# Compact without losing the plan\n\n## Goal\nEngine path carries it too.\n'
const APPROVE = '{"approved":true} Plan approved — plan mode exited; carry out the plan starting with your next step.'
const planCall = (seq: number, plan = PLAN, callId = `c${seq}`) =>
  ev(seq, 'tool/call', { callId, name: 'exit_plan_mode', arguments: { plan } })
const verdict = (seq: number, callId: string, text = APPROVE, isError = false) => ({
  seq, type: 'tool/result',
  data: { message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', toolCallId: callId, isError, content: [{ type: 'text', text }] }] } },
} as unknown as EngineSessionEvent)

const plan = (chapters: Array<{ number: number; startSeq: number; endSeq: number }>): SummarizePlan => ({
  tocText: '',
  numbers: chapters.map((c) => c.number),
  chapter: { title: 'Span', summary: 's', path: `${chapters[0]!.number}.md` },
  ...(chapters.length > 1 ? {
    chapters: chapters.map((c) => ({
      number: c.number, path: `${c.number}.md`, title: `Ch ${c.number}`, summary: 's', startSeq: c.startSeq, endSeq: c.endSeq,
    })),
  } : {}),
})

test('a legacy single-chapter compaction renders the plan it shadowed', () => {
  const session = mapSession([
    dmsg(0, 'design it'),
    ev(1, 'plan/mode', { active: true }),
    planCall(2), verdict(3, 'c2'),
    dmsg(4, 'approved', 'assistant'),
  ])
  const rendered = buildFinalizedChapter(session, [0, 1, 2, 3, 4], plan([{ number: 1, startSeq: 0, endSeq: 4 }]), cfg)
  assert.match(rendered.markdown, /## Plans in this chapter/)
  assert.match(rendered.markdown, /### Plan — "Compact without losing the plan" — APPROVED/)
  assert.equal(rendered.stats.planMode, 'active')
  assert.equal(rendered.stats.plans?.[0]?.status, 'approved')
  assert.ok(!rendered.stats.unrenderedSeqs.includes(1), 'plan/mode is a named case, not a hole (verify.md P4)')
  assert.deepEqual(rendered.stats.unrenderedSeqs, [], 'and every event in the span rendered to something')
})

test('a plan whose verdict crosses a composed boundary is still APPROVED in the first chapter', () => {
  const session = mapSession([
    dmsg(0, 'design it'), planCall(1, PLAN, 'c1'),
    dmsg(2, 'implementing', 'assistant'), verdict(3, 'c1'),
  ])
  const [first] = buildFinalizedChapters(session, [0, 1, 2, 3], plan([
    { number: 1, startSeq: 0, endSeq: 1 }, { number: 2, startSeq: 2, endSeq: 3 },
  ]), cfg)
  assert.equal(first!.stats.plans?.[0]?.status, 'approved', 'rendered from the whole shadowed span, not one range')
  assert.equal(first!.stats.plans?.[0]?.resultSeq, 3)
})

test('engineRecord carries plan facts, and the registry round-trips them through zod', async () => {
  const session = mapSession([dmsg(0, 'plan'), planCall(1), verdict(2, 'c1')])
  const rendered = buildFinalizedChapter(session, [0, 1, 2], plan([{ number: 1, startSeq: 0, endSeq: 2 }]), cfg)
  const rec = engineRecord(plan([{ number: 1, startSeq: 0, endSeq: 2 }]), [0, 1, 2], rendered, '/abs/001-x.md', 'a'.repeat(64))
  assert.equal(rec.plans?.[0]?.status, 'approved')
  assert.equal(rec.planMode, undefined, 'no plan/mode event was logged ⇒ the field is ABSENT, never a fabricated false')
  assert.equal(rendered.artifacts.length, 2, 'the plan blob and the verdict result')

  const tables = new Map<string, Map<string, unknown>>()
  const table = (name: string) => {
    let m = tables.get(name)
    if (m === undefined) { m = new Map(); tables.set(name, m) }
    return {
      get: (k: string) => m!.get(k), put: async (k: string, v: unknown) => { m!.set(k, v) },
      entries: () => m!.entries(), get size() { return m!.size },
    }
  }
  const store = makeDomainStore({ table, close: async () => {} } as never)
  await store.put('s-1', appendChapters(freshSession('s-1'), [rec]))
  const back = await store.get('s-1')
  assert.deepEqual(back.chapters[0]!.plans, rec.plans, 'the durable row keeps the plan facts')

  // A row written BEFORE the feature: the keys simply do not exist in storage, and
  // parsing must not invent them (JSON drops undefined keys on the way in).
  const legacyRaw = JSON.parse(JSON.stringify({ ...freshSession('old'), chapters: [{ ...rec, plans: undefined, planMode: undefined }] }))
  const parsed = parseSessionState(legacyRaw)
  assert.equal(parsed.chapters[0]!.plans, undefined, 'no phantom plan list on a legacy row')
  assert.equal(parsed.chapters[0]!.planMode, undefined)
})

test('deriveIdentity prefers a supplied plan title and falls back to the human line', () => {
  const msgs = [{ role: 'user', content: [{ type: 'text', text: 'design the thing now' }] }]
  assert.equal(deriveIdentity(msgs, false).title, 'design the thing now')
  assert.equal(deriveIdentity(msgs, false, 'Carry session plans into chapters').title, 'Carry session plans into chapters')
  assert.equal(deriveIdentity(msgs, false, '   ').title, 'design the thing now', 'blank is not a title')
  const long = 'x'.repeat(120)
  assert.equal(deriveIdentity(msgs, false, long).title.length, 73, 'the 72-char cap with an ellipsis still applies')
})

test('the engine honors a planInlineChars of 0 without losing the artifact', () => {
  const session = mapSession([planCall(1), verdict(2, 'c1')])
  const rendered = buildFinalizedChapter(session, [1, 2], plan([{ number: 1, startSeq: 1, endSeq: 2 }]), { ...cfg, planInlineChars: 0 })
  assert.ok(!rendered.markdown.includes('head (first'), 'no head printed')
  assert.equal(rendered.stats.plans?.length, 1, 'the fact still exists')
  assert.ok(rendered.artifacts.some((a) => a.content.includes('# Compact without losing the plan')), 'and its bytes are stored')
})
