---
title: "7. Continuation budget math"
description: Why the limit is a share of the space left after the header, and why "refuse with numbers" beats "truncate to fit".
lastUpdated: true
---

A continuation's cost is the **newly added** context: the Table of Contents plus the handoff note. The invariant that keeps it sane:

```
tocTokens + handoffNoteTokens  ≤  continuationBudgetRatio × (window − systemPromptTokens)
```

Measured **before** the session is created. Over budget → **refuse, with per-rule numbers.** Never silently truncate.

## Why "after the header," not "of the window"

A 32K model with a ~9K system prompt and tool schemas has only ~23K of headroom. Budget the continuation as a fraction of the *whole* window and you make it unmeetable on exactly the small-context hardware the plugin exists for. Reserve a share of what **remains** — here `continuationBudgetRatio` defaults to **0.25**, so on 32K/9K the new content may use ~5.75K tokens, and the TOC that measured **~102 tokens** clears it with room to breathe.

## Why refuse rather than clip

A dropped or clipped handoff note is precisely the lossy behavior this whole project rejects. A summary can shrink; a *citation index* should stop short and say so — "TOC 6,120 tokens + note 1,300 > budget 5,750; the 6 chapters that fit are listed, these 4 are not" — so the human narrows the ranges or raises the ratio deliberately. The same doctrine runs everywhere in the system: offline degrades to `local-only` **naming the failed step**; budget overflow lists the rules that didn't fit; oversized tool results that can't be deferred **warn rather than inline silently**. Loud beats lossy, every time.

## The retention paradox, structurally avoided

In-place compaction has a corner where a message is too big to file and too new to keep — bounded refusal or forced truncation is the usual answer. dsh-chapters makes it unreachable: a monster tool result **never enters the window at all** — it is stubbed at arrival into `artifacts/` ([§9](/concepts/archive-anatomy/)), so the retention gate at the *rescue* stage is instead a *never-on-the-desk* gate. This is the Recursive-LM decomposition doing bookkeeping for us — next page.

Next: [8. Recursive context theory](/concepts/recursive-context/).
