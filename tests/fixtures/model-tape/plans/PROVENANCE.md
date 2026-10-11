# Tape provenance — `plans` project

**Distilled 2026-10-10 from the SCRIPTED upstream** (`tests/e2e/stub-model.ts`), not
from the live Local model. Read this before trusting what the tape proves.

| | |
|---|---|
| Journey | `tests/e2e/plans.spec.ts` — plan mode entered with `/plan <message>`, a real `exit_plan_mode` tool call, the host's plan-review card opened and answered by a real click, then `/chapters-fork` |
| Served by | `node tests/e2e/stub-model.ts` (OpenAI-compatible SSE on :8081), started with `E2E_UPSTREAM=http://127.0.0.1:8081` |
| `model` field in the JSON | `qwen3.8-flash-next` — the proxy records the REQUEST's route name, so this field says nothing about what answered. The provenance is this file |
| Why not the live model | the local model server dropped the stream mid-turn, on both attempts — see "Attempted live, twice" below; the scripted upstream made the browser plane reproducible the same day |

## What this tape proves, and what it does not

**Proves** — everything on our side of the seam, in a real browser against a real
harness: the plan-mode policy section is composed by the preset, the host executes
`exit_plan_mode`, opens its review and logs `plan/mode`, `tool/call` and
`tool/result` in the shapes `src/plans.ts` reads; the archive writes the Plans
block, the artifact holds the plan byte-for-byte, and the child's single seeded
event calls the plan out. It also CAUGHT two wrong assumptions of mine during
distillation: approving a plan leaves plan mode (so the folded `planMode:` is
`inactive`, not `active`), and the chip in the toolbar is an EXIT control only —
`/plan` is the entry door.

**Does not prove** that a trained model would choose to submit that plan. The
scripted upstream decided that, and it decided it on every turn.

## Root cause of the dropped streams — measured on the container, same day

This is no longer a mystery to re-derive: `docker inspect` gave `RestartCount=2` and `docker logs`
contains exactly two `CUDA error: out of memory` → `ggml_abort()` lines. One-to-one — **every restart
was a crash**, and `RestartPolicy=unless-stopped` relaunches it silently, so `/health` reads green
between deaths while anything in flight dies with the previous process. The two abort sites:

| site | what it means |
|---|---|
| `alloc at ggml-cuda.cu:583` | a plain VRAM allocation failed |
| `ggml_cuda_graph_evaluate_and_capture` → `cudaGraphInstantiate` | CUDA **graph capture** failed — and capture happens lazily, *during serving* |

The second explains the shape of the failure: the server boots clean, runs for hours (`graphs reused =
2020`), then dies the first time it needs a graph for a new tensor shape. The budget on this card
(RTX 2080 SUPER, 7289 MiB free at load) is why there is no room for that:

```
weights on CUDA0     4570.57 MiB   ← CPU_MOE=1 leaves 85,565 MiB of experts in system RAM
KV on CUDA0            432 (+54) MiB
recurrent state        450.28 MiB   ← per slot, and N_PARALLEL=-1 means several slots
compute buffer        1173.35 MiB   ← BATCH=8192
                    ─────────────
                    ≈ 6626 MiB resident, ~660 MiB headroom — before any graph instance
```

with `LLAMA_ARG_FIT=off` disabling the guard that would shrink the configuration instead of aborting,
and `CTX_SIZE=65536` against a DSH profile that pins `contextWindow: 32000` — 32K of unusable headroom
paid for in VRAM.

Separately, the same server is slow enough to fail on its own: the log's own numbers are **153 tok/s
prefill / 15.45 tok/s decode**, one turn costing 266 s for 22,765 tokens. So a request that meets an
abort reads client-side as `TRANSPORT` ("terminated"), and a request that merely outlives a deadline
reads as `TIMEOUT` — one machine fault, two symptoms, which is exactly why my per-attempt diagnoses
disagreed. At 15 tok/s the profile's `maxTokens: 15000` is a 16-minute worst case per turn, and no
client timeout survives that.

**Before scheduling another live distillation:** set `n_parallel 1`, `ctx-size 32768` or lower, turn
`--fit` back on, drop the batch, consider `--no-cuda-graph` and `--cache-type-k/v q8_0`; then prove a
*completion* with a real ~17K-token request. `/v1/models` answering is not that proof. And do not run a
live journey while another agent session is using the same server — per-slot state and graphs multiply,
and the life that ended at 19:53:55Z died moments after a 22.7K-token turn of mine.

## Attempted live, twice, on 2026-10-10

Both attempts failed identically, so nobody re-tries this blind: the model container
(`qwen-flash-next`, reporting *healthy*) accepted the request and then **dropped the stream mid-turn** —
the session log ends `turn/end {reason:{kind:"error", error:{message:"terminated", code:"TRANSPORT"}}}` —
once after ~50 s on an 8-token probe, and once after **15 minutes** with no tool call emitted and zero
tape entries recorded. A `/v1/models` answer is therefore NOT evidence the server can finish a turn: get a
real completion through `curl /v1/chat/completions` with a header the size the journey actually sends
(~17K tokens) before scheduling a re-record.

## Third attempt, same day, AFTER memory was freed — the most useful one

The journey got further than the model's limits:

| tape entry | what it was | outcome |
|---|---|---|
| `0000` | the session-title call | answered (`finish_reason: "length"`) |
| `0001` | the plan turn, ~17K-token header | **`finish_reason: "tool_calls"`** — the live model DID submit `exit_plan_mode` |
| — | the turn AFTER the human clicks Approve | never answered; CUDA out of memory |

