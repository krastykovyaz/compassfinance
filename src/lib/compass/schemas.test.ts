import { describe, expect, it } from "vitest";
import { validateCompassResult } from "./schemas";

describe("validateCompassResult", () => {
  it("accepts a minimal valid response (text only)", () => {
    const result = validateCompassResult(JSON.stringify({ text: "Your portfolio is up 2% today." }));
    expect(result).toEqual({ ok: true, data: { text: "Your portfolio is up 2% today.", blocks: [], suggestedFollowUps: [] } });
  });

  it("rejects non-JSON text", () => {
    const result = validateCompassResult("not json at all");
    expect(result.ok).toBe(false);
  });

  it("rejects a JSON array (not an object)", () => {
    const result = validateCompassResult("[1,2,3]");
    expect(result.ok).toBe(false);
  });

  it("rejects a response with no text field", () => {
    const result = validateCompassResult(JSON.stringify({ blocks: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_text");
  });

  it("unwraps a markdown code fence around the JSON", () => {
    const result = validateCompassResult('```json\n{"text": "Hello"}\n```');
    expect(result).toEqual({ ok: true, data: { text: "Hello", blocks: [], suggestedFollowUps: [] } });
  });

  it("validates a full response with every block type", () => {
    const raw = {
      text: "Here's your portfolio breakdown.",
      blocks: [
        { type: "metric", label: "Portfolio change", value: "+€184", period: "today" },
        { type: "portfolio_summary", source: "TRADING212", label: "Trading 212", totalValue: 10400, currency: "EUR", changeToday: 84, changeTodayPercent: 0.8 },
        { type: "position", symbol: "NVDA", name: "NVIDIA Corp.", quantity: 5, value: 4180, currency: "EUR", pnl: 96, source: "IBKR" },
        { type: "activity", description: "Sold 10 MSFT", amount: 4230, currency: "USD", date: "2026-03-12", source: "IBKR" },
        { type: "risk", label: "Concentration", description: "NVIDIA and Apple represent 38% of your portfolio." },
        { type: "news", title: "NVIDIA announces new AI chips", source: "Reuters", url: "https://example.com/article" },
        { type: "asset", assetId: "nvda", name: "NVIDIA Corp.", symbol: "NVDA" },
        { type: "education", title: "What is a futures contract?", body: "An agreement to buy or sell..." },
        { type: "scenario", label: "Bitcoin -20%", assumption: "Everything else stays the same.", impact: "Portfolio would fall ~3.2%." },
        { type: "data_limitation", provider: "interactive_brokers", message: "Fee data is unavailable through the current API source." },
        { type: "source", provider: "trading212", label: "Trading 212" },
      ],
      suggestedFollowUps: ["Why did NVIDIA rise?", "What affected Bitcoin today?"],
    };
    const result = validateCompassResult(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.blocks).toHaveLength(11);
      expect(result.data.suggestedFollowUps).toEqual(["Why did NVIDIA rise?", "What affected Bitcoin today?"]);
    }
  });

  it("drops an individual invalid block rather than rejecting the whole response", () => {
    const raw = {
      text: "Partial response",
      blocks: [
        { type: "metric", label: "Valid", value: "€100" },
        { type: "metric", label: "Missing value" }, // invalid — no `value`
        { type: "not_a_real_type", foo: "bar" }, // unrecognized type
      ],
    };
    const result = validateCompassResult(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.blocks).toHaveLength(1);
      expect(result.data.blocks[0]).toEqual({ type: "metric", label: "Valid", value: "€100" });
    }
  });

  it("never fabricates a default for a missing optional field — omits it instead", () => {
    const result = validateCompassResult(JSON.stringify({ text: "x", blocks: [{ type: "metric", label: "L", value: "V" }] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.blocks[0]).not.toHaveProperty("period");
    }
  });

  it("caps blocks and follow-ups to their documented maximums rather than accepting unbounded arrays", () => {
    const manyBlocks = Array.from({ length: 30 }, () => ({ type: "metric", label: "L", value: "V" }));
    const manyFollowUps = Array.from({ length: 20 }, (_, i) => `Question ${i}`);
    const result = validateCompassResult(JSON.stringify({ text: "x", blocks: manyBlocks, suggestedFollowUps: manyFollowUps }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.blocks.length).toBeLessThanOrEqual(12);
      expect(result.data.suggestedFollowUps.length).toBeLessThanOrEqual(4);
    }
  });

  it("de-duplicates identical suggested follow-ups rather than showing the same question as two buttons (live reported bug)", () => {
    const result = validateCompassResult(
      JSON.stringify({ text: "x", suggestedFollowUps: ["Объясни это на моём портфеле", "Объясни это на моём портфеле", "What are the risks?"] })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestedFollowUps).toEqual(["Объясни это на моём портфеле", "What are the risks?"]);
    }
  });

  it("de-duplication is case/whitespace-insensitive", () => {
    const result = validateCompassResult(JSON.stringify({ text: "x", suggestedFollowUps: ["Why did it move?", "why did it move? ", "WHY DID IT MOVE?"] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestedFollowUps).toEqual(["Why did it move?"]);
    }
  });

  it("de-duplicates BEFORE capping to the maximum, so a duplicate never crowds out a later distinct suggestion", () => {
    const result = validateCompassResult(
      JSON.stringify({ text: "x", suggestedFollowUps: ["A", "A", "A", "B", "C", "D"] })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestedFollowUps).toEqual(["A", "B", "C", "D"]);
    }
  });

  it("rejects an oversized text field rather than truncating silently", () => {
    const result = validateCompassResult(JSON.stringify({ text: "x".repeat(5000) }));
    expect(result.ok).toBe(false);
  });
});
