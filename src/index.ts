/**
 * dsh-chapters — cordis entry point (host plane). The ONLY host-facing function
 * plugin; engine logic lives in engine.ts (mounted per preset realm), every
 * decision in the pure modules (docs/development.md § L0).
 *
 * Responsibilities:
 *  1. Make the `chapters` preset EXIST in the host's preset roster, and say loudly
 *     when it does not. Hosts before 0.2.0 are NOT supported: a preset is an
 *     `@deepseek-ai/dsh-agent-preset` declaration row, and this plugin registers
 *     that row at activation through the host's own `agentPresets.register()`
 *     (`src/preset.ts`). The old `$DSH_HOME/.agent-presets/` directory copy is
 *     gone — no 0.2.x host reads it, and shipping the row as a patch layer instead
 *     breaks the boot of every pre-0.1.7 host (measured; docs/contract.md).
 *  2. Open the dsh_chapters storage domain and register chapters_segment /
 *     chapters_continue (src/tools.ts adapts them to the pure core).
 *  3. Witness/dev diagnostics.
 *
 * Protocol notes (each measured, docs/contract.md):
 *  - function plugin: named exports `name` / `inject` / `Config` / `apply`;
 *    NO default export (mixing forms makes the Loader discard the namespace).
 *  - Config uses schemastery (default import) — plain specs are for tool
 *    parameters, zod for domain records; never mix.
 */
import { writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { appendChapters, reserve } from './registry.ts'
import { acquireChapterStore, makeDomainStore } from './store.ts'
import type { ChapterRecord } from './archive.ts'
import { registerChaptersTools } from './tools.ts'
import { CHAPTERS_PRESET_ID, registerChaptersPreset, inventoryEntry, unusableRows, type PresetRegistryLike, type RegisterOutcome } from './preset.ts'
import { registerHostCommands } from './commands.ts'
import { createEnrichWiring } from './enrich-wire.ts'
import { rulesCommand, type RulesIo } from './rules-commands.ts'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { createSyncScheduler, makeCollectionsReader, projectForCwd, readToken, DEFAULT_CLONE_DIR, type SyncScheduler } from './sync.ts'
import { parseKnowledgeRemote, projectKeyForTarget, resolveProject } from './repo.ts'
import { providerKindFor, registerProvider } from './provider.ts'
import { createTreedxProvider } from './treedx/provider.ts'

/** The cordis surface this entry touches; widened in later stages. */
interface HostCtx {
  logger?: { info?: (message: string) => void; warn?: (message: string) => void }
  get?: (name: string) => unknown
  effect?: (fn: () => void, label?: string) => void
  agents?: unknown
  tools?: { register(def: unknown): () => void }
  sessionProjections?: { stateOf(session: unknown, key: string): unknown }
  llm?: {
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{ context?: { contextWindow?: number } } | undefined>
    stream?: (opts: unknown) => AsyncIterable<unknown>
  }
}

export interface Config {
  installChaptersPreset: boolean
  compactionThresholdRatio: number
  artifactStoreRoot: string
  chapterTokenTarget: number
  toolResultDeferFloorTokens: number
  continuationBudgetRatio: number
  fallbackPreset: string
  mergeThreshold: number
  chapterLimit: number
  /** Plans (docs/plans-carriage.md § 7): verbatim plan chars shown in a chapter,
   * the tool-call-argument artifact floor (0 = off), and whether the notice
   * carries the `## Plans on this path` block. */
  planInlineChars: number
  callArgArtifactTokens: number
  plansInNotice: boolean
  /** Teach the child its lookup verbs (read / chapters_artifact / chapters_search). */
  retrievalHints: boolean
  /** Seed plan mode into continuation children (plans-carriage § 10). */
  planSeedMode: boolean
  /** Carry the operative plan into every in-place checkpoint (§ 9). */
  plansInCheckpoint: boolean
  planCheckpointChars: number
  harnessId: string
  /** §12: the project's knowledge repo URL ('' = rely on /chapters-link). */
  knowledgeRemote: string
  /** §12: wins over the §2.3 derivation. */
  projectKeyOverride: string
  /** §12: coalesce window for post-archive pushes. */
  syncDebounceMs: number
  /** §12: default pack size for chapters_search. */
  searchDefaultMaxTokens: number
  /** P2 §12: enrichment kill switch (auto triggers live on the realm plane;
   * the host plane's queue is manual-only so nothing ever double-runs). */
  enrichmentEnabled: boolean
  /** 'provider/model' or '' = conversation/stored route (record §6). */
  enrichmentModel: string
  enrichmentIdleMs: number
  enrichmentBatchCap: number
  /** P2 §6.3 vocabulary pass (shadow by default). */
  vocabApply: boolean
  vocabCoMin: number
  vocabOverlapMin: number
  /** P3 §7.3: budget for the notice's core-rules section (refuse, never clip). */
  coreRulesBudgetTokens: number
  /** P3 §8: search bonus for effective-core rules (per-machine status). */
  rulesCoreBonus: number
  /** §15 amendment: transport policy — 'auto' dispatches on the remote
   * scheme (treedx+ → TreeDX, anything else → git); an explicit value must
   * match the scheme or the link refuses (never a silent fallback). */
  knowledgeProvider: 'auto' | 'git' | 'treedx'
  /** TreeDX transport tunables (record §12 register: no hardcoded numbers). */
  treedxFetchTimeoutMs: number
  treedxWorkspaceTtlSeconds: number
  treedxLeaseRetries: number
  treedxLeaseRetryDelayMs: number
}

export const Config = Schema.object({
  // The preset is how the engine reaches real sessions (preset realm mount);
  // turning this off means opting into manual preset authoring instead.
  installChaptersPreset: Schema.boolean().default(true),
  // The engine row of the registered preset (docs/host-compaction-seam.md). This is the
  // one row config that used to live in a preset YAML a human edited in the home; with
  // the row registered from code it belongs to THIS config, so a profile patch retunes it.
  compactionThresholdRatio: Schema.number().default(0.9),
  artifactStoreRoot: Schema.string().default('.dsh-chapters'),
  chapterTokenTarget: Schema.number().default(8000),
  toolResultDeferFloorTokens: Schema.number().default(200),
  // Share of the window REMAINING after the header bound — never of the
  // whole window (docs/architecture.md § Budgets).
  continuationBudgetRatio: Schema.number().default(0.25),
  fallbackPreset: Schema.string().default('chapters'),
  // Topic-sequential composition (record §4.2) for the model-free fork path.
  mergeThreshold: Schema.number().default(0.3),
  chapterLimit: Schema.number().default(8000),
  // Plans (docs/plans-carriage.md § 7). A plan's full text is ALWAYS
  // artifact-backed, so planInlineChars is display economy and never a data
  // decision. callArgArtifactTokens defaults to 0 = OFF: turning it on changes
  // chapter bytes for sessions with large tool-call arguments (a `write` call
  // carries a whole file), which means model tapes must be re-recorded — so a
  // deployment opts in deliberately rather than by accident.
  planInlineChars: Schema.number().default(900),
  callArgArtifactTokens: Schema.number().default(0),
  // Renders zero bytes when the path holds no plans, so the default-on cost for
  // sessions that never enter plan mode is exactly nothing.
  plansInNotice: Schema.boolean().default(true),
  retrievalHints: Schema.boolean().default(true),
  // Seeding is measured-safe (kernel accepts the two-event seed and the host's own
  // plan projection folds it to active) and it is what keeps the agent anchored to
  // the task across a continuation — so it ships ON, for continuations only.
  planSeedMode: Schema.boolean().default(true),
  plansInCheckpoint: Schema.boolean().default(true),
  planCheckpointChars: Schema.number().default(1600),
  // Per-machine identity for the knowledge repo (commit author + per-harness
  // token scoping, record §2.1). The hostname is the honest default; override
  // per machine when two sessions on one box must be told apart.
  harnessId: Schema.string().default(hostname()),
  // Knowledge repo (record §12): '' leaves linking to /chapters-link; a URL
  // auto-links every workspace on its first archive event.
  knowledgeRemote: Schema.string().default(''),
  projectKeyOverride: Schema.string().default(''),
  syncDebounceMs: Schema.number().default(30000),
  searchDefaultMaxTokens: Schema.number().default(400),
  enrichmentEnabled: Schema.boolean().default(true),
  enrichmentModel: Schema.string().default(''),
  enrichmentIdleMs: Schema.number().default(60000),
  enrichmentBatchCap: Schema.number().default(5),
  vocabApply: Schema.boolean().default(false),
  vocabCoMin: Schema.number().default(3),
  vocabOverlapMin: Schema.number().default(0.5),
  coreRulesBudgetTokens: Schema.number().default(1200),
  rulesCoreBonus: Schema.number().default(0.15),
  // enum-style string (same register as `fallbackPreset`): 'auto' | 'git' |
  // 'treedx', validated at use — schemastery has no literal schema.
  knowledgeProvider: Schema.string().default('auto'),
  treedxFetchTimeoutMs: Schema.number().default(15000),
  treedxWorkspaceTtlSeconds: Schema.number().default(900),
  treedxLeaseRetries: Schema.number().default(3),
  treedxLeaseRetryDelayMs: Schema.number().default(1000),
}) as Schema<Config>

export const name = '@treeseed/dsh-chapters'

export const inject = ['storageDomain', 'tools', 'agents', 'llm', 'sessionProjections']

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(HERE, '..')

/** Registrations this module owns for the life of the process. The registry hands back an
 *  unregister disposer, and holding it — never calling it — is the point: a disposer wired
 *  through `ctx.effect` runs when the apply fiber's activation completes, which un-registered
 *  the preset the instant it had been registered (measured: `register()` reported success
 *  while the roster came back without `chapters`). The same apply-fiber trap bit the storage
 *  domain in r35. */
const heldDisposers: Array<() => Promise<void>> = []

export async function apply(ctx: HostCtx, config: Config): Promise<void> {
  // § Preset delivery. A host whose `agentPresets` exposes `register()` composes presets
  // from declaration rows; one that does not is older than 0.2.0 and is NOT supported.
  // The answer comes from the service's shape, never from a version string.
  const registry = ctx.get?.('agentPresets') as PresetRegistryLike | undefined
  const registers = typeof registry?.register === 'function'
  let registerOutcome: RegisterOutcome
  if (!config.installChaptersPreset) registerOutcome = { state: 'disabled' }
  else if (!registers) registerOutcome = { state: 'unsupported' }
  else {
    try {
      registerOutcome = (await registerChaptersPreset(registry, {
        resolvable: resolvableFromThisPackage,
        thresholdRatio: config.compactionThresholdRatio,
        // NOT ctx.effect(): a cleanup registered on the apply fiber fires when THAT fiber's
        // activation completes, and the registry's disposer un-registers the preset — measured
        // on 0.2.0-rc.2, where `register()` reported success while the roster came back
        // WITHOUT `chapters`. Same apply-fiber trap r35 caught for the storage domain.
        dispose: (disposer) => { heldDisposers.push(disposer) },
      })).outcome
    } catch (error) {
      // Nothing here may take the plugin down: tools and commands register below, and a
      // session with no chapters tools is still useful.
      registerOutcome = { state: 'failed', reason: String((error as Error)?.message ?? error) }
    }
  }

  let domain: import('./store.ts').DomainLike | undefined
  try {
    const storageDomain = ctx.get?.('storageDomain') as
      { open: (s: unknown) => Promise<import('./store.ts').DomainLike>; get?: (n: string) => import('./store.ts').DomainLike | undefined } | undefined
    if (storageDomain === undefined) throw new Error('storageDomain absent')
    const handle = await acquireChapterStore(storageDomain)
    domain = handle.domain
    const store = handle.store
    // No close effect here: the facility's own disposer closes domains still
    // open at facility unmount (its documented teardown), and a close effect
    // on the apply fiber fires when THAT fiber is disposed — mid-run, which
    // closed the domain under later commands (r35 caught it). One opener, and
    // the closer is the facility's unmount, not our fiber.
    void handle.owner
    // §15 amendment: the TreeDX transport, configured and registered in THIS
    // module instance (host plane). The realm engine registers its own copy
    // (separate module instances under isolation) — same code, per-plane.
    registerProvider(createTreedxProvider({
      fetchTimeoutMs: config.treedxFetchTimeoutMs,
      workspaceTtlSeconds: config.treedxWorkspaceTtlSeconds,
      leaseRetries: config.treedxLeaseRetries,
      leaseRetryDelayMs: config.treedxLeaseRetryDelayMs,
    }))
    // P2: host-plane enrichment wiring — command surface + status only
    // (trigger forced manual; the realm engine owns auto drains).
    // The routed model of the last real tool-carrying session on this plane:
    // the host has no live agent, so without this a fork-only flow (never any
    // in-place compaction => realm never captures lastRoute) leaves
    // /chapters-enrich run with no route to call. Persisted immediately so
    // the realm's resolver sees it via the shared settings table too.
    let hostRoute: { provider: string, model: string } | null = null
    const enrich = createEnrichWiring({
      store,
      cwd: () => undefined,
      config: {
        enabled: config.enrichmentEnabled,
        model: config.enrichmentModel,
        trigger: 'manual',
        idleMs: config.enrichmentIdleMs,
        batchCap: config.enrichmentBatchCap,
      },
      fetch: async (prompt, route) => {
        if (route === null) throw new Error('no enrichment route resolvable (set /chapters-enrich model … or run a turn first)')
        const llm = ctx.llm
        if (llm?.stream === undefined) throw new Error('llm.stream absent')
        const assembler = new BlockAssembler()
        for await (const chunk of llm.stream({
          provider: route.provider, model: route.model,
          messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'plugin', plugin: 'dsh-chapters' } })],
          maxTokens: 900,
          purpose: 'compaction',
        })) assembler.push(chunk as never)
        return (assembler.blocks() as { type?: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      },
      conversationRoute: () => hostRoute,
      log: (m) => ctx.logger?.info?.(`dsh-chapters: ${m}`),
      warn: (m) => ctx.logger?.warn?.(`dsh-chapters: ${m}`),
    })
    const scheduler = createScheduler(store, domain, config, undefined, (cwd, ok) => {
      enrich.rememberCwd(cwd)
      if (ok) enrich.queue.onSyncDone('afterPush')
    }, (m) => ctx.logger?.warn?.(m))
    registerChaptersTools(ctx as never, store, {
      artifactStoreRoot: config.artifactStoreRoot,
      chapterTokenTarget: config.chapterTokenTarget,
      toolResultDeferFloorTokens: config.toolResultDeferFloorTokens,
      continuationBudgetRatio: config.continuationBudgetRatio,
      fallbackPreset: config.fallbackPreset,
      mergeThreshold: config.mergeThreshold,
      chapterLimit: config.chapterLimit,
      planInlineChars: config.planInlineChars,
      callArgArtifactTokens: config.callArgArtifactTokens,
      plansInNotice: config.plansInNotice,
      retrievalHints: config.retrievalHints,
      planSeedMode: config.planSeedMode,
      searchMaxTokens: config.searchDefaultMaxTokens,
      harnessId: config.harnessId,
      coreRulesBudgetTokens: config.coreRulesBudgetTokens,
      rulesCoreBonus: config.rulesCoreBonus,
      scheduler,
      noteRoute: (r) => {
        hostRoute = r
        void store.putSetting('enrichment.route', `${r.provider}/${r.model}`).catch(() => undefined)
      },
    })
    registerHostCommands(ctx as never, domain, {
      artifactStoreRoot: config.artifactStoreRoot,
      harnessId: config.harnessId,
      scheduler,
      enrich,
      rules: (cwd, args) => rulesCommand({
        cwd: () => cwd,
        storeRoot: config.artifactStoreRoot,
        harnessId: config.harnessId,
        store,
        projectFor: (c) => projectForCwd(store.projects(), c),
        mirrorDir: (c) => join(c, DEFAULT_CLONE_DIR),
        syncNow: async (c) => { try { await scheduler.run(c, 'rules') } catch { /* status file records it */ } },
        now: () => new Date(),
      } satisfies RulesIo, args),
    })
  } catch (error) {
    // Tools are the whole user-facing surface short of the engine: a failure
    // here is loud, never a silently missing tool. Loud means the operator
    // actually sees it — the realm logger routes to boot stdout (r19/r35 twice
    // burned by a warn nobody could read; the DSH_CHAPTERS_ERRORS sink env is
    // the engine's precedent).
    const message = `dsh-chapters: tool/command registration FAILED (${String(error)})`
    ctx.logger?.warn?.(message)
    console.error(message)
  }

  // Honest status, because the settings surface reads "enabled and running" either way.
  // "mounted" is not "the preset exists": a session's preset id is durable state, so an
  // absent or broken preset means every chapters session refuses to OPEN while its log
  // sits there intact — a user-visible failure with nothing in the UI to explain it.
  const presetNote = registerOutcome.state === 'registered' ? 'delivery: registered the chapters preset declaration row'
    : registerOutcome.state === 'pruned' ? `delivery: registered the chapters preset (${registerOutcome.dropped.length} row(s) this host cannot resolve, dropped)`
      : registerOutcome.state === 'already-declared' ? 'delivery: preset declared by another patch layer (kept, not re-registered)'
        : registerOutcome.state === 'disabled' ? 'delivery: OFF (config.installChaptersPreset=false; preset authoring is yours)'
          : registerOutcome.state === 'unsupported' ? 'delivery: REFUSED — this host predates preset declaration rows (< 0.2.0)'
            : `delivery: FAILED (${registerOutcome.reason})`
  const unhealthy = registerOutcome.state === 'failed'
    || (registerOutcome.state === 'unsupported' && config.installChaptersPreset === true)
  const mountMsg = `dsh-chapters: mounted (tools registered; ${presetNote})`
  if (unhealthy) ctx.logger?.warn?.(`${mountMsg} — UNHEALTHY: sessions choosing the chapters preset will not compose`)
  else ctx.logger?.info?.(mountMsg)

  // File presence is NOT preset existence (§ Preset delivery): the roster is the only
  // evidence. It must be asked AFTER activation — the registry re-audits a mount by
  // awaiting the settled loader tree, and a caller "must not run inside a Host row's
  // own activation, which the settlement would wait on" — hence this deferred check,
  // which also catches a registration that mounted but could not activate. One check
  // per boot, reused by the dev witness.
  const marker = process.env.DSH_CHAPTERS_WITNESS
  let roster: Promise<RosterVerdict> | undefined
  const rosterCheck = (): Promise<RosterVerdict> =>
    roster ??= reportPresetRoster(ctx, config.fallbackPreset, registerOutcome)
  setTimeout(() => {
    void rosterCheck().then((verdict) => {
      if (marker !== undefined) void witness(ctx, marker, domain, verdict, registerOutcome)
    })
  }, 500).unref?.()
}

