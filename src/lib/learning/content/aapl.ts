import { AssetLearningPath } from "./types";

export const aaplLearningPath: AssetLearningPath = {
  assetId: "aapl",
  title: "Understanding Apple Inc.",
  shortDescription: "How owning a single company like Apple differs from owning an index.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "aapl-business-model",
      title: "Apple's business model",
      objective: "Describe how Apple makes money.",
      explanation:
        "Apple designs and sells hardware — iPhone, Mac, iPad, Watch — and increasingly earns recurring revenue from services layered on top of that hardware: the App Store, iCloud, Apple Music, and subscriptions like Apple TV+. The hardware sells the ecosystem; the services turn a one-time purchase into an ongoing relationship.",
      keyTakeaways: [
        "Core revenue comes from hardware: iPhone, Mac, iPad, Watch.",
        "Services (App Store, iCloud, subscriptions) are a growing, recurring revenue stream.",
        "Hardware and services reinforce each other — the ecosystem is the product.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "aapl-earnings-valuation",
      title: "Revenue, earnings and valuation basics",
      objective: "Explain, in plain terms, what investors watch in Apple's results and why price isn't the same as value.",
      explanation:
        "Each quarter, Apple reports revenue (total sales) and earnings (profit after costs). Investors compare these to analyst expectations — a \"beat\" or \"miss\" can move the stock even if the absolute numbers are large, because the market is pricing in expectations, not just current results. A stock's price also reflects a valuation — roughly, how much investors are willing to pay today for a claim on future earnings — which is a separate question from whether the company itself is doing well.",
      keyTakeaways: [
        "Revenue is total sales; earnings are profit after costs.",
        "Markets react to results versus expectations, not just the raw numbers.",
        "Price reflects valuation — what investors will pay for future earnings — not just current performance.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "aapl-company-risk",
      title: "Company-specific risk",
      objective: "Identify what makes owning a single stock riskier than owning a broad index.",
      explanation:
        "When you own an index like the S&P 500, one company's bad quarter is diluted across 499 others. When you own a single stock like Apple, you're exposed to everything specific to that one company: a product cycle that underdelivers, supply-chain disruption, regulatory action in a key market, or a shift in consumer demand. That concentrated exposure is the trade-off for potentially larger gains if the company performs well.",
      keyTakeaways: [
        "A single stock carries risks specific to that one company — an index spreads them out.",
        "Product cycles, supply chains, and regulation are examples of company-specific risk.",
        "Concentrated exposure cuts both ways: bigger potential upside, bigger potential downside.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "aapl-q1",
      lessonId: "aapl-business-model",
      question: "What are Apple's two broad revenue categories?",
      options: ["Hardware and services", "Advertising and retail", "Mining and manufacturing", "Loans and insurance"],
      correctAnswer: 0,
      explanation: "Apple earns from hardware sales and a growing services business.",
      difficulty: "easy",
    },
    {
      id: "aapl-q2",
      lessonId: "aapl-business-model",
      question: "Which of these is an example of Apple's services revenue?",
      options: ["iPhone sales", "App Store and iCloud subscriptions", "Mac sales", "Retail store rent"],
      correctAnswer: 1,
      explanation: "App Store and iCloud are recurring, subscription-style services revenue.",
      difficulty: "easy",
    },
    {
      id: "aapl-q3",
      lessonId: "aapl-earnings-valuation",
      question: "Why can a stock fall even after a company reports higher profit than last year?",
      options: [
        "Higher profit always means the stock rises",
        "The results may have missed what the market was already expecting",
        "Profit has no connection to stock price",
        "It's impossible for a stock to fall after a profit increase",
      ],
      correctAnswer: 1,
      explanation: "Markets price in expectations — a result below expectations can still be a \"miss\" even if it grew year over year.",
      difficulty: "medium",
    },
    {
      id: "aapl-q4",
      lessonId: "aapl-earnings-valuation",
      question: "What does a stock's valuation roughly represent?",
      options: [
        "The company's total number of employees",
        "How much investors are willing to pay today for a claim on future earnings",
        "The company's headquarters location",
        "A guaranteed future price",
      ],
      correctAnswer: 1,
      explanation: "Valuation reflects what the market is willing to pay now for expected future performance.",
      difficulty: "medium",
    },
    {
      id: "aapl-q5",
      lessonId: "aapl-company-risk",
      question: "Why is owning a single stock like Apple generally riskier than owning a broad index?",
      options: [
        "Single stocks are always more expensive",
        "Company-specific events aren't diluted across hundreds of other companies",
        "Indexes cannot lose value",
        "Apple has no competitors",
      ],
      correctAnswer: 1,
      explanation: "A single company's problems fall entirely on that one stock, unlike a diversified index.",
      difficulty: "hard",
    },
    {
      id: "aapl-q6",
      lessonId: "aapl-company-risk",
      question: "Which scenario best illustrates company-specific risk for Apple?",
      options: [
        "A broad market-wide interest rate change",
        "A key product line facing a supply-chain disruption",
        "Every stock in the S&P 500 rising together",
        "A global stock market holiday",
      ],
      correctAnswer: 1,
      explanation: "A supply-chain issue affecting one of Apple's product lines is specific to Apple, not the whole market.",
      difficulty: "hard",
    },
  ],
};
