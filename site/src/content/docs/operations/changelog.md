---
title: "26. Changelog & release notes"
description: Every version, what it fixed, and the incidents that found them — written the way we'd want to read it.
lastUpdated: true
---

Releases publish automatically from a bare-semver tag via **npm trusted publishing (OIDC)**. The publish itself is gated on the full deterministic suite under the coverage gate; the eight-segment tape-replay acceptance chain runs in CI on every push to `main`, so a release is always cut from a green acceptance run. Each CI-published version carries a provenance attestation tying it back to this repo, that workflow run, and that commit — 0.1.0, the one manual ship, predates attestation.

### 0.1.8 — 2026-10 · a plan's heading stops being allowed to be unbounded

Found by reading 0.1.7's own carriage for what a hostile input does to it: a plan whose `# heading` is a
4 KB paragraph was printed **in full** in every chapter that carries the plan *and* again in every child
notice built from that path — unbounded, and un-costed until the budget gate refused the continuation.

- `PLAN_TITLE_MAX` (120 chars, `src/plans.ts`): the **display** title is bounded; the artifact keeps the
  heading whole, which is the same distinction `planInlineChars` draws for the body. Closed ATX headings
  (`# Title #`) lose their trailing hashes in the title only, never in the bytes. Two unit rows pin both.
- Same class, one scale down: the outline line is now a bounded **index** — twelve headings at 60 chars
  each, with a trailing `+more (chapters_artifact 'toc' lists every heading)` when entries are dropped. An
  outline that silently stops listing would be the exact lie this store exists to avoid, so shortening is
  always announced, and the complete map is one query away. Four unit rows pin the cap, the note, and the
  no-note-when-under-cap case.
- The `plans` tape's PROVENANCE.md now records the two live re-record attempts that failed — the local
  model container reported *healthy* and dropped the stream mid-turn, once after 15 minutes with no tool
  call and no tape entries — so the next person checks with a real ~17K-header completion instead of
  `/v1/models`, which answers even when the server cannot finish a turn.
- Browser-plane ledger for the eight-project chain (`npm run coverage:e2e`): 79.92 / 64.64 / 76.28 —
  reported, not tuned; the ≥85 gate is the deterministic one.

### 0.1.11 — 2026-10 · the plans journey cannot ask the model anything

0.1.10 pinned the threshold and still went red on hosted CI — with the new annotations making the cause
unambiguous: the miss was the **plot-elicitation** request again, i.e. the engine had decided to compact
mid-journey on the runner no matter what the threshold said. Tuning a threshold to beat a token count I
cannot observe is not a fix; **removing the machinery is**. The acceptance boot now takes a per-project
pin (`E2E_NO_AUX_MODEL=1`) that writes `auto: false` and `elicitedPlot: false` into the engine row of the
throwaway profile, so for this journey:

- pressure compaction is not registered at all — no threshold, and no runner's header size, can make it
  fire;
- the plot-elicitation call that produced the two missed requests **cannot be issued** — which is the
  difference between "unlikely on this machine" and "impossible on any machine";
- and the spec still asserts `compaction/*` is absent, so if someone re-enables the machinery under a
  journey that depends on its absence, the test says so locally, in words.

The pin is additive and per-project: every other journey keeps the 32K/15K stress regime and its
compaction behaviour, because for those the point *is* compaction. Verified: the plans project replays
green with the pin, the eight-project chain passes, and a boot with both rows patched starts cleanly (the
base config accepts them — an unknown key would fail the boot loudly, not silently).

### 0.1.10 — 2026-10 · a tape that only passes on the machine that made it stops being acceptable

0.1.9 shipped with a red hosted acceptance chain: `[plans]` missed a tape entry that replayed green on
every local run. The annotations finally said why — the miss was a **plot-elicitation** request, meaning
the runner had crossed `0.9 × the pinned 32K window` and compacted mid-journey while this machine never
did. Two truths follow, and both are now enforced:

- **The plans journey pins its own precondition.** Its threshold is `0.99`, so pressure compaction cannot
  interrupt it on any hardware; and the spec now *asserts* that nothing compacted
  (`compaction/*` events = 0, with the reason written where the assertion lives). If a future change makes
  pressure arrive mid-journey, the journey fails locally, in words — not as an unmatchable request on
  someone else's machine. The tape was re-distilled under the pin; the eight-project chain replays green.
