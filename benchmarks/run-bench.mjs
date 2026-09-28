#!/usr/bin/env node
/**
 * dsh-chapters three-arm memory benchmark — LOCAL ONLY (never CI).
 *
 *   node benchmarks/run-bench.mjs [--horizon 32768] [--port 8080] [--model qwen3.8-flash-next]
 *                                 [--needles 8] [--every 60]
 *
 * Arms (same pressure horizon, same grader):
 *   A truncation     — keep the tail window; the head is gone.
 *   B llm-summarize  — summarize the head with the model (its cost is TIMED AND BILLED, as in real
 *                      LLM-compaction products), continue with summary + tail.
 *   C chapters       — archive the head VERBATIM (a copy), continue with the deterministic TOC line
 *                      rendered by the plugin's own deriveIdentity() + tail; if recall is short, one
 *                      scripted retrieval turn pulls the verbatim chapter (what `read` on a chapter
 *                      path does in production).
 *
 * Scoring: K needle facts planted at spaced offsets in the head; recall = needle phrases present in
 * the final answer (whitespace-normalized). Costs = provider-reported tokens (uncached, cached) and
 * wall time for every call the arm makes. --every <min> runs the loop forever for nightly capture;
 * each pass writes site/src/data/results/bench-<utc>.json — commit to publish, rebuild the site.
 */
import { writeFileSync } from 'node:fs';
import { deriveIdentity } from '../lib/engine-core.js';

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt; };
const HOST = `http://localhost:${arg('port', '8080')}`;
const MODEL = arg('model', 'qwen3.8-flash-next');
const HORIZON = Number(arg('horizon', '32768'));      // tokens of head to displace
const NEEDLES = Number(arg('needles', '8'));
const TAIL = 2000;                                      // tokens (approx) of always-kept tail
const RETRIEVE = 4;                                     // tokens-per-char divisor for sizing filler