/**
 * The §5 sync loop for the host plane. Auto-link (when `knowledgeRemote` is
 * configured) happens lazily inside resolveProject: a workspace's first
 * archive event finds a project record, so nothing network-shaped runs
 * before anything archives.
 */
export function createScheduler(
  store: import('./store.ts').RegistryStore,
  domain: import('./store.ts').DomainLike,
  config: Config,
  debounceOverride?: number,
  onSyncDone?: (cwd: string, ok: boolean) => void,
  warn?: (m: string) => void,
): SyncScheduler {
  return createSyncScheduler({
    storeRoot: config.artifactStoreRoot,
    cloneDir: DEFAULT_CLONE_DIR,
    debounceMs: debounceOverride ?? config.syncDebounceMs,
    vocab: { apply: config.vocabApply, coMin: config.vocabCoMin, overlapMin: config.vocabOverlapMin },
    ...(onSyncDone !== undefined ? { onSyncDone } : {}),
    resolveProject: (cwd) => {
      const found = projectForCwd(store.projects(), cwd)
      if (found !== undefined) return found
      if (config.knowledgeRemote === '') return undefined
      try {
        const target = parseKnowledgeRemote(config.knowledgeRemote)
        const kind = providerKindFor(target.kind, config.knowledgeProvider)
        const resolved = resolveProject(cwd,
          config.projectKeyOverride !== '' ? config.projectKeyOverride : undefined,
          config.knowledgeRemote)
        const rec = {
          // Identity via projectKeyForTarget: §2.3 canonicalization, plus the
          // treedx/ namespace for TreeDX targets (keyed per-machine-stable by
          // construction — that is the whole point of §2.3). The override wins
          // exactly as before.
          projectKey: config.projectKeyOverride !== '' ? resolved.projectKey : projectKeyForTarget(target),
          slug: target.treedx?.repoName ?? (resolved.remote ?? config.knowledgeRemote).split('/').pop()!.replace(/\.git$/, ''),
          remote: config.knowledgeRemote,
          kind,
          harnessId: config.harnessId,
          linkedAt: new Date().toISOString(),
          cwd,
        }
        domain.table('projects').put(rec.projectKey, rec)
        return rec
      } catch (error) {
        // A policy contradiction (knowledgeProvider vs the remote scheme) is
        // LOUD in the log but never throws into the archive path (§5.3 shape).
        warn?.(`dsh-chapters: knowledgeRemote auto-link refused: ${String((error as Error)?.message ?? error)}`)
        return undefined
      }
    },
    tokenFor: (cwd, projectKey) => readToken(cwd, config.artifactStoreRoot, projectKey),
    collectionsFor: makeCollectionsReader(store.sessions.bind(store), config.artifactStoreRoot),
  })
}

