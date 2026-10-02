---
title: "26. Changelog & release notes"
description: Every version, what it fixed, and the incidents that found them — written the way we'd want to read it.
lastUpdated: true
---

Releases publish automatically from a bare-semver tag via **npm trusted publishing (OIDC)**. The publish itself is gated on the full deterministic suite under the coverage gate; the seven-segment tape-replay acceptance chain runs in CI on every push to `main`, so a release is always cut from a green acceptance run. Each CI-published version carries a provenance attestation tying it back to this repo, that workflow run, and that commit — 0.1.0, the one manual ship, predates attestation.

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

The full platform: zero-token deterministic compaction, citation continuations with cumulative TOCs, arrival-time artifacting, the knowledge pool (git + TreeDX transports), enrichment ladder, per-machine rules ledger, the fork button, and an acceptance suite that replays browser journeys from committed model tapes with zero LLM calls in CI. 450→464 deterministic tests, 97.95% statements / 85.6%+ branch/function gates held from day one. (Shipped manually before trusted publishing was wired — the one version without a provenance attestation.)

> **On naming.** The package was `dsh-chapter-fork` once — and "fork" in DSH means *copy the parent's history*, the one operation this plugin must never perform. It now names the artifact instead; the reasoning, including the candidates that lost, is in the repo's architecture record.
