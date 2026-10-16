/**
 * The host-drift gate for preset DELIVERY.
 *
 * Presets changed mechanism at host 0.1.7-alpha.1: `$DSH_HOME/.agent-presets/<id>/`
 * is no longer read at all, and a preset is an `@deepseek-ai/dsh-agent-preset`
 * declaration row. The failure mode of a mechanism change nobody noticed is the
 * interesting part — nothing crashes. The plugin boots, its tools register,
 * Settings says "enabled and running", the preset is absent, and then `resume`
 * throws `agent-preset/not-found` for every session whose log recorded it. A user's
 * chapters sessions look corrupted; their logs are intact and untouched.
 *
 * This package delivers that row by calling the host's own `agentPresets.register()`
 * at activation — why not a shipped patch layer is recorded with its two measured
 * boot-breaking failures in `src/preset.ts` § "Why this file is code". So these rows
 * guard what the static file used to guard, plus what THIS mechanism can get wrong:
 *   1. the shipped composition is well-formed, and its id is `chapters` — that id is
 *      DURABLE STATE inside other people's session logs, so renaming it orphans them;
 *   2. `package.json` `dsh.bundle.patch` stays a STRING — an array is a TypeError at
 *      `dsh-app-boot/lib/index.js:853` on every host before 0.1.7-alpha.1, which is
 *      the very release that introduced declaration rows. A bundle that cannot boot
 *      the old host has no business claiming to support it;
 *   3. every module the composition mounts resolves against a real host install, and
 *      anything that does not is in the declared optional set — because one failed row
 *      makes the WHOLE preset `broken` (`mountPreset` throws, `retain()` refuses),
 *      which is the same user-visible failure as the missing preset;
 *   4. our row set differs from the host's own standard list ONLY by the declared
 *      deltas, so a host rename or drop shows up here rather than in someone's session;
 *   5. every `{{variable}}` referenced is one the installed host registers — the
 *      second failure of this same upgrade: the legacy suffix interpolated `{{cwd}}`,
 *      hosts from 0.2.1-alpha.2 register only `provider`/`model`, and interpolation
 *      THROWS, so a preset that composes perfectly still breaks every turn;
 *   6. the persona suffix is still keyed to the plot-extraction echo guard, because
 *      that guard matches phrases inside the suffix and the coupling is invisible from
 *      either side;
 *   7. the registration arms (registered / pruned / already-declared / unsupported /
 *      failed) and the roster arms (present / broken / absent / unknown) classify
 *      correctly — their log line is the only health signal a plugin can produce about
 *      a preset it does not own.
 *
 * Rows 3/4 run only when the host's web bundle resolves (same RUN/SKIP discipline as
 * host-seed-contract.test.ts: unmeasured must be named, not quietly green). The pinned
 * e2e host (dev/dsh-host-lock = @deepseek-ai/dsh 0.1.5-rc.1) predates declaration rows
 * and ships no `dsh-web-app` preset list, so on that closure these SKIP by name — the
 * rows still fire on a developer box or CI job carrying a 0.1.7+/0.2.x host.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resolvableFromThisPackage, readRosterVerdict, rosterRemediation, reportPresetRoster } from '../../src/index.ts'
import {
  CHAPTERS_PRESET_ID, chaptersPresetDefinition, chaptersPresetRows, pruneResolvableRows,
  registerChaptersPreset, inventoryEntry, unusableRows,
  type PresetDefinition, type PresetRow, type PresetRegistryLike,
} from '../../src/preset.ts'
import { extractPlot } from '../../src/engine-core.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(HERE, '..', '..')
const PRESET_ID = 'chapters'

/** Strip comments/blanks; keep indentation, which is the structure we assert on. */
function significantLines(file: string): string[] {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l))
}

