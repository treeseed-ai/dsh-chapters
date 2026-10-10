/**
 * The enrichment ladder must never touch a plan document (docs/plans-carriage.md
 * § 11): its body is a WORK DIRECTIVE, and paraphrasing an order into a "summary"
 * is exactly the drift this store exists to prevent. The guard lives in the ladder
 * itself, keyed on the file's own `kind: plan` frontmatter — not on the filename,
 * so renaming a document cannot disarm it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChapterFile } from '../../src/enrich-store.ts'

const isPlanDoc = (text: string): boolean =>
  parseChapterFile(text).fmLines.some((l) => /^kind:\s*plan\s*$/.test(l))

const PLAN_DOC = [
  '---', 'kind: plan', 'title: "Migrate the store"', 'status: approved', 'planSeq: 2',
  'sha256: ' + 'a'.repeat(64), 'topics: ["store"]', '---', '',
  '# Migrate the store', '', '## Goal', 'Move blobs under the tree.', '',
].join('\n')
const CHAPTER = [
  '---', 'title: "Planning"', 'sha256: ' + 'b'.repeat(64), 'topics: ["store"]', '---', '',
  '**User:**', '', '```', 'hi', '```', '',
].join('\n')

test('a plan document is recognised by its kind, whatever the file is named', () => {
  assert.equal(isPlanDoc(PLAN_DOC), true)
  assert.equal(isPlanDoc(CHAPTER), false, 'a transcript chapter stays eligible')
  const renamed = PLAN_DOC.replace('kind: plan', 'kind:  plan  ')
  assert.equal(isPlanDoc(renamed), true, 'whitespace in the field cannot disarm the guard')
})

test('the guard is about kind, not filename: a mis-named chapter is still annotated', () => {
  assert.equal(isPlanDoc(CHAPTER), false, 'plan-001-sounds-like-a-plan.md is not exempt by name')
})

test('a plan body survives a sanctioned frontmatter write untouched', () => {
  const before = parseChapterFile(PLAN_DOC)
  assert.ok(before.body.trimStart().startsWith('# Migrate the store'), 'the document body is the plan, nothing else')
  assert.ok(!/\*\*User:\*\*|\*\*Assistant:\*\*/.test(before.body), 'and it carries no transcript to summarize')
})