- **The acceptance chain reports like the gate.** `scripts/ci-replay.sh` tees the run and, on failure,
  emits `::error::` annotations naming the failing project and tests, the tail of the proxy's tape-miss
  journal (the prefixes it compared), and the tail of `var/e2e-engine-errors.log` — the engine's own
  diagnostics, which every boot already writes. Before this, a red chain left a maintainer with
  "Process completed with exit code 1" and a 5 MB artifact behind a token; that cost three CI cycles on
  0.1.9 and it is not a cost worth repeating.

No plugin behaviour changed in this release; what changed is the guarantee that the acceptance plane
means the same thing everywhere it runs.

### 0.1.9 — 2026-10 · plans become directives the agent keeps, searches, and never overwrites

The four deferred questions about plan carriage came back answered, and the answer that
changed the design was a distinction: **a continuation extends the same stream of work, a fork
splits one off.** Everything below follows from taking that seriously.

- **Plan mode now survives a continuation.** A child created by `chapters_continue` from a session
  that was still planning is seeded with its own `plan/mode {active:true}` event, so it genuinely IS
  in plan mode — gated, not merely told. This was measured before it was built: the installed kernel
  accepts a two-event seed in the exact production header shape (`0:user/message → 1:plan/mode →
  2:session/end-seed`, log-only, surface unchanged), and the host's own plan projection folds it to
  `active: true` where the one-event control does not. It is deliberately NOT seeded for a branch,
  and NOT seeded after an approval — approving a plan exits plan mode, so that child's job is to
  implement, not to keep planning. `planSeedMode` (default on) is the switch.
- **The notice reads the intent.** A continuation gets `## Active plan` — the operative directive, its
  verdict, its chapter, its artifact and its document — plus `## Previous plans on this path`, explicitly
  marked as history rather than orders. A branch gets **zero bytes**: its plans are already in the chapters
  the table of contents cites.
- **A plan is now a document of a third kind.** Each submission is written as `kind: plan` beside its
  chapter (`plan-NNN-<slug>.md`), carrying its status, the chapter that cites it, and the blob sha of the
  same bytes. It sits in `chapters/` on purpose: the pool transport, the mirror rehydrate and the corpus
  index pick it up unchanged, so `chapters_search` answers *"what did we plan about X"* with the plan
  itself rather than the transcript that happens to quote it. Its numbering has its own registry counter,
  so a plan can never consume a chapter number or reorder the TOC, and superseding never overwrites: the
  v1 document stays, with its history intact.
- **Directives are never paraphrased.** The enrichment ladder skips `kind: plan` documents — the guard
  reads the file's own frontmatter, so renaming cannot disarm it. A summary of an order is the drift this
  store exists to prevent.
- **The operative plan is carried into every compaction checkpoint**, the way the plot is, bounded and
  with the truncation announced — because shadowing can hide the chapter that holds it, and a directive
  that survives only in a file the agent may never open is a directive it drifts from. Session-wide,
  newest-first: "what am I building" is not a property of the region being condensed.
- **One named exception to the injection screen.** The harness's own *"The user switched this session to
  plan mode."* is archived verbatim — it is a fact about this session, not another project's private
  instruction file. Matched by plugin AND form, so it cannot widen by accident; instruction files, runtime
  snapshots and skill catalogs still screen, and the strict predicate that drives topic signatures and the
  `(N msgs)` counts is untouched on purpose.
- **The browser journey now has two legs**, because a distinction that is only described is not tested:
  one session plans, approves, then (1) *continues* via `chapters_segment` → `chapters_continue` — that
  child's single seeded message carries `## Active plan`, the plan's document path, and deliberately **no
  seeded gate**, since approving a plan exits plan mode and gating that child would block the work it was
  told to do; then (2) *branches* via the fork button — that child carries **no** directive section at all
  while still citing the archive. The scripted upstream reads the ceiling from the real tool's own result
  rather than from a hard-coded number, so the ranges are the tool's.
