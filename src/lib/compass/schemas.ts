// Structured output schema + strict validation for Compass Agent
// responses (Phase 4, Section 25). Mirrors lib/ai/providers/schemas.ts's
// own rigor (validateTutorResult) — DeepSeek's raw JSON text is NEVER
// rendered directly; every field is validated, length-capped, and
// type-checked before it reaches the UI. If the model's JSON fails
// validation, the caller (compass-engine.ts) falls back to a safe text
// response rather than rendering anything unvalidated (Section 25: "If
// structured output fails... otherwise return a safe text response").

export type CompassBlock =
  | { type: "metric"; label: string; value: string; period?: string }
  | {
      type: "portfolio_summary";
      source: string;
      label: string;
      totalValue: number | null;
      currency: string | null;
      changeToday: number | null;
      changeTodayPercent: number | null;
    }
  | {
      type: "position";
      symbol: string;
      name: string | null;
      quantity: number | null;
      value: number | null;
      currency: string | null;
      pnl: number | null;
      source: string;
    }
  | { type: "activity"; description: string; amount: number | null; currency: string | null; date: string; source: string }
  | { type: "risk"; label: string; description: string }
  | { type: "news"; title: string; source: string; url: string }
  | { type: "asset"; assetId: string; name: string; symbol: string }
  | { type: "education"; title: string; body: string }
  | { type: "scenario"; label: string; assumption: string; impact: string }
  | { type: "data_limitation"; provider: string; message: string }
  | { type: "source"; provider: string; label: string };

export type CompassBlockType = CompassBlock["type"];

export type CompassAgentResult = {
  text: string;
  blocks: CompassBlock[];
  suggestedFollowUps: string[];
};

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const MAX_TEXT_LEN = 4000;
const MAX_SHORT_LEN = 300;
const MAX_BLOCKS = 12;
const MAX_FOLLOW_UPS = 4;

function str(value: unknown, maxLen: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen ? value : null;
}
function optStr(value: unknown, maxLen: number): string | undefined {
  return value === undefined ? undefined : (str(value, maxLen) ?? undefined);
}
function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Case/whitespace-insensitive de-dup, keeping first-seen order and
 * original casing — a live reported bug: DeepSeek sometimes returns the
 * same suggested follow-up twice (identical text), which rendered as two
 * visually indistinguishable buttons in the sheet. Applied BEFORE the
 * MAX_FOLLOW_UPS cap so a duplicate never crowds out a genuinely distinct
 * suggestion that came after it. */
function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * DeepSeek normally returns raw JSON in JSON mode, but a model can
 * sometimes wrap an otherwise valid object in ```json ... ``` despite the
 * request — same defensive unwrap as lib/ai/providers/schemas.ts, never
 * attempting to "repair" genuinely malformed JSON.
 */
function normalizeJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(normalizeJsonText(text));
  } catch {
    return null;
  }
}

/** Validates ONE block. Returns null (never throws) for a block whose
 * `type` isn't recognized or whose required fields don't validate — an
 * invalid individual block is DROPPED (see validateCompassResult), never
 * allowed to invalidate the whole response over one bad block, and never
 * rendered partially with fabricated defaults for its missing fields. */
