/**
 * "Can a NEW session find the plans, the rules, and the other important details when
 * it asks?" — the requirement, tested as a query rather than as a data structure.
 *
 * A store, a pool publication and a mirror are plumbing; the only thing a child
 * actually has is a question. So this file writes one of each document kind into a
 * real archive, publishes it the way the sync loop does, and then asks three things a
 * fresh session would ask — and asserts the answer NAMES the kind and opens at a real
 * path. Plans and rules are the two kinds a child cannot guess at: a plan lives in no
 * chapter it was pointed to, and a rule arrives from another machine entirely.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCorpus, searchKnowledge } from '../../src/search.ts'
import { entryFromChapter } from '../../src/indexing.ts'

const PLAN_DOC = [
  '---', 'kind: plan', 'title: "Carry the carriage"', 'status: approved', 'planSeq: 12',
  'sha256: ' + 'a'.repeat(64), 'topics: ["carriage", "plans", "notice"]', '---', '',
  '# Carry the carriage', '', '## Goal', 'Put the operative plan into the continuation notice.', '',
].join('\n')

const CHAPTER_DOC = [
  '---', 'kind: chapter', 'title: "Rendering chapters"', 'topics: ["render", "chapter", "markdown"]',
  'sha256: ' + 'b'.repeat(64), '---', '',
  '**Assistant:** The renderer writes verbatim Markdown chapter bodies.', '',
].join('\n')

const RULE_DOC = [
  '---', 'kind: rule', 'title: "Never exempt the token meter"', 'category: policy',
  'topics: ["meter", "budget", "preflight"]', '---', '',
  'A plan block counts against the continuation budget. Never exempt the meter.', '',
].join('\n')

const world = (): { clone: string; write: (rel: string, text: string) => string } => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'find-everything-'))
  const clone = path.join(tmp, 'pool')
  return {
    clone,
    write: (rel, text) => {
      const p = path.join(clone, rel)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, text)
      return p
    },
  }
}

const find = (clone: string, query: string) =>
  searchKnowledge(clone, query, 2000, { projectKey: 'PK' })

test('a question about a plan answers with the plan, labelled as one', () => {
  const w = world()
  w.write('chapters/PK/sess-1/plan-001-carry-the-carriage.md', PLAN_DOC)
  w.write('chapters/PK/sess-1/001-rendering-chapters.md', CHAPTER_DOC)
  const hit = find(w.clone, 'carry the operative plan into the continuation notice')
  const plans = hit.results.filter((r) => r.kind === 'plan')
  assert.ok(plans.length > 0, `expected a plan in the results: ${JSON.stringify(hit.results.map((r) => r.kind))}`)
  assert.match(plans[0]!.path, /plan-001-carry-the-carriage\.md$/)
  assert.ok(fs.existsSync(path.join(w.clone, plans[0]!.path)), 'the cited path opens for the read tool')
  assert.match(hit.line, /\| plan \|/, 'and the printed line names the kind, so the child knows it holds a directive')
  fs.rmSync(path.dirname(w.clone), { recursive: true, force: true })
})

test('a question about a rule answers with the rule, from another machine', () => {
  const w = world()
  w.write('rules/PK/dsh/rules-0001-never-exempt-the-meter.md', RULE_DOC)
  w.write('chapters/PK/sess-1/001-rendering-chapters.md', CHAPTER_DOC)
  const hit = find(w.clone, 'may the plan block be exempted from the budget')
  const rules = hit.results.filter((r) => r.kind === 'rule')
  assert.ok(rules.length > 0, `expected a rule: ${JSON.stringify(hit.results.map((r) => r.kind))}`)
  assert.match(rules[0]!.path, /rules-0001-never-exempt-the-meter\.md$/)
  assert.ok(fs.existsSync(path.join(w.clone, rules[0]!.path)), 'the rule path opens')
  assert.match(hit.line, /\| rule \|/, 'labelled as a rule')
  fs.rmSync(path.dirname(w.clone), { recursive: true, force: true })
})

test('a question about the work answers with the chapter, and all three kinds coexist', () => {
  const w = world()
  w.write('chapters/PK/sess-1/plan-001-carry-the-carriage.md', PLAN_DOC)
  w.write('chapters/PK/sess-1/001-rendering-chapters.md', CHAPTER_DOC)
  w.write('rules/PK/dsh/rules-0001-never-exempt-the-meter.md', RULE_DOC)
  const chapter = find(w.clone, 'verbatim markdown chapter bodies rendering')
  assert.ok(chapter.results.some((r) => r.kind === 'chapter'), 'the narrative question reaches the transcript')
  // The corpus is one index over three kinds: nothing may be displaced by having a kind.
  const corpus = loadCorpus(w.clone)
  const kinds = corpus.entries.map((e) => e.kind).sort()
  assert.deepEqual(kinds, ['chapter', 'plan', 'rule'], 'every kind is indexed from the same store')
  for (const e of corpus.entries) {
    assert.ok(e.topics.length > 0, `${e.kind} carries topics for the index floor`)
  }
  fs.rmSync(path.dirname(w.clone), { recursive: true, force: true })
})

test('a plan document is findable by its status and by what it changed, not only its title', () => {
  const entry = entryFromChapter('chapters/PK/sess-1/plan-001-carry-the-carriage.md', PLAN_DOC, Date.now())
  assert.equal(entry.kind, 'plan')
  assert.deepEqual(entry.topics, ['carriage', 'plans', 'notice'], 'topics come from its own frontmatter')
  const w = world()
  w.write('chapters/PK/sess-1/plan-001-carry-the-carriage.md', PLAN_DOC)
  const byBody = find(w.clone, 'operative plan continuation notice goal')
  assert.ok(byBody.results.some((r) => r.kind === 'plan'), 'body terms reach the plan too')
  fs.rmSync(path.dirname(w.clone), { recursive: true, force: true })
})
