---
title: "16. Agent tools"
description: What the model can call, when it reaches for each, and the receipts that they actually fire.
lastUpdated: true
---

Six tools, all schema-typed with output schemas (mandatory in this plugin). The field study: agents called these — plus plain `read` on archive paths — **49 times, all successful**.

| Tool | What it does | When the model reaches |
|---|---|---|
| `chapters_segment` | returns the archive ceiling + chapter-shaped ranges (title/summary editable, text never) | "we're expensive — what can we archive?" |
| `chapters_continue` | archive the chosen ranges, open a new session whose first message is the cumulative TOC, carry a handoff note | the workhorse of continuation |
| `chapters_fork` | same machinery to branch without abandoning the parent — title + handoff note only, archives nothing, writes no files | "let's try another angle from here" |
| `chapters_search` | ranked hits into the pool's index, token-bounded | at the start of any domain ("has anyone hit this?") |
| `chapters_artifact` | `toc / search / read` on content-addressed blobs that never hit the window | re-consulting big results — after compaction, across windows |
| `chapters_rule_propose` | write-once rule candidate (still needs a human per-machine approve) | "we learned a team convention" |

## What success returns

| Tool | Returns |
|---|---|
| `chapters_segment` | `archiveCeiling`, `eventCount`, `toolResults[{seq, toolName, bytes, estimatedTokens, excerpt}]`, `existingChapters`, `budgetHint` |
| `chapters_continue` | `childSessionId`, `presetUsed`, `chapters`, `warnings[]` (coverage gaps, over-target chapters), `budget` |
| `chapters_fork` | `childSessionId`, `presetUsed`, `budget` |
| `chapters_search` | `results[{score, date, kind, title, path, topics}]`, `total`, `shown`, `budget{requested, used, remaining}`, `note` when the list was trimmed |
| `chapters_artifact` | per action — `toc`: heading map with line numbers; `search`: matched blocks + `totalMatches`/`truncated`/`remainingMatches`; `read`: `start`, `end`, `of`, `lines` |
| `chapters_rule_propose` | `ok`, `text` — the proposal reply |

Every refusal shares one shape: `{ ok: false, reason, budget? }` — measured numbers, never a truncation. `chapters_artifact read` windows are 1-based (default 200 lines, hard cap 400); `toc`/`search` default to a 400-token packing budget.

## The drill-down shape in practice

A child session in the field study met a 24K-token artifact, and after its first compaction the raw text was gone from context. What happened next, from the logs: `toc` on the artifact → five windowed `read` calls by line range (offsets 1, 400, 799, 1198, 1517) → and *later windows re-consulted the same blob again post-compaction*. Nobody wrote a "use artifacts" playbook step; the TOC and stub handles advertise themselves, and recursive retrieval is what a capable model does with them.

Next: [17. Configuration](/reference/configuration/).
