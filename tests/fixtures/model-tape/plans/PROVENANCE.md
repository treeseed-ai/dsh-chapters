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


## Re-distilled the same day for the two-leg journey

The journey grew a second leg (continuation *and* branch, so § 12's distinction is executed rather than
described), which changed the request prefixes and invalidated the earlier tape. This directory is the
re-distilled set: 6 scripted-upstream entries — title, the `exit_plan_mode` call, the approval
acknowledgement, `chapters_segment`, `chapters_continue` with the ceiling read back out of the real tool's
own result, and the closing turn. Strict replay of the whole project passes in ~17 s with no LLM present,
and the full eight-project chain runs it on every push.
