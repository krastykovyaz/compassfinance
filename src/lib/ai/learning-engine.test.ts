import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("./providers/deepseek-provider", () => ({
  DeepSeekProvider: class {
    id = "deepseek";
    complete = (...args: unknown[]) => completeMock(...args);
  },
}));

vi.mock("./prompts", () => ({ buildTutorPrompt: () => ({ system: "sys", user: "usr" }) }));
vi.mock("./cache", () => ({
  buildCacheKey: () => "cache-key",
  getCached: () => null,
  setCached: () => {},
}));
vi.mock("./log", () => ({ logAIOperation: () => {} }));

import { tutor } from "./learning-engine";
import type { LearningContext } from "./curriculum-context";

const CONTEXT: LearningContext = {
  assetId: "nvda",
  assetTitle: "NVIDIA",
  category: "stock",
  lessonId: "l1",
  lessonTitle: "Intro",
  objectives: [],
  concepts: [],
  canonicalExplanation: "text",
  completionCriteria: "Complete all lessons.",
  difficulty: "beginner",
  difficultyGuidance: "",
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  completeMock.mockResolvedValue({ ok: true, text: JSON.stringify({ title: "T", explanation: "E", keyPoints: ["a"] }), latencyMs: 50 });
});

describe("tutor — expectJson (shares DeepSeek's reasoning-eats-budget risk with Compass)", () => {
  it("sets expectJson: true on every DeepSeek call, which defaults DeepSeekProvider to disableReasoning", async () => {
    await tutor(CONTEXT, "user_question", "lesson", "What is a P/E ratio?");
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ expectJson: true }));
  });
});