/** Every mounted plugin name in a patch/entry list (skips the row wrapper and groups). */
function mountedNames(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    const m = /^\s*name:\s*'?([^']+)'?\s*$/.exec(l)
    if (m === null) continue
    const value = m[1]!
    if (value === '@deepseek-ai/dsh-agent-preset' || value.startsWith('cordis:')) continue
    // A mounted row's `name` is an npm specifier (always lowercase, scoped or hyphenated);
    // the declaration's own display `name: Chapters` is prose, and an earlier revision of
    // this helper treated it as a package — the row then failed for the wrong reason.
    // Subpaths MUST be allowed: `.../engine`, `.../list-agents`, `.../tools` are exactly
    // the ones a host rename eats first.
    if (!/^(@[a-z0-9._~-]+\/[a-z0-9._~-]+|[a-z0-9._~-]+)(\/[a-z0-9._~+/=-]+)*$/.test(value)) continue
    if (!(value.startsWith('@') || value.includes('-'))) continue
    out.push(value)
  }
  return out
}

/** The composition's rows, groups flattened one level (children live in `config`). */
function flatRows(rows: PresetRow[]): PresetRow[] {
  return rows.flatMap((row) => (row.group === true && Array.isArray(row.config)
    ? [row, ...(row.config as PresetRow[])]
    : [row]))
}

/**
 * Rows whose module is NOT expected to resolve on every host this package serves.
 * Each entry is a measured fact about a named host version, not a guess:
 *  - `dsh-tool-schedule`: first published at 0.2.1-alpha.1; absent from 0.2.0-rc.1/rc.2
 *    (verified against the installed rc.2 tree and the registry) and not in their
 *    standard list. The runtime prunes it there; keeping the row gives the alpha hosts
 *    the schedule tools. Measured on rc.2: mounting it anyway left the preset
 *    `DECLARED BUT BROKEN — tool-schedule … never started`.
 * Deliberately NOT here: `dsh-time-context` (published and installed at rc.2, and in
 * every alpha standard list) and `dsh-tool-ralph` (row dropped from the alpha.2 list,
 * package still published through alpha.4).
 */
const KNOWN_OPTIONAL = new Set(['@deepseek-ai/dsh-tool-schedule'])

test('RUN — the shipped preset composition is well-formed', () => {
  const definition = chaptersPresetDefinition()
  assert.equal(definition.id, PRESET_ID, 'config.id is the roster key')
  assert.ok(definition.name !== '' && definition.description !== '', 'the menu shows a name and a description')
  assert.equal(typeof definition.order, 'number', 'config.order positions the preset in the menu')
  assert.ok(Array.isArray(definition.plugins) && definition.plugins.length > 10,
    'a preset that mounts almost nothing is a typo, not a preset')
  for (const row of flatRows(definition.plugins)) {
    assert.ok(typeof row.name === 'string' && row.name !== '', `row ${row.id} names no plugin`)
    assert.ok(typeof row.id === 'string' && row.id !== '', `row ${row.name} has no id`)
    if (row.group === true) assert.ok(Array.isArray(row.config), `group ${row.id} must hold a list of rows`)
    else assert.ok(!Array.isArray(row.config), `ordinary row ${row.id} must not hold a list`)
  }
  // The host validates exactly this shape before mounting (entryListProblem), so a row
  // that reads like prose is a refused preset, not a warning.
  assert.ok(flatRows(definition.plugins).some((row) => row.name === '@treeseed/dsh-chapters/engine'),
    'without the engine realm row there is no chapter-form compaction in this preset')
})

test('RUN — config.id is exactly "chapters", because it is durable state in other logs', () => {
  assert.equal(CHAPTERS_PRESET_ID, 'chapters')
  assert.equal(chaptersPresetDefinition().id, 'chapters',
    'this id is recorded as agent-preset/selected in every continuation child this plugin created; '
    + 'an existing session whose recorded preset cannot be resolved will not open')
})

test('RUN — dsh.bundle.patch stays a string, because an array will not boot an old host', () => {
  // Measured on the pinned 0.1.5-rc.1 closure: `dsh.bundle.patch` as a LIST dies at
  // profile load — `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of
  // type string. Received an instance of Array` (`dsh-app-boot/lib/index.js:853`,
  // `join(packageDir, declared)`). Array support landed WITH declaration rows in
  // 0.1.7-alpha.1, so a two-layer manifest is exactly as incompatible as it looks —
  // and the host never warns, it just does not come up.
  const manifest = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as
    { dsh?: { bundle?: { patch?: unknown } } }
  assert.equal(typeof manifest.dsh?.bundle?.patch, 'string',
    'shipping the preset row as a SECOND patch layer breaks every host before 0.1.7-alpha.1 at boot; '
    + 'the preset is registered at activation instead (src/preset.ts, header)')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
})