// ---------------------------------------------------------------- preset delivery

/**
 * Why delivery is a `register()` call and not a file, in one incident: hosts from
 * 0.1.7-alpha.1 stopped reading `$DSH_HOME/.agent-presets/` — a preset is an
 * `@deepseek-ai/dsh-agent-preset` declaration row — while the plugin kept copying,
 * kept logging that it had mounted, and the preset was simply GONE. That is worse
 * than a crash, because `resume` resolves the preset id recorded in the session's
 * own log and throws `agent-preset/not-found`, so every chapters session became
 * unopenable while its durable log sat there intact and uncorrupted.
 *
 * Shipping the row as a patch layer instead is what a reader will reach for, and it
 * is a boot-breaking choice on the hosts this plugin used to support: `dsh.bundle.patch`
 * as an array throws `ERR_INVALID_ARG_TYPE` at legacy `dsh-app-boot/lib/index.js:853`,
 * an unresolvable row aborts a legacy plugin tree, and `disabled: !!js` cannot gate the
 * row because the Loader evaluates `disabled` before any service is mounted (all three
 * measured). Support floor is 0.2.0 now, so the row is registered here through the
 * host's own `agentPresets.register()` — the same call its declaration-row plugin makes.
 */

/**
 * Whether a row's module can be imported from THIS package's resolution family.
 *
 * The preset mount resolves its rows from the registry's context, which shares this Node
 * resolution root; a false answer here means a row that would activate as failed — and one
 * failed row makes the whole preset `broken`, which is worse than a missing tool.
 *
 * Never throws: an unresolvable specifier is the answer. Two limits of the probe are the
 * host's own, not ours to paper over: a RELATIVE specifier resolves without touching the
 * filesystem (Node answers the URL, not existence), so a file-URL row would always be
 * reported resolvable; and a name that resolves is not yet a name that ACTIVATES — a plugin
 * that rejects its config throws later, which is what the roster line reports as
 * `DECLARED BUT BROKEN`. Subpath exports are the useful case, and they are the ones a host
 * rename eats first: `@scope/pkg/no-longer-exported` answers `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
export function resolvableFromThisPackage(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) return true
  try {
    import.meta.resolve(specifier)
    return true
  } catch {
    return false
  }
}

/** What the host roster says about our preset. */
export type RosterVerdict =
  | { state: 'present'; broken?: string }
  | { state: 'absent'; rows: string[] }
  | { state: 'unknown'; error: string }

