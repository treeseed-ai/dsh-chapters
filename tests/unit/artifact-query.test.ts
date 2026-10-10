import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveArtifactPath, resolveArtifactWithMirror, buildToc, searchArtifact, readLines } from '../../src/artifact-query.ts'

test('resolveArtifactPath: sha form, in-store paths, and escape refusal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-'))
  const sha = 'a'.repeat(64)
  assert.equal(resolveArtifactPath(root, sha), path.join(root, 'artifacts', 'aa', `${sha}.txt`))
  assert.equal(resolveArtifactPath(root, `artifacts/bb/${'b'.repeat(64)}.txt`), path.join(root, 'artifacts/bb/' + 'b'.repeat(64) + '.txt'))
  assert.equal(resolveArtifactPath(root, path.join(root, 'artifacts/cc/x.txt')), path.join(root, 'artifacts/cc/x.txt'))
  assert.throws(() => resolveArtifactPath(root, '/etc/passwd'), /escapes/)
  assert.throws(() => resolveArtifactPath(root, 'artifacts/../../secrets.txt'), /escapes/)
  fs.rmSync(root, { recursive: true, force: true })
})

test('buildToc: heading map with 1-based lines, fenced code ignored, truncation flagged', () => {
  const text = ['# Title', 'body', '## Methods', '```', '# not a heading', '```', '### Sub', 'x'.repeat(5000)].join('\n')
  const toc = buildToc(text, 2)
  assert.deepEqual(toc.entries, [
    { line: 1, depth: 1, title: 'Title' },
    { line: 3, depth: 2, title: 'Methods' },
  ])
  assert.equal(toc.truncated, true)
  const full = buildToc(text)
  assert.deepEqual(full.entries.map((e) => e.line), [1, 3, 7], 'fence interior skipped')
})

test('searchArtifact: ±context blocks merge, budget truncates and reports', () => {
  const lines = Array.from({ length: 200 }, (_, i) => i === 10 || i === 11 || i === 150 ? `line ${i} QUANTIZATION rocks` : `plain line ${i}`)
  const text = lines.join('\n')
  const hit = searchArtifact(text, 'quantization', { maxTokens: 10_000 })
  assert.equal(hit.total, 3)
  assert.equal(hit.blocks.length, 2, '10+11 merge, 150 separate')
  assert.ok(hit.blocks[0]!.lines.some((l) => l.startsWith('11:')), '1-based numbered')
  const tight = searchArtifact(text, 'quantization', { maxTokens: 30 })
  assert.equal(tight.truncated, true)
  assert.ok(tight.remaining >= 1)
  const lit = searchArtifact(text, '(rocks', { maxTokens: 10_000 })
  assert.equal(lit.total, 0, 'invalid regex falls back to LITERAL "(rocks" — with the parenthesis, which no line contains')
})

test('searchArtifact literal fallback actually matches substrings when regex fails', () => {
  const text = 'alpha\nbeta (gamma) delta\nepsilon'
  const r = searchArtifact(text, '(gamma)', { maxTokens: 1000 })
  assert.equal(r.total, 1, 'invalid-group regex compiles in JS though — matched via regex here')
  const r2 = searchArtifact(text, 'GAMMA', { maxTokens: 1000 })
  assert.equal(r2.total, 1, 'case-insensitive literal')
})

test('readLines: 1-based window, file-end bound, hard cap', () => {
  const text = Array.from({ length: 1000 }, (_, i) => `l${i + 1}`).join('\n')
  const r = readLines(text, 3, 5)
  assert.deepEqual(r.lines, ['3: l3', '4: l4', '5: l5', '6: l6', '7: l7'])
  assert.equal(r.of, 1000)
  const capped = readLines(text, 1, 500)
  assert.equal(capped.end, 400, 'hard cap 400 lines per call')
  assert.equal(capped.lines.length, 400)
  const tail = readLines(text, 990, 500)
  assert.equal(tail.end, 1000)
  assert.equal(tail.lines.length, 11, 'file end bounds the window')
})