- Ledger: **582 deterministic rows, zero skips**, 98.05 / 86.44 / 93.67 against the ≥85 gate; verify.md
  rows P12–P17; the knowledge record carries the corpus amendment (`Amendment 2026-10-10 — plans are
  documents of a third kind`), and the design record its §§ 9–13.
- And one lesson worth its own line, because it is the reason the acceptance layer exists: distilling the
  journey caught a bug in **our own test reader** — session logs are JSONL, so a payload's quotes arrive
  escaped and a regex over the raw line silently never matches. An assertion that cannot match is worse
  than one that fails: it looks like a pass. The spec now parses the event before asserting on it.

### 0.1.7 — 2026-10 · the plans journey joins the acceptance chain, and the browser corrects three beliefs

0.1.6 shipped session-plan carriage with the browser plane written but never executed. It executes now, as
**the eighth project in the tape-replay chain** (`tests/e2e/plans.spec.ts`, project `plans`, ~13 s in
replay): `/plan <message>` → a real `exit_plan_mode` tool call → the host's plan-review card opened and
answered by a real click → fork → the child's single seeded event calling the plan out, with the plan's
full bytes on disk. The eight-project chain passes end to end (`CHAIN_EXIT=0`, 9 tests) on committed tapes,
no LLM present.

**Provenance, stated plainly:** the box's local model server dropped the stream mid-journey
(`turn/end` `code:"TRANSPORT"`), so this tape was distilled through `tests/e2e/stub-model.ts` — a scripted
OpenAI-compatible upstream whose SSE shape is copied form-for-form from recorded llama.cpp traffic. What
that proves is everything on our side of the seam in a real browser against the real review channel; what
it does NOT prove is a model choosing to plan. `tests/fixtures/model-tape/plans/PROVENANCE.md` says so in
the directory itself (the recorded `model` field names the request's route, so it cannot carry
provenance) and carries the command that retires the stub.

**What running it corrected** — the reason the layer exists, and every one of these was a belief the
deterministic plane had encoded:

- approving a plan **exits** plan mode, so a chapter's folded `planMode:` after an approval is `inactive`,
  not `active`; both flips print and the fold takes the last logged value. The archived chapter was right,
  my assertion wrong.
- the toolbar chip is an **exit-only** control (`plan.pending ? !plan.active : plan.active`); the entry door
  is the `/plan` command. Worth a 40-minute timeout to learn.
- the review question is a **region's accessible name**, not matchable element text — `text=…` hangs,
  `getByRole('region', …)` finds it.
- a seeded event read back out of the zstd log is **JSON-escaped**: parse the event and assert on its
  text, never on the raw line.
- a scripted upstream that string-matches its own message array **lies confidently** — `exit_plan_mode`
  and `approved` both appear in the system prompt, so the first version never opened a review. The honest
  signal is the transcript's shape (a `role:'tool'` message exists only once a tool has run); the stub's
  turn policy now has its own rows (`tests/unit/stub-model.test.ts`), because a wrong stub records a tape
  of a session that never planned.
- acceptance assertions are scoped to **the session tree the run created** — scanning the whole store lets
  a previous run satisfy the next one.

Also in this ship: the plan blob's publication leg is pinned (a chapter's plan must be planned for the
pool, not just written locally), the site's anatomy page states the mode-fold truth instead of guessing it,
and a red deterministic gate now annotates its own diagnosis (`scripts/ci-gate.sh`, since the 0.1.6 run
that failed with nothing readable left behind). Deterministic ledger: **557 rows, zero skips**, coverage
98.11 / 86.44 / 93.8 against the ≥85 gate.

### 0.1.6 — 2026-10 · session plans survive the continuation

A plan submitted through DSH's plan mode lived in the archive as the first 400 characters of a tool-call
line, and a created child cannot inherit plan mode — so the continuation of a planned session either
implemented something nobody approved or re-planned from recall. Now the plan is a first-class citizen of
the archive (design record: `docs/plans-carriage.md` in the repo).

