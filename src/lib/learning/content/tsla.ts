import { AssetLearningPath } from "./types";

export const tslaLearningPath: AssetLearningPath = {
  assetId: "tsla",
  title: "Understanding Tesla Inc.",
  shortDescription: "The EV and energy business, growth expectations, and why the stock is volatile.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "tsla-business-segments",
      title: "The EV business and other segments",
      objective: "Describe Tesla's main business segments.",
      explanation:
        "Tesla's core business is designing, manufacturing, and selling electric vehicles (EVs). Alongside vehicles, it also has an energy generation and storage segment (solar products and battery systems like Powerwall/Megapack) and has talked publicly about ambitions in robotics and autonomous driving software. Vehicle sales remain the large majority of current revenue, with the other segments smaller but often central to how investors think about the company's future.",
      keyTakeaways: [
        "Core revenue comes from designing, building, and selling EVs.",
        "Energy generation and storage (solar, batteries) is a smaller but real segment.",
        "Software/autonomy and robotics ambitions factor heavily into how the stock is discussed.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "tsla-growth-competition",
      title: "Growth expectations and competition",
      objective: "Explain how growth expectations and rising competition shape the stock.",
      explanation:
        "Much of Tesla's valuation has historically reflected expectations of continued rapid growth — in vehicle deliveries, new products, and potential future businesses like autonomy. At the same time, competition in the EV market has grown substantially, from both established automakers and newer entrants, which puts pressure on pricing and market share. Investors watch delivery numbers, margins, and new-product timelines closely because they speak directly to whether that growth story is on track.",
      keyTakeaways: [
        "Valuation has leaned heavily on expectations of continued rapid growth.",
        "EV competition has increased from both legacy automakers and new entrants.",
        "Delivery numbers and margins are closely watched growth indicators.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "tsla-volatility",
      title: "Why the stock is volatile",
      objective: "Identify factors that contribute to Tesla's price volatility.",
      explanation:
        "Tesla's stock has historically moved more sharply than the broader market. Contributing factors include high growth expectations baked into the price (which amplify reactions to news), a public-facing CEO whose statements can move the stock, sensitivity to delivery and margin numbers each quarter, and the fact that its valuation reflects not just current auto sales but bets on future businesses that haven't fully materialized yet.",
      keyTakeaways: [
        "High embedded growth expectations amplify reactions to news, good or bad.",
        "Quarterly delivery and margin numbers are closely watched volatility triggers.",
        "Part of the valuation reflects future businesses that aren't fully proven yet.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "tsla-q1",
      lessonId: "tsla-business-segments",
      question: "What is Tesla's core, largest revenue segment?",
      options: ["Electric vehicles", "Insurance", "Cloud computing", "Retail banking"],
      correctAnswer: 0,
      explanation: "Vehicle sales remain the large majority of Tesla's current revenue.",
      difficulty: "easy",
    },
    {
      id: "tsla-q2",
      lessonId: "tsla-business-segments",
      question: "Which of these is part of Tesla's energy segment?",
      options: ["Solar products and battery storage", "Airline tickets", "Grocery delivery", "Mortgage lending"],
      correctAnswer: 0,
      explanation: "Solar products and battery storage systems like Powerwall/Megapack make up the energy segment.",
      difficulty: "easy",
    },
    {
      id: "tsla-q3",
      lessonId: "tsla-growth-competition",
      question: "What has increased significantly in the EV market in recent years?",
      options: ["Competition from other automakers", "The number of gas stations", "Regulation of bicycles", "Demand for typewriters"],
      correctAnswer: 0,
      explanation: "Competition in EVs has grown from both legacy automakers and new entrants.",
      difficulty: "medium",
    },
    {
      id: "tsla-q4",
      lessonId: "tsla-growth-competition",
      question: "Why do investors watch Tesla's quarterly delivery numbers closely?",
      options: [
        "They speak directly to whether the growth story is on track",
        "Deliveries have no connection to the stock",
        "They only matter once a decade",
        "Delivery numbers are unrelated to valuation",
      ],
      correctAnswer: 0,
      explanation: "Delivery numbers are a direct, frequent signal of whether growth expectations are being met.",
      difficulty: "medium",
    },
    {
      id: "tsla-q5",
      lessonId: "tsla-volatility",
      question: "Why can high embedded growth expectations make a stock more volatile?",
      options: [
        "They amplify the market's reaction to news, positive or negative",
        "They guarantee the stock never falls",
        "They eliminate all risk",
        "They have no effect on price movement",
      ],
      correctAnswer: 0,
      explanation: "When a lot of future growth is already priced in, both good and bad news can trigger larger moves.",
      difficulty: "hard",
    },
    {
      id: "tsla-q6",
      lessonId: "tsla-volatility",
      question: "What does it mean that part of Tesla's valuation reflects \"future businesses that aren't fully proven yet\"?",
      options: [
        "The stock price only reflects current car sales",
        "Some of the price reflects bets on things like autonomy that haven't fully materialized",
        "Tesla has no exposure to future plans",
        "Future plans are guaranteed to succeed",
      ],
      correctAnswer: 1,
      explanation: "A portion of the valuation is a bet on future outcomes, which adds uncertainty and volatility.",
      difficulty: "hard",
    },
  ],
};
