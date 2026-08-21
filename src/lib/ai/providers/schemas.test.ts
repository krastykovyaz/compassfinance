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

  it("accepts French JSON without treating accented characters as invalid", () => {
    const result = validateTutorResult(
      JSON.stringify({
        title: "Capitalisation boursière",
        explanation: "La capitalisation boursière mesure la valeur totale des actions d'une entreprise.",
        keyPoints: ["Elle dépend du cours de l'action.", "Elle dépend aussi du nombre d'actions."],
        example: "Une entreprise avec un million d'actions à 10 € vaut environ 10 millions d'euros.",
        nextStep: "Comprendre la pondération par capitalisation.",
      })
    );

    expect(result.ok).toBe(true);
  });

  it("accepts Russian JSON and Unicode content", () => {
    const result = validateTutorResult(
      JSON.stringify({
        title: "Рыночная капитализация",
        explanation: "Рыночная капитализация показывает общую стоимость акций компании.",
        keyPoints: ["Она зависит от цены акции.", "Также важно количество акций в обращении."],
        example: "Если у компании миллион акций по 10 долларов, капитализация составляет около 10 миллионов долларов.",
        nextStep: "Изучите взвешивание индекса по капитализации.",
      })
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a JSON response wrapped in a markdown fence", () => {
    const result = validateTutorResult(
      `\`\`\`json
${JSON.stringify({
  title: "Рыночная капитализация",
  explanation: "Короткое объяснение.",
  keyPoints: ["Пункт один"],
})}
\`\`\``
    );

    expect(result.ok).toBe(true);
  });

  it("rejects malformed JSON", () => {
    expect(validateTutorResult("{bad")).toEqual({
      ok: false,
      reason: "not_json_object",
    });
  });

  it("rejects arrays and invalid fields", () => {
    expect(validateTutorResult("[]")).toEqual({
      ok: false,
      reason: "not_json_object",
    });

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
