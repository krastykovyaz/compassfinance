// Server-only DeepSeek implementation of AIProvider.
//
// Important: the API key is read only from process.env and is never exposed
// to the browser. The provider is intentionally tolerant of model responses:
// some model/API combinations can return valid JSON wrapped in markdown even
// when JSON mode is requested. We normalize that server-side before schema
// validation.
//
// DeepSeek API: POST https://api.deepseek.com/chat/completions

import { AICompletionRequest, AICompletionResult, AIProvider } from "./provider";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function getTimeoutMs() {
  const configured = Number(process.env.DEEPSEEK_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function extractText(data: DeepSeekChatCompletionResponse): string | null {
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

export class DeepSeekProvider implements AIProvider {
  readonly id = "deepseek";

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const start = Date.now();
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return { ok: false, kind: "missing_api_key", latencyMs: Date.now() - start };
    }

    const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

    // A single request is normally enough. If JSON mode is rejected by the
    // provider/model, retry once without response_format. The response is
    // still strictly validated by schemas.ts, so this does not weaken the
    // application contract.
    const attempts = request.expectJson ? [true, false] : [false];

    for (let attempt = 0; attempt < attempts.length; attempt += 1) {
      const useJsonMode = attempts[attempt];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), getTimeoutMs());

      try {
        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            temperature: request.temperature ?? 0.4,
            max_tokens: request.maxTokens ?? 700,
            ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          return { ok: false, kind: "rate_limited", latencyMs: Date.now() - start };
        }

        if (!response.ok) {
          // A 4xx/5xx from JSON mode is worth one plain-mode retry. For a
          // normal request there is nothing useful to retry here.
          if (useJsonMode && response.status >= 400 && response.status < 500) {
            continue;
          }
          return { ok: false, kind: "provider_error", latencyMs: Date.now() - start };
        }

        const data = (await response.json()) as DeepSeekChatCompletionResponse;
        const text = extractText(data);

        if (!text) {
          // If JSON mode produced an empty/malformed content response, give
          // the provider one plain-mode attempt as well.
          if (useJsonMode) continue;
          return { ok: false, kind: "invalid_response", latencyMs: Date.now() - start };
        }

        return { ok: true, text, latencyMs: Date.now() - start };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return { ok: false, kind: "timeout", latencyMs: Date.now() - start };
        }

        // Network errors should not be retried immediately: a second request
        // is unlikely to help and could double cost.
        return { ok: false, kind: "network_error", latencyMs: Date.now() - start };
      } finally {
        clearTimeout(timer);
      }
    }

    return { ok: false, kind: "invalid_response", latencyMs: Date.now() - start };
  }
}
