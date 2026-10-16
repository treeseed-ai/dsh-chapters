/**
 * The `chapters` agent preset: its composition, and the ONLY sanctioned way this
 * plugin makes a preset EXIST on a host that composes presets from declaration
 * rows (>= 0.1.7-alpha.1; "Nothing reads $DSH_HOME/.agent-presets any more").
 *
 * WHY THIS FILE IS CODE AND NOT A SHIPPED PATCH LAYER
 * ---------------------------------------------------
 * The host's idiom is a `@deepseek-ai/dsh-agent-preset` row carried by a bundle
 * patch layer, listed in `package.json` `dsh.bundle.patch`. Shipping that row as
 * a SECOND layer means `dsh.bundle.patch` becomes an ARRAY, and both halves of
 * that are fatal on a pre-0.1.7 host — measured on the pinned e2e closure
 * (0.1.5-rc.1), not reasoned about:
 *
 *   - array `patch`: `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must
 *     be of type string. Received an instance of Array` at
 *     `dsh-app-boot/lib/index.js:853` (`join(packageDir, declared)`) — the host
 *     never boots.
 *   - the row itself, in ANY layer a legacy host reads:
 *     `dsh: plugin tree failed to load: ... failed to import loader entry
 *     preset-chapters (@deepseek-ai/dsh-agent-preset): Cannot find package` — a
 *     legacy host's plugin tree aborts the boot on one unresolvable row.
 *   - gating it with `disabled: !!js get('agentPresets')?.register === undefined`
 *     does not work either: the Loader evaluates `disabled` BEFORE services are
 *     mounted, so the expression is truthy on a 0.2.x host too and the row never
 *     registers (measured: `preset-v2 … failed to import`, roster without it).
 *
 * Registering through `ctx.get('agentPresets').register(definition)` is the same
 * call the host's own declaration-row plugin makes
 * (`dsh-agent-preset/lib/index.js`: `[Service.init]` → `this.ctx.agentPresets.register(this.config)`),
 * made from a row that resolves on EVERY host: this package. The tradeoff is
 * honest and stated in docs/contract.md: the composition is not visible in a
 * patch-layer dump, so the roster (not a file) is the evidence — which is the
 * rule this module enforces anyway.
 *
 * WHY ROWS ARE PRUNED AGAINST THE INSTALLED HOST
 * ----------------------------------------------
 * The host's standard plugin list is not stable across the versions this package
 * must serve. Measured against published `@deepseek-ai/dsh-web-app` presets:
 * 0.2.0-rc.1/rc.2 lack `dsh-time-context` and `dsh-tool-schedule`;
 * `dsh-tool-schedule` is not published at 0.2.0-rc.x AT ALL (first real version
 * 0.2.1-alpha.1), and `dsh-plugin-market` exists only at 0.2.1-alpha.4. One
 * unresolvable row does not degrade: `mountPreset` throws on any failed row, the
 * registry stores it as `record.broken`, and `retain()` then refuses with
 * `agent-preset/invalid` — every session choosing `chapters` stops composing,
 * while its durable log sits there intact. So a row whose package does not
 * resolve is DROPPED here and reported, instead of taking the preset down.
 *
 * @module dsh-chapters/src/preset
 */

/** One mounted plugin row of a preset composition (the Loader's own shape).
 * A group row carries its children in `config`; an ordinary row carries a
 * config map — the Loader accepts both under the same key. */
export interface PresetRow {
  id: string
  name: string
  config?: Record<string, unknown> | PresetRow[]
  disabled?: boolean
  group?: boolean
  isolate?: Record<string, boolean>
}

/** The `AgentPreset` Config the host registers (`dsh-agent-preset/lib/index.js:13-20`). */
export interface PresetDefinition {
  id: string
  name: string
  description: string
  order: number
  plugins: PresetRow[]
}

/** The plan-mode prompt section, verbatim from the host's own standard preset.
 * Reword it with the host and the drift test says so; it is prompt bytes every
 * chapters session pays, so it is not ours to invent. */