/** Ask the host which presets exist. Tolerates both shapes the service has
 *  offered: the bare row array (`list()`) and the remote envelope (`{presets}`). */
export async function readRosterVerdict(
  presets: { list?: () => Promise<unknown> } | undefined,
  presetId: string,
): Promise<RosterVerdict> {
  if (presets?.list === undefined) return { state: 'unknown', error: 'agentPresets service absent' }
  try {
    const raw = await presets.list()
    const rows = ((Array.isArray(raw) ? raw : (raw as { presets?: unknown[] } | undefined)?.presets) ?? []) as
      { id?: unknown; broken?: unknown }[]
    const mine = rows.find((r) => r?.id === presetId)
    if (mine === undefined) return { state: 'absent', rows: rows.map((r) => String(r?.id ?? '?')).sort() }
    const broken = mine.broken
    return typeof broken === 'string' && broken !== '' ? { state: 'present', broken } : { state: 'present' }
  } catch (error) {
    return { state: 'unknown', error: String((error as Error)?.message ?? error) }
  }
}

/** The remedy, in the two shapes an absent preset can have on a supported host. */
export function rosterRemediation(presetId: string, outcome: RegisterOutcome): string {
  if (outcome.state === 'disabled') {
    return `config.installChaptersPreset=false, so this plugin did not register "${presetId}" — declare it yourself, `
      + 'or turn the config back on and restart'
  }
  if (outcome.state === 'unsupported') {
    return 'this host predates preset declaration rows (< 0.2.0) and is not supported by this plugin — the chapters '
      + 'tools and commands still work, but no `chapters` preset can exist here; upgrade @deepseek-ai/dsh'
  }
  return `this plugin registers "${presetId}" itself at activation, so an absent preset means that call did not `
    + 'happen or was refused — read the mount line above for "delivery:" and the failure arm it names'
}