// The host's own shipped preset list, when a 0.1.7+/0.2.x web bundle is installed here.
let hostStandard: string | undefined
try {
  const req = createRequire(import.meta.url)
  hostStandard = join(dirname(req.resolve('@deepseek-ai/dsh-web-app/package.json')), 'presets', 'standard.patch.yml')
  if (!existsSync(hostStandard)) hostStandard = undefined
} catch {
  hostStandard = undefined
}

const guard = hostStandard === undefined ? 'SKIP' : 'RUN'
const skip = hostStandard === undefined ? '@deepseek-ai/dsh-web-app not installed (the pinned e2e host predates declaration rows)' : false

test(`${guard} — every module the preset mounts resolves against the installed host`, { skip }, () => {
  assert.ok(hostStandard !== undefined)
  const unresolved: string[] = []
  for (const row of flatRows(chaptersPresetRows())) {
    if (row.group === true) continue
    if (row.name.startsWith('cordis:') || row.name.startsWith('@treeseed/dsh-chapters')) continue
    if (resolvableFromThisPackage(row.name)) continue
    if (KNOWN_OPTIONAL.has(row.name)) continue
    unresolved.push(`${row.id} (${row.name})`)
  }
  assert.deepEqual(unresolved, [],
    'a preset row whose module no longer resolves activates as failed, and one failed row makes the WHOLE '
    + 'preset broken — every session choosing it stops composing. Drop the row, or add it to KNOWN_OPTIONAL '
    + 'naming the host version that removed it (the runtime prunes those and says so in the mount line)')
  // And a declared-optional row must actually be droppable: the probe has to be asked.
  const { dropped } = pruneResolvableRows(chaptersPresetRows(), (spec) => !KNOWN_OPTIONAL.has(spec))
  for (const name of KNOWN_OPTIONAL) {
    assert.ok(dropped.some((d) => d.includes(name)),
      `${name} is declared optional but the pruner would have mounted it anyway — the probe is not reaching it`)
  }
})

test(`${guard} — our list differs from the host standard list ONLY by the declared deltas`, { skip }, () => {
  assert.ok(hostStandard !== undefined)
  const ours = new Set(flatRows(chaptersPresetRows()).filter((row) => row.group !== true).map((row) => row.name))
  const theirs = new Set(mountedNames(significantLines(hostStandard)))
  // Rows we mount that a GIVEN host's standard list may or may not carry: the engine is
  // ours; time-context/tool-schedule are in the alpha standard list and absent from
  // rc.2's, so either can be an ADD or a MATCH depending on which host is installed.
  const CROSS_VERSION = new Set([...KNOWN_OPTIONAL, '@deepseek-ai/dsh-time-context'])
  const added = [...ours].filter((n) => !theirs.has(n) && !CROSS_VERSION.has(n))
  const removed = [...theirs].filter((n) => !ours.has(n) && !CROSS_VERSION.has(n))
  assert.deepEqual(added, ['@treeseed/dsh-chapters/engine'],
    'the only row we ADD is the chapter engine; if the host renamed or dropped something else, '
    + 'this preset is mounting a package that may not exist on another supported host')
  assert.deepEqual(removed, ['@deepseek-ai/dsh-compaction-basic'],
    'the only row we REPLACE is the host LLM summarizer — everything else stays mounted, '
    + 'or a chapters session silently loses a tool the standard preset has')
  // The behavioural deltas, asserted on the EFFECTIVE rows rather than a file's text.
  const compaction = chaptersPresetRows().find((row) => row.id === 'compaction')
  const children = compaction?.config as PresetRow[]
  const pruner = children.find((row) => row.id === 'tool-result-pruner')
  assert.deepEqual(pruner?.config, { thresholdChars: 1000000, headChars: 4096, tailChars: 1024 },
    'the tool-result pruner is deliberately dormant (chapters defer at archive time), and that plugin '
    + 'rejects unknown config keys — keep exactly {thresholdChars, headChars, tailChars}')
  const engine = children.find((row) => row.name === '@treeseed/dsh-chapters/engine')
  assert.deepEqual(engine?.config, { thresholdRatio: 0.9 }, 'the engine threshold is configured, not left to defaults')
  const ralph = flatRows(chaptersPresetRows()).find((row) => row.id === 'tool-ralph')
  assert.ok(ralph !== undefined && ralph.disabled !== true,
    'the chapters preset runs the bounded goal loop; the host standard list mounts ralph DISABLED, so '
    + 'enabling it is a declared delta of ours and must stay visible here')
  const persona = chaptersPresetRows().find((row) => row.id === 'persona')
  assert.match(String((persona?.config as { prefix?: string }).prefix), /\{\{model\}\}/,
    'the persona prefix is the host wording; dropping it silently changes every session')
})

