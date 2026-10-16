# Open items — 2026-10-11

Handoff for a fresh session. Everything below is *scoped and reachable*; none of it is a unknown
defect. Shipped state: **0.1.13** (tag = npm `latest` = the user's installed profile), hosted CI green
(deterministic gate + eight-project tape chain), and the untagged commit after it (`5bdc11b`) changes
only the e2e stub and this record.

Order matters: 1 and 2 are the ones that change what we are allowed to *claim*.

## 1. Live-model proof of the plans journey

**What is missing.** Every acceptance claim for plan carriage runs off a tape distilled from the
scripted upstream (`tests/e2e/stub-model.ts`), because this box's model server was in a CUDA-OOM
restart loop. The behaviour at our seam is proven; "a real model plans, a human approves, the
continuation carries it" is not.

**What attempt 5 already bought** (see `tests/fixtures/model-tape/plans/PROVENANCE.md`): a real
`exit_plan_mode` submission, the host review answered by a real click, `plan/mode` flipping
active→inactive on approval, the archived chapter carrying the plan, and the **branch** child receiving
zero directive bytes — all with a live model. What it did *not* buy: the continuation leg, because the
model called `chapters_segment` and then answered in prose.

**How to close it.** The container is now `RestartCount=0` with `N_PARALLEL` removed.

1. Prove a **completion**, not a health check: `curl` a real ~14K-token chat request and confirm it
   finishes. `/v1/models` answering proves nothing (measured repeatedly).
2. Run the journey live: `E2E_MODEL=live E2E_PORT=41850 E2E_THRESHOLD=0.99 E2E_NO_AUX_MODEL=1
   npx playwright test -c tests/e2e/playwright.config.ts --project=plans`
3. Expect cost: ~15 tok/s decode means several minutes per turn, and with one slot this session's own
   turns queue behind it. Do it when the box is otherwise free.
4. Record the outcome in `PROVENANCE.md` either way — including a failure and its cause. Do **not**
   promote the scripted tape's status based on a live run that only half-completed.

**Honest limit.** A live journey is inherently non-deterministic (attempt 5 proved the model may chain
two calls or may not). It is evidence, never a CI gate. Do not try to make it one.

## 2. The seeded-gate row in a browser

**What is missing.** The seeded `plan/mode` into a continuation child (§ 10 of
`docs/plans-carriage.md`) is proven by a kernel probe and by deterministic rows, but never *observed*
in a real session.

**Already done, and it is the hard part:** the session shape was reached live-in-the-harness and
recorded — `plan/mode {active:true}` at seq 4, `turn/end` at 21, **no** tool call. So a session can be
in plan mode with a completed turn, which gives the deterministic door a real ceiling to archive
against. The attempt was reverted unshipped for two harness reasons, both now fixed on `main`:

- the stub had to learn to answer **plainly** in plan mode (`kind: 'plain'`), and its "is the human
  asking for a plan?" test first read the **last** user message — but the harness appends its own
  injected user messages (workspace instructions, runtime snapshot, skill catalog) *after* the human's,
  so the ask was invisible and the next step hung 15 minutes on a review card that could not appear.
  Now it scans every user-role message, the trigger is a whole sentence so the plan-mode *policy* text
  cannot set it off, and both properties are pinned by rows in `tests/unit/stub-model.test.ts`.
- a **stale stub process** was serving pre-edit logic, which made a harness bug look like a product
  one. Restart the upstream before trusting any distillation.

**Remaining work.** Re-add the leg (draft is in this file's history of the repo: new session → `/plan`
with a plain ask → wait for `plan/mode` + `turn/end` → `/chapters-continue` → poll `ch-` children for a
`plan/mode` event at seq 1 with `active:true`, assert exactly one `dsh-chapters` user/message, and
assert the notice carries **no** plan section since no plan was submitted). Then re-distill the plans
tape with a **fresh** stub and replay it. Roughly 15–20 minutes.

## 3. Per-message anchoring (needs a product decision, not just code)

`deriveRanges` already accepts any anchor, and the fork/continue doors archive from the watermark. What
does not exist is a way for a human to say *"branch from this message"*, because the button acts at
conversation end. Two open questions before code:

- where the affordance lives (message action row vs selection in the composer), and
- **how the child is told what it did not inherit** — an anchored branch silently drops the tail, which
  is exactly the kind of unstated loss this project refuses. It needs a line in the notice.

Scope it as its own plan; do not fold it into a release.

## 4. Default-preset shipping policy (the user's call)

Today `chapters` is opt-in: the profile must name it, and the README/site tell users how. The
alternative — make it the default agent preset — changes every new session's header. That is a
distribution decision with a cache consequence (a recomposed header is measured at ~12K tokens on a
32K model) and it belongs to the human, not to an agent. Ask before touching it.

## 5. Human-judgment verification rows

Still open and still human-only: readability of a real checkpoint in a real browser, and whether the
notice/preamble *feels* right to work in. These are not automatable and should not be faked with
assertions. `docs/verify.md` lists them; run them after installing, in the project you actually care
about.

## Also worth knowing

- **Durability caveat for a new project:** with no pool linked, the archive lives only in the
  workspace. `/chapters-link <path-or-url>` is the difference between "this machine remembers" and
  "the project remembers".
- **Search now answers unlinked** (0.1.12) and says which door it used. If a result ever looks
  machine-only when you expected the pool, that note is the first thing to read.
- **`/chapters-continue` vs `/chapters-fork`** is the intent line: continue carries the operative plan
  and may seed plan mode; fork carries nothing.

## Preset delivery on 0.1.7+/0.2.x — landed, and what it exposed (2026-10-16)

**Landed:** the `chapters` preset now EXISTS on a declaration-row host, by `agentPresets.register()` at
activation (`src/preset.ts`), with rows the host cannot import dropped and named, a held disposer, and a
deferred ROSTER check (`present` / `DECLARED BUT BROKEN` / `absent` / `unknown`) as the only health signal.
**Support floor is 0.2.0** (user decision 2026-10-16): the legacy `.agent-presets` copy, the
`presets/chapters/` tree, `installChaptersPreset`'s copy arm and `preset-install.test.ts` are DELETED; a
pre-0.2.0 host gets `delivery: REFUSED` with its tools intact. The engine row's `thresholdRatio` became
the host-plane config `compactionThresholdRatio` (no hardcoded tunables). Verified on real boots:
0.2.0-rc.2 → `register: pruned, roster: present, inventoryRows: 28, unusableRows: []`;
0.2.1-alpha.4 → `register: registered, roster: present, inventoryRows: 29, unusableRows: []`
(after dropping `toolFilter`, which alpha.4 THROWS on — see the config-key row of the drift test). `tests/unit/preset-declaration.test.ts`
(13 rows, `src/preset.ts` at 100%) is the drift gate, and it now RUNS on this box instead of skipping.

**Why the row is not a shipped patch layer** — measured, because it looks like the obvious fix and it is a
boot-breaking one: `dsh.bundle.patch` as an ARRAY throws `ERR_INVALID_ARG_TYPE` at
`dsh-app-boot/lib/index.js:853` on every host before 0.1.7-alpha.1, and a row naming
`@deepseek-ai/dsh-agent-preset` aborts that host's plugin tree (`Cannot find package`). `disabled: !!js`
cannot gate it either: the Loader evaluates `disabled` before services mount, so the row is disabled on the
NEW host too (measured). Full record: `docs/contract.md` § Presets are declaration rows.

**Open, in order:**

0. **Re-anchor the e2e host, then re-distill the tapes.** `tests/e2e/boot.ts` now refuses by name
   while `dev/dsh-host-lock` pins a pre-0.2.0 host, and the refusal lifts itself when the lock moves —
   that is the upgrade path, not a TODO. The per-boot row pins (`thresholdRatio`, `enrichmentEnabled`,
   `auto`, `elicitedPlot`, `toolResultArtifactTokens`) and the `[e2e] boot pins:` line were deleted with
   the YAML they patched; they come back expressed as CONFIG on the registered row (`compactionThresholdRatio`
   exists now; the rest need the same treatment). Until then the browser acceptance chain does not run, and
   `docs/verify.md`'s P23 is retired rather than passing.
1. **The roster check is the only evidence we have that a preset composes — and it is a boot-time log
   line.** A user cannot see it without a terminal. Candidate: surface `delivery:` + the roster verdict in
   `/chapters-status` (and a warning row in the Settings plugin panel), so "installed and running" stops
   being the whole answer. Nothing else in the plugin reports health to a human today.
2. **`compositionInventory()` is used by the dev witness only.** Making the boot check itself compare
   mounted rows would catch a row that resolves but never activates — the `broken` flag does not always
   cover that, and the witness proves the shape of the answer already.
3. **A reset registry can overwrite a chapter — no guard exists today.** `writeArchive`
   (`src/archive.ts:106`) reserves numbers from the registry and writes them; nothing checks whether that
   path already exists on disk. So the exact incident shape — registry gone (host reinstall) while chapter
   files remain, or restored by rehydration — lets a NEW archive reuse number 001 and clobber a surviving
   file, which breaks the append-only rule from the inside. Two rows are missing: at boot, report files the
   registry does not know (`<store>/<root>/chapters/*.md` vs registry rows, counted); and refuse a
   reservation whose target path exists, with the numbers.
4. **Rehydration restores bytes, not rows.** `rehydrateStoreFromMirror` (`src/sync.ts:476`) fills absent
   chapter and artifact files only. Search works off the files' own frontmatter, but numbering, ancestry and
   collections are registry state, so a rehydrated store can be searched and cannot be continued cleanly.
   Decide: rebuild rows from frontmatter (honest — the bytes are the ground truth), or refuse continuation
   over a partially restored store with numbers. Do not let it look like a fresh chain.

## Host bug we cannot fix: the workspace directory-picker modal (2026-10-16)

Reported by the user as "the directory selection modal crashes before I can select a workspace", and it
survived a host upgrade. Root-caused with real boots (`var/picker-probe/FINDINGS.md`, kept out of the
repo's claims — it is host code): the picker's CLIENT bundle and the shell's client module table must come
from the same host generation. The 0.1.x picker asks for `IconFolderOpen16`/`IconFolderClose16`;
0.2.0-rc.2's shell exports only the `…Regular` spellings, with no compat alias in either direction. The
slot boundary catches it, so the symptom is a rendered-then-dead dialog:
`Error: Minified React error #130 … got: undefined`, logged as
`slot entry crashed in 'sidebar.workspaces.directoryFlow'`
(`@deepseek-ai/dsh-client-ui-renderer/lib/client.js:618`). A stale profile-local copy of
`@deepseek-ai/dsh-client-ui-directory-picker-*` under `$DSH_HOME/profiles/<p>/node_modules` shadows the
upgraded global install and reproduces "the new host did not fix it" exactly.

Nothing in this plugin contributes to that slot (its client half registers
`conversation.chat.assistant-actions` only), so the repo can ship no fix — only the recipe, which the
site documents: purge the stale picker copies, and if the auto-resolved backend is not the one you want,
pin the pair deliberately in the profile patch (`disabled: true` on `directory-picker`, insert
`@deepseek-ai/dsh-host-directory-picker-browse` + `@deepseek-ai/dsh-client-ui-directory-picker-browse`).
Upstream ask: compat aliases for the renamed icon exports, or a boot-time shell↔plugin version handshake
that rejects a mismatched bundle instead of crashing at render.
