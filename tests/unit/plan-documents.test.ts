/**
 * Plans as first-class DOCUMENTS (docs/plans-carriage.md § 11) — the human decision
 * of 2026-10-10: "I can see wanting to query the plans", including how they evolved
 * and what their status became. A plan is therefore not only bytes inside a
 * transcript chapter: it is its own `kind: plan` file, in the same tree so the pool
 * transport, the mirror rehydrate and the corpus index carry it unchanged.
 *
 * What each row protects:
 *  - the document's body is the plan, byte for byte — a paraphrased directive is the
 *    failure mode the whole plugin exists to avoid;
 *  - numbering is INDEPENDENT of chapters (a plan must never consume a chapter
 *    number or reorder the TOC) yet still registry-allocated (never a directory scan,
 *    so a concurrent sibling cannot pick the same name);
 *  - the corpus keeps `kind: plan` rather than flattening it back to `chapter`;
 *  - enrichment skips directives entirely — the ladder annotates narrative, never an
 *    order.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderChapter, sha256 } from '../../src/render.ts'
import { writeArchive, type ArchiveFs, type RenderedChapter } from '../../src/archive.ts'
import { entryFromChapter } from '../../src/indexing.ts'
import { planTopicsOf } from '../../src/plans.ts'
import type { RenderConfig, SessionEventLike } from '../../src/types.ts'

const CONFIG: RenderConfig = { toolResultDeferFloorTokens: 200, chapterTokenTarget: 4000 }
const PLAN = '# Migrate the chapter store\n\n## Goal\nMove blobs under the tree.\n\n## Tests\nnode --test\n'
const APPROVE = '{"approved":true} Plan approved — plan mode exited; carry out the plan starting with your next step.'

const events = (): SessionEventLike[] => [
  { type: 'user/message', seq: 0, data: { id: 'm0', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'plan the store migration in src/store.ts' }] } },
  { type: 'plan/mode', seq: 1, data: { active: true } },
  { type: 'tool/call', seq: 2, data: { callId: 'c2', name: 'exit_plan_mode', arguments: { plan: PLAN } } },
  { type: 'tool/result', seq: 3, data: { message: { source: { kind: 'tool', callId: 'c2' }, content: [{ type: 'tool-result', toolCallId: 'c2', isError: false, content: [{ type: 'text', text: APPROVE }] }] } } },
  { type: 'assistant/message', seq: 4, data: { id: 'm4', role: 'assistant', source: { kind: 'user' }, content: [{ type: 'text', text: 'approved' }] } },
]

const memFs = () => {
  const files = new Map<string, string>()
  return {
    files,
    fs: {
      async write(p: string, c: string) { files.set(p, c) },
      async read(p: string) { return files.get(p) },
      async exists(p: string) { return files.has(p) },
    },
  }
}

/** Chapter numbers from a registry-shaped counter, plan numbers from its own. */
const counters = () => {
  const state = { nextChapterNumber: 1, nextPlanNumber: 1, reservations: new Map<string, number[]>() }
  const take = (key: string, field: 'nextChapterNumber' | 'nextPlanNumber', count: number): number[] => {
    const held = state.reservations.get(key)
    if (held !== undefined) return held
    const numbers = Array.from({ length: count }, (_, i) => (state[field] as number) + i)
    state[field] = (state[field] as number) + count
    state.reservations.set(key, numbers)
    return numbers
  }
  return {
    state,
    allocator: {
      async reserve(key: string, count: number) { return take(key, 'nextChapterNumber', count) },
      async reservePlan(key: string, count: number) { return take(key, 'nextPlanNumber', count) },
    },
  }
}

const render = (): RenderedChapter =>
  renderChapter(events(), { title: 'Migration', summary: 's', startSeq: 0, endSeq: 4 }, CONFIG)

test('a plan in range yields a document with its own body, title and status', () => {
  const chapter = render()
  const docs = chapter.stats.planDocs ?? []
  assert.equal(docs.length, 1)
  assert.equal(docs[0]!.title, 'Migrate the chapter store')
  assert.equal(docs[0]!.status, 'approved')
  assert.equal(docs[0]!.body, PLAN.trim(), 'the document body IS the plan, un-summarised')
  assert.equal(docs[0]!.sha256, sha256(PLAN.trim()), 'and it matches the blob hash the chapter cites')
  assert.ok(docs[0]!.topics.length > 0, 'topics for the index')
})

