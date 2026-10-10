/**
 * The enrichment ladder WRITES chapter files, so a Plans-bearing chapter must
 * survive a sanctioned frontmatter rewrite byte-for-byte in its body (docs/
 * plans-carriage.md § 2). Two ways this could have gone wrong and did not:
 * the new `plans:` / `planMode:` lines being read as part of the body by the
 * frontmatter splitter, and the body-hash guard (T9) tripping on a chapter whose
 * body now carries a fenced plan head — which would have silently frozen
 * enrichment for every planned session.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderChapter, sha256 } from '../../src/render.ts'
import { parseChapterFile, updateChapterFrontmatter, bodyHash } from '../../src/enrich-store.ts'
import type { RenderConfig, SessionEventLike } from '../../src/types.ts'

const CONFIG: RenderConfig = { toolResultDeferFloorTokens: 200, chapterTokenTarget: 4000 }
const PLAN = '# Carry the plan\n\n## Goal\nSurvive enrichment too.\n\n```md\n# fenced, must not close anything\n```\n'
const APPROVE = '{"approved":true} Plan approved — plan mode exited; carry out the plan starting with your next step.'

const events = (): SessionEventLike[] => [
  { type: 'user/message', seq: 0, data: { id: 'm0', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'design it' }] } },
  { type: 'plan/mode', seq: 1, data: { active: true } },
  { type: 'tool/call', seq: 2, data: { callId: 'c2', name: 'exit_plan_mode', arguments: { plan: PLAN } } },
  { type: 'tool/result', seq: 3, data: { message: { source: { kind: 'tool', callId: 'c2' }, content: [{ type: 'tool-result', toolCallId: 'c2', isError: false, content: [{ type: 'text', text: APPROVE }] }] } } },
  { type: 'assistant/message', seq: 4, data: { id: 'm4', role: 'assistant', source: { kind: 'user' }, content: [{ type: 'text', text: 'ok' }] } },
]

test('a Plans-bearing chapter round-trips through the enrichment writer', () => {
  const chapter = renderChapter(events(), { title: 'Planning', summary: 's', startSeq: 0, endSeq: 4 }, CONFIG)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrich-plans-'))
  const file = path.join(dir, '001-planning.md')
  fs.writeFileSync(file, chapter.markdown)

  const doc = parseChapterFile(fs.readFileSync(file, 'utf8'))
  // the plan's own fence and its HR must NOT be read as the frontmatter close
  assert.ok(doc.body.includes('## Plans in this chapter'), 'body keeps the block')
  assert.ok(doc.body.includes('# fenced, must not close anything'), 'and the plan survives inside it')
  assert.equal(doc.fmLines.find((l) => l.startsWith('plans:'))?.includes('2:approved:'), true, 'the plans: line is frontmatter, not body')
  // the declared anchor matches the parsed body — the guard's whole contract
  const declared = doc.fmLines.find((l) => /^sha256: /.test(l))!.split(': ')[1]!
  assert.equal(declared, bodyHash(doc.body), 'T9 convention holds with a Plans block present')

  const wrote = updateChapterFrontmatter(file, { generated: '[{by:"dsh-chapters"}]' }, sha256(chapter.markdown))
  assert.equal(wrote.changed, true)
  const after = parseChapterFile(fs.readFileSync(file, 'utf8'))
  assert.equal(after.body, doc.body, 'the BODY is untouched bytes — enrichment grew frontmatter only')
  assert.equal(after.fmLines.find((l) => l.startsWith('plans:')) === undefined, false, 'the plans: line survived the rewrite')
  assert.equal(bodyHash(after.body), declared, 'and the guard still agrees with the anchor')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the plan artifact and the verdict result are separate, resolvable blobs', () => {
  const chapter = renderChapter(events(), { title: 'Planning', summary: 's', startSeq: 0, endSeq: 4 }, CONFIG)
  const fact = chapter.stats.plans![0]!
  const plan = chapter.artifacts.find((a) => a.sha256 === fact.sha256)!
  assert.equal(plan.content, PLAN.trim(), 'the plan blob holds the plan and nothing else')
  assert.ok(chapter.artifacts.length >= 2, 'the verdict result is its own artifact')
  assert.notEqual(chapter.artifacts.find((a) => a.sha256 === fact.sha256)!.path, plan.path + '.txt')
})