/** Deferred boot check: one truthful line about the preset, plus the verdict for the witness.
 * Exported so the four arms of that line are tested without booting a host — the line IS the
 * health signal a user reads, and an untested health signal is how the silent case survived. */
export async function reportPresetRoster(
  ctx: HostCtx,
  presetId: string,
  outcome: RegisterOutcome,
): Promise<RosterVerdict> {
  const presets = ctx.get?.('agentPresets') as { list?: () => Promise<unknown> } | undefined
  const verdict = await readRosterVerdict(presets, presetId)
  const line = (message: string, warn: boolean): void => {
    if (warn) {
      ctx.logger?.warn?.(message)
      console.error(message)
    } else ctx.logger?.info?.(message)
  }
  if (verdict.state === 'present' && verdict.broken === undefined) {
    line(`dsh-chapters: preset "${presetId}" is in the host roster — chapter-form compaction and continuations will compose`, false)
  } else if (verdict.state === 'present') {
    line(`dsh-chapters: preset "${presetId}" is DECLARED BUT BROKEN — ${verdict.broken} — sessions choosing it will not compose. `
      + 'A preset row whose child plugin no longer resolves fails here; the plugin drops rows this host cannot import, '
      + 'so this line means a package that resolves but will not activate — re-anchor src/preset.ts against this host.', true)
  } else if (verdict.state === 'absent') {
    line(`dsh-chapters: UNHEALTHY — preset "${presetId}" is NOT in the host roster (roster: ${verdict.rows.join(', ') || 'empty'}). `
      + `Every session whose log records it will refuse to open with agent-preset/not-found — the logs are intact; the composition is missing. `
      + `Remedy: ${rosterRemediation(presetId, outcome)}`, true)
  } else {
    line(`dsh-chapters: could not verify the preset roster (${verdict.error}) — treat chapter-form compaction as unconfirmed`, true)
  }
  return verdict
}

