import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/providers/deepseek-provider", () => ({
  DeepSeekProvider: class {
    async complete() {
      return {
        ok: true,
        text: JSON.stringify({
          title: "Understanding the concept",
          explanation: "Here is a grounded explanation.",
          keyPoints: ["Point one", "Point two"],
          example: "A simple example.",
          nextStep: "Learn the related concept next.",
        }),
        latencyMs: 5,
      };
    }
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/ai/tutor", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "test-tutor",
    },
    body: JSON.stringify(body),
  });
}

const base = {
  assetId: "sp500",
  lessonId: "what-is-it",
  difficulty: "beginner",
  locale: "en",
};

describe("POST /api/ai/tutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a lesson tutor action", async () => {
    const response = await POST(
      request({
        ...base,
        phase: "lesson",
        action: "explain_simple",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.title).toBe("Understanding the concept");
  });

  it("accepts a free-form learner question", async () => {
    const response = await POST(
      request({
        ...base,
        phase: "lesson",
        action: "user_question",
        userQuestion: "Why does market capitalization matter?",
      })
    );

    expect(response.status).toBe(200);
  });

  it("accepts post-quiz context with a score", async () => {
    const response = await POST(
      request({
        ...base,
        phase: "post-quiz",
        action: "review_mistakes",
        score: 0.6,
        total: 5,
        recentMistakeQuestionIds: ["q1", "q2"],
      })
    );

    expect(response.status).toBe(200);
  });

  it("rejects invalid phases and quiz-time access", async () => {
    const invalid = await POST(
      request({
        ...base,
        phase: "quiz",
        action: "explain_simple",
      })
    );
    expect(invalid.status).toBe(400);

    const missing = await POST(
      request({
        ...base,
        phase: "post-quiz",
        action: "review_mistakes",
        total: 5,
      })
    );
    expect(missing.status).toBe(400);
  });

  it("rejects invalid actions", async () => {
    const response = await POST(
      request({
        ...base,
        phase: "lesson",
        action: "generate_question",
      })
    );

    expect(response.status).toBe(400);
  });
});
