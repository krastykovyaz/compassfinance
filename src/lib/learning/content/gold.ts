import { AssetLearningPath } from "./types";

export const goldLearningPath: AssetLearningPath = {
  assetId: "gold",
  title: "Understanding Gold",
  shortDescription: "A commodity investors use differently than stocks — no earnings, no dividends.",
  category: "commodity",
  completionReward: 100,
  lessons: [
    {
      id: "gold-what-it-represents",
      title: "What gold represents as an investment",
      objective: "Explain why gold is fundamentally different from a stock.",
      explanation:
        "Unlike a stock, gold isn't a claim on a company's future earnings — it doesn't pay dividends, and its price isn't driven by quarterly results or a business model. Its value comes from its physical scarcity, its long history as a store of value across cultures and economies, and ongoing demand from jewelry, industrial uses, and central bank reserves. Investors typically hold gold through physical bullion, exchange-traded funds that track its price, or mining company stocks (which behave more like stocks than gold itself).",
      keyTakeaways: [
        "Gold pays no dividends and isn't tied to a company's earnings.",
        "Its value comes from scarcity, historical role as a store of value, and demand.",
        "It can be held as physical bullion, an ETF, or via mining stocks.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "gold-inflation-real-rates",
      title: "Inflation, real rates, and safe-haven demand",
      objective: "Explain what typically drives gold's price up or down.",
      explanation:
        "Gold's price is often discussed in relation to inflation and \"real\" interest rates (interest rates after accounting for inflation). Because gold generates no yield of its own, it tends to become relatively more attractive when real rates are low or negative — the opportunity cost of holding a non-yielding asset shrinks. Gold is also often described as a \"safe-haven\" asset: during periods of economic or geopolitical stress, some investors turn to it as a way to diversify away from stocks and currencies, though this pattern isn't guaranteed to hold in every crisis.",
      keyTakeaways: [
        "Gold often moves inversely with real interest rates.",
        "Low or negative real rates can make non-yielding gold relatively more attractive.",
        "It's often treated as a \"safe-haven\" asset during stress, though not reliably every time.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "gold-no-earnings",
      title: "No company earnings or dividends",
      objective: "Explain the practical implication of gold generating no income.",
      explanation:
        "Because gold produces no earnings, dividends, or interest, an investor's return depends entirely on its price changing — there's no underlying cash flow to fall back on while waiting. This is a meaningful difference from owning a stock or bond, where an investor can earn income even if the price doesn't move. It's a structural feature of the asset to understand, not a claim about whether gold is a good or bad investment.",
      keyTakeaways: [
        "Gold generates no earnings, dividends, or interest.",
        "Returns depend entirely on price appreciation, not income.",
        "This is a structural difference from stocks and bonds, not a value judgment.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "gold-q1",
      lessonId: "gold-what-it-represents",
      question: "Does gold pay dividends?",
      options: ["No", "Yes, quarterly", "Yes, but only to large investors", "Only during recessions"],
      correctAnswer: 0,
      explanation: "Gold pays no dividends — it's not a claim on a company's earnings.",
      difficulty: "easy",
    },
    {
      id: "gold-q2",
      lessonId: "gold-what-it-represents",
      question: "Which of these is a common way to invest in gold?",
      options: ["An ETF that tracks gold's price", "A checking account", "A corporate bond", "A rental property"],
      correctAnswer: 0,
      explanation: "Gold-tracking ETFs are one common way investors gain exposure without holding physical bullion.",
      difficulty: "easy",
    },
    {
      id: "gold-q3",
      lessonId: "gold-inflation-real-rates",
      question: "What tends to happen to gold's relative appeal when real interest rates are low or negative?",
      options: [
        "It can become relatively more attractive",
        "It always becomes worthless",
        "It has no relationship to interest rates",
        "It automatically pays a higher dividend",
      ],
      correctAnswer: 0,
      explanation: "Low real rates reduce the opportunity cost of holding a non-yielding asset like gold.",
      difficulty: "medium",
    },
    {
      id: "gold-q4",
      lessonId: "gold-inflation-real-rates",
      question: "What does \"safe-haven demand\" for gold refer to?",
      options: [
        "Investors turning to gold during periods of economic or geopolitical stress",
        "A guarantee that gold always rises during a crisis",
        "Gold's use in jewelry only",
        "A government requirement to buy gold",
      ],
      correctAnswer: 0,
      explanation: "Some investors turn to gold during periods of stress, though this pattern isn't reliable in every case.",
      difficulty: "medium",
    },
    {
      id: "gold-q5",
      lessonId: "gold-no-earnings",
      question: "Since gold produces no income, what does an investor's return depend entirely on?",
      options: [
        "The price of gold changing",
        "Quarterly dividend payments",
        "Interest paid by the gold itself",
        "Company earnings reports",
      ],
      correctAnswer: 0,
      explanation: "With no income generated, return comes entirely from price appreciation (or depreciation).",
      difficulty: "hard",
    },
    {
      id: "gold-q6",
      lessonId: "gold-no-earnings",
      question: "How does gold's lack of income compare to owning a stock or bond?",
      options: [
        "Stocks and bonds can generate income even if price doesn't move; gold cannot",
        "Gold generates more income than any stock",
        "Stocks and bonds also generate zero income",
        "There is no difference at all",
      ],
      correctAnswer: 0,
      explanation: "Unlike gold, stocks can pay dividends and bonds can pay interest independent of price movement.",
      difficulty: "hard",
    },
  ],
};
