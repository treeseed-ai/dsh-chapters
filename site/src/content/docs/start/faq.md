---
title: "4. FAQ & troubleshooting"
description: The traps that are real, what they look like, and why — including a few we discovered instrumenting our own production runs.
lastUpdated: true
---

### Commands "don't run" in a brand-new session

The harness draft screen turns composer text into the **first message**, not a command — so `/chapters-status` typed cold just messages the agent. Send any short opener first (or ask the agent to check status in prose) and the command surface works for the rest of the session. This is a client draft-routing behavior, not plugin state; it's documented wherever commands appear.

### `/chapters-status` says `local-only — no credentials` / `no upstream linked`

Correct, not broken. Before you link a pool, the archive is local and fully usable (`chapters_search` reads the mirror once it exists; chapters are on disk regardless). The status command reports the *transport* state and names the failed step precisely — [Part III](/knowledge/pool/) explains linking.

### `origin changed — rebuilding mirror`

You relinked to a different upstream. The mirror is transport, the store is truth: the plugin rebuilds from local state and republishes. This is the designed recovery, logged loudly with its reason.

### Cache hit rate drops when many agents share one local model

That is llama.cpp KV **capacity**, not dsh-chapters. On a single-slot server, interleaved sessions can only keep the shared prefix cached; divergent tails re-prefill. dsh-chapters' own serial sessions warm to 99.7%+ (measured). Full writeup with numbers: [§21 Cache behavior on llama.cpp](/evidence/llamacpp-cache/).

### I updated the plugin but nothing changed

Restart `dsh web` — bundles load at boot (`dsh plugin update … && restart`). Same applies after an upgrade that changes `cordis.patch.yml` defaults.

### A continuation said "over budget" and refused

Budget is *newly added* context after the header; the plugin refuses with per-rule numbers and never silently truncates a handoff note (a clipped note is the lossy behavior the whole design rejects). Trim the note or lower `continuationBudgetRatio` — [§7](/concepts/budget/).

### My model never writes `PLOT:` lines, so checkpoints have no plot

Fine — the plugin elicits one bounded call to author the plot over the region being condensed, and (since 0.1.3) logs *why* if it declines. Reason strings land in the diagnostics sink if you set `DSH_CHAPTERS_ENGINE_ERRORS`. This exact pipeline is a case study in [§26 changelog](/operations/changelog/) and the [field study](/evidence/field-study/).

### How do I check what a chapter actually contains?

It is a file. `cat .dsh-chapters/<root>/chapters/001-*.md`. The archive is plain Markdown on purpose — no API, no format lock-in.

### Where do credentials live?

Per-project, `0600`, under the DSH home — never in the repo, never in a chapter, never in the corpus. See [§27 security](/operations/security/).
