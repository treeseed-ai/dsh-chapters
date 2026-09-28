/** Benchmark/field data: every JSON in ./results is one study, rendered newest
 * first. Two kinds: 'observational' (field studies, metric rows) and
 * 'benchmark' (arm comparisons from benchmarks/run-bench.mjs). */
export interface MetricRow { label: string; value: string; unit?: string; source?: string }
export interface ArmRow {
  arm: 'truncation' | 'llm-summarize' | 'chapters';
  horizon: number;                 // tokens of conversation at pressure point
  tokensUncached: number; tokensCached: number; wallMs: number;
  recallPct: number; completed: boolean;
}
export interface Study {
  id: string; kind: 'observational' | 'benchmark'; label: string; date: string;
  model?: string; contextWindow?: number; notes?: string;
  metrics?: MetricRow[]; arms?: ArmRow[];
}

const files = import.meta.glob('./results/*.json', { eager: true, import: 'default' }) as Record<string, Study>;
export const studies: Study[] = Object.values(files).sort((a, b) => (a.date < b.date ? 1 : -1));
export const latestStudy = studies[0];

export const armLabel = (a: ArmRow['arm']): string =>
  a === 'truncation' ? 'Sliding-window truncation' : a === 'llm-summarize' ? 'LLM summarization compaction' : 'dsh-chapters (verbatim archive)';
