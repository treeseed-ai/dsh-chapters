/**
 * THE SCRIPTED UPSTREAM — a tiny OpenAI-compatible SSE server that plays the MODEL
 * for one acceptance journey (session-plan carriage), so the browser plane can be
 * distilled into a tape on a box whose local model server is unhealthy, and then
 * replayed in hosted CI exactly like the seven model-distilled projects.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT (the honesty of the whole file):
 *  - PROVES: the harness's real `exit_plan_mode` tool executes under the preset's
 *    plan-mode policy; the host's REAL review channel opens in the browser and a
 *    real click answers it; the durable log gains genuine `plan/mode`, `tool/call`
 *    and `tool/result` events; and our reader, renderer, archive, registry and
 *    notice carry them — end to end, in the same system every other feature is
 *    accepted with.
 *  - DOES NOT PROVE: that a trained model would choose to submit that plan. That
 *    half belongs to the GPU box: `E2E_MODEL=record E2E_TAPE=plans` against a
 *    healthy local model re-distills the SAME spec from real traffic and retires
 *    the stub. NOTE: the recorded `model` field is the REQUEST's route name
 *    (`qwen3.8-flash-next`), so it CANNOT be trusted as provenance — the tape directory
 *    carries `PROVENANCE.md` saying what actually served it.
 *
 * Wire format copied FORM-FOR-FORM from recorded llama.cpp traffic
 * (`tests/fixtures/model-tape/arrival/0001.json`): the opening
 * `{role:"assistant",content:null}` chunk, the `delta.tool_calls` argument drip,
 * the closing `finish_reason` chunk, the standalone `usage`+`timings` chunk the
 * token meter reads, and `data: [DONE]`.
 *
 * Test-only scaffolding, like tests/integration/http-git-server.ts and
 * tests/e2e/model-proxy.ts: the product never depends on any of this.
 *
 *   node tests/e2e/stub-model.ts                       # listens on :8081
 *   E2E_MODEL=record E2E_TAPE=plans E2E_UPSTREAM=http://127.0.0.1:8081 \
 *     npx playwright test -c tests/e2e/playwright.config.ts --project=plans
 */
import http from 'node:http'
import { randomBytes } from 'node:crypto'

export interface StubHandle { url: string; port: number; close: () => Promise<void> }

export const STUB_MODEL = 'stub-plan-carriage'

/** The plan the scripted model submits: ordinary markdown, no secrets, no live paths. */
export const STUB_PLAN = [
  '# Verify the plan carriage end to end',
  '',
  '## Goal',
  'An approved session plan survives an archive and appears in the child notice.',
  '',
  '## Success criteria',
  'The chapter carries a Plans block, the plan is whole on disk, the child reads the verdict.',
  '',
  '## Changes by subsystem',
  'src/render.ts renders the block; src/continue-core.ts carries the notice.',
  '',
  '## Tests',
  'unit plans suite, the carriage integration, and this journey.',
  '',
].join('\n')

const TITLE_SYSTEM = 'Create a concise title'
const PLAN_TOOL = 'exit_plan_mode'

export type StubDecision =
  | 'title'
  | 'plan'
  | 'after-approval'
  /** the segment result was unreadable — the stub refuses to invent a range */
  | 'no-ceiling'
  /** the continuation leg: segment first… */
  | 'segment'
  /** …then continue, with ranges read from the segment result the REAL tool produced */
  | { kind: 'continue'; fromSeq: number; toSeq: number }

/**
 * What this turn should do, read off the request the harness ACTUALLY sent — and
 * read from the CONVERSATION only. The first attempt string-matched the whole
 * message array for `exit_plan_mode` / `approved`, and the SYSTEM PROMPT contains
 * both words (the tool catalog and the plan policy): every turn decided
 * 'after-approval', answered in prose, and no review card ever opened. Measured
 * 2026-10-10 on the recording run — the log shows an `assistant/message` where a
 * `tool/call` belonged, and a spec timing out on a card that never existed.
 *
 * The honest signal is the shape of the transcript: a `role:'tool'` message exists
 * only once a tool has RUN, i.e. the human has answered the review.
 */