const PLAN_MODE_SECTION = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.
`

/**
 * The PLOT: discipline. Two facts are load-bearing in this string and a test pins
 * both by BEHAVIOUR, not by text equality:
 *  - no `{{cwd}}`: `dsh-agent-loop` registers `provider`/`model`/`cwd` up to
 *    0.2.0-rc.2 and only `provider`/`model` from 0.2.1-alpha.2, and an
 *    unregistered reference THROWS at prompt assembly (`dsh-system-prompt`
 *    `interpolate`), killing every turn of every chapters session. The working
 *    directory already reaches the model from `dsh-working-directory` (host plane).
 *  - the wording `src/engine-core.ts`'s PLOT_TEMPLATE_ECHO matches, so a model
 *    quoting our own instruction back is not inherited as a "plot".
 */
const PLOT_SUFFIX = "When a task spans multiple turns, end each reply with one line beginning 'PLOT:' (max 60 words — objective, current hypothesis, immediate next step). A checkpoint carries this plot forward; if it looks stale, revise it on your next plot line."

/**
 * WHY THE DELEGATION ROWS CARRY NO `toolFilter`, although the host's own alpha.1/alpha.2
 * list denied `schedule_*` there.
 *
 * Measured on a real 0.2.1-alpha.4 boot: `tool-subagent` does NOT strip an unknown key —
 * it rejects the removed one outright, and the WHOLE preset goes broken:
 *   `tool-subagent: toolFilter is no longer supported; configure persona and tool plugins
 *    in an Agent Preset and select it with agentPreset (spawn only)`
 * while the same composition on 0.2.0-rc.2 (which still accepts `toolFilter`) mounts. So a
 * key that one supported host accepts and the next one THROWS on is worse than dropping it:
 * the deny list protected nothing on rc.2 (no schedule tools exist there at all) and would
 * break every chapters session on the alpha. The general rule this incident writes down:
 * carry only config keys EVERY supported host accepts, and let the roster line — not a
 * file on disk — be the evidence that the composition is usable.
 */

/**
 * The chapters preset: the host's standard coding-agent composition with EXACTLY
 * four deltas, each one a product decision of ours.
 *
 *  1. `compaction-basic` → `@treeseed/dsh-chapters/engine` (thresholdRatio 0.9):
 *     the zero-inference `summarize()` — chapters from the log, no model tokens.
 *  2. `tool-result-pruner.thresholdChars` 8192 → 1000000, deliberately dormant:
 *     chapters defer oversized results at ARCHIVE time (verbatim bodies +
 *     artifact references), never in-surface, where a prune is a prefix cliff on
 *     local hardware.
 *  3. the persona gains the PLOT: suffix (plot carriage through in-place
 *     checkpoints) and keeps no `{{cwd}}` (see PLOT_SUFFIX).
 *  4. `tool-ralph` mounted ENABLED — the bounded goal loop the continuation
 *     children run. The host ships it disabled; enabling it here is ours.
 *
 * @param platform the platform the shell-gated rows are decided against; a
 *        parameter so the rows are testable on any machine.
 */
export function chaptersPresetRows(platform: NodeJS.Platform = process.platform, thresholdRatio = 0.9): PresetRow[] {
  return [
    {
      id: 'persona',
      name: '@deepseek-ai/dsh-persona',
      config: { prefix: 'You are a coding agent powered by the {{model}} model.', suffix: PLOT_SUFFIX },
    },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: platform === 'win32' },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: platform !== 'win32' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    { id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    {
      id: 'planning',
      name: 'cordis:group',
      group: true,
      isolate: { planMode: true },
      config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: PLAN_MODE_SECTION } }],
    },
    {
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
      config: [
        { id: 'chapters-engine', name: '@treeseed/dsh-chapters/engine', config: { thresholdRatio } },
        { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
        // Delta 2: dormant by choice, not by accident. Keep the key set exactly
        // {thresholdChars, headChars, tailChars} — this plugin rejects unknown keys.
        { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 1000000, headChars: 4096, tailChars: 1024 } },
      ],
    },
    {
      id: 'delegation',
      name: 'cordis:group',
      group: true,
      isolate: { workflowEngine: true },
      config: [
        { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
        { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
        {
          id: 'tool-subagent',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true, backgroundMode: 'continuable' },
        },
        {
          id: 'tool-subagent-fork',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable' },
        },
        {
          id: 'workflow-ptc',
          name: '@deepseek-ai/dsh-workflow-ptc',
          config: { provider: 'spawn' },
        },
        { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
        // Delta 4: enabled, where the host standard list mounts it disabled.
        { id: 'tool-ralph', name: '@deepseek-ai/dsh-tool-ralph', config: { subagentProvider: 'spawn', maxRounds: 64 } },
      ],
    },
    { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
    { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    // Disabled by host policy; the row stays so a profile `override` can switch it.
    { id: 'tool-plugin-manager', name: '@deepseek-ai/dsh-plugin-manager/tools', disabled: true },
  ]
}

/** The preset identity. `config.id` is DURABLE STATE: every continuation child's
 *  log records it as `agent-preset/selected`, so renaming it orphans those
 *  sessions (`agent-preset/not-found` on open). */
export const CHAPTERS_PRESET_ID = 'chapters'

export function chaptersPresetDefinition(
  platform: NodeJS.Platform = process.platform,
  thresholdRatio = 0.9,
): PresetDefinition {
  return {
    id: CHAPTERS_PRESET_ID,
    name: 'Chapters',
    description: 'Full coding agent; context relief via zero-inference chapter compaction.',
    order: 0,
    plugins: chaptersPresetRows(platform, thresholdRatio),
  }
}

/** Whether a row names something a resolver must answer for. `cordis:` rows are
 *  pseudo-modules the Loader always provides; our own package is by definition
 *  present (its realm row is the point of the preset). */
function needsProbe(row: PresetRow): boolean {
  return !row.name.startsWith('cordis:') && !row.name.startsWith('@treeseed/dsh-chapters')
}

/** A row whose own module cannot be imported would activate as failed, and one
 *  failed row makes the WHOLE preset broken (`mountPreset` throws) — so it is
 *  dropped, with the reason, instead of taking every chapters session down.
 *
 *  The probe is asked with the row's FULL specifier, so a package that exists but
 *  no longer exports the subpath (`.../tools`, `.../list-agents`) is caught too —
 *  those are the renames that eat presets.
 *
 * @param rows the composition, groups included.
 * @param resolvable asked with each row's module specifier. MUST NOT throw.
 */
export function pruneResolvableRows(
  rows: PresetRow[],
  resolvable: (specifier: string) => boolean,
): { kept: PresetRow[]; dropped: string[] } {
  const dropped: string[] = []
  const keep = (row: PresetRow): boolean => {
    if (!needsProbe(row)) return true
    if (resolvable(row.name)) return true
    dropped.push(`${row.id} (${row.name})`)
    return false
  }
  const visit = (list: PresetRow[]): PresetRow[] => list.flatMap((row): PresetRow[] => {
    if (row.group !== true || !Array.isArray(row.config)) return keep(row) ? [row] : []
    const children = (row.config as PresetRow[]).filter(keep)
    if (children.length === 0) {
      dropped.push(`${row.id} (group emptied)`)
      return []
    }
    return [{ ...row, config: children }]
  })
  return { kept: visit(rows), dropped }
}

/** What registering a preset can end up as. Every arm has its own log line and
 *  its own remedy, because the silent case is the one that cost a human hours. */
export type RegisterOutcome =
  | { state: 'registered' }
  /** config.installChaptersPreset=false: the operator owns the preset, we do not register. */
  | { state: 'disabled' }
  | { state: 'already-declared' }
  | { state: 'pruned'; dropped: string[] }
  | { state: 'unsupported' }
  | { state: 'failed'; reason: string }

/** The narrow surface of `ctx.get('agentPresets')` this module uses. */
export interface PresetRegistryLike {
  register?: (definition: PresetDefinition) => Promise<() => Promise<void>>
  list?: () => Promise<unknown>
  /** Host-side inventory of every declared preset and its mounted rows —
   *  `compositionInventory()` in `@deepseek-ai/dsh-agent-preset-registry`. */
  compositionInventory?: () => Promise<unknown>
}

/** One mounted row of a live preset composition, as the host's own inventory reports it.
 *  `fiberState` is the Loader's state for that row; an enabled row that is not `active`
 *  cannot serve a session, and the roster's `broken` flag reports that only for the whole
 *  mount — which is why the witness asks for the rows too. */
export interface InventoryRow {
  entryId?: string
  moduleName?: string
  enabled?: boolean
  fiberState?: string
}

/** One preset's entry in a `compositionInventory()` response. */
export interface InventoryEntry {
  id?: string
  broken?: string
  rows?: InventoryRow[]
}

/** Find one preset in an inventory response, tolerating a missing or odd shape. */
export function inventoryEntry(raw: unknown, presetId: string): InventoryEntry | undefined {
  return Array.isArray(raw) ? (raw as InventoryEntry[]).find((entry) => entry?.id === presetId) : undefined
}

/** Enabled rows of one preset that are not active. A row `pending` a host service can
 *  still activate later, so this is reported apart from `broken`, never as a refusal. */
export function unusableRows(entry: InventoryEntry | undefined): string[] {
  if (!Array.isArray(entry?.rows)) return []
  return (entry.rows as InventoryRow[])
    .filter((row) => row.enabled !== false && typeof row.fiberState === 'string' && row.fiberState !== 'active')
    .map((row) => `${row.entryId ?? '?'} (${row.moduleName ?? '?'}) ${row.fiberState}`)
}

/**
 * Make the `chapters` preset exist on a host that composes presets from
 * declaration rows, and say what happened.
 *
 * @param presets the host's `agentPresets` service, or undefined on a host that
 *        has no preset registry at all (then the legacy directory copy is the
 *        delivery, and this returns 'unsupported').
 * @param dispose owner for the disposer the registry hands back — registering
 *        without it would leave a standing preset mount after unmount.
 */
export async function registerChaptersPreset(
  presets: PresetRegistryLike | undefined,
  opts: {
    resolvable: (specifier: string) => boolean
    platform?: NodeJS.Platform
    /** Engine pressure threshold for the realm row; the host plane's
     *  `config.compactionThresholdRatio` is what feeds it (no hardcoded tunables). */
    thresholdRatio?: number
    dispose: (disposer: () => Promise<void>) => void
  },
): Promise<{ outcome: RegisterOutcome; definition: PresetDefinition }> {
  const definition = chaptersPresetDefinition(opts.platform, opts.thresholdRatio ?? 0.9)
  if (typeof presets?.register !== 'function') return { outcome: { state: 'unsupported' }, definition }
  const { kept, dropped } = pruneResolvableRows(definition.plugins, opts.resolvable)
  const pruned = { ...definition, plugins: kept }
  try {
    const disposer = await presets.register(pruned)
    opts.dispose(disposer)
  } catch (error) {
    const reason = String((error as Error)?.message ?? error)
    // A duplicate is not our failure: someone declared `chapters` in a patch
    // layer (the documented 0.2.x remedy before this shipped). Their row wins;
    // ours must not throw, or this plugin's own row fails to activate and the
    // tools disappear with it.
    if (/duplicate agent preset/i.test(reason)) return { outcome: { state: 'already-declared' }, definition: pruned }
    return { outcome: { state: 'failed', reason }, definition: pruned }
  }
  return { outcome: dropped.length > 0 ? { state: 'pruned', dropped } : { state: 'registered' }, definition: pruned }
}
