---
title: "27. Security & privacy"
description: Where secrets live, what never leaves your machine, and what the archive guarantees.
lastUpdated: true
---

## Credentials

- Knowledge-pool tokens (git or TreeDX) are stored **under the DSH home, mode 0600, per project** — never in the workspace, never in a chapter, never in git, never in an agent prompt beyond the auth header the transport adds. A local-path link needs no credential at all.
- Remote identity includes a deliberate de-credentialization: `https://user:token@repo` and `https://repo` canonicalize to **one project key** — pasting a URL with credentials cannot fork your pool into a split-brain twin (caught, fixed, pinned by test).

## Data boundary

The plugin has no network of its own: it writes files (workspace store, mirror clone) and drives **your** git/TreeDX transport to **your** linked remote. No telemetry, no phoning, no account, no default egress beyond the DSH home's configured providers. The archive is plain Markdown — it can and should go through the same review (and `.gitignore`, if you don't want the store in your repo working tree) as any other file.

## Integrity

- **The log is append-only** — no tool path rewrites or deletes durable history; compaction *shadows* in the rendered surface and the shadowed spans are archived verbatim with coverage checked per span.
- **Write-once everywhere it matters** — chapters are never edited (the body-hash guard makes the enrichment metadata regions the only sanctioned mutation, with provenance chains), rules are never edited, artifacts are content-addressed.
- **Supply chain**: published versions are provenance-attested via OIDC trusted publishing (no long-lived npm tokens exist in the pipeline), and `npm audit signatures` verifies any install.

## If your sessions contain sensitive text

The same advice as any chat-log system, honestly scoped: **chapters archive conversation bytes verbatim** — if a secret is said in a session, the archive stores it like the session log does. Treat pools as you'd treat git history you can rewrite *before* first push, and use per-project pools + scoped tokens (a read-write-token to one pool is the blast radius). Redaction hooks for specific chapter writes are a known gap, on the record, not a hidden one.

Questions on this page deserve a repo issue rather than an email — the answers belong in public.

← back to [26. Changelog](/operations/changelog/) · or start the book at [1. Quickstart](/start/quickstart/).
