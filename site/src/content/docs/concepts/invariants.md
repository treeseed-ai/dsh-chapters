---
title: "6. The four invariants"
description: The non-negotiables every design decision follows from — each earned by a failure they prevent.
lastUpdated: true
---

**1. Never rewrite the durable session log.**
Append-only, always. Compaction *shadows* spans in the rendered surface (the durable record is untouched and fully auditable). Rewriting history is how memory products lose your trust the one time it matters.

**2. Never seed a continuation from the parent's history.**
A naive "fork" copies the parent's events into the child — context *grows* every generation and nothing ever compacts. The continuation is instead **unseeded but for one synthetic message: the TOC notice**. Citation, not copying — the whole economics of the system follow from this one line.

**3. Never contribute to the shared system prompt.**
The header is global to every session in a profile; per-continuation notices are the only injection surface. Enabling dsh-chapters changes what *your sessions can do*, never what *every session hears*. (Rules land in the continuation notice for exactly this reason — [§13](/knowledge/rules/).)

**4. Never let the model author chapter bodies.**
The model chooses ranges and titles; the plugin renders the text from the log. Model-typed "lossless" archives are reconstructed from recall — which is precisely the failure mode being eliminated. Corollary: the model *is* trusted where trust is cheap and human-auditable — proposed rules are model-authored *prose*, but write-once and approval-gated.

## Why invariants instead of settings

Every one of these was chosen after watching the convenient alternative fail: seeded forks that never shrink, summaries that drop the detail the task turns on, a global prompt every user of the machine must trust. The architecture is small because the rules are strict — and the strictness is the product. The invariants are enforced in code, tested by name (`tests/unit/engine-core.test.ts`, the golden TOC test for byte-identical absence), and referenced from commit messages like load-bearing walls.

Next: [7. Continuation budget math](/concepts/budget/).
