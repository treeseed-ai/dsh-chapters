import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { openApp, newSessionWithTurn, localModelUp, currentSessionId, sessionLogTextById, ROOT } from './session.ts'

/**
 * A SESSION PLAN, carried: enter plan mode in the browser, let the model submit
 * `exit_plan_mode`, approve it in the host's review card, then fork — and prove the
 * child's own log calls that plan out while its FULL bytes sit on disk.
 *
 * The acceptance row for docs/plans-carriage.md. The deterministic plane already
 * pins classification, the block, the artifact, the budget and the zero-bytes rule
 * (tests/unit/plans-*.test.ts, tests/integration/plans-carriage.test.ts); only the
 * browser plane can show that the HOST's own review exchange writes exactly the log
 * shape this plugin reads, end to end in a real session.
 *
 * CLIENT-PLANE FACTS, MEASURED — not guessed:
 *  - the plan-mode chip's accessible name in each state:
 *    `@deepseek-ai/dsh-client-ui-plan/lib/client.js:61-98` ("Plan mode off, press to
 *    turn on" / "Plan mode on, press to turn off");
 *  - the review question the exit tool asks, and its two option labels:
 *    `@deepseek-ai/dsh-plan-mode/lib/index.js:259-276` ("Approve this plan and leave
 *    plan mode?" / "Approve" / "Keep planning");
 *  - options render as buttons named by their label
 *    (`@deepseek-ai/dsh-client-ui-user-questions/lib/client.js:276, 601`).
 *
 * DEV PROJECT, NOT IN THE CI CHAIN (the explore.spec precedent): it needs the live
 * model to submit a plan, so it self-skips when Local is not up. Recording its tape
 * on the GPU box is what promotes it to a chain project — and a first live run must
 * CONFIRM the selectors above against the shipped build before that promotion is
 * claimed (docs/plans-carriage.md § Tapes and e2e impact; verify.md P11).
 *
 * Prompts stay tool-free IN WORDS THE MODEL OBEYS (the RR2 lesson), and every
 * assertion reads the DURABLE plane — the archive files and the child's own log,
 * addressed by the identity localStorage reports, never a directory scan.
 */

const storeRoot = path.join(ROOT, '.dsh-chapters')

/** Chapters in any session tree of the store, each with the plan artifact it cites. */
const archivedPlans = (): Array<{ chapter: string; blob: string; bytes: number }> => {
  const found: Array<{ chapter: string; blob: string; bytes: number }> = []
  if (!fs.existsSync(storeRoot)) return found
  for (const sessionDir of fs.readdirSync(storeRoot)) {
    const chapters = path.join(storeRoot, sessionDir, 'chapters')
    if (!fs.existsSync(chapters) || !fs.statSync(chapters).isDirectory()) continue
    for (const file of fs.readdirSync(chapters).filter((f) => f.endsWith('.md'))) {
      const abs = path.join(chapters, file)
      const text = fs.readFileSync(abs, 'utf8')
      if (!text.includes('## Plans in this chapter')) continue
      for (const m of text.matchAll(/full text: `artifacts\/([0-9a-f]{2})\/([0-9a-f]{64})\.txt`/g)) {
        const blob = path.join(storeRoot, sessionDir, 'artifacts', m[1]!, `${m[2]}.txt`)
        if (fs.existsSync(blob)) found.push({ chapter: abs, blob, bytes: fs.statSync(blob).size })
      }
    }
  }
  return found
}

test('an approved plan is archived whole and called out in the child that continues it', async ({ page }) => {
  test.setTimeout(900_000)
  test.skip(!(await localModelUp()), 'Local model server not running — this journey needs a live plan submission')

  await openApp(page)
  // Enter plan mode with the shipped chip (the /plan command is the other door; the
  // chip is the one whose accessible name is measured above).
  await page.locator('button[aria-label="Plan mode off, press to turn on"]').first().click()
  await newSessionWithTurn(page, 'Which file defines the chapter renderer? Plan only — do not edit anything.')

  // The host opens its review card with the plan the model submitted. Approve it.
  await expect(page.locator('text=Approve this plan and leave plan mode').first(), 'the review card opens')
    .toBeVisible({ timeout: 300_000 })
  await page.getByRole('button', { name: 'Approve' }).first().click()

  // Fork: everything through the last completed turn is archived, a child opens.
  const fork = page.locator('button[aria-label="Fork with chapters"]').first()
  await expect(fork, 'the chapters fork action survives a plan turn').toBeVisible({ timeout: 120_000 })
  await fork.click()

  // ---- durable plane: the chapter carries the block; the blob carries the bytes.
  await expect.poll(() => archivedPlans().length, { timeout: 180_000, intervals: 2_000 })
    .toBeGreaterThan(0)
  const [plan] = archivedPlans()
  expect(plan!.bytes).toBeGreaterThan(60, 'a plan is more than its printed head')
  expect(fs.readFileSync(plan!.blob, 'utf8')).toMatch(/^#\s+\S/m, 'the stored bytes are the plan markdown itself')
  const chapterText = fs.readFileSync(plan!.chapter, 'utf8')
  expect(chapterText).toMatch(/### Plan — ".*" — APPROVED/)
  expect(chapterText).toMatch(/^planMode: (active|inactive)$/m, 'the folded mode state is declared')
  expect(chapterText).toMatch(/^plans: \[\d+:approved:[0-9a-f]{8}\]$/m, 'frontmatter declares what the block claims')

  // ---- the child's own log: the operative plan is named, with a retrievable path.
  const childId = await currentSessionId(page)
  expect(childId, 'the app switched to the branch').toBeTruthy()
  await expect.poll(() => {
    const log = sessionLogTextById(childId ?? '')
    return log.includes('ACTIVE PLAN') && log.includes('chapters_artifact')
  }, { timeout: 180_000, intervals: 2_000 }).toBe(true)
  expect(sessionLogTextById(childId ?? '')).toMatch(/ACTIVE PLAN: "[^"]+" — APPROVED/)
})
