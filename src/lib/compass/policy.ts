// Compass Agent's no-recommendation policy (Phase 4, Sections 5/6/42). A
// hard, server-side product policy: Compass must never provide a
// personalized investment recommendation. This is enforced in TWO
// independent layers, not one:
//
//   1. classifyMessageIntent (INPUT side) — runs BEFORE any DeepSeek call.
//      If the user's message is asking the assistant to decide/choose an
//      action for them, the engine returns a fixed safe redirect
//      immediately, without spending an LLM call at all (Section 38:
//      "avoid unnecessary LLM calls").
//   2. containsRecommendationLanguage (OUTPUT side) — a defense-in-depth
//      safety net over whatever DeepSeek actually returns, in case the
//      system prompt's own instructions aren't followed. If tripped, the
//      engine discards the model's text and substitutes the same safe
//      redirect rather than ever showing recommendation language.
//
// Section 6 is explicit: "Do NOT implement a naive keyword blocker...
// classify the semantic intent." The distinguishing signal used below is
// NOT the presence of financial vocabulary (buy/sell/invest — which
// appear in plainly educational questions too, e.g. "What does buying a
// stock mean?") — it's the "should I/we" (or an equivalent imperative
// asking the assistant to choose/decide/pick FOR the user) construction:
// a modal auxiliary + first-person subject that marks "make this decision
// for me," which is the actual semantic marker of advice-seeking. Every
// example in Section 6/42's own prohibited list matches this pattern;
// every example in its own allowed list does not — see policy.test.ts for
// the full, literal test of both lists.

const ADVICE_SEEKING_PATTERNS: RegExp[] = [
  // "Should I buy NVIDIA?", "Should I sell Bitcoin?", "Should I increase
  // Apple?", "What should I invest in?", "Which asset should I buy?",
  // "What should I rebalance?" — every one of these contains this exact
  // modal ("should") + first-person-subject ("I"/"we") construction.
  /\bshould\s+(i|we)\b/i,
  // Direct imperative decision-delegation that doesn't happen to use
  // "should" — "tell me what to buy", "pick a stock for me", "recommend
  // an asset to me" — still asking the assistant to choose FOR the user,
  // the same underlying intent "should I" captures.
  /\btell\s+me\s+(what|which)\s+to\s+(buy|sell|invest)/i,
  /\b(pick|choose)\s+(a|an|me)?\s*(stock|asset|coin|crypto|investment)\s*(for\s+me)?\b/i,
  /\b(recommend|suggest)\s+(a|an|some|me)?\s*(stock|asset|coin|crypto|investment)/i,
];

export type MessageIntent = "advice_seeking" | "neutral";

/** Pre-LLM-call classification of the user's message. `neutral` covers
 * every genuinely educational/analytical/comparative/scenario question —
 * these are the SAFE default, since a false negative here still passes
 * through the system prompt's own no-recommendation instructions AND the
 * output-side safety net below; a false positive would incorrectly block
 * a legitimate question, which is the failure mode to bias against. */
export function classifyMessageIntent(message: string): MessageIntent {
  return ADVICE_SEEKING_PATTERNS.some((pattern) => pattern.test(message)) ? "advice_seeking" : "neutral";
}

const RECOMMENDATION_LANGUAGE_PATTERNS: RegExp[] = [
  // Direct second-person directives — "You should buy...", "You should
  // sell...", "You should hold...", "You should increase/reduce/rebalance/
  // invest/allocate...". Excludes "what you should buy" / "whether you
  // should sell..." — the exact QUESTION-FRAMING Compass's own safe
  // redirect text uses to explain what it WON'T say (Section 5's own
  // worked examples: "I can't decide whether you should sell NVIDIA").
  // Those are refusal framings, never directives, and must never
  // themselves trip the very safety net they exist to satisfy.
  /(?<!what\s)(?<!whether\s)\byou\s+should\s+(buy|sell|hold|invest|increase|reduce|rebalance|allocate|open|close|enter|exit)\b/i,
  // First-person advisory framing — "I recommend...", "I suggest you...",
  // "my recommendation/advice is...".
  /\bi\s+recommend\b/i,
  /\bi\s+suggest\s+you\b/i,
  /\bmy\s+(recommendation|advice)\s+is\b/i,
  // Bare imperative trading directives a response might open with —
  // "Buy NVIDIA.", "Sell Tesla.", "Hold Apple." (Section 5's own
  // forbidden-examples list, verbatim).
  /^\s*(buy|sell|hold)\s+[a-z0-9.\-]+\s*[.!]?\s*$/im,
  /\b(open|close|enter|exit)\s+(this|the)\s+(position|trade)\b/i,
];

/** Output-side safety net (Section 5's forbidden-examples list, checked
 * literally). Only ever used to DECIDE whether to discard a response —
 * never to "fix" or rewrite it, since a partially-salvaged response could
 * still carry a recommendation the pattern didn't catch. */
export function containsRecommendationLanguage(text: string): boolean {
  return RECOMMENDATION_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/** The fixed, safe redirect Section 5 specifies verbatim for the two
 * worked examples — reused as the generic fallback for ANY advice-seeking
 * message or policy-tripped output, parameterized only by an optional
 * asset/topic name when one was identifiable from the message/context. */
export function buildSafeRedirect(topic: string | null): string {
  if (topic) {
    return `I can't tell you whether to buy, sell, or hold ${topic}. I can analyze the position, its contribution to your portfolio, recent performance, relevant news, and the risks involved.`;
  }
  return "I can't recommend what you should buy, sell, or hold. I can compare assets, explain their risks and performance, connect relevant news, and show how they relate to your existing portfolio.";
}
