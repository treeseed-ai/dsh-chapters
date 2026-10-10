/**
 * Pure data types for the chapter archive. No cordis, no DSH imports — this module is what makes the
 * archive unit-testable without booting a harness, which is the whole testing strategy in
 * docs/development.md § Test Layers.
 *
 * Event field names here were taken from real session logs read during Phase 0 (see
 * spikes/probe/FINDINGS.md), not guessed: `user/message` carries `data.{id,role,source,content}` and
 * `tool/call` carries `data.{callId,name,arguments}`. Where the shape is uncertain the renderer degrades
 * rather than throws, because a dropped detail in an archive is worse than an ugly one.
 */

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType?: string; data?: string; path?: string }
  | { type: string; [key: string]: unknown }

export interface SessionEventLike {
  type: string
  seq: number
  time?: number
  surfaceOp?: string
  data?: Record<string, unknown>
}

/** One chapter = a contiguous, closed range of durable event seqs. Integers, never text anchors. */
export interface ChapterRange {
  title: string
  summary: string
  startSeq: number
  endSeq: number
}

/** The model's sparse exceptions about tool results. Absence means "use the default rule". */
export interface ToolResultOverride {
  seq: number
  inline: boolean
}

/**
 * A session plan's verdict, as the log states it (`src/plans.ts`). `failed` is the
 * family where the host threw without a human verdict (no review channel, service
 * reloaded mid-review, the call ran outside plan mode, the markdown had no heading)
 * — labelling those `rejected` would invent a decision nobody made.
 */
export type PlanStatus = 'approved' | 'rejected' | 'dismissed' | 'pending' | 'superseded' | 'failed'

/** One plan's machine facts, carried in the chapter record and the registry row. */
export interface PlanFact {
  seq: number
  status: PlanStatus
  title: string
  sha256: string
  artifactPath: string
  bytes: number
  estTokens: number
  resultSeq: number | null
}

/**
 * The notice's flat plan row (archived facts and live, unarchived docs unify here).
 * Rows travel in CAUSAL order — chapters root-first, plans within a chapter by seq,
 * then the caller's unarchived tail. Every session numbers its own events from zero,
 * so a `seq` in one session is NOT comparable with a `seq` in another: the builder's
 * order is the chronology, and nothing downstream may re-sort by `seq`
 * (docs/plans-carriage.md § 4).
 */
export interface NoticePlan {
  title: string
  status: PlanStatus
  seq: number
  chapterNumber?: number
  chapterPath?: string
  artifactPath?: string
  sha256?: string
  estTokens?: number
}

export interface RenderConfig {
  /** Below this estimated token count a tool result stays inline without needing a model override. */
  toolResultDeferFloorTokens: number
  /** Chapter sizes past this are flagged for a split at the next boundary. Never truncated. */
  chapterTokenTarget: number
  /**
   * Verbatim plan characters printed inline under a plan's reference. The full text is
   * ALWAYS artifact-backed, so this is a display budget, never a data decision.
   * 0 = pointer only (the artifact line and outline still print).
   */
  planInlineChars?: number
  /**
   * Above this estimated token count a tool-call ARGUMENT is artifact-backed and the
   * inline text is a bounded head. 0 = off: every argument keeps the plain head rule,
   * so a deployment opts in deliberately (it changes chapter bytes, hence tapes).
   */
  callArgArtifactTokens?: number
  /**
   * Credential redaction patterns applied at the render chokepoint (record §9).
   * Absent → the built-in conservative set. Extensible per deployment.
   */
  redactions?: readonly import('./redact.ts').RedactPattern[]
}

export interface ArtifactRef {
  /** Content hash; the artifact path is derived from it, so identical results dedupe across a subtree. */
  sha256: string
  /** Relative path from the store root, as it will be printed in the chapter and read back. */
  path: string
  bytes: number
  /** The exact bytes to write. Written whether or not the body was also inlined. */
  content: string
  /** True when the chapter body also carries the text, i.e. the model asked to keep it visible. */
  inlined: boolean
  toolName: string
  sourceSeq: number
}

export interface RenderedChapter {
  range: ChapterRange
  /** Index topics (deterministic floor: paths + top terms). P2 enrichment may relabel. */
  topics: string[]
  /** Full Markdown file body, YAML frontmatter included. */
  markdown: string
  artifacts: ArtifactRef[]
  stats: {
    /** chars/4 estimate until tokenMeter is wired at the host boundary; labelled as an estimate. */
    estimatedTokens: number
    estimatedBytes: number
    events: number
    /** user+assistant MESSAGE events in the chapter (record §7.3: counts, not tokens). */
    messages: number
    toolCalls: number
    toolResultsInlined: number
    toolResultsDeferred: number
    /** True when the chapter exceeds chapterTokenTarget — a split signal, never a truncation licence. */
    overTarget: boolean
    /** Events in the range that produced no rendered output, so a silent hole is visible. */
    unrenderedSeqs: number[]
    /** Plans submitted inside this range, with the artifact that carries their full
     * text. Absent (not an empty list) on chapters rendered before this feature —
     * the same "never a lying zero" rule `messages` follows. */
    plans?: PlanFact[] | undefined
    /** Folded `plan/mode` state at the range's end; 'unknown' when the log never said. */
    planMode?: 'active' | 'inactive' | 'unknown' | undefined
    /** Tool-call arguments artifact-backed by the `callArgArtifactTokens` rule. */
    invocationArtifacts?: number | undefined
  }
}

/** A candidate tool result, enumerated by the plugin so the model never guesses at sizes. */
export interface ToolResultCandidate {
  seq: number
  toolName: string
  bytes: number
  estimatedTokens: number
  excerpt: string
}

export class RangeError extends Error {
  readonly code: 'overlapping' | 'gap' | 'descending' | 'beyond-ceiling' | 'empty'
  constructor(code: RangeError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'RangeError'
  }
}
