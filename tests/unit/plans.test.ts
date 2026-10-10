/**
 * The plan detector (docs/plans-carriage.md § 1) and the notice block it feeds (§ 4).
 *
 * Fixtures mirror the REAL host shapes, never invented ones — the same discipline
 * tests/unit/render.test.ts:18-22 applies to tool results, because a flat fake
 * payload is exactly what hid a real bug for a whole run (measured 2026-09-19).
 * Verdict texts here are copied from the installed `@deepseek-ai/dsh-plan-mode`
 * (`lib/index.js:237-251, 277-289`), so a host wording change shows up as a red
 * row rather than as a chapter that calls a rejected plan approved.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPlansSection, classifyVerdict, detectPlans, planOutlineOf, planTitleOf,
} from '../../src/plans.ts'
import type { NoticePlan } from '../../src/types.ts'
import type { SessionEventLike } from '../../src/types.ts'

const PLAN = `# Carry session plans into chapters

## Goal
Make an approved plan survive a continuation.

## Success criteria
- the child sees the verdict

\`\`\`md
# a heading inside a fence is NOT an outline entry
\`\`\`

### Details
More text.
`

const APPROVE_TEXT = '{"approved":true} Plan approved — plan mode exited; carry out the plan starting with your next step.'
const KEEP_PLANNING = 'The user chose to keep planning; their feedback: cover the rollback path.'
const DISMISSED = 'The user dismissed the plan review to speak instead; stay in plan mode, stop here, and wait for their message.'

const call = (seq: number, callId: string, plan: string, asString = false): SessionEventLike => ({
  type: 'tool/call', seq,
  data: { callId, name: 'exit_plan_mode', arguments: asString ? JSON.stringify({ plan }) : { plan } },
})
// REAL result nesting (measured e2e 2026-09-19): text sits ONE level below the wrapper.
const result = (seq: number, callId: string, text: string, isError = false): SessionEventLike => ({
  type: 'tool/result', seq,
  data: {
    message: {
      source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, isError, content: [{ type: 'text', text }] }],
    },
  },
})
const mode = (seq: number, active: boolean): SessionEventLike => ({ type: 'plan/mode', seq, data: { active } })

// ------------------------------------------------------------------ detection

test('detectPlans pairs a submission with its approval and classifies it', () => {
  const scan = detectPlans([call(4, 'c1', PLAN), result(5, 'c1', APPROVE_TEXT)])
  assert.equal(scan.plans.length, 1)
  const p = scan.plans[0]!
  assert.equal(p.status, 'approved')
  assert.equal(p.seq, 4)
  assert.equal(p.resultSeq, 5)
  assert.equal(p.title, 'Carry session plans into chapters')
  assert.equal(p.text, PLAN.trim())
  assert.equal(p.archived, true)
})

test('both argument shapes parse — object and pre-serialized string', () => {
  const viaObject = detectPlans([call(1, 'a', PLAN), result(2, 'a', APPROVE_TEXT)])
  const viaString = detectPlans([call(1, 'a', PLAN, true), result(2, 'a', APPROVE_TEXT)])
  assert.equal(viaString.plans[0]!.text, viaObject.plans[0]!.text)
})

test('a keep-planning verdict is rejected, and the feedback survives as the verdict line', () => {
  const p = detectPlans([call(1, 'a', PLAN), result(2, 'a', KEEP_PLANNING, true)]).plans[0]!
  assert.equal(p.status, 'rejected')
  assert.match(p.verdict ?? '', /keep planning/)
})

test('a dismissed review is DISMISSED, never REJECTED — the human spoke instead of answering', () => {
  const p = detectPlans([call(1, 'a', PLAN), result(2, 'a', DISMISSED, true)]).plans[0]!
  assert.equal(p.status, 'dismissed')
})

test('no result at all means PENDING, and pending is the loudest word in the vocabulary', () => {
  const p = detectPlans([call(1, 'a', PLAN)]).plans[0]!
  assert.equal(p.status, 'pending')
  assert.equal(p.resultSeq, null)
  assert.equal(p.verdict, null)
})

test('the LAST result of a redelivery is the authoritative one (measured 2026-09-28)', () => {
  const p = detectPlans([
    call(1, 'a', PLAN),
    result(2, 'a', KEEP_PLANNING, true),
    result(3, 'a', APPROVE_TEXT),
  ]).plans[0]!
  assert.equal(p.status, 'approved')
  assert.equal(p.resultSeq, 3)
})

test('a verdict past the ceiling still pairs, and a submission past it is the live one', () => {
  const below = detectPlans([call(4, 'a', PLAN), result(9, 'a', APPROVE_TEXT)], { ceiling: 6 })
  assert.equal(below.plans[0]!.status, 'approved', 'the pairing crossed the ceiling and stayed a pairing')
  assert.equal(below.plans[0]!.archived, true)
  const above = detectPlans([call(9, 'b', PLAN), result(12, 'b', APPROVE_TEXT)], { ceiling: 6 })
  assert.equal(above.plans[0]!.archived, false, 'seq 9 > ceiling 6: unarchivable until the turn closes')
})

test('same-titled re-submission: the newest is operative, the earlier one is superseded', () => {
  const revised = PLAN.replace('## Goal', '## Goal (v2)')
  const scan = detectPlans([
    call(1, 'a', PLAN), result(2, 'a', KEEP_PLANNING, true),
    call(6, 'b', revised), result(7, 'b', APPROVE_TEXT),
  ])
  assert.deepEqual(scan.plans.map((p) => p.status), ['superseded', 'approved'])
})

test('a differently-titled plan is an independent submission, not a supersession', () => {
  const other = '# Ship the release\n\n## Goal\nCut the tag.'
  const scan = detectPlans([call(1, 'a', PLAN), result(2, 'a', APPROVE_TEXT), call(6, 'b', other)])
  assert.deepEqual(scan.plans.map((p) => p.status), ['approved', 'pending'])
})

test('an unrelated tool call is not a plan, whatever its arguments say', () => {
  assert.equal(detectPlans([{ type: 'tool/call', seq: 1, data: { callId: 'x', name: 'bash', arguments: { command: 'exit_plan_mode' } } }]).plans.length, 0)
})

test('injected spans inside a plan body are screened out; prose quoting AGENTS.md survives', () => {
  const dirty = `${PLAN}\n<system-reminder>\nInstructions from: AGENTS.md\nsecret project policy\n</system-reminder>\n`
  const p = detectPlans([call(1, 'a', dirty), result(2, 'a', APPROVE_TEXT)]).plans[0]!
  assert.ok(!p.text.includes('system-reminder'), 'the span is gone')
  assert.ok(!p.text.includes('secret project policy'), 'and so are its bytes')
  assert.ok(p.text.includes('## Goal'), 'the plan itself stays verbatim')
  const quoted = '# Quoting is conversation\n\nThe AGENTS.md file says to append-only.\n'
  assert.match(detectPlans([call(1, 'a', quoted)]).plans[0]!.text, /AGENTS\.md file says/)
})

// ------------------------------------------------------------------ shape readers

test('planTitleOf takes the first heading at any level', () => {
  assert.equal(planTitleOf('## Deep first\nbody'), 'Deep first')
  assert.equal(planTitleOf('no heading here'), '')
})

test('planOutlineOf lists H2/H3 in order and skips headings inside fences', () => {
  const { outline, levels } = planOutlineOf(PLAN)
  assert.deepEqual(outline, ['Goal', 'Success criteria', 'Details'])
  assert.deepEqual(levels, [2, 2, 3])
})

test('classifyVerdict: a success that never says approved is NOT an approval (no invented verdict)', () => {
  assert.equal(classifyVerdict('ok then', false), 'failed')
  assert.equal(classifyVerdict('no user-questions channel is available', true), 'failed')
  assert.equal(classifyVerdict('{approved:true}', false), 'approved')
})

// ------------------------------------------------------------------ mode folding

test('plan/mode folds last-value-wins, exactly like the host projection', () => {
  const scan = detectPlans([mode(1, true), mode(9, false)])
  assert.deepEqual(scan.flips, [{ seq: 1, active: true }, { seq: 9, active: false }])
  assert.equal(scan.modeActive, false)
})

test('no mode event ever logged means modeActive null — unknown, never a guessed false', () => {
  assert.equal(detectPlans([call(1, 'a', PLAN)]).modeActive, null)
})

// ------------------------------------------------------------------ the notice block

const row = (over: Partial<NoticePlan> & { seq: number }): NoticePlan => ({
  title: 'T', status: 'approved', ...over,
})

test('zero plans means ZERO bytes: the tape-safety property (verify.md P8)', () => {
  assert.equal(buildPlansSection([]), '')
})

test('an approved operative plan calls out the artifact and forbids re-planning from recall', () => {
  const text = buildPlansSection([row({
    seq: 412, title: 'Carry session plans into chapters', status: 'approved',
    chapterNumber: 4, chapterPath: '.dsh-chapters/root/chapters/004-x.md',
    artifactPath: '.dsh-chapters/root/artifacts/8f/8f3a1c9d.txt', sha256: '8f3a1c9d'.repeat(8), estTokens: 4600,
  })])
  assert.match(text, /^## Plans on this path/m)
  assert.match(text, /ACTIVE PLAN: "Carry session plans into chapters" — APPROVED/)
  assert.match(text, /ch\. 4 \.dsh-chapters\/root\/chapters\/004-x\.md/)
  assert.match(text, /full text: \.dsh-chapters\/root\/artifacts\/8f\/8f3a1c9d\.txt/)
  assert.match(text, /do NOT re-plan from recall/i)
})

test('a PENDING operative plan is called out as never approved (verify.md P2)', () => {
  const text = buildPlansSection([row({ seq: 501, title: 'Maybe a plan', status: 'pending' })])
  assert.match(text, /ACTIVE PLAN: "Maybe a plan" — PENDING/)
  assert.match(text, /do NOT implement it/i)
  assert.ok(!/carry out the plan/i.test(text), 'nothing in it may read as approval')
})

test('a plan above the archive ceiling prints NOT ARCHIVED with its log seq (verify.md P6)', () => {
  const text = buildPlansSection([row({ seq: 640, title: 'Open review', status: 'pending' })])
  assert.match(text, /NOT ARCHIVED — parent log seq 640 only/)
})

test('superseded submissions list chronologically under the operative one', () => {
  const text = buildPlansSection([
    row({ seq: 10, title: 'Same plan', status: 'superseded' }),
    row({ seq: 20, title: 'Same plan', status: 'approved' }),
    row({ seq: 30, title: 'Other plan', status: 'rejected' }),
  ])
  assert.match(text, /ACTIVE PLAN: "Other plan" — REJECTED/)
  assert.equal(text.split('\n').filter((l) => l.startsWith('- ')).length, 3, 'ACTIVE + both earlier rows')
  assert.match(text, /3 submitted: 1 superseded, 1 approved, 1 rejected/, 'the tally states what the path holds')
})

test('a supersession of the OPERATIVE title is not repeated as its own line', () => {
  const text = buildPlansSection([
    row({ seq: 10, title: 'Carry plans', status: 'superseded' }),
    row({ seq: 20, title: 'Carry plans', status: 'approved' }),
  ])
  assert.match(text, /ACTIVE PLAN: "Carry plans" — APPROVED/)
  assert.equal(text.split('\n').filter((l) => l.startsWith('- ')).length, 1, 'the operative supersedes its own earlier draft silently')
})

test('a session archived mid-plan-mode says the child starts outside it (inherited mode is a host no)', () => {
  const text = buildPlansSection([row({ seq: 5, title: 'x', status: 'pending' })], { modeActive: true })
  assert.match(text, /Plan mode was ACTIVE at the end of the archived span/)
  assert.match(text, /this child starts OUTSIDE it/)
})

test('rows arrive in CAUSAL order and the LAST of them is operative — never re-sorted by seq', () => {
  // Two sessions on one ancestor path have independent seq spaces: a root chapter's
  // seq 40 and a child chapter's seq 3 are not comparable numbers. The notice builder
  // therefore hands rows in reading order (root-first chapters, then the live tail),
  // and this function must not "fix" that by sorting.
  const text = buildPlansSection([
    row({ seq: 40, title: 'Root plan', status: 'approved', chapterNumber: 1 }),
    row({ seq: 3, title: 'Child plan', status: 'pending', chapterNumber: 2 }),
  ])
  assert.match(text, /ACTIVE PLAN: "Child plan" — PENDING/, 'the LATER chapter wins, not the bigger number')
  const rows = text.split('\n').filter((l) => l.startsWith('- '))
  assert.match(rows[1]!, /Root plan/, 'chronological listing keeps reading order')
})
