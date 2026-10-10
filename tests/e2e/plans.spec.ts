import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { openApp, localModelUp, currentSessionId, sessionLogTextById, logEvents, typeComposer, ROOT } from './session.ts'

/**
 * A SESSION PLAN, carried: plan mode in the browser, a real `exit_plan_mode`
 * submission, the host's own review card answered by a click, a fork — and the
 * child's own log calling that plan out while its full bytes sit on disk.
 *
 * The acceptance row for docs/plans-carriage.md § 4/§ 5, and the ONLY layer that
 * exercises the host's review exchange (the deterministic plane reads log-shaped
 * fixtures; this makes the harness write them).
 *
 * CLIENT-PLANE FACTS, MEASURED — not guessed:
 *  - plan-mode chip accessible names: `@deepseek-ai/dsh-client-ui-plan/lib/client.js:61-98`
 *    ("Plan mode off, press to turn on" / "Plan mode on, press to turn off");
 *  - the review question and its two labels: `@deepseek-ai/dsh-plan-mode/lib/index.js:259-276`
 *    ("Approve this plan and leave plan mode?" / "Approve" / "Keep planning");
 *  - options render as buttons named by their label
 *    (`@deepseek-ai/dsh-client-ui-user-questions/lib/client.js:276, 601`);
 *  - the chapters fork action: `button[aria-label="Fork with chapters"]`, measured
 *    live in fork-button.spec.ts.
 *
 * WHY THE TURN IS DRIVEN BY HAND (and not with newSessionWithTurn): the review is
 * AWAITED inside the tool call, so `turn/end` cannot arrive until a human answers.
 * The helper therefore waits for the card, clicks, and only then waits for the
 * turn to close — the shape the host actually produces.
 *
 * THE MODEL IS A SCRIPTED UPSTREAM on this box (tests/e2e/stub-model.ts): the wire
 * format is copied from recorded llama.cpp traffic, so the harness's provider, the
 * tool runtime, the review channel and the durable log are all REAL; only the
 * decision to submit a plan is scripted. What this journey therefore proves is the
 * carriage, not model behaviour — and the GPU box can re-record the same project
 * from the live model, which retires the stub (docs/plans-carriage.md § Tapes).
 * Assertions read the DURABLE plane: files on disk and the child's own log,
 * addressed by the identity localStorage reports.
 */

const storeRoot = path.join(ROOT, '.dsh-chapters')

const walkMd = (dir: string): string[] => {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkMd(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

/**
 * Chapters carrying a Plans block, SCOPED to one session tree. Scoping is not
 * tidiness: the store accumulates across specs and across re-runs of this one, and
 * an unscoped scan lets a PREVIOUS run's plan satisfy the assertion — a green that
 * proves nothing. `rootSession` is the id this spec just created through the real
 * UI, so anything found under it was written by this journey.
 */
const archivedPlans = (rootSession: string): Array<{ chapter: string; blob: string; bytes: number; text: string }> => {
  const found: Array<{ chapter: string; blob: string; bytes: number; text: string }> = []
  const tree = path.join(storeRoot, rootSession)
  if (!fs.existsSync(tree)) return found
  for (const file of walkMd(tree)) {
    const text = fs.readFileSync(file, 'utf8')
    if (!text.includes('## Plans in this chapter')) continue
    const m = /full text: `artifacts\/([0-9a-f]{2})\/([0-9a-f]{64})\.txt`/.exec(text)
    if (m === null) continue
    // the blob sits beside the chapter's session tree: <store>/<root>/artifacts/…
    const blob = path.join(tree, 'artifacts', m[1]!, `${m[2]}.txt`)
    if (fs.existsSync(blob)) found.push({ chapter: file, blob, bytes: fs.statSync(blob).size, text })
  }
  return found
}

/** Create a session and wait only for its identity (no turn is expected yet). */
async function newSession(page: Page): Promise<string> {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-label="New session"]'))
      .find((b) => /New Session/i.test(b.textContent ?? '')) as HTMLButtonElement | undefined
    btn?.click()
  })
  let sid: string | null = null
  for (let i = 0; i < 15 && sid === null; i += 1) {
    await page.waitForTimeout(1000)
    sid = await currentSessionId(page)
  }
  if (sid === null) throw new Error('new-session click never set dsh.sessions.current')
  return sid
}