async function chat(messages, maxTokens) {
  const t0 = Date.now();
  const res = await fetch(`${HOST}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0 }) });
  const j = await res.json();
  if (j.error) throw new Error(`api error: ${JSON.stringify(j.error).slice(0, 160)}`);
  const u = j.usage ?? {};
  return { text: String(j.choices?.[0]?.message?.content ?? ''),
    uncached: (u.prompt_tokens ?? 0) - (u.prompt_tokens_details?.cached_tokens ?? 0),
    cached: u.prompt_tokens_details?.cached_tokens ?? 0, wallMs: Date.now() - t0 };
}

// deterministic filler + planted needles
function buildHead(needleCount) {
  const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ');
  let seed = 4242; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const per = Math.floor(HORIZON * RETRIEVE / (needleCount + 1) / 60);   // lines between needles
  const parts = []; const needles = [];
  for (let n = 0; n < needleCount; n++) {
    for (let l = 0; l < per; l++) parts.push(`${l}: ${words[Math.floor(rnd() * 26)]} ${words[Math.floor(rnd() * 26)]} ${words[Math.floor(rnd() * 26)]}`);
    const fact = `the VESSEL-${n + 1} retry budget is ${1000 + n * 173} and its owner is ${words[n % 26]}-${words[(n * 7) % 26]}`;
    needles.push({ key: `VESSEL-${n + 1}`, fact });
    parts.push(`NEEDLE-FACT ${n + 1}: ${fact}`);
  }
  return { text: parts.join('\n'), needles };
}
const buildTail = () => Array.from({ length: 12 }, (_, i) => `assistant step ${i}: checked the ${i}th module, no findings to report yet.`).join('\n');
const question = (needles) => `Without any tools, answer each line: for ${needles.map(n => n.key).join(', ')}, state its retry budget and owner from the working record above.`;
const grade = (answer, needles) => {
  const norm = answer.replace(/\s+/g, ' ').toLowerCase();
  let hit = 0;
  for (const n of needles) {
    const budget = n.fact.match(/\b1\d{3}\b/)?.[0];
    const owner = n.fact.split(' owner is ')[1]?.toLowerCase();
    if (budget !== undefined && owner !== undefined && norm.includes(budget) && norm.includes(owner)) hit++;
  }
  return Math.round(100 * hit / needles.length);
};

async function armA(head, tail, needles) {
  const r = await chat([{ role: 'user', content: `${tail}\n\n${question(needles)}` }], 700);
  return { arm: 'truncation', tokensUncached: r.uncached, tokensCached: r.cached, wallMs: r.wallMs, recallPct: grade(r.text, needles), completed: true };
}
async function armB(head, tail, needles) {
  const s = await chat([{ role: 'user', content: `Summarize the following working record for continuation, keeping every concrete number, name, and identifier:\n\n${head}` }], 900);
  const r = await chat([{ role: 'user', content: `SUMMARY OF EARLIER WORK:\n${s.text}\n\n${tail}\n\n${question(needles)}` }], 700);
  return { arm: 'llm-summarize', tokensUncached: s.uncached + r.uncached, tokensCached: s.cached + r.cached, wallMs: s.wallMs + r.wallMs, recallPct: grade(r.text, needles), completed: true };
}
async function armC(head, tail, needles) {
  // deterministic index line, produced by the plugin's OWN pure module (verbatim archive = head text):
  const { title, summary } = deriveIdentity([{ role: 'user', content: [{ type: 'text', text: head }] }], false);
  const toc = `# Continuation: memory benchmark\n\n## Conversation TOC\n1. [${title}](.dsh-chapters/bench/chapters/001-work.md) — ${summary}`;
  const r1 = await chat([{ role: 'user', content: `${toc}\n\n${tail}\n\n${question(needles)}\nIf a value is missing from this line, say exactly NEED_MORE.` }], 700);
  let out = { uncached: r1.uncached, cached: r1.cached, wallMs: r1.wallMs, text: r1.text };
  if (out.text.includes('NEED_MORE') || grade(out.text, needles) < 100) {
    const r2 = await chat([{ role: 'user', content: `${toc}\n\nARCHIVE (read from .dsh-chapters/bench/chapters/001-work.md):\n${head}\n\n${tail}\n\n${question(needles)}` }], 700);
    out = { uncached: out.uncached + r2.uncached, cached: out.cached + r2.cached, wallMs: out.wallMs + r2.wallMs, text: r2.text };
  }
  return { arm: 'chapters', tokensUncached: out.uncached, tokensCached: out.cached, wallMs: out.wallMs, recallPct: grade(out.text, needles), completed: true };
}

async function runOnce(n) {
  const { text: head, needles } = buildHead(NEEDLES);
  const tail = buildTail();
  console.log(`bench run ${new Date().toISOString()} — horizon ${HORIZON}t, ${NEEDLES} needles, model ${MODEL}`);
  const arms = [];
  for (const [i, fn] of [armA, armB, armC].entries()) {
    try { arms.push(await fn(head, tail, needles)); }
    catch (e) { console.warn(`arm ${i} failed: ${String(e.message).slice(0, 120)}`); }
  }
  const id = `bench-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const study = { id, kind: 'benchmark', label: `Arms @ ${HORIZON.toLocaleString()}t horizon (${NEEDLES} needles)`,
    date: new Date().toISOString().slice(0, 10), model: MODEL, contextWindow: HORIZON,
    notes: 'Controlled local benchmark (see site evidence/benchmarks for the protocol).', arms };
  const out = new URL(`../site/src/data/results/${id}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(study, null, 2));
  console.log('arms:'); for (const a of arms) console.log(` ${a.arm.padEnd(14)} uncached ${String(a.tokensUncached).padStart(7)} cached ${String(a.tokensCached).padStart(7)} wall ${(a.wallMs / 1000).toFixed(0)}s recall ${a.recallPct}%`);
  console.log(`wrote site/src/data/results/${id}.json`);
}

const every = Number(arg('every', '0'));
if (every > 0) { // nightly loop: first run now, then every <every> minutes
  for (;;) { await runOnce(); console.log(`sleeping ${every} min (single-tenant on purpose — kill with ctrl-c)`); await new Promise(r => setTimeout(r, every * 60_000)); }
} else { await runOnce(); }