const toolText = (m: unknown): string => {
  const rec = (m ?? {}) as { role?: unknown; content?: unknown }
  if (rec.role !== 'tool') return ''
  return typeof rec.content === 'string' ? rec.content : JSON.stringify(rec.content ?? '')
}

export function decide(body: { messages?: unknown[]; [k: string]: unknown }): { kind: StubDecision } | { kind: 'continue'; fromSeq: number; toSeq: number } {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const first = messages[0] as { content?: string } | undefined
  if (typeof first?.content === 'string' && first.content.includes(TITLE_SYSTEM)) return { kind: 'title' }
  const tools = messages.map(toolText).filter((t) => t !== '')
  const lastTool = tools.length > 0 ? tools[tools.length - 1]! : ''
  const lastUser = [...messages].reverse().map((m) => (m as { content?: unknown }).content).find((c) => typeof c === 'string') as string | undefined
  // Continuation leg, step 2: `chapters_segment` answered, so continue with the
  // ranges the REAL tool's ceiling allows — read from its result, never guessed.
  if (/archiveCeiling/.test(lastTool)) {
    // The number survives however the harness frames the payload — plain JSON, or
    // JSON escaped inside a string one level down, where the quotes arrive as
    // \"archiveCeiling\". Matching on the KEY and the digits, not on quotes, is the
    // only version that behaves the same on every machine: the local run read this
    // fine and the runner did not, and that difference cost six CI cycles (0.1.12).
    const ceiling = Number(/archiveCeiling[^0-9]{0,6}(\d+)/.exec(lastTool)?.[1] ?? '0')
    // A ceiling of 0 is not a range, it is a parse failure — and inventing one would
    // send a bogus archive that `validateRanges` rightly refuses, with an error that
    // names the chapter and not the cause. Answer in prose and let the spec see no
    // child, which is the honest failure this time.
    if (Number.isFinite(ceiling) && ceiling > 0) return { kind: 'continue', fromSeq: 0, toSeq: ceiling }
    return { kind: 'no-ceiling' }
  }
  // Continuation leg, step 1: the human asked for a continuation; measure first.
  if (typeof lastUser === 'string' && /chapters_segment/.test(lastUser) && !tools.some((t) => t.includes('"childSessionId"'))) {
    return { kind: 'segment' }
  }
  if (lastTool.includes('"childSessionId"')) return { kind: 'after-approval' }
  return tools.length > 0 ? { kind: 'after-approval' } : { kind: 'plan' }
}

const chunk = (id: string, created: number, model: string, payload: Record<string, unknown>): string =>
  `data: ${JSON.stringify({ created, id, model, system_fingerprint: 'stub-0000-eafe15a5e', object: 'chat.completion.chunk', ...payload })}\n\n`

const sseHead = (id: string, c: number, m: string) =>
  chunk(id, c, m, { choices: [{ finish_reason: null, index: 0, delta: { role: 'assistant', content: null } }] })
const sseText = (id: string, c: number, m: string, piece: string) =>
  chunk(id, c, m, { choices: [{ finish_reason: null, index: 0, delta: { content: piece } }] })
const sseToolStart = (id: string, c: number, m: string, callId: string, name: string, firstArg: string) =>
  chunk(id, c, m, { choices: [{ finish_reason: null, index: 0, delta: { tool_calls: [{ index: 0, id: callId, type: 'function', function: { name, arguments: firstArg } }] } }] })
const sseToolArg = (id: string, c: number, m: string, piece: string) =>
  chunk(id, c, m, { choices: [{ finish_reason: null, index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: piece } }] } }] })
const sseFinish = (id: string, c: number, m: string, reason: string) =>
  chunk(id, c, m, { choices: [{ finish_reason: reason, index: 0, delta: {} }] })
/** usage rides its own chunk (recorded llama.cpp shape) — the host token meter reads it. */
const sseUsage = (id: string, c: number, m: string, prompt: number, completion: number, cached: number) =>
  chunk(id, c, m, {
    choices: [],
    usage: { completion_tokens: completion, prompt_tokens: prompt, total_tokens: prompt + completion, prompt_tokens_details: { cached_tokens: cached } },
    timings: { cache_n: cached, prompt_n: prompt - cached, prompt_ms: 90, predicted_n: completion, predicted_ms: 60 },
  })

