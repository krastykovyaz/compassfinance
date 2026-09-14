import "server-only";

// Safe, structured server-side logging for the Compass Agent — mirrors
// lib/ai/log.ts's own stance: coarse, non-sensitive fields only. Never
// the API key, never the full prompt or financial data, never more of
// the user's message than its length.

export function logCompassOperation(entry: {
  contextType: string;
  locale: string;
  latencyMs: number;
  success: boolean;
  cached?: boolean;
  /** Coarse failure category only (e.g. "missing_api_key", "timeout",
   * "invalid_response") — never a raw provider error message or stack trace. */
  failureKind?: string;
}): void {
  console.log(
    `[compass:chat] context=${entry.contextType} locale=${entry.locale} latencyMs=${entry.latencyMs} ` +
      `success=${entry.success}${entry.cached ? " cached=true" : ""}${entry.failureKind ? ` failureKind=${entry.failureKind}` : ""}`
  );
}
