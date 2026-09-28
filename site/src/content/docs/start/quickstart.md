---
title: "1. Quickstart"
description: Install dsh-chapters in one line, restart, and take your first continuation in about two minutes.
lastUpdated: true
---

## Three steps

**1. Install the plugin** (DeepSeek Harness ≥ 0.1.x, Node ≥ 24):

```bash
dsh plugin add @treeseed/dsh-chapters
```

Latest release: see the [npm page](https://www.npmjs.com/package/@treeseed/dsh-chapters) — every version ships with a build provenance attestation and a green deterministic + tape-replay CI run behind it.

**2. Restart your harness.** `dsh web` loads plugin bundles at boot. After restart you have, with no further configuration:

- the agent tools `chapters_segment`, `chapters_continue`, `chapters_fork`, `chapters_search`, `chapters_artifact`, `chapters_rule_propose`;
- the composer commands `/chapters-link`, `/chapters-status`, `/chapters-enrich`, `/chapters-rule`;
- a **Fork with chapters** button on every assistant message;
- the `chapters` agent preset (select it from the preset menu to route in-place `/compact` through the deterministic engine — optional; the archive tools work without it).

**3. Take a continuation.** Work a few turns in a real task until the conversation feels expensive, then either click **Fork with chapters** on the last assistant message, or say:

> *"Segment this conversation and continue with a TOC; keep the debugging history in one chapter and the setup in another."*

The agent archives verbatim chapters, opens the continuation, and the new session starts with a Table of Contents of everything that came before. Nothing was summarized; the original session is untouched and still openable.

## Check it works

```
/chapters-status
```

Before linking a knowledge pool, the honest answer is `local-only` with the reason ("no upstream linked") — that is the system working as designed, not a failure: the local archive is written and searchable the moment it exists, and transport comes later ([Part III](/knowledge/pool/)).

## Two traps we documented so you don't rediscover them

- **Slash commands need a started conversation.** On the brand-new session *draft* screen, the composer sends text as the first message rather than running a command — send any short opener first (or just ask: *"check our chapters status"*), then commands behave. This is a harness draft-screen behavior, and the plugin's docs are candid about it.
- **Restart after upgrade.** `dsh plugin update @treeseed/dsh-chapters` swaps files; the running process holds the old bundle until restart.

## What's next

[2. Your first continuation](/start/first-continuation/) walks the mechanics — what the archive looks like, what the new session actually contains, and how to reload a chapter when the model needs the old detail.