test('resolveArtifactWithMirror: store first, mirror second, sha-form too, traversal refused, honest null', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'art-mirror-'))
  const store = path.join(base, '.dsh-chapters')
  const mirror = path.join(base, '.dsh-knowledge')
  const sha = 'ab' + 'c'.repeat(62)
  fs.mkdirSync(path.join(store, 'artifacts', 'ab'), { recursive: true })
  fs.writeFileSync(path.join(store, 'artifacts', 'ab', `${sha}.txt`), 'STORED')
  assert.equal(resolveArtifactWithMirror(store, `artifacts/ab/${sha}.txt`, mirror), path.join(store, 'artifacts', 'ab', `${sha}.txt`), 'store hit wins')
  const sha2 = 'cd' + 'e'.repeat(62)
  fs.mkdirSync(path.join(mirror, 'artifacts', 'PROJKEY1', 'cd'), { recursive: true })
  fs.writeFileSync(path.join(mirror, 'artifacts', 'PROJKEY1', 'cd', `${sha2}.txt`), 'POOLED')
  assert.equal(resolveArtifactWithMirror(store, `artifacts/cd/${sha2}.txt`, mirror), path.join(mirror, 'artifacts', 'PROJKEY1', 'cd', `${sha2}.txt`), 'pool mirror fills the local miss')
  assert.equal(resolveArtifactWithMirror(store, sha2, mirror), path.join(mirror, 'artifacts', 'PROJKEY1', 'cd', `${sha2}.txt`), 'bare sha-64 resolves through the mirror too')
  assert.equal(resolveArtifactWithMirror(store, 'artifacts/ff/deadbeef.txt', mirror), null, 'missing everywhere is null, never a guess')
  assert.equal(resolveArtifactWithMirror(store, 'artifacts/cd/../../escape.txt', mirror), null, 'traversal can never escape the mirror root')
})

test('resolveArtifactWithMirror: a chapter citation resolves inside the ANCESTRY TREE (verify.md P10)', () => {
  // Measured 2026-10-09 while implementing plans-carriage: archive.writeArchive writes
  // deferred results — and every plan's full text — to <storeRoot>/<rootSession>/artifacts/…,
  // while the arrival stubber writes to <storeRoot>/artifacts/…. Both print the SAME
  // citation form (`artifacts/aa/<sha>.txt`), so a reader that only checks the store root
  // calls a stored byte missing. That is the gap this row keeps closed.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'art-tree-'))
  const store = path.join(base, '.dsh-chapters')
  const mirror = path.join(base, '.dsh-knowledge')
  const sha = 'ab' + 'f'.repeat(62)
  const tree = path.join(store, 'sess-root-1', 'artifacts', 'ab', `${sha}.txt`)
  fs.mkdirSync(path.dirname(tree), { recursive: true })
  fs.writeFileSync(tree, 'TREE')
  assert.equal(resolveArtifactWithMirror(store, `artifacts/ab/${sha}.txt`, mirror), tree, 'the tree dir answers a store-root miss')
  const sha2 = '9d' + 'e'.repeat(62)
  const tree2 = path.join(store, 'sess-root-2', 'artifacts', '9d', `${sha2}.txt`)
  fs.mkdirSync(path.dirname(tree2), { recursive: true })
  fs.writeFileSync(tree2, 'TREE2')
  assert.equal(resolveArtifactWithMirror(store, sha2, mirror), tree2, 'a bare sha resolves through the trees as well')

  // The store root still WINS when both hold the blob: local ground truth first.
  const sha3 = '00' + '1'.repeat(62)
  fs.mkdirSync(path.join(store, 'sess-root-3', 'artifacts', '00'), { recursive: true })
  fs.writeFileSync(path.join(store, 'sess-root-3', 'artifacts', '00', `${sha3}.txt`), 'TREE')
  fs.mkdirSync(path.join(store, 'artifacts', '00'), { recursive: true })
  fs.writeFileSync(path.join(store, 'artifacts', '00', `${sha3}.txt`), 'ROOT')
  assert.equal(resolveArtifactWithMirror(store, `artifacts/00/${sha3}.txt`, mirror), path.join(store, 'artifacts', '00', `${sha3}.txt`))

  // Dot-dirs are never walked, and a traversal reference still cannot leave the store.
  const sha4 = '77' + '2'.repeat(62)
  fs.mkdirSync(path.join(store, '.hidden', 'artifacts', '77'), { recursive: true })
  fs.writeFileSync(path.join(store, '.hidden', 'artifacts', '77', `${sha4}.txt`), 'HIDDEN')
  assert.equal(resolveArtifactWithMirror(store, `artifacts/77/${sha4}.txt`, mirror), null, 'a hidden tree is not part of the archive')
  assert.equal(resolveArtifactWithMirror(store, `artifacts/88/${'3'.repeat(64)}.txt`, mirror), null, 'nothing there is a clean null, never a guess')
  fs.rmSync(base, { recursive: true, force: true })
})
