// The small provider abstraction Milestone 10 asks for (Part 2). The
// Learning Engine (the AI endpoints under src/app/api/ai/) never imports
// DeepSeek directly — it calls generateLearningResponse() from here, which
// delegates to whichever AIProvider is configured. Swapping or adding a
// second provider later means writing one new file that implements
// AIProvider and changing getAIProvider() — nothing else in the app
// changes.
//
// Deliberately NOT a big plugin framework: one interface, one factory
// function, one concrete implementation (DeepSeek) for now. See Part 2 of
// the milestone brief — "do NOT over-engineer this into a large
// framework".

export type AICompletionRequest = {
  /** Server-authored instructions the model must follow. Never derived
   * from user input — see prompts.ts. */
  systemPrompt: string;
  /** The compact, curated context + question/task for this operation. */
  userPrompt: string;
  /** When true, the provider must request/enforce JSON output if it can. */
  expectJson: boolean;
  temperature?: number;
  maxTokens?: number;
  /** When true, disables the model's internal reasoning/"thinking" phase,
   * if the provider supports doing so. DeepSeek's reasoning-capable
   * models spend part of `maxTokens` on an internal `reasoning_tokens`
   * pass BEFORE producing any visible content — for a deterministic
   * structured-output task that doesn't benefit from deliberation, this
   * can silently consume the entire token budget and return truncated,
   * unparseable output (observed live: `reasoning_tokens` alone exceeded
   * a 700-token cap, leaving zero tokens for the actual JSON — see
   * compass-engine.ts, the first caller to set this). Leave unset for
   * callers happy with the provider's default behavior. */
  disableReasoning?: boolean;
};

export type AIErrorKind =
  | "missing_api_key"
  | "timeout"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "provider_error";

export type AICompletionResult =
  | { ok: true; text: string; latencyMs: number }
  | { ok: false; kind: AIErrorKind; latencyMs: number };

export interface AIProvider {
  /** Short id used only in server-side logs (e.g. "deepseek"). */
  readonly id: string;
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}
