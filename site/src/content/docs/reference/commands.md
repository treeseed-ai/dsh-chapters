---
title: "15. Commands"
description: The full composer surface, exact syntax, and what each answer means.
lastUpdated: true
---

Run in the composer **inside a session** (draft screens send text as a message — [FAQ](/start/faq/)). Registered in `src/commands.ts`; the two deterministic archive doors (`/chapters-fork`, `/chapters-continue`) in `src/tools.ts`.

## `/chapters-link` — the knowledge upstream

| Form | Effect |
|---|---|
| `/chapters-link` | show current upstream + mirror status |
| `/chapters-link <local-path>` | bind a shared local git repo (bare or worktree; `file:///`, `~`, and relative paths all resolve) — a bare pool repo is created on demand, no credentials needed |
| `/chapters-link <https-url> <token>` | bind a smart-HTTP pool; the token is required **unless the host is loopback** (`127.0.0.1` / `localhost` / `::1`), and is stored **0600 under the DSH home**, never in the project |
| `/chapters-link treedx+<url>/<repo> <token>` | bind a TreeDX service (token always required — bearer API); the managed repository is created server-side if absent |

The no-args answer is a git-status-like block: `Provider`, `Upstream`, `Bound` (slug · project key · since), `Mirror` (branch/head, plus an origin-drift note when it will rebuild), `Sync` (last run + detail), `Pending` (files not yet mirrored), `Harness` (this machine's id). Relinking to a different target — or a push that finds the mirror diverged — rebuilds the mirror from the store (the store is the truth).

## `/chapters-status`

Per linked project: `Project` / `Remote` / `Provider` lines, then `Sync: a push is pending (debounced)` or the last sync mode; then `Last sync: <time> — synced` (or `local-only: <reason>`) with the step trail behind it — `cloned → published N new file(s), M already mirrored → pushed` — and the enrichment status line. With no project and no history it says so in one line and points at `/chapters-link`. Pending counts, vocabulary curation notes, and failure details are all printed — no silence.

## `/chapters-enrich`

```
/chapters-enrich run                          # process one batch now (up to `enrichmentBatchCap` chapters)
/chapters-enrich model                        # show the current annotator route
/chapters-enrich model <provider/model|clear> # override it, or reset to the conversation route
/chapters-enrich report                       # enrichment status line + pending chapter count
```

## `/chapters-rule`

```
/chapters-rule add <category> "<text>"                     # write-once proposal; binds nothing yet
/chapters-rule list [--all|--proposed|--category <c>]      # review surface
/chapters-rule approve <id> | revoke <id>                  # YOUR machine's curation fact — never a shared rewrite
```

## `/chapters-fork [title]`

The message-level fork button, also callable from the composer: everything after the last archive watermark up to the last completed turn is archived verbatim (ranges derived deterministically — **zero model involvement**) and a titled child opens whose first message is the cumulative TOC. If nothing new was said since the last archive it degrades to a pure citation fork — a child citing the existing chapters unchanged, nothing written.

## `/chapters-continue [title]`

The same deterministic door, with the opposite intent: everything after the last archive watermark up to
the last completed turn is archived verbatim (**zero model involvement** — ranges derived from the plugin's
own watermark), and the child that opens **extends the same stream of work** rather than splitting from it.
So its notice carries the operative plan — `## Active plan`, the verdict, the chapter, the blob and the
`kind: plan` document — and, if the session is still planning, the child is genuinely *in* plan mode
because it is seeded with its own `plan/mode` fact.

Why a command and not just the `chapters_continue` tool: a tool call has to be authored by the model, which
means (a) the model must chain `chapters_segment` → `chapters_continue` with correct ranges, and (b) any
recorded test of it **freezes those machine-specific numbers**. The command removes both dependencies —
which is how the continuation became testable in a browser at all.

Fork vs continue is a real choice, not a naming preference: a **fork** splits a new direction and receives
zero directive bytes (the plans stay reachable as history), while a **continuation** keeps the work and is
told which plan governs it. If nothing new was said since the last archive, both degrade to a pure citation
child.

## Plus the host's `/compact`

With the `chapters` agent preset mounted, `/compact` runs through the plugin's deterministic engine: checkpoint summary with carried plot, zero inference tokens, append-only shadowing. (The harness's own command surface, ours underneath.)

Next: [16. Agent tools](/reference/tools/).