- **Every plan's full text is artifact-backed, always.** A chapter carries a `## Plans in this chapter`
  block AFTER the verbatim transcript — verdict, outline, bounded head (`planInlineChars`, default 900),
  and the content-addressed path — and the bytes are queryable with `chapters_artifact` `toc | search |
  read`, the same recursive drill-down that serves oversized results. The chapter's frontmatter declares
  `plans: [seq:status:sha8]` and the folded `planMode:`; the registry record carries the structured facts.
- **Six statuses, read the way the host writes them.** `approved` (`{approved:true}`), `rejected` (the
  "keep planning" feedback survives), `dismissed` (the user took the wheel), `pending` (no verdict event —
  printed as never-approved, and the notice tells the child not to implement it), `superseded` (same H1,
  later submission), `failed` (the review never opened — not a human verdict, so not labelled as one).
  Redelivered results keep the LAST copy. `plan/mode` events stopped being silently-unrendered holes.
- **The child's notice calls the operative plan out** under `## Plans on this path`, cited to its chapter
  and its artifact, with superseded drafts listed chronologically underneath. A plan whose review is still
  open sits in an unfinished turn — above the archive ceiling, in no chapter, in no artifact — and is
  carried marked `NOT ARCHIVED — parent log seq N` rather than dropped.
- **A plan is a chapter boundary.** Both segmenters close the chapter that carries a submission at the
  next turn boundary, and the plan's own H1 titles it. `chapters_segment` returns `plans`, `livePlans` and
  `modeActive` so the model places ranges on facts instead of guessing what the review said.
- **Nothing is exempted from the meter.** The block is counted by the same `preflight` as the rest of the
  notice, and over-budget still refuses with numbers. The economy is carriage, not blindness.
- **Tape-neutral by construction:** every piece above renders ZERO bytes for a path with no plans —
  verified, not assumed: the seven-segment replay chain passed unchanged (no re-record), and no fixture
  contains an `exit_plan_mode` turn. New knob `callArgArtifactTokens` therefore ships OFF (0) because
  turning it on *would* change chapter bytes for sessions with large `write` arguments.
- **Fixed on the way, and it was never about plans:** a chapter's `artifacts/aa/<sha>.txt` citation could
  not be resolved by `chapters_artifact` when the blob sat in the ancestry tree (where `writeArchive`
  writes) rather than at the store root (where arrival stubs write) — so every deferred result since 0.1.0
  pointed at a path its own reader could not open. The resolver now searches store root → session trees →
  pool mirror, and the refusal text names all three.
- **Ship note, kept honest:** the `0.1.6` tag published (Release job green — it runs the same
  deterministic gate) and Pages deployed, while the parallel `CI` job on that commit went red at
  `coverage:ci` with no surviving diagnosis: stdout only, the summary step skipped on failure, the one
  artifact behind a token. Every local reproduction of the pushed SHA — a fresh `git clone` + `npm ci`,
  TreeDX env removed so the live rows skip exactly as they do on the runner — came back
  544 pass / 5 skip / exit 0, and the very next commit `50453c9` is green on both hosted jobs. So the
  0.1.6 red run was a flake we could not name, and the pipeline got fixed for that instead:
  `scripts/ci-gate.sh` annotates metrics, tallies and failing tests, and the summary now always runs.
- Tests: 80 new rows across `plans`, `render-plans`, `continue-plans`, `plans-segmentation`,
  `plans-tools`, `plans-engine`, `log-shape` (unit) and `plans-carriage` (integration, real fs + real
  registry + the `chapters_artifact` retrieval loop), verify.md rows P1–P11. The browser journey is
  written (`tests/e2e/plans.spec.ts`, project `plans-dev`) and self-skips without a live model — it awaits
  its tape on the GPU box.

### 0.1.5 — 2026-10 · the store heals: sync rehydrates deleted chapters from the pool

A user deleting the workspace's `.dsh-chapters/` (a natural instinct when testing a re-link) exposed a real hole: the registry and continuation TOCs keep citing store paths, the pool keeps every byte, but nothing flowed back — 56 of 57 chapter references dangling silently, and `read` on an archived chapter would simply miss. Worse, migrating to a *new* pool sources from the store, so relinking after such a wipe published nothing while looking idle.

