---
title: "15. Commands"
description: The full composer surface, exact syntax, and what each answer means.
lastUpdated: true
---

Run in the composer **inside a session** (draft screens send text as a message — [FAQ](/start/faq/)).

## `/chapters-link` — the knowledge upstream

| Form | Effect |
|---|---|
| `/chapters-link` | show current upstream + mirror status |
| `/chapters-link <local-path>` | bind a shared local git repo (bare or worktree) — no credentials needed |
| `/chapters-link <https-url> <token>` | bind a smart-HTTP pool; token stored **0600 under the DSH home**, never in the project |
| `/chapters-link treedx+<url>/<repo> <token>` | bind a TreeDX service (token required — bearer API) |

The answer line includes the derived project key and a `Sync:` state; relinking to a different target rebuilds the mirror from the store (the store is the truth).

## `/chapters-status`

Last sync with its steps behind it: `cloned → published N new file(s), M already mirrored → pushed`, or an honest `local-only — <failed step>: <reason>` — pending counts, vocabulary mode, no silence.

## `/chapters-enrich`

```
/chapters-enrich run                          # drain the ladder now
/chapters-enrich model <provider/model|clear> # override the annotator route
/chapters-enrich report                       # per-chapter actions + provenance
```

## `/chapters-rule`

```
/chapters-rule add <category> "<text>"                     # write-once proposal; binds nothing yet
/chapters-rule list [--all|--proposed|--category <c>]      # review surface
/chapters-rule approve <id> | revoke <id>                  # YOUR machine's curation fact — never a shared rewrite
```

## Plus the host's `/compact`

With the `chapters` agent preset mounted, `/compact` runs through the plugin's deterministic engine: checkpoint summary with carried plot, zero inference tokens, append-only shadowing. (The harness's own command surface, ours underneath.)

Next: [16. Agent tools](/reference/tools/).
