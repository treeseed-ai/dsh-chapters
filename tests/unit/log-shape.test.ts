/**
 * The log-shape readers extracted from the renderer (docs/plans-carriage.md § 1):
 * the plan detector and the chapter renderer must pair calls with results by ONE
 * implementation. These rows are the contract they share.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  callArg, callArgsText, lastResultFor, resultCallId, sameCall, toolResultIsError, toolResultText,
} from '../../src/log-shape.ts'
import type { SessionEventLike } from '../../src/types.ts'

const call = (seq: number, callId: string, args: unknown): SessionEventLike =>
  ({ type: 'tool/call', seq, data: { callId, name: 'x', arguments: args } })
const result = (seq: number, callId: string, text: string, isError = false): SessionEventLike => ({
  type: 'tool/result', seq,
  data: {
    message: {
      source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, isError, content: [{ type: 'text', text }] }],
    },
  },
})

test('toolResultText flattens the REAL nesting (text one level below the wrapper)', () => {
  assert.equal(toolResultText(result(1, 'a', 'hello').data as Record<string, unknown>), 'hello')
  const stringContent: SessionEventLike = {
    type: 'tool/result', seq: 1,
    data: { message: { content: [{ type: 'tool-result', content: 'flat string' }] } },
  }
  assert.equal(toolResultText(stringContent.data as Record<string, unknown>), 'flat string')
})

test('toolResultIsError reads the wrapper flag, which is where the host puts it', () => {
  assert.equal(toolResultIsError(result(1, 'a', 'boom', true).data as Record<string, unknown>), true)
  assert.equal(toolResultIsError(result(1, 'a', 'fine').data as Record<string, unknown>), false)
})

test('resultCallId: nested message.source, and a flat data.callId as the older fallback', () => {
  assert.equal(resultCallId(result(1, 'abc', 'x')), 'abc')
  assert.equal(resultCallId({ type: 'tool/result', seq: 2, data: { callId: 'flat' } }), 'flat')
  assert.equal(resultCallId({ type: 'tool/result', seq: 3, data: {} }), undefined)
})

test('sameCall matches by callId ONLY — adjacency never implies a pairing', () => {
  assert.equal(sameCall(call(1, 'a', {}), result(9, 'a', 'x')), true)
  assert.equal(sameCall(call(1, 'a', {}), result(2, 'b', 'x')), false)
  assert.equal(sameCall({ type: 'tool/call', seq: 1, data: { name: 'x' } } as SessionEventLike, result(2, 'a', 'x')), false,
    'an unnamed call cannot be paired with anything')
})

test('lastResultFor takes the newest copy of a redelivery', () => {
  const list = [result(2, 'a', 'first', true), result(5, 'a', '{"approved":true}')]
  assert.equal(lastResultFor(list, 'a')?.seq, 5)
  assert.equal(lastResultFor(list, 'zz'), undefined)
})

test('callArg accepts an object, a JSON string, and refuses to invent from junk', () => {
  assert.equal(callArg({ arguments: { plan: 'P' } }, 'plan'), 'P')
  assert.equal(callArg({ arguments: '{"plan":"P"}' }, 'plan'), 'P')
  assert.equal(callArg({ arguments: 'not json at all' }, 'plan'), undefined)
  assert.equal(callArg({}, 'plan'), undefined)
})

test('callArgsText serializes once, identically for both shapes', () => {
  const a = callArgsText({ arguments: { x: 1 } })
  const b = callArgsText({ arguments: '{"x":1}' })
  assert.equal(a, b)
})