/** Drip the argument blob like a real stream does: an odd first piece, then runs. */
function argPieces(json: string): string[] {
  const out: string[] = []
  let i = 0
  for (const size of [1, 9, 13, 13, 13]) {
    if (i >= json.length) break
    out.push(json.slice(i, i + size))
    i += size
  }
  if (i < json.length) out.push(json.slice(i))
  return out
}

export function startStubModel(opts: { port?: number } = {}): Promise<StubHandle> {
  const port = opts.port ?? Number(process.env.STUB_PORT ?? 8081)
  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    if (req.method === 'GET' && url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: STUB_MODEL, object: 'model' }] }))
      return
    }
    if (req.method === 'POST' && url.includes('models/info')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: STUB_MODEL, object: 'model', context: { contextWindow: 32000, maxTokens: 15000 } }))
      return
    }
    if (req.method !== 'POST' || !url.includes('chat/completions')) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"stub: unknown route"}')
      return
    }
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => parts.push(c))
    req.on('end', () => {
      let body: { messages?: unknown[] } = {}
      try { body = JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { /* tolerate an empty body */ }
      const decision = decide(body)
      const id = `chatcmpl-${randomBytes(24).toString('hex')}`
      const created = Math.floor(Date.now() / 1000)
      const model = STUB_MODEL
      const messages = Array.isArray(body.messages) ? body.messages : []
      const promptTokens = Math.max(400, Math.round(JSON.stringify(messages).length / 4))
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.write(sseHead(id, created, model))
      let completion = 8
      if (decision.kind === 'title') {
        for (const piece of ['Verify the plan ', 'carriage']) { res.write(sseText(id, created, model, piece)); completion += 4 }
        res.write(sseFinish(id, created, model, 'stop'))
      } else if (decision.kind === 'plan') {
        const args = JSON.stringify({ plan: STUB_PLAN })
        const pieces = argPieces(args)
        res.write(sseToolStart(id, created, model, `stub-${randomBytes(10).toString('hex')}`, PLAN_TOOL, pieces[0]!))
        for (const p of pieces.slice(1)) res.write(sseToolArg(id, created, model, p))
        completion = Math.max(24, Math.round(args.length / 4))
        res.write(sseFinish(id, created, model, 'tool_calls'))
      } else if (decision.kind === 'segment') {
        res.write(sseToolStart(id, created, model, `stub-seg-${randomBytes(6).toString('hex')}`, 'chapters_segment', '{}'))
        completion = 8
        res.write(sseFinish(id, created, model, 'tool_calls'))
      } else if (decision.kind === 'continue') {
        const args = JSON.stringify({
          title: 'Carriage continuation',
          handoffNote: 'Continue the approved plan; the archive carries it verbatim.',
          chapters: [{ title: 'Planning the carriage', summary: 'the plan and its approval', startSeq: decision.fromSeq, endSeq: decision.toSeq }],
        })
        const pieces = argPieces(args)
        res.write(sseToolStart(id, created, model, `stub-cont-${randomBytes(6).toString('hex')}`, 'chapters_continue', pieces[0]!))
        for (const p of pieces.slice(1)) res.write(sseToolArg(id, created, model, p))
        completion = Math.max(30, Math.round(args.length / 4))
        res.write(sseFinish(id, created, model, 'tool_calls'))
      } else if (decision.kind === 'no-ceiling') {
        res.write(sseText(id, created, model, 'Unable to read the archive ceiling from the segmentation result; not archiving.'))
        completion = 12
        res.write(sseFinish(id, created, model, 'stop'))
      } else {
        res.write(sseText(id, created, model, 'Approved — the plan is carried; nothing further to change for this journey.'))
        completion = 12
        res.write(sseFinish(id, created, model, 'stop'))
      }
      res.write(sseUsage(id, created, model, promptTokens, completion, messages.length > 4 ? Math.floor(promptTokens * 0.55) : 0))
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${port}`, port,
      close: async () => { await new Promise<void>((r) => server.close(() => r())) },
    }))
  })
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('stub-model.ts')) {
  const handle = await startStubModel()
  process.stdout.write(`stub-model: serving ${handle.url}/v1/chat/completions (scripted plan carriage)\n`)
  const shutdown = () => { void handle.close().then(() => process.exit(0)) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