test('an approved plan is archived whole and called out in the child that continues it', async ({ page }) => {
  test.setTimeout(1_500_000)

  const upstreamLive = await localModelUp()
  if (!upstreamLive) {
    // Loud, never vacuous: a skipped journey reads as green to anything that
    // only counts failures (measured 2026-09-19: a run asserted against an
    // agent transcript because a skip was quiet).
    throw new Error('plans.spec: nothing answers http://localhost:8080 — start the scripted upstream (node tests/e2e/stub-model.ts) or the live Local model. This journey must RUN.')
  }

  await openApp(page)
  const sid = await newSession(page)
  const preSeq = Math.max(0, ...sessionLogTextById(sid).split('\n')
    .map((l) => { try { const e = JSON.parse(l); return typeof e.seq === 'number' ? e.seq : -1 } catch { return -1 } })
    .filter((n) => n >= 0))

  // `/plan <message>` is the ENTRY door: the host appends `plan/mode {active:true}`
  // immediately (no turn is open yet) and steers the text as one ordinary user
  // message. The chip is NOT one — `PlanModeControl` renders only while mode is
  // already active (`plan.pending ? !plan.active : plan.active`, client.js:39-41):
  // it is the EXIT control. Measured the hard way, one 40-minute timeout.
  //
  // The model's exit_plan_mode call then opens the host's review, which BLOCKS the
  // turn — so waiting for the card is the correct wait, not a deadline.
  await typeComposer(page, '/plan Which file defines the chapter renderer? Plan only — do not edit anything, and present the plan with the exit_plan_mode tool when ready.')

  // The review renders as a REGION named by the question, with the plan text
  // inside it and an "Approve" button (measured from the failure snapshot of the
  // first recording run: `region "Approve this plan and leave plan mode?"` →
  // `paragraph: An approved session plan survives…` → `button "Approve"`).
  // A `text=` locator on the question hung for 20 minutes: the substring exists
  // only inside that region's accessible name, not as matchable element text.
  const card = page.getByRole('region', { name: /Approve this plan and leave plan mode/ })
  await expect(card, 'the host opens its plan review').toBeVisible({ timeout: 900_000 })

  // Read the plan the card is showing BEFORE answering: it is the same text the
  // tool call carried, so this asserts the review received the real bytes.
  const cardText = await card.innerText()
  expect(cardText).toMatch(/Verify the plan carriage end to end/, 'the plan the human reviews is the plan the model sent')
  expect(cardText).toMatch(/unit plans suite, the carriage integration/, 'through to the plan\u2019s last line')

  await card.getByRole('button', { name: 'Approve' }).click()

  // Now the turn can close.
  await expect.poll(() => {
    const evs = sessionLogTextById(sid).split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((e): e is { seq: number; type: string } => e !== null && typeof e.seq === 'number')
    const approved = evs.some((e) => e.type === 'tool/result' && e.seq > preSeq)
    return approved && evs.some((e) => e.type === 'turn/end' && e.seq > preSeq)
  }, { timeout: 900_000, intervals: [3000] }, 'the approved review and turn/end are durable in the log').toBe(true)

  const parentLog = sessionLogTextById(sid)
  expect(parentLog).toContain('"exit_plan_mode"', 'the submission is in the durable log')
  expect(parentLog).toContain('"plan/mode"', 'and the mode flip is a durable event of its own')

  // Fork: everything through the last completed turn is archived; a child opens.
  const fork = page.locator('button[aria-label="Fork with chapters"]').first()
  await expect(fork, 'the chapters fork action survives a plan turn').toBeVisible({ timeout: 120_000 })
  await fork.click()

  // ---- durable plane: chapter carries the block, blob carries the bytes.
  await expect.poll(() => archivedPlans(sid).length, { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(0)
  const [plan] = archivedPlans(sid)
  expect(plan!.bytes).toBeGreaterThan(200, 'a plan is more than its printed head')
  const blob = fs.readFileSync(plan!.blob, 'utf8')
  expect(blob).toMatch(/^# Verify the plan carriage end to end/, 'the stored bytes are the plan markdown itself')
  expect(blob).toContain('## Tests', 'through to the last section')
  expect(plan!.text).toMatch(/### Plan — "Verify the plan carriage end to end" — APPROVED/)
  // MEASURED, not assumed (this run's first attempt expected 'active' and the
  // product said otherwise): approving a plan EXITS plan mode, so the last logged
  // `plan/mode` in the archived span is inactive. Both flips print, and the fold
  // is the last one — exactly the host projection rule the record describes.
  expect(plan!.text).toMatch(/- plan mode ACTIVE from seq \d+ \(log event plan\/mode\)/, 'entry recorded')
  expect(plan!.text).toMatch(/- plan mode inactive from seq \d+ \(log event plan\/mode\)/, 'the approved exit recorded')
  expect(plan!.text).toMatch(/^planMode: inactive$/m, 'and the fold takes the last value')
  expect(plan!.text).toMatch(/^plans: \[\d+:approved:[0-9a-f]{8}\]$/m, 'frontmatter declares what the block claims')

  // ---- the child's own log names the operative plan and how to load it.
  const childId = await currentSessionId(page)
  expect(childId, 'the app switched to the branch').toBeTruthy()
  expect(childId).not.toBe(sid)
  // Read the SEEDED EVENT, not the raw JSONL: inside the log the notice text is
  // JSON-escaped, so quoting assertions against the file text silently never match
  // (measured on this run — the poll passed on the substring, the anchored regex
  // did not). Parse the event and assert on the text the child actually reads.
  const childLog = sessionLogTextById(childId ?? '')
  const noticeEvent = logEvents(childLog).find((e) => e.type === 'user/message' && e.raw.includes('chapters:toc'))
  expect(noticeEvent, 'the child holds exactly one seeded TOC notice').not.toBeUndefined()
  const notice = JSON.parse(noticeEvent!.raw).data.content[0].text as string
  expect(notice).toMatch(/^## Plans on this path$/m, 'the block rides above the fold')
  expect(notice).toMatch(/ACTIVE PLAN: "Verify the plan carriage end to end" — APPROVED/)
  expect(notice).toContain('chapters_artifact', 'the child is told HOW to load it without swallowing it')
  expect(notice).toMatch(/Do NOT re-plan from recall/)
  expect(notice).toMatch(/full text: \.dsh-chapters\/[^ ]+artifacts\/[0-9a-f]{2}\/[0-9a-f]{64}\.txt/, 'cited to a path under the archive')
  // and the seeded event is the ONLY inherited history (invariant 2)
  const seeded = logEvents(childLog).filter((e) => e.type === 'user/message' && e.raw.includes('"plugin":"dsh-chapters"'))
  expect(seeded.length).toBe(1, 'one notice, no replayed parent events')
})