function validateBlock(raw: unknown): CompassBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;

  switch (b.type) {
    case "metric": {
      const label = str(b.label, MAX_SHORT_LEN);
      const value = str(b.value, MAX_SHORT_LEN);
      if (!label || !value) return null;
      const period = optStr(b.period, MAX_SHORT_LEN);
      return { type: "metric", label, value, ...(period !== undefined ? { period } : {}) };
    }
    case "portfolio_summary": {
      const source = str(b.source, MAX_SHORT_LEN);
      const label = str(b.label, MAX_SHORT_LEN);
      if (!source || !label) return null;
      return {
        type: "portfolio_summary",
        source,
        label,
        totalValue: numOrNull(b.totalValue),
        currency: str(b.currency, 10),
        changeToday: numOrNull(b.changeToday),
        changeTodayPercent: numOrNull(b.changeTodayPercent),
      };
    }
    case "position": {
      const symbol = str(b.symbol, MAX_SHORT_LEN);
      const source = str(b.source, MAX_SHORT_LEN);
      if (!symbol || !source) return null;
      return {
        type: "position",
        symbol,
        name: str(b.name, MAX_SHORT_LEN),
        quantity: numOrNull(b.quantity),
        value: numOrNull(b.value),
        currency: str(b.currency, 10),
        pnl: numOrNull(b.pnl),
        source,
      };
    }
    case "activity": {
      const description = str(b.description, MAX_TEXT_LEN);
      const date = str(b.date, MAX_SHORT_LEN);
      const source = str(b.source, MAX_SHORT_LEN);
      if (!description || !date || !source) return null;
      return { type: "activity", description, amount: numOrNull(b.amount), currency: str(b.currency, 10), date, source };
    }
    case "risk": {
      const label = str(b.label, MAX_SHORT_LEN);
      const description = str(b.description, MAX_TEXT_LEN);
      if (!label || !description) return null;
      return { type: "risk", label, description };
    }
    case "news": {
      const title = str(b.title, MAX_TEXT_LEN);
      const source = str(b.source, MAX_SHORT_LEN);
      const url = str(b.url, 1000);
      if (!title || !source || !url) return null;
      return { type: "news", title, source, url };
    }
    case "asset": {
      const assetId = str(b.assetId, MAX_SHORT_LEN);
      const name = str(b.name, MAX_SHORT_LEN);
      const symbol = str(b.symbol, MAX_SHORT_LEN);
      if (!assetId || !name || !symbol) return null;
      return { type: "asset", assetId, name, symbol };
    }
    case "education": {
      const title = str(b.title, MAX_SHORT_LEN);
      const body = str(b.body, MAX_TEXT_LEN);
      if (!title || !body) return null;
      return { type: "education", title, body };
    }
    case "scenario": {
      const label = str(b.label, MAX_SHORT_LEN);
      const assumption = str(b.assumption, MAX_TEXT_LEN);
      const impact = str(b.impact, MAX_TEXT_LEN);
      if (!label || !assumption || !impact) return null;
      return { type: "scenario", label, assumption, impact };
    }
    case "data_limitation": {
      const provider = str(b.provider, MAX_SHORT_LEN);
      const message = str(b.message, MAX_TEXT_LEN);
      if (!provider || !message) return null;
      return { type: "data_limitation", provider, message };
    }
    case "source": {
      const provider = str(b.provider, MAX_SHORT_LEN);
      const label = str(b.label, MAX_SHORT_LEN);
      if (!provider || !label) return null;
      return { type: "source", provider, label };
    }
    default:
      return null;
  }
}

/** Top-level validator for the full DeepSeek response. `text` is
 * mandatory (the one field the UI can always fall back to rendering);
 * `blocks`/`suggestedFollowUps` default to empty arrays rather than
 * failing the whole response when absent or partially invalid — Section
 * 25: "never blindly render arbitrary model JSON," not "reject the
 * entire response over one cosmetic field." */
export function validateCompassResult(raw: string): ValidationResult<CompassAgentResult> {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "not_json_object" };
  }
  const obj = parsed as Record<string, unknown>;

  const text = str(obj.text, MAX_TEXT_LEN);
  if (!text) return { ok: false, reason: "invalid_text" };

  const blocks: CompassBlock[] = Array.isArray(obj.blocks)
    ? obj.blocks
        .slice(0, MAX_BLOCKS)
        .map(validateBlock)
        .filter((b): b is CompassBlock => b !== null)
    : [];

  const suggestedFollowUps: string[] = Array.isArray(obj.suggestedFollowUps)
    ? dedupeStrings(
        obj.suggestedFollowUps
          .map((q) => str(q, MAX_SHORT_LEN))
          .filter((q): q is string => q !== null)
      ).slice(0, MAX_FOLLOW_UPS)
    : [];

  return { ok: true, data: { text, blocks, suggestedFollowUps } };
}