So the remaining blocker is not the model's willingness to plan (proven, in tape) and not the
spec — it is **KV-cache growth on the follow-up request**, which carries the header plus the plan
plus the review result. The server's own startup line says why there is no headroom:
`n_slots = 4, n_ctx_slot = 65536, kv_unified = 'true'` — unified KV sized for four concurrent
64K contexts. Before re-trying, cut that: `-np 1`, `--ctx-size` near the 32K the e2e regime pins,
and/or `--cache-type-k q8_0 --cache-type-v q8_0` (roughly halves KV bytes). The partial
`plans-live/` directory from this attempt was deleted; this stub tape remains the one in the chain,
and the spec it replays is now derived from the log rather than from my script, so it is ready for
the live bytes the moment they land (two of the three entries above already exist).

## Attempt 4 (same day, after memory was freed) — the blocker changed, and that is progress

The review card never opened, but **not** because of CUDA: the turn ended
`turn/end {kind:"error", error:{message:"Request timed out.", code:"TIMEOUT"}}`. The model had done the
obviously right thing — asked to plan how a renderer works, it explored first (`glob src/**/*.ts`, then
`grep renderChapter|...`), and the request carrying those tool results timed out before a plan was
written. Two entries reached tape (the title call, and a `tool_calls` turn for glob); the plan turn never
happened.

Consequences for the next attempt, both actionable:
1. The journey prompt now forbids exploration **in words the model obeys** — no reads, lists, searches or
   tools except the plan tool, state any missing fact as an assumption — so the distillation is one turn
   to a submission (the RR2 doctrine, applied).
2. If a timeout still lands, it is the profile's `fetch-timeouts`/`llm-gate` budget versus a ~18K-token
   prefill with tool results appended — not memory. Read the `code` on `turn/end` before assuming OOM.

## Re-recording from the live model

Retires this note. Nothing else changes — the spec is the same spec:

```bash
rm -f tests/fixtures/model-tape/plans/*.json
E2E_MODEL=record E2E_TAPE=plans E2E_PORT=41750 E2E_THRESHOLD=0.9 \
  PLAYWRIGHT_BROWSERS_PATH=$PWD/var/ms-playwright \
  npx playwright test -c tests/e2e/playwright.config.ts --project=plans
```

The `:8080` server must be healthy (`curl localhost:8080/v1/models`), and the model
has to actually call `exit_plan_mode` — if it answers in prose instead, the review
never opens and the spec fails loudly rather than recording a session that never
planned. Then update this file to say the tape is model-distilled.


## What is in this tape now (and what was taken out, on purpose)

Three entries: the session-title call, the `exit_plan_mode` submission, and the post-approval turn. Strict
replay passes in ~13 s with no LLM, and the eight-project chain runs it on every push.

A fourth leg — the model calling `chapters_segment` then `chapters_continue` — was distilled here and then
**removed**: a tape freezes a model's tool ARGUMENTS, and those args carried the ceiling this machine's live
segment tool happened to report (30) against the runner's 29. `validateRanges` refused the stale range, which
is the product behaving exactly as designed, and the journey was unreproducible by construction. Continuation
semantics moved to the deterministic plane, where a ceiling is a number under test rather than a number on
tape. Full account: `docs/plans-carriage.md` and verify.md P11.

## Threshold pin (0.1.10) — why this project does not use the stress regime's 0.9

The first hosted run of this tape MISSED on a plot-elicitation request: the runner crossed
`0.9 × 32000` mid-journey and compacted, while every local run stayed under it. The project now pins
`E2E_THRESHOLD=0.99` and the spec asserts no `compaction/*` event appears, so a future change that brings
pressure into this journey fails locally instead of surprising a machine nobody can see. If you re-record
from the live model, keep the pin — the tape is only valid for the regime it was distilled under.

## Live attempt 5 (2026-10-11, after the user set `N_PARALLEL` off and rebuilt the container)

The server held up — **RestartCount=0, one life, no OOM** — and the journey ran 8.6 min against the real
model. What it proved, and what it broke:

- **A real model plans, and the carriage works.** It emitted a genuine `exit_plan_mode` call (seq 20) with
  its own plan, the host opened its review, the click approved it, `plan/mode` flipped active→inactive, and
  the archived chapter carried the plan. The parent exited plan mode on approval exactly as § 10 claims.
- **The branch child got NO plan section — verified on bytes, from the live run.** Its seeded notice listed
  chapters and cited paths, with no `## Active plan` and no `ACTIVE PLAN` call-out. Decision 3 holds against
  a real model, not only against a stub.
- **The model ignored an explicit negative instruction.** Told in words not to read, grep, glob or run any
  tool except the plan tool, it called `grep`, `glob`, `read`, and `bash` anyway before producing its plan.
  RR2's lesson, re-learned: prompt-level "don't" is advisory to this model; only structure is binding.
- **The live-only continuation leg failed, and the reason is the model, not the product.** It called
  `chapters_segment` (seq 62) and then *answered in prose* instead of calling `chapters_continue` — so my
  guard threw with the tool's own account rather than a bare zero. A two-step tool chain that must be
  followed in order is not something a 15-tok/s local model can be asked to guarantee.
- **A real ordering bug this run caught in my own spec:** the fork-button click precedes the continuation
  leg, so the live leg was typing its instruction into the BRANCH child (which then dutifully called
  `chapters_segment` and asked the human what to do — a defensible thing for an agent with no directive).
  Moved the leg ahead of the click.

So: the live plane remains **not green**, and the honest statement is narrower than "the feature needs a
live run" — the *archival and intent behaviour is now live-verified*, while a journey that requires the
model to chain two specific tool calls in sequence is not reliably runnable at all. That leg stays
live-only, guarded, and reported when it fails.
