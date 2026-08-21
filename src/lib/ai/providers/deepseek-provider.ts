// Server-only DeepSeek implementation of AIProvider.
//
// SECURITY: DEEPSEEK_API_KEY is read from process.env only, inside a file
// under src/lib/ (never src/components/ or anything imported by a "use
// client" module), and is never returned in any response body. This file
// must never be imported from client code — the API routes under
// src/app/api/ai/ are the only callers, and Next.js already keeps
// non-NEXT_PUBLIC_ env vars out of the client bundle, but the import
// boundary is the real guarantee: nothing under src/components or
// src/app/**/page.tsx imports this module.
//
// DeepSeek's API is OpenAI-compatible (verified against api-docs.deepseek.com,
// August 2026): POST https://api.deepseek.com/chat/completions, bearer auth,
// `response_format: { type: "json_object" }` for JSON mode. Current model
// IDs are deepseek-v4-flash and deepseek-v4-pro — the older "deepseek-chat"
// / "deepseek-reasoner" names are being retired, so DEEPSEEK_MODEL defaults
// to deepseek-v4-flash rather than a legacy name.

import { AICompletionRequest, AICompletionResult, AIProvider } from "../provider";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

type DeepSeekChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
};

export class DeepSeekProvider implements AIProvider {
  readonly id = "deepseek";

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const start = Date.now();
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return { ok: false, kind: "missing_api_key", latencyMs: Date.now() - start };
    }

    const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
    // Overridable via env for tests exercising the timeout path — never
    // needed in production, where the 20s default applies.
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS) || DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
          ...(request.expectJson ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        return { ok: false, kind: "rate_limited", latencyMs: Date.now() - start };
      }
      if (!response.ok) {
        // Never forward the provider's raw error body to the client — log
        // only status/latency server-side (Part 21/23).
        return { ok: false, kind: "provider_error", latencyMs: Date.now() - start };
      }

      const data = (await response.json()) as DeepSeekChatCompletionResponse;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.length === 0) {
        return { ok: false, kind: "invalid_response", latencyMs: Date.now() - start };
      }

      return { ok: true, text, latencyMs: Date.now() - start };
    } catch (err) {
      const latencyMs = Date.now() - start;
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, kind: "timeout", latencyMs };
      }
      return { ok: false, kind: "network_error", latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
