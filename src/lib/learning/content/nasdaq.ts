import { AssetLearningPath } from "./types";

export const nasdaqLearningPath: AssetLearningPath = {
  assetId: "nasdaq",
  title: "Understanding the Nasdaq 100",
  shortDescription: "A technology- and growth-heavy index, and how it differs from the S&P 500.",
  category: "index",
  completionReward: 100,
  lessons: [
    {
      id: "nasdaq-what-it-is",
      title: "What does the Nasdaq 100 represent?",
      objective: "Explain what the Nasdaq 100 tracks and why it leans toward technology.",
      explanation:
        "The Nasdaq 100 tracks 100 of the largest non-financial companies listed on the Nasdaq stock exchange. Because Nasdaq has historically been the exchange of choice for technology companies, the index ends up heavily weighted toward tech and other growth-oriented sectors — think software, semiconductors, internet platforms, and consumer technology.",
      keyTakeaways: [
        "Tracks 100 large non-financial companies listed on Nasdaq.",
        "Heavily tilted toward technology and growth sectors.",
        "Excludes financial companies like banks and insurers by design.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "nasdaq-concentration",
      title: "Concentration, growth and volatility",
      objective: "Describe how concentration in a handful of large companies affects the index.",
      explanation:
        "Like the S&P 500, the Nasdaq 100 is market-cap weighted, but because it's a narrower, more sector-concentrated list, its largest handful of companies can make up a bigger share of the index's total value. That concentration means the index can move more sharply — in either direction — than a more broadly diversified benchmark, since a strong or weak quarter from just a few giant companies has an outsized effect.",
      keyTakeaways: [
        "Market-cap weighted, same mechanic as the S&P 500.",
        "Fewer sectors means more concentration in its top holdings.",
        "Higher concentration can mean larger swings, up or down.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "nasdaq-vs-sp500",
      title: "How it differs from the S&P 500",
      objective: "Compare the Nasdaq 100 to the S&P 500 in sector mix and behavior.",
      explanation:
        "The S&P 500 spans nearly every sector of the U.S. economy — financials, healthcare, industrials, energy, and more — while the Nasdaq 100 is concentrated in technology and growth-oriented companies and excludes financials entirely. In practice, this means the Nasdaq 100 often reacts more strongly to shifts in interest-rate expectations and technology-sector news, since growth companies' valuations are more sensitive to how future earnings are discounted.",
      keyTakeaways: [
        "S&P 500 is broad across sectors; Nasdaq 100 is tech/growth-concentrated.",
        "Nasdaq 100 tends to react more to rate expectations and tech-sector news.",
        "Neither index is inherently \"better\" — they represent different slices of the market.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "nasdaq-q1",
      lessonId: "nasdaq-what-it-is",
      question: "What does the Nasdaq 100 primarily track?",
      options: [
        "100 of the largest non-financial companies on Nasdaq",
        "Every company listed on Nasdaq",
        "Only technology startups",
        "U.S. government bonds",
      ],
      correctAnswer: 0,
      explanation: "It's a curated list of 100 large non-financial Nasdaq-listed companies.",
      difficulty: "easy",
    },
    {
      id: "nasdaq-q2",
      lessonId: "nasdaq-what-it-is",
      question: "Which type of company is excluded from the Nasdaq 100 by design?",
      options: ["Technology companies", "Financial companies", "Consumer companies", "Healthcare companies"],
      correctAnswer: 1,
      explanation: "Financial companies (banks, insurers, etc.) are excluded from the index.",
      difficulty: "easy",
    },
    {
      id: "nasdaq-q3",
      lessonId: "nasdaq-concentration",
      question: "Why can the Nasdaq 100 be more concentrated than the S&P 500?",
      options: [
        "It has fewer sectors and a narrower company list",
        "It only includes one company",
        "It's equally weighted across all 100 companies",
        "It excludes large companies",
      ],
      correctAnswer: 0,
      explanation: "A narrower sector mix means the largest holdings can make up a bigger share of the index.",
      difficulty: "medium",
    },
    {
      id: "nasdaq-q4",
      lessonId: "nasdaq-concentration",
      question:
        "If a handful of the Nasdaq 100's largest companies report weak earnings in the same quarter, what's the likely effect on the index?",
      options: [
        "No effect, since the index is diversified",
        "A potentially outsized move, since those companies carry more weight",
        "The index would be unaffected by earnings",
        "Only financial stocks would react",
      ],
      correctAnswer: 1,
      explanation: "Because top holdings carry more weight, their results can move the whole index more than smaller names would.",
      difficulty: "medium",
    },
    {
      id: "nasdaq-q5",
      lessonId: "nasdaq-vs-sp500",
      question: "Which statement best compares the Nasdaq 100 to the S&P 500?",
      options: [
        "They track identical companies",
        "The Nasdaq 100 is broader and more diversified",
        "The Nasdaq 100 is more concentrated in tech/growth; the S&P 500 spans more sectors",
        "The S&P 500 excludes financial companies",
      ],
      correctAnswer: 2,
      explanation: "The Nasdaq 100 is growth/tech-concentrated, while the S&P 500 spans nearly every sector.",
      difficulty: "hard",
    },
    {
      id: "nasdaq-q6",
      lessonId: "nasdaq-vs-sp500",
      question: "Why might the Nasdaq 100 react more sharply than the S&P 500 to changing interest-rate expectations?",
      options: [
        "It contains only bonds",
        "Growth companies' valuations are more sensitive to how future earnings are discounted",
        "It has no exposure to the economy",
        "Interest rates don't affect stock indices",
      ],
      correctAnswer: 1,
      explanation: "Growth-heavy indexes tend to be more sensitive to discount-rate changes than broader, more balanced indexes.",
      difficulty: "hard",
    },
  ],
};