// ---------------------------------------------------------------- dev witness

async function witness(
  ctx: HostCtx,
  marker: string,
  preopened?: import('./store.ts').DomainLike,
  roster?: RosterVerdict,
  register?: RegisterOutcome,
): Promise<void> {
  const WITNESS_SESSION = 'dsh-chapters-witness'
  const out: Record<string, unknown> = { at: new Date().toISOString() }
  try {
    out.storageDomainPresent = ctx.get?.('storageDomain') !== undefined
    // What this host's preset mechanism IS, and what the roster says about the
    // chapters preset. These two lines are the difference between "the preset files
    // are installed" (true, and meaningless on a declaration-row host) and "the
    // preset exists" — the only thing a session cares about.
    out.registryRegisters = typeof (ctx.get?.('agentPresets') as PresetRegistryLike | undefined)?.register === 'function'
    out.presetRegister = register?.state ?? 'not-attempted'
    if (register?.state === 'pruned') out.presetDroppedRows = register.dropped
    if (register?.state === 'failed') out.presetRegisterError = register.reason
    out.presetRoster = roster?.state ?? 'not-checked'
    // The roster says a preset is declared; the inventory says whether its rows are
    // actually active. A row that resolves but will not activate leaves the preset on
    // the menu and unusable, and only this distinction names it.
    const invRaw = await (ctx.get?.('agentPresets') as PresetRegistryLike | undefined)?.compositionInventory?.()?.catch?.(() => undefined)
    const inv = inventoryEntry(invRaw, CHAPTERS_PRESET_ID)
    if (inv !== undefined) {
      out.presetInventoryRows = (inv.rows ?? []).length
      out.presetUnusableRows = unusableRows(inv)
      if (inv.broken !== undefined) out.presetInventoryBroken = inv.broken
    }
    if (roster?.state === 'absent') out.presetRosterRows = roster.rows
    if (roster?.state === 'present' && roster.broken !== undefined) out.presetRosterBroken = roster.broken
    if (roster?.state === 'unknown') out.presetRosterError = roster.error
    const storageDomain = ctx.get?.('storageDomain') as { open: (s: unknown) => Promise<import('./store.ts').DomainLike>; get?: (n: string) => import('./store.ts').DomainLike | undefined }
    const store = preopened !== undefined ? makeDomainStore(preopened) : (await acquireChapterStore(storageDomain!)).store
    const prior = await store.get(WITNESS_SESSION)
    out.priorChapters = prior.chapters.length
    if (prior.chapters.length === 0) {
      const reserved = reserve(prior, 'witness@1', 1)
      const record: ChapterRecord = {
        number: reserved.numbers[0] ?? 1,
        path: `.dsh-chapters/${WITNESS_SESSION}/chapters/001-witness.md`,
        title: 'witness', summary: `first boot ${new Date().toISOString()}`,
        startSeq: 0, endSeq: 0, topics: [], messages: 0, sha256: '0'.repeat(64), estimatedTokens: 0, artifacts: [],
      }
      await store.put(WITNESS_SESSION, appendChapters(reserved.state, [record]))
    } else {
      await store.put(WITNESS_SESSION, prior)
    }
    out.storedChapters = (await store.get(WITNESS_SESSION)).chapters.length
  } catch (error) {
    out.error = String(error)
  }
  writeFileSync(marker, JSON.stringify(out, null, 2))
}
