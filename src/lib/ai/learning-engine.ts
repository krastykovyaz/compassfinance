import { DeepSeekProvider } from "./providers/deepseek-provider";
import type { AIErrorKind, AIProvider } from "./provider";
import type { LearningContext } from "./curriculum-context";
import { buildTutorPrompt } from "./prompts";
import type { TutorAction, TutorPhase } from "./prompts";
import { validateTutorResult } from "./schemas";
import type { TutorResult } from "./schemas";
import { buildCacheKey, getCached, setCached } from "./cache";
import { logAIOperation } from "./log";

let provider: AIProvider | null = null;

function getAIProvider(): AIProvider {
  if (!provider) provider = new DeepSeekProvider();
  return provider;
}

export type EngineResult<T> =
  | { ok: true; data: T; cached: boolean }
  | { ok: false; kind: AIErrorKind | "invalid_response" };

async function runTutorOperation(params: {
  context: LearningContext;
  action: TutorAction;
  phase: TutorPhase;
  userQuestion?: string;
}): Promise<EngineResult<TutorResult>> {
  const { context, action, phase, userQuestion } = params;
  const { system, user } = buildTutorPrompt(context, action, userQuestion, phase);

  const cacheKey =
    action === "user_question" || phase === "post-quiz"
      ? null
      : buildCacheKey([
          "tutor",
          context.assetId,
          context.lessonId,
          context.difficulty,
          context.locale,
          action,
        ]);

  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) {
      const validated = validateTutorResult(cached);
      if (validated.ok) {
        logAIOperation({
          operation: "tutor",
          assetId: context.assetId,
          lessonId: context.lessonId,
          difficulty: context.difficulty,
          locale: context.locale,
          latencyMs: 0,
          success: true,
        });
        return { ok: true, data: validated.data, cached: true };
      }
    }
  }

  const result = await getAIProvider().complete({
    systemPrompt: system,
    userPrompt: user,
    expectJson: true,
  });

  if (!result.ok) {
    logAIOperation({
      operation: "tutor",
      assetId: context.assetId,
      lessonId: context.lessonId,
      difficulty: context.difficulty,
      locale: context.locale,
      latencyMs: result.latencyMs,
      success: false,
      failureKind: result.kind,
    });
    return { ok: false, kind: result.kind };
  }

  const validated = validateTutorResult(result.text);
  if (!validated.ok) {
    logAIOperation({
      operation: "tutor",
      assetId: context.assetId,
      lessonId: context.lessonId,
      difficulty: context.difficulty,
      locale: context.locale,
      latencyMs: result.latencyMs,
      success: false,
      failureKind: `invalid_response:${validated.reason}`,
    });
    return { ok: false, kind: "invalid_response" };
  }

  if (cacheKey) setCached(cacheKey, result.text);

  logAIOperation({
    operation: "tutor",
    assetId: context.assetId,
    lessonId: context.lessonId,
    difficulty: context.difficulty,
    locale: context.locale,
    latencyMs: result.latencyMs,
    success: true,
  });

  return { ok: true, data: validated.data, cached: false };
}

export function tutor(
  context: LearningContext,
  action: TutorAction,
  phase: TutorPhase = "lesson",
  userQuestion?: string
) {
  return runTutorOperation({ context, action, phase, userQuestion });
}