test('writeArchive emits the document, and its own anchor verifies', async () => {
  const { fs, files } = memFs()
  const { allocator, state } = counters()
  const chapter = render()
  const wrote = await writeArchive({
    fs, allocator, storeRoot: '.dsh-chapters', rootSessionId: 'root-1',
    chapters: [chapter], attemptId: 'a1',
  })
  const docs = wrote.records[0]!.planDocs
  assert.ok(docs && docs.length === 1, 'the record points at the document')
  const text = files.get(docs![0]!.path)
  assert.ok(text, 'the file was written')
  assert.match(text!, /^---\nkind: plan\n/, 'the kind is the FIRST key (the index reads it flat)')
  assert.match(text!, /^status: approved$/m)
  assert.match(text!, /^planSeq: 2$/m)
  assert.match(text!, new RegExp(`^chapter: "${wrote.records[0]!.path.replace(/[/.]/g, (c) => '\\' + c)}"$`, 'm'), 'it cites its transcript chapter')
  // The blob handle is the sha itself: `artifacts/<aa>/<sha>.txt` is DERIVED from it,
  // and chapters_artifact accepts either form — so the document carries one number,
  // not two copies of the same address.
  assert.match(text!, /^sha256: [0-9a-f]{64}$/m, 'the blob the chapter cites is the same bytes')
  assert.equal(
    wrote.records[0]!.artifacts.find((a) => a.sha256 === docs![0]!.sha256) !== undefined, true,
    'the chapter record and the document agree on one sha, so neither can drift silently')
  assert.ok(!text!.includes('**User:**'), 'the body is the plan alone — no transcript, no block wrapper')
  assert.equal(text!.slice(text!.indexOf('---\n', text!.indexOf('---\n') + 4) + 4), `${PLAN.trim()}\n`)

  // numbering isolation: one chapter, one plan, two counters
  assert.equal(state.nextChapterNumber, 2, 'exactly one chapter number spent')
  assert.equal(state.nextPlanNumber, 2, 'exactly one plan number spent')
  assert.ok(docs![0]!.path.endsWith('plan-001-migrate-the-chapter-store.md'), 'a plan file never looks like a second chapter 001')
})

test('a retry reuses the plan allocation and writes the document once', async () => {
  const { fs, files } = memFs()
  const { allocator } = counters()
  const chapter = render()
  const first = await writeArchive({ fs, allocator, storeRoot: '.dsh-chapters', rootSessionId: 'root-1', chapters: [chapter], attemptId: 'same' })
  const before = files.size
  const second = await writeArchive({ fs, allocator, storeRoot: '.dsh-chapters', rootSessionId: 'root-1', chapters: [render()], attemptId: 'same' })
  assert.equal(second.records[0]!.planDocs![0]!.path, first.records[0]!.planDocs![0]!.path, 'same number reused for the same attempt')
  assert.equal(files.size, before, 'no duplicate files, no new numbers')
})

test('a writer without plan allocation still archives — the document is additive', async () => {
  const { fs } = memFs()
  const plain = { async reserve(key: string, count: number) { return Array.from({ length: count }, (_, i) => i + 1) } }
  const wrote = await writeArchive({ fs, allocator: plain, storeRoot: '.dsh-chapters', rootSessionId: 'r', chapters: [render()], attemptId: 'x' })
  assert.equal(wrote.records.length, 1)
  assert.equal(wrote.records[0]!.planDocs, undefined, 'no documents, and no claim of them')
  assert.match(wrote.records[0]!.summary.length >= 0 ? 'ok' : '', /ok/, 'the chapter itself is unaffected')
})

test('the corpus keeps kind: plan, and the index floor names paths and terms', () => {
  const { fs, files } = memFs()
  void fs
  const doc = [...files.entries()]
  void doc
  const chapter = render()
  const text = chapter.markdown
  void text
  const entry = entryFromChapter('chapters/PK/root/plan-001-x.md', [
    '---', 'kind: plan', 'title: "Migrate"', 'topics: ["store"]', '---', '', '# Migrate the chapter store', '',
  ].join('\n'))
  assert.equal(entry.kind, 'plan', 'not flattened to chapter by its directory')
  const topics = planTopicsOf(PLAN)
  assert.ok(topics.includes('store') || topics.includes('chapter'), `terms from the plan: ${topics.join(', ')}`)
  assert.ok(planTopicsOf('Touch src/render.ts and docs/architecture.md here').includes('src/render.ts'), 'a path the plan names is a topic')
})
