/**
 * The preset installer, over real temp directories.
 *
 * This code shipped a hole that cost a user their session: the never-clobber guard tested for
 * `preset.yml` ALONE, while the preset is really `preset.yml` + `agent.cordis.yml` — and the
 * second file is the one that names the chapter engine realm row. A partially wiped DSH home
 * (an interrupted uninstall/reinstall) therefore left a preset directory that passed the guard
 * on every boot forever: nothing was ever repaired, sessions choosing the preset failed to
 * COMPOSE (their logs and archives untouched), and the plugin still logged that it had
 * mounted.
 *
 * It could not be tested before because it resolved its own paths and read the developer's
 * real home. Both directories are parameters now, so every row below runs against a temp dir
 * and the developer's `~/.dsh` is never touched.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installChaptersPreset } from '../../src/index.ts'

const SHIPPED = path.join(process.cwd(), 'presets', 'chapters')

const world = (): { src: string; dst: string; parent: string; dispose: () => void } => {
  const root = path.join(os.tmpdir(), `preset-install-${Math.random().toString(36).slice(2)}`)
  const src = path.join(root, 'package', 'presets', 'chapters')
  const parent = path.join(root, 'home', '.agent-presets')
  const dst = path.join(parent, 'chapters')
  mkdirSync(src, { recursive: true })
  cpSync(SHIPPED, src, { recursive: true })
  return { src, dst, parent, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

const recorder = (): { logs: Array<{ level: string; msg: string }>; log: { info: (m: string) => void; warn: (m: string) => void } } => {
  const logs: Array<{ level: string; msg: string }> = []
  return { logs, log: { info: (m) => logs.push({ level: 'info', msg: m }), warn: (m) => logs.push({ level: 'warn', msg: m }) } }
}

test('the shipped preset is really two files — the premise of this whole test file', () => {
  // If someone adds a third file, the completeness check must cover it; that is what
  // `missing` is computed from, not from a hardcoded pair.
  const names = ['preset.yml', 'agent.cordis.yml']
  for (const n of names) assert.ok(existsSync(path.join(SHIPPED, n)), `shipped preset must contain ${n}`)
})

test('a fresh home gets a full install', () => {
  const w = world(); const r = recorder()
  const out = installChaptersPreset(w.src, w.dst, r.log, w.parent)
  assert.equal(out.status, 'installed')
  assert.ok(existsSync(path.join(w.dst, 'preset.yml')), 'preset.yml written')
  assert.ok(existsSync(path.join(w.dst, 'agent.cordis.yml')), 'agent.cordis.yml written — the file whose absence caused the incident')
  assert.equal(r.logs.filter((l) => l.level === 'warn').length, 0, 'a clean install is not a warning')
  w.dispose()
})

test('a complete user preset is left exactly alone (the never-clobber rule survives)', () => {
  const w = world()
  installChaptersPreset(w.src, w.dst, recorder().log, w.parent)
  const edited = '# my own tuning\n' + readFileSync(path.join(w.dst, 'agent.cordis.yml'), 'utf8')
  writeFileSync(path.join(w.dst, 'agent.cordis.yml'), edited)
  const r = recorder()
  const out = installChaptersPreset(w.src, w.dst, r.log, w.parent)
  assert.equal(out.status, 'complete')
  assert.deepEqual(out.missing, [])
  assert.equal(readFileSync(path.join(w.dst, 'agent.cordis.yml'), 'utf8'), edited, 'user edits are never overwritten')
  assert.equal(r.logs.length, 0, 'a healthy preset says nothing')
  w.dispose()
})

test('THE INCIDENT: a preset missing its engine row self-heals, and the user edit survives', () => {
  const w = world()
  installChaptersPreset(w.src, w.dst, recorder().log, w.parent)
  const keep = '# user tuning on the manifest\n' + readFileSync(path.join(w.dst, 'preset.yml'), 'utf8')
  writeFileSync(path.join(w.dst, 'preset.yml'), keep)
  // what a partial wipe of the home looks like: the guard file present, the engine row gone
  unlinkSync(path.join(w.dst, 'agent.cordis.yml'))

  const r = recorder()
  const out = installChaptersPreset(w.src, w.dst, r.log, w.parent)
  assert.equal(out.status, 'repaired', 'a partial preset is no longer a permanent silent failure')
  assert.deepEqual(out.missing, ['agent.cordis.yml'], 'it names what was missing, so the log is a diagnosis')
  assert.ok(existsSync(path.join(w.dst, 'agent.cordis.yml')), 'the missing file is restored')
  assert.equal(readFileSync(path.join(w.dst, 'preset.yml'), 'utf8'), keep, 'restoring a missing file is not clobbering an existing one')
  assert.ok(r.logs.some((l) => l.level === 'warn' && l.msg.includes('INCOMPLETE')), 'and it warns — this was invisible before')
  w.dispose()
})

test('a nested file in the preset is treated as missing, not skipped', () => {
  const w = world()
  mkdirSync(path.join(w.src, 'extra'), { recursive: true })
  writeFileSync(path.join(w.src, 'extra', 'notes.yml'), 'nested\n')
  installChaptersPreset(w.src, w.dst, recorder().log, w.parent)
  assert.ok(existsSync(path.join(w.dst, 'extra', 'notes.yml')), 'subdirectories install')
  rmSync(path.join(w.dst, 'extra', 'notes.yml'))
  const out = installChaptersPreset(w.src, w.dst, recorder().log, w.parent)
  assert.equal(out.status, 'repaired')
  assert.deepEqual(out.missing, ['extra/notes.yml'], 'relative path with the directory intact')
  assert.ok(existsSync(path.join(w.dst, 'extra', 'notes.yml')), 'and the directory is recreated')
  w.dispose()
})

test('an install failure reports failed, warns loudly, and does NOT claim health', () => {
  const w = world()
  // Make the destination impossible to create: a FILE where the directory must go.
  mkdirSync(w.parent, { recursive: true })
  writeFileSync(path.join(w.parent, 'chapters'), 'not a directory')
  const r = recorder()
  const out = installChaptersPreset(w.src, w.dst, r.log, w.parent)
  assert.equal(out.status, 'failed')
  assert.ok(typeof out.error === 'string' && out.error.length > 0, 'the OS error is carried, not swallowed')
  assert.ok(r.logs.some((l) => l.level === 'warn' && /FAILED/.test(l.msg)), 'warned')
  w.dispose()
})

test('a source without a manifest is refused rather than half-installed', () => {
  const w = world()
  unlinkSync(path.join(w.src, 'preset.yml'))
  const out = installChaptersPreset(w.src, w.dst, recorder().log, w.parent)
  assert.equal(out.status, 'no-source', 'nothing to install — do not create a preset directory that cannot mount')
  assert.equal(existsSync(w.dst), false, 'and no partial directory is left behind')
  w.dispose()
})
