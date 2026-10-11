/**
 * The host-drift gate for the seeded continuation (docs/plans-carriage.md § 10).
 *
 * Seeding `plan/mode` into a continuation child is the one place this plugin leans on
 * kernel internals: it works because the host (a) KNOWS the `plan/mode` event type and
 * (b) treats it as LOG-ONLY, never surface-eligible. Both facts were measured against
 * the installed kernel on 2026-10-10 — and neither is checked by anything else in the
 * suite, which is exactly how a kernel upgrade would turn into silent behavioural
 * drift: a child that is no longer gated, or a seed the constructor refuses outright,
 * with every test still green.
 *
 * These rows read the kernel's own exported predicates rather than reimplementing its
 * rules, so they fail when the kernel's INTENT changes, not when its code is refactored.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const KERNEL = '@deepseek-ai/dsh-session'

const kernel = await import(KERNEL).catch(() => null)

// The host is a devDependency: if it cannot be resolved the gate is not "skipped
// quietly", it is unmeasured — so say which, in the test name.
const guard = kernel === null ? 'SKIP' : 'RUN'

test(`${guard} — plan/mode is a kernel-known event type`, { skip: kernel === null ? `${KERNEL} not installed` : false }, async () => {
  assert.ok(kernel !== null)
  const types = kernel.KNOWN_SESSION_EVENT_TYPES as Set<string>
  assert.equal(types.has('plan/mode'), true,
    'the host stopped knowing plan/mode: a seeded plan/mode event would now be rejected, and continuations would silently stop being gated')
})

test(`${guard} — plan/mode is log-only, never surface-eligible`, { skip: kernel === null ? `${KERNEL} not installed` : false }, async () => {
  assert.ok(kernel !== null)
  assert.equal(kernel.isSurfaceEligibleType('plan/mode'), false,
    "the host made plan/mode surface-eligible: the seeded event would enter the child's context, changing what a continuation is charged for")
})

test(`${guard} — the surface/append predicates still distinguish the seed shape`, { skip: kernel === null ? `${KERNEL} not installed` : false }, async () => {
  assert.ok(kernel !== null)
  // `isAppendSurfaceEvent` narrows on the event's MARKER as well as its type, so a
  // hand-built object is not evidence about the kernel — an earlier revision of this
  // row asserted on its own fixture and "failed" for that reason. The notice's
  // reachability is proven end to end instead: the browser journey reads the child's
  // TOC back off the durable log. What is gated here is the type-level intent, which
  // is the part a kernel change can flip without touching our code.
  assert.equal(kernel.isSurfaceEligibleType('user/message'), true, 'the notice event must stay surface-eligible')
  const mode = { type: 'plan/mode', seq: 1, data: { active: true } }
  assert.equal(kernel.isAppendSurfaceEvent(mode as never), false, 'a seeded plan/mode stays out of the surface')
  const flip = { type: 'plan/mode', seq: 2, data: { active: false } }
  assert.equal(kernel.isAppendSurfaceEvent(flip as never), false, 'and so does the exit flip')
})

test(`${guard} — a plugin-authored synthetic event is a permitted shape`, { skip: kernel === null ? `${KERNEL} not installed` : false }, async () => {
  assert.ok(kernel !== null)
  // Invariant 2's amendment depends on the plugin authoring the state event itself.
  // adoptSessionEvent is the host's own coercion boundary; if it starts rejecting a
  // synthetic plan/mode, the seed contract is gone and the child is not gated.
  const adopted = kernel.adoptSessionEvent({ type: 'plan/mode', seq: 1, data: { active: true } } as never)
  assert.equal(adopted?.type, 'plan/mode')
})