test('RUN — no row carries a config key a supported host throws on', () => {
  // The pruner protects against a package that is GONE. It cannot protect against a key that a
  // host refuses, and that failure is just as total: `tool-subagent` on 0.2.1-alpha.4 rejects the
  // `toolFilter` key it dropped — `toolFilter is no longer supported; configure persona and tool
  // plugins in an Agent Preset` — and the whole preset came back
  // `DECLARED BUT BROKEN` on a real boot, while the same composition mounted cleanly on
  // 0.2.0-rc.2, which still accepts the key. A host that no longer has a tool does not need it
  // denied; a host that rejects the key loses every chapters session. So the intersection wins.
  const refused = new Map<string, string[]>([
    ['@deepseek-ai/dsh-tool-subagent', ['toolFilter']],
    ['@deepseek-ai/dsh-compaction-tool-result-pruner', []],
    ['@deepseek-ai/dsh-plan-mode', []],
  ])
  const allowed = new Map<string, string[]>([
    ['@deepseek-ai/dsh-tool-subagent', ['provider', 'toolName', 'modelSelectionSettings', 'backgroundMode']],
    ['@deepseek-ai/dsh-compaction-tool-result-pruner', ['thresholdChars', 'headChars', 'tailChars']],
    ['@deepseek-ai/dsh-compaction-basic', []],
    ['@deepseek-ai/dsh-plan-mode', ['section']],
    ['@treeseed/dsh-chapters/engine', ['thresholdRatio']],
    ['@deepseek-ai/dsh-tool-ralph', ['subagentProvider', 'maxRounds']],
    ['@deepseek-ai/dsh-tool-todo', ['allowParallelInProgress']],
    ['@deepseek-ai/dsh-tool-web', ['fetch', 'searchTimeoutMs']],
    ['@deepseek-ai/dsh-agent-instructions', ['maxBytes']],
    ['@deepseek-ai/dsh-tool-fs-search', ['sampleOverCapGlobResults']],
    ['@deepseek-ai/dsh-persona', ['prefix', 'suffix']],
  ])
  const violations: string[] = []
  for (const row of flatRows(chaptersPresetRows())) {
    const config = row.config as Record<string, unknown> | undefined
    if (row.group === true || config === undefined) continue
    const refusedKeys = refused.get(row.name)?.filter((k) => k in config) ?? []
    if (refusedKeys.length > 0) violations.push(`${row.id}: ${row.name} refuses ${refusedKeys.join(', ')}`)
    const whitelist = allowed.get(row.name)
    if (whitelist !== undefined) {
      const extra = Object.keys(config).filter((k) => !whitelist.includes(k))
      if (extra.length > 0) violations.push(`${row.id}: ${row.name} carries undocumented keys ${extra.join(', ')}`)
    }
  }
  assert.deepEqual(violations, [],
    'every config key must be accepted by EVERY host this package serves — one refused key breaks the '
    + 'whole preset (measured on 0.2.1-alpha.4 with tool-subagent/toolFilter). If a host renamed or '
    + 'removed a key, drop it here and say why in src/preset.ts')
})

// The set every host in support has registered: `provider` and `model`. `cwd` is
// DELIBERATELY EXCLUDED — it exists through 0.2.0-rc.2 and is gone from 0.2.1-alpha.2,
// and an unregistered reference THROWS at prompt assembly, so a preset using `{{cwd}}`
// works on one supported host and breaks every turn on the other. This assertion is
// about OUR composition, so it runs on a runner with no harness installed at all.
const UNIVERSALLY_REGISTERED_VARS = ['provider', 'model']

