// Compass Agent's context system (Phase 4, Section 7). A shared,
// client-and-server type — the client sends a CompassContext with every
// chat request (Section 24's `{conversationId?, message, context}`); the
// server independently RE-VALIDATES it (parseCompassContext) rather than
// trusting the client-supplied shape, since a context also selects which
// data the Financial Context Builder is allowed to read (e.g. never let a
// tampered "PORTFOLIO / IBKR" context leak into an "ASSET" response's
// data-fetch path — see financial-context-builder.ts).
//
// No "server-only" import here deliberately: the UI needs these exact
// same types (for the context badge, the entry button, and suggested
// questions), and parseCompassContext's job — reject anything malformed —
// is equally useful on the client (defensive local state) and mandatory
// on the server (trust boundary).

export type PortfolioContextSource = "ALL" | "PAPER" | "TRADING212" | "IBKR" | "HYPERLIQUID";

const PORTFOLIO_SOURCES: readonly PortfolioContextSource[] = ["ALL", "PAPER", "TRADING212", "IBKR", "HYPERLIQUID"];

export type CompassContext =
  | { type: "HOME" }
  | { type: "PORTFOLIO"; source: PortfolioContextSource }
  | { type: "NEWS"; articleId?: string }
  | { type: "ASSET"; assetId: string }
  | { type: "LEARNING"; assetId: string; lessonId: string | null }
  | { type: "TRADING212_CONNECTION" }
  | { type: "IBKR_CONNECTION" }
  | { type: "HYPERLIQUID_CONNECTION" }
  | { type: "PROFILE" };

export type CompassContextType = CompassContext["type"];

const MAX_ID_LENGTH = 100;

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Strictly re-validates a context payload — never trusts the client's
 * shape outright (Section 24: this is a trust-boundary input, same as
 * every other client-supplied field this codebase validates before use).
 * Returns null for anything malformed rather than guessing a fallback,
 * so the caller (the chat route) can reject the request cleanly. */
export function parseCompassContext(raw: unknown): CompassContext | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  switch (obj.type) {
    case "HOME":
      return { type: "HOME" };
    case "PROFILE":
      return { type: "PROFILE" };
    case "TRADING212_CONNECTION":
      return { type: "TRADING212_CONNECTION" };
    case "IBKR_CONNECTION":
      return { type: "IBKR_CONNECTION" };
    case "HYPERLIQUID_CONNECTION":
      return { type: "HYPERLIQUID_CONNECTION" };
    case "PORTFOLIO":
      return PORTFOLIO_SOURCES.includes(obj.source as PortfolioContextSource)
        ? { type: "PORTFOLIO", source: obj.source as PortfolioContextSource }
        : null;
    case "NEWS":
      // articleId is optional — "browsing the news feed generally" (no
      // single article selected yet) is a real, distinct context from
      // "reading this specific article", not an error.
      if (obj.articleId === undefined) return { type: "NEWS" };
      return isSafeId(obj.articleId) ? { type: "NEWS", articleId: obj.articleId } : null;
    case "ASSET":
      return isSafeId(obj.assetId) ? { type: "ASSET", assetId: obj.assetId } : null;
    case "LEARNING":
      if (!isSafeId(obj.assetId)) return null;
      return {
        type: "LEARNING",
        assetId: obj.assetId,
        lessonId: obj.lessonId != null && isSafeId(obj.lessonId) ? obj.lessonId : null,
      };
    default:
      return null;
  }
}

/** The single, canonical encoding of a CompassContext into the two plain
 * columns CompassConversation actually stores (contextType/contextKey) —
 * the ONE place this mapping is defined, used both when creating a
 * conversation row and when a route needs to describe an existing one. */
export function encodeContextKey(context: CompassContext): string | null {
  switch (context.type) {
    case "PORTFOLIO":
      return context.source;
    case "NEWS":
      return context.articleId ?? null;
    case "ASSET":
      return context.assetId;
    case "LEARNING":
      return context.lessonId ? `${context.assetId}:${context.lessonId}` : context.assetId;
    default:
      return null;
  }
}

/** The inverse of encodeContextKey — reconstructs a CompassContext from
 * the two stored columns, e.g. when loading an existing conversation for
 * a follow-up message (Section 7: "context must persist during follow-up
 * messages"). Returns null for a row whose stored shape is no longer
 * valid rather than guessing — same "reject, don't guess" stance as
 * parseCompassContext. */
export function decodeContext(contextType: string, contextKey: string | null): CompassContext | null {
  switch (contextType) {
    case "HOME":
      return { type: "HOME" };
    case "PROFILE":
      return { type: "PROFILE" };
    case "TRADING212_CONNECTION":
      return { type: "TRADING212_CONNECTION" };
    case "IBKR_CONNECTION":
      return { type: "IBKR_CONNECTION" };
    case "HYPERLIQUID_CONNECTION":
      return { type: "HYPERLIQUID_CONNECTION" };
    case "PORTFOLIO":
      return contextKey && PORTFOLIO_SOURCES.includes(contextKey as PortfolioContextSource)
        ? { type: "PORTFOLIO", source: contextKey as PortfolioContextSource }
        : null;
    case "NEWS":
      return { type: "NEWS", articleId: contextKey ?? undefined };
    case "ASSET":
      return contextKey ? { type: "ASSET", assetId: contextKey } : null;
    case "LEARNING": {
      if (!contextKey) return null;
      const [assetId, lessonId] = contextKey.split(":");
      return assetId ? { type: "LEARNING", assetId, lessonId: lessonId ?? null } : null;
    }
    default:
      return null;
  }
}
