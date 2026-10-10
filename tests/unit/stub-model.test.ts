/**
 * The scripted upstream's decision rule, pinned because its FIRST version read the
 * whole message array for `exit_plan_mode`/`approved` — words that live in the
 * SYSTEM PROMPT (tool catalog + plan policy) — so every turn answered in prose and
 * the review card never opened. A stub that quietly answers wrongly is worse than
 * no stub: the journey would have recorded a tape of a session that never planned.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, STUB_MODEL } from '../e2e/stub-model.ts'

const msg = (role: string, content: string) => ({ role, content })

test('the title assembly is its own decision — a single system prompt about titling', () => {
  assert.equal(decide({ messages: [msg('system', 'Create a concise title for an AI coding-assistant session'), msg('user', '[]')] }).kind, 'title')
})

test('a fresh conversation submits the plan — even though the system prompt names exit_plan_mode and approval', () => {
  const withCatalog = [
    msg('system', 'Tools include exit_plan_mode: Present your plan for the user\'s review and, on approval, leave plan mode.'),
    msg('user', 'Plan only: which file defines the chapter renderer?'),
  ]
  assert.equal(decide({ messages: withCatalog }).kind, 'plan', 'catalog text is NOT a verdict')
})

test('a tool message in the transcript is the only thing that means the human answered', () => {
  const answered = [
    msg('system', 'exit_plan_mode may be approved'),
    msg('user', 'Plan only'),
    { role: 'assistant', content: [], toolCalls: [{ name: 'exit_plan_mode' }] },
    { role: 'tool', content: 'Plan approved' },
  ]
  assert.equal(decide({ messages: answered }).kind, 'after-approval')
})

test('the stub names itself, never impersonates the distilled model', () => {
  assert.equal(STUB_MODEL, 'stub-plan-carriage', 'a tape recorded here must be readable as such')
})
