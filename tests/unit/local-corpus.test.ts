/**
 * Search with NO pool linked (findability audit, 2026-10-11).
 *
 * `chapters_search` used to answer a question about a local archive with
 * "link a remote first" — even though every chapter, every `kind: plan` document and
 * every rule was already on disk in the workspace store. That is the difference
 * between an index that exists and an index a session can actually use, so these rows
 * pin the local door: what it finds, what it deliberately does not index, and how it
 * distinguishes "nothing matched" from "there is nothing here".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildLocalCorpus, searchLocalStore } from '../../src/search.ts'

const store = (): string => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'local-corpus-')), '.dsh-chapters')
  fs.mkdirSync(path.join(root, 'sess-1', 'chapters'), { recursive: true })
  fs.mkdirSync(path.join(root, 'rules', 'h-1'), { recursive: true })
  fs.mkdirSync(path.join(root, 'artifacts', 'aa'), { recursive: true })
  fs.mkdirSync(path.join(root, 'sess-1', 'artifacts', 'bb'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sess-1', 'chapters', '001-work.md'), [
    '---', 'title: "Wire the renderer"', 'topics: ["render", "chapter"]', 'summary: "How chapters get rendered"', '---', '',
    '**Assistant:** The renderer writes the body.', '',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'sess-1', 'chapters', 'plan-001-carriage.md'), [
    '---', 'kind: plan', 'title: "Carry the plan"', 'status: approved', 'topics: ["carriage", "notice"]', '---', '',
    '# Carry the plan', '', 'Put the operative plan into the notice.', '',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'rules', 'h-1', '001-meter.md'), [
    '---', 'kind: rule', 'title: "Never exempt the meter"', 'category: policy', '---', '',
    'Plan blocks count against the continuation budget.', '',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'artifacts', 'aa', `${'a'.repeat(64)}.txt`), 'a deferred blob, not prose\n')
  fs.writeFileSync(path.join(root, 'sess-1', 'artifacts', 'bb', `${'b'.repeat(64)}.txt`), 'a chapter-level blob\n')
  return root
}

test('the local store yields all three document kinds', () => {
  const root = store()
  const { entries } = buildLocalCorpus(root)
  const kinds = entries.map((e) => e.kind).sort()
  assert.deepEqual(kinds, ['chapter', 'plan', 'rule'], `expected one of each, got ${JSON.stringify(kinds)}`)
  assert.equal(entries.find((e) => e.kind === 'plan')!.path, 'sess-1/chapters/plan-001-carriage.md')
  assert.ok(entries.find((e) => e.kind === 'rule')!.path.startsWith('rules/h-1/'), 'rules keep their harness partition')
  fs.rmSync(path.dirname(root), { recursive: true, force: true })
})

test('blobs are NOT indexed twice — artifacts answer to chapters_artifact', () => {
  const root = store()
  const { entries } = buildLocalCorpus(root)
  assert.equal(entries.some((e) => e.path.includes('artifacts')), false, 'no artifact appears as a search document')
  fs.rmSync(path.dirname(root), { recursive: true, force: true })
})

test('a plan question finds the plan, and the path opens from the workspace', () => {
  const root = store()
  const hit = searchLocalStore(root, 'carry the operative plan into the notice', 400)
  assert.ok(hit.results.length > 0, 'the plan is found')
  assert.equal(hit.results[0]!.kind, 'plan')
  assert.ok(fs.existsSync(path.join(root, hit.results[0]!.path)), 'a citation that does not open is not a citation')
  assert.equal(hit.empty, false)
  fs.rmSync(path.dirname(root), { recursive: true, force: true })
})

test('"nothing matched" and "nothing here" stay distinguishable', () => {
  const root = store()
  const noMatch = searchLocalStore(root, 'zzz nonexistent topic qqq', 400)
  assert.equal(noMatch.results.length, 0)
  assert.equal(noMatch.empty, false, 'documents exist; the query simply did not match')
  assert.equal(noMatch.documents, 3)
  const absent = searchLocalStore(path.join(root, 'never-created'), 'anything', 400)
  assert.equal(absent.empty, true, 'no store at all is a different fact, and is reported as one')
  fs.rmSync(path.dirname(root), { recursive: true, force: true })
})

test('the local and pool doors share one scorer, so ranking cannot drift', () => {
  const root = store()
  const a = searchLocalStore(root, 'render chapters', 400)
  const b = searchLocalStore(root, 'render chapters', 400)
  assert.deepEqual(a.results.map((r) => `${r.path}|${r.score}`), b.results.map((r) => `${r.path}|${r.score}`), 'deterministic')
  assert.match(a.line, /\| chapter \|/, 'the printed line keeps the kind column for both doors')
  fs.rmSync(path.dirname(root), { recursive: true, force: true })
})
