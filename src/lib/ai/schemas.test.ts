import { describe, expect, it } from "vitest";
import { validateTutorResult } from "./schemas";

describe("validateTutorResult", () => {
  it("accepts a valid tutor response", () => {
    const result = validateTutorResult(
      JSON.stringify({
        title: "Market cap",
        explanation: "A company's market value based on its shares and price.",
        keyPoints: ["Shares outstanding matter.", "Price changes market cap."],
        example: "A company with 1 million shares at $10 has a $10m market cap.",
        nextStep: "Learn why index weighting matters.",
      })
    );

    expect(result.ok).toBe(true);
  });

  it("rejects malformed JSON", () => {
    expect(validateTutorResult("{bad")).toEqual({
      ok: false,
      reason: "not_json_object",
    });
  });

  it("rejects invalid fields and oversized key points", () => {
    expect(
      validateTutorResult(
        JSON.stringify({
          title: "",
          explanation: "x",
          keyPoints: [],
        })
      ).ok
    ).toBe(false);

    expect(
      validateTutorResult(
        JSON.stringify({
          title: "Title",
          explanation: "Explanation",
          keyPoints: Array.from({ length: 7 }, () => "point"),
        })
      ).ok
    ).toBe(false);
  });
});