test('RUN — the composition references only prompt variables every supported host registers', () => {
  const refs = [...new Set([...JSON.stringify(chaptersPresetRows()).matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)].map((m) => m[1]!))]
  const risky = refs.filter((r) => !UNIVERSALLY_REGISTERED_VARS.includes(r))
  assert.deepEqual(risky, [],
    `the preset references {{${risky.join('}} / {{')} }}, which at least one supported host does not register. `
    + 'interpolate() THROWS on an unknown variable, so every turn of every chapters session dies — and the preset '
    + 'still looks installed. (`dsh-working-directory` already prints the working directory into the runtime '
    + 'context, which is why {{cwd}} was pure duplication.)')
  assert.ok(refs.includes('model'), 'the persona prefix is the host wording; dropping it changes every session silently')
})

test(`${guard} — the installed host really does register what the composition references`, { skip }, () => {
  // The drift half: read the kernel's OWN registrations rather than trusting the set above,
  // so a host that drops `model` or `provider` fails here instead of in someone's session.
  const req = createRequire(import.meta.url)
  const loop = (() => { try { return req.resolve('@deepseek-ai/dsh-agent-loop') } catch { return undefined } })()
  assert.ok(loop !== undefined, 'the host loop package must resolve when this row runs')
  const registered = new Set([...readFileSync(loop, 'utf8').matchAll(/\.variable\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((m) => m[1]!))
  assert.ok(registered.size >= 2, `expected the host to register provider+model, saw: ${[...registered]}`)
  const refs = [...new Set([...JSON.stringify(chaptersPresetRows()).matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)].map((m) => m[1]!))]
  const unknown = refs.filter((r) => !registered.has(r))
  assert.deepEqual(unknown, [],
    `this host does not register ${unknown.join(', ')} — prompt assembly throws, so EVERY turn in a chapters `
    + `session on it fails (registered here: ${[...registered].join(', ')})`)
})

/** The persona suffix as the shipped composition carries it. */
function shippedSuffix(): string {
  const persona = chaptersPresetRows().find((row) => row.id === 'persona')
  const suffix = (persona?.config as { suffix?: string } | undefined)?.suffix
  assert.ok(typeof suffix === 'string' && suffix !== '', 'the preset must carry the PLOT: suffix or plot carriage has nothing to carry')
  return suffix
}

test('RUN — the suffix we ship is still recognised as a template echo by plot extraction', () => {
  // src/engine-core.ts's PLOT_TEMPLATE_ECHO suppresses a "plot" that is really our own
  // instruction quoted back (the 2026-09-25 audit: all eight checkpoints of a real run
  // inherited the boilerplate, and because the result was non-null the bounded elicited
  // fallback never ran). That suppression is keyed to phrases inside the suffix, so
  // rewording the suffix can silently un-key it. Pin the coupling by BEHAVIOUR.
  const suffix = shippedSuffix()
  const echo = { role: 'assistant', content: [{ type: 'text', text: `PLOT: ${suffix}` }] }
  assert.equal(extractPlot([echo] as unknown as Parameters<typeof extractPlot>[0]), null,
    'the shipped suffix is no longer matched by PLOT_TEMPLATE_ECHO — reword the guard in src/engine-core.ts '
    + 'in the SAME change as the suffix, or every session inherits its own instruction as a plot')
  // Positive control: the row must not pass because extraction broke entirely.
  const real = { role: 'assistant', content: [{ type: 'text', text: 'PLOT: rebuild the preset delivery; next: run the drift gate' }] }
  assert.ok((extractPlot([real] as unknown as Parameters<typeof extractPlot>[0]) ?? '').includes('rebuild the preset delivery'),
    'plot extraction itself has stopped working, so the assertion above proves nothing')
})

test('RUN — the pruner drops an unresolvable row instead of mounting a broken preset', () => {
  const rows: PresetRow[] = [
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'gone', name: '@deepseek-ai/dsh-gone' },
    { id: 'planning', name: 'cordis:group', group: true, config: [
      { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' },
      { id: 'also-gone', name: '@deepseek-ai/dsh-also-gone' },
    ] },
    { id: 'empty-group', name: 'cordis:group', group: true, config: [{ id: 'only', name: '@deepseek-ai/dsh-only' }] },
  ]
  const { kept, dropped } = pruneResolvableRows(rows, (spec) => !spec.includes('gone') && !spec.includes('only'))
  assert.deepEqual(kept.map((r) => r.id), ['tool-fs', 'planning'], 'unresolvable rows go; a group keeps its good children')
  assert.deepEqual((kept[1]?.config as PresetRow[]).map((r) => r.id), ['plan-mode'], 'the dropped child is gone from the group')
  assert.deepEqual(dropped, [
    'gone (@deepseek-ai/dsh-gone)',
    'also-gone (@deepseek-ai/dsh-also-gone)',
    'only (@deepseek-ai/dsh-only)',
    'empty-group (group emptied)',
  ], 'every drop is named — a silent drop is how a preset loses a tool nobody notices')
  // A cordis: pseudo-name and our own realm row are never probed: the engine row IS the point.
  const none = pruneResolvableRows(chaptersPresetRows(), () => false)
  assert.ok(none.kept.some((r) => r.id === 'compaction'), 'the compaction group must survive any probe')
  assert.ok(flatRows(none.kept).some((r) => r.name === '@treeseed/dsh-chapters/engine'),
    'pruning may never remove the chapters engine — that is the preset')
})

test('RUN — registerChaptersPreset classifies every outcome and never throws at the caller', async () => {
  const held: Array<() => Promise<void>> = []
  const opts = { resolvable: () => true, platform: 'linux' as NodeJS.Platform, dispose: (d: () => Promise<void>) => { held.push(d) } }

  // A host with no register() — the pre-0.1.7 closure — is not a failure: the caller
  // must fall back to the legacy directory copy, which src/index.ts does.
  assert.equal((await registerChaptersPreset({}, opts)).outcome.state, 'unsupported')
  assert.equal((await registerChaptersPreset(undefined, opts)).outcome.state, 'unsupported')

  let received: PresetDefinition | undefined
  const registry = {
    register: async (definition: PresetDefinition) => { received = definition; return async () => { /* unregister */ } },
  } as unknown as PresetRegistryLike
  const ok = await registerChaptersPreset(registry, opts)
  assert.equal(ok.outcome.state, 'registered')
  assert.equal(received?.id, 'chapters', 'the definition is what the host registers')
  assert.ok(flatRows(received?.plugins ?? []).some((r) => r.name === '@treeseed/dsh-chapters/engine'),
    'the engine realm row is nested in the compaction group, so it must survive the flattening the host mounts')
  assert.equal(held.length, 1, 'the disposer must be HELD: a cleanup wired to the apply fiber un-registers '
    + 'the preset the moment activation finishes (measured on 0.2.0-rc.2: register() reported success while '
    + 'the roster came back without chapters)')

  // A duplicate is someone else's declaration row winning, not our failure — and it must
  // not propagate: a throwing apply() means no tools, no commands, no chapters at all.
  const dupe = { register: async () => { throw new Error('Duplicate agent preset: chapters') } } as unknown as PresetRegistryLike
  assert.equal((await registerChaptersPreset(dupe, opts)).outcome.state, 'already-declared')

  const boom = { register: async () => { throw new Error('Preset services require isolate realms: compaction') } } as unknown as PresetRegistryLike
  const failed = await registerChaptersPreset(boom, opts)
  assert.equal(failed.outcome.state, 'failed')
  assert.match(failed.outcome.state === 'failed' ? failed.outcome.reason : '', /isolate realms/,
    'the host reason must survive — this line is the only diagnosis of a refused mount')

  // Pruning is REPORTED, so a host missing a package is a named fact, not a silent gap.
  const pruned = await registerChaptersPreset(registry, { ...opts, resolvable: (s: string) => !s.includes('tool-schedule') })
  assert.equal(pruned.outcome.state, 'pruned')
  assert.ok(pruned.outcome.state === 'pruned' && pruned.outcome.dropped.length === 1, 'the drop is named')
  assert.ok(!JSON.stringify(pruned.definition).includes('dsh-tool-schedule'), 'the pruned row must not reach the host')
})

test('RUN — the roster verdict is the health signal (absent is not silently fine)', async () => {
  const rows = { presets: [{ id: 'standard', isDefault: true }] }
  const absent = await readRosterVerdict({ list: async () => rows }, PRESET_ID)
  assert.equal(absent.state, 'absent')
  assert.deepEqual(absent.rows, ['standard'])

  // both historical shapes of list() must be understood: the envelope and the bare array
  const bare = await readRosterVerdict({ list: async () => [{ id: PRESET_ID }] }, PRESET_ID)
  assert.equal(bare.state, 'present')
  assert.ok(bare.state === 'present' && bare.broken === undefined, 'a declared, unbroken preset is healthy')

  const broken = await readRosterVerdict({ list: async () => [{ id: PRESET_ID, broken: 'mount failed: X' }] }, PRESET_ID)
  assert.ok(broken.state === 'present' && broken.broken === 'mount failed: X',
    'declared-but-broken must be reported apart from absent — the remedy differs')

  const noService = await readRosterVerdict(undefined, PRESET_ID)
  assert.equal(noService.state, 'unknown')
  const throwing = await readRosterVerdict({ list: async () => { throw new Error('loader not settled') } }, PRESET_ID)
  assert.equal(throwing.state, 'unknown')

  // The inventory answers the question the roster cannot: are the ROWS active?
  const inventory = [{ id: PRESET_ID, rows: [
    { entryId: 'chapters:tool-fs', moduleName: '@deepseek-ai/dsh-tool-fs', enabled: true, fiberState: 'active' },
    { entryId: 'chapters:bad', moduleName: '@deepseek-ai/dsh-bad', enabled: true, fiberState: 'failed' },
    { entryId: 'chapters:off', moduleName: '@deepseek-ai/dsh-off', enabled: false, fiberState: 'failed' },
  ] }]
  const entry = inventoryEntry(inventory, PRESET_ID)
  assert.ok(entry !== undefined)
  assert.deepEqual(unusableRows(entry), ['chapters:bad (@deepseek-ai/dsh-bad) failed'],
    'a disabled row that failed is not a problem; an enabled one that never activated is')
  assert.deepEqual(unusableRows(inventoryEntry(inventory, 'nope')), [], 'an absent preset has no rows to judge')
  assert.equal(inventoryEntry(undefined, PRESET_ID), undefined, 'a host without the method must not throw here')
  // A row the host reports without an id or a module still has to be NAMED, or the operator
  // is told "something is wrong" with nothing to act on.
  assert.deepEqual(unusableRows({ rows: [{ fiberState: 'failed' } as never] }), ['? (?) failed'])
  const odd = { register: async () => { throw 'registry refused' } } as unknown as PresetRegistryLike
  const oddResult = await registerChaptersPreset(odd, { resolvable: () => true, dispose: () => {} })
  assert.equal(oddResult.outcome.state, 'failed', 'a thrown non-Error is still an outcome, not a crash')
  assert.match(oddResult.outcome.state === 'failed' ? oddResult.outcome.reason : '', /registry refused/,
    'the thrown value must survive as text — a swallowed reason is an unreadable diagnosis')
})

test('RUN — the roster line says the true thing for every verdict, in the loud channel when it is bad', async () => {
  // The mount line cannot answer "will a chapters session open" — only the roster can, and a
  // warn nobody reads is how the silent case survived. So: info when healthy, warn+console.error
  // for every other arm, with the roster's own names in the absent case.
  const mk = (raw: unknown) => {
    const lines: { info: string[]; warn: string[]; err: string[] } = { info: [], warn: [], err: [] }
    const ctx = {
      get: (name: string) => (name === 'agentPresets' ? { list: async () => raw } : undefined),
      logger: { info: (m: string) => { lines.info.push(m) }, warn: (m: string) => { lines.warn.push(m) } },
    }
    return { ctx, lines, err: lines.err }
  }
  const realError = console.error
  const captured: string[] = []
  console.error = (m: string) => { captured.push(String(m)) }
  try {
    const healthy = mk([{ id: PRESET_ID }])
    assert.equal((await reportPresetRoster(healthy.ctx as never, PRESET_ID, { state: 'registered' })).state, 'present')
    assert.deepEqual(healthy.lines.warn, [], 'a healthy roster must not warn')
    assert.match(healthy.lines.info.join(''), /is in the host roster/)

    const broken = mk([{ id: PRESET_ID, broken: 'tool-x: never started' }])
    assert.equal((await reportPresetRoster(broken.ctx as never, PRESET_ID, { state: 'registered' })).state, 'present')
    assert.match(broken.lines.warn.join(''), /DECLARED BUT BROKEN/)
    assert.match(broken.lines.warn.join(''), /tool-x: never started/, 'the host\u2019s own reason must be quoted, not paraphrased')

    const absent = mk([{ id: 'standard' }])
    assert.equal((await reportPresetRoster(absent.ctx as never, PRESET_ID, { state: 'registered' })).state, 'absent')
    assert.match(absent.lines.warn.join(''), /UNHEALTHY/)
    assert.match(absent.lines.warn.join(''), /roster: standard/, 'the other ids are the evidence a human needs')
    assert.match(absent.lines.warn.join(''), /agent-preset\/not-found/, 'the consequence must be named, not implied')

    const unknown = { ctx: { get: () => undefined, logger: { info: () => {}, warn: (m: string) => { captured.push(m) } } } }
    assert.equal((await reportPresetRoster(unknown.ctx as never, PRESET_ID, { state: 'registered' })).state, 'unknown')
    assert.match(captured.join(''), /could not verify the preset roster/)
    // Every bad arm reaches the loud channel too — the realm logger precedent, warn alone is invisible.
    assert.ok(captured.some((m) => /DECLARED BUT BROKEN/.test(m)) && captured.some((m) => /UNHEALTHY/.test(m)),
      'a warn-only health line is what made the original incident hours-long')
  } finally {
    console.error = realError
  }
})

test('RUN — resolvableFromThisPackage answers without throwing, both ways', () => {
  // Asked with packages THIS manifest depends on, so the row passes on a CI runner that has
  // no harness installed — an assertion about the developer's machine would be a lie there,
  // which is the mistake this row made on the first 0.1.17 release run.
  assert.equal(resolvableFromThisPackage('isomorphic-git'), true, 'a declared dependency must resolve')
  assert.equal(resolvableFromThisPackage('@deepseek-ai/schemastery'), true, 'a declared peer must resolve')
  assert.equal(resolvableFromThisPackage('@treeseed/dsh-chapters-not-a-package'), false,
    'a missing package must be a false answer, never a thrown error — this runs inside apply()')
  assert.equal(resolvableFromThisPackage('@deepseek-ai/schemastery/definitely-not-an-export'), false,
    'a package that exists but no longer exports the subpath the row names must be a NO — that is the rename this probe is for')
  assert.equal(resolvableFromThisPackage('./nonsense-relative'), true,
    'a RELATIVE name is answered as resolvable: Node resolves the URL without touching the filesystem. '
    + 'The composition uses package specifiers only; if that ever changes, this probe stops proving anything '
    + 'for those rows and the roster line becomes the only evidence.')
})

test('RUN — the remediation names the reason an absent preset has', () => {
  const modern = rosterRemediation(PRESET_ID, { state: 'registered' })
  assert.match(modern, /registers "chapters" itself/, 'the mechanism is named, not guessed at')
  assert.match(modern, /delivery:/, 'and the log line to read is named')
  const opted = rosterRemediation(PRESET_ID, { state: 'disabled' })
  assert.match(opted, /installChaptersPreset=false/, 'an opt-out must not read as a failure')
  const old = rosterRemediation(PRESET_ID, { state: 'unsupported' })
  assert.match(old, /< 0\.2\.0/, 'a pre-0.2.0 host is unsupported, and the message says so plainly')
  assert.match(old, /upgrade @deepseek-ai\/dsh/, 'with the remedy the user can actually take')
  assert.match(old, /tools and commands still work/, '"nothing works" would be a lie: the tools register either way')
})
