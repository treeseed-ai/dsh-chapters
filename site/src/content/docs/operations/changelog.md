---
title: "26. Changelog & release notes"
description: Every version, what it fixed, and the incidents that found them — written the way we'd want to read it.
lastUpdated: true
---

Releases publish automatically from a bare-semver tag via **npm trusted publishing (OIDC)**. The publish itself is gated on the full deterministic suite under the coverage gate; the seven-segment tape-replay acceptance chain runs in CI on every push to `main`, so a release is always cut from a green acceptance run. Each CI-published version carries a provenance attestation tying it back to this repo, that workflow run, and that commit — 0.1.0, the one manual ship, predates attestation.

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
