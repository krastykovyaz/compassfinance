// Safe, structured server-side logging for the AI Learning Engine
// (Part 21). Deliberately logs only coarse, non-sensitive fields — never
// the API key, never the full prompt (which could carry more of the
// lesson content than necessary to debug), and never anything from the
// learner's free-text answer beyond its length.

export type AIOperation = "tutor";

export function logAIOperation(entry: {
  operation: AIOperation;
  assetId: string;
  lessonId: string;
  difficulty: string;
  locale: string;
  latencyMs: number;
  success: boolean;
  /** Coarse failure category only (e.g. "missing_api_key", "timeout") —
   * never a raw provider error message or stack trace. */
  failureKind?: string;
}): void {
  console.log(
    `[ai:${entry.operation}] asset=${entry.assetId} lesson=${entry.lessonId} ` +
      `difficulty=${entry.difficulty} locale=${entry.locale} latencyMs=${entry.latencyMs} ` +
      `success=${entry.success}${entry.failureKind ? ` failureKind=${entry.failureKind}` : ""}`
  );
}