- **`runSync` rehydrates before it publishes**: the freshly cloned mirror's `chapters/<projectKey>/…` and `artifacts/<projectKey>/…` are copied back into any *absent* store paths (present files are never overwritten — the store stays ground truth; other projects' prefixes are out of scope; idempotent).
- **The recovery is loud**: `rehydrated N file(s) from the pool into the store` lands in `/chapters-status` steps.
- Tests: direct rehydrate semantics (fill / no-overwrite / key-scope / idempotence) + a runSync-after-store-wipe integration proving the steps line and byte return.

### 0.1.4 — 2026-10 · the shared-pool audit fixes: artifacts travel, results dedupe

Found by a real 12-session run against a linked git pool (parent + 10 sub-agents at two depths, plus a search probe): the pool was **publishing zero artifact blobs**. The cause was a layout disagreement — the arrival stubber writes content-addressed blobs to the store **root** (`artifacts/aa/<sha>.txt`), while the publisher scanned a per-session path that never existed. Every pool chapter's `⟦see artifacts/…⟧` reference dangled on other machines.

- **Publisher** now walks the store-root artifacts directory into `artifacts/<projectKey>/…` (legacy per-session layouts still plan; rel collisions dedupe — one blob, one entry).
- **`chapters_artifact` reads the pool**: a local store miss falls back to the linked workspace's mirror, so a teammate's deferred 40K-line log is retrievable with the same toc/search/read windows. Misses name both roots searched and point at `/chapters-status` — the loud-not-silent contract, extended to the cross-machine leg.
- **Renderer dedupes host redeliveries**: the host can emit two `tool/result` events for one callId (measured: 25 in that run — read ×17, web_fetch ×2, chapters_artifact ×3); chapters now archive keep-last, so verbatim bodies never bloat with the same text twice.
- Same run's good news, for the record: **26/26 checkpoints carried genuine plots** (0.1.3's elicitation budget in production), the dead-link → relink degrade/rebuild path worked end to end, and cross-session search returned ranked hits minutes after the first publish.

### 0.1.3 — 2026-09 · plot elicitation goes loud and gets a real budget

- `extractPlot` fixed after the first real-world multi-agent run exposed **8 of 9 checkpoints inheriting the persona instruction's own quoted `'PLOT:'` text** as the "plot" (the substring scan scraped the prompt; non-null garbage then *suppressed* the bounded elicited fallback — the mechanism designed for exactly that case). Contract-shaped now: marker must start a line, system-role messages never yield a plot, template echoes rejected.
- Elicit budget 220 → **600** tokens (reasoning tokens compete with content; reproduced live at 155/220 for a *short* excerpt), and every refusal path — no-route, malformed reply, throw — now logs **why** to the `DSH_CHAPTERS_ENGINE_ERRORS` diagnostics sink. Loud-not-silent, in the last silent spot.
- Regression tests pin the verbatim corrupted frames from the wild, not paraphrases of them.

### 0.1.1 / 0.1.2 — 2026-09 · the first real runs' harvest

- `@treeseed/dsh-chapters` joins its npm org scope; plugin identity, bundle patch, and preset engine row move with it (measured: the host resolves by package name; the client bundle self-registers a build-time id — both now scoped).
- **Push of an unborn mirror is an honest no-op**, not `local-only` (a pristine-store link to an empty remote reported blame-worthy transport for having nothing to send).
- Elicit excerpt screens host-injections — machine-independent plot requests.
- Release pipeline switched to OIDC trusted publishing (no deploy tokens) with provenance on every version.

### 0.1.0 — 2026-09 · first release

The full platform: zero-token deterministic compaction, citation continuations with cumulative TOCs, arrival-time artifacting, the knowledge pool (git + TreeDX transports), enrichment ladder, per-machine rules ledger, the fork button, and an acceptance suite that replays browser journeys from committed model tapes with zero LLM calls in CI. 450→464 deterministic tests, the ≥85% all-axes coverage gate held from day one (today: 97.98% statements / 85.61% branch / 93.62% functions). (Shipped manually before trusted publishing was wired — the one version without a provenance attestation.)

> **On naming.** The package was `dsh-chapter-fork` once — and "fork" in DSH means *copy the parent's history*, the one operation this plugin must never perform. It now names the artifact instead; the reasoning, including the candidates that lost, is in the repo's architecture record.
