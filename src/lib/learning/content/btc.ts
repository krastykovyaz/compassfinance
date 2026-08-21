import { AssetLearningPath } from "./types";

export const btcLearningPath: AssetLearningPath = {
  assetId: "btc",
  title: "Understanding Bitcoin",
  shortDescription: "Supply mechanics, network security basics, adoption, and volatility.",
  category: "crypto",
  completionReward: 100,
  lessons: [
    {
      id: "btc-what-it-is",
      title: "What Bitcoin is",
      objective: "Explain what Bitcoin is at a basic level.",
      explanation:
        "Bitcoin is a digital currency that exists on a decentralized network — no single company, bank, or government controls it. Transactions are recorded on a public, shared ledger called a blockchain, maintained by a global network of computers rather than a central authority. It was created as an alternative to relying on banks or governments to verify and settle transactions.",
      keyTakeaways: [
        "Bitcoin is a decentralized digital currency with no central controlling authority.",
        "Transactions are recorded on a public ledger called a blockchain.",
        "It was designed as an alternative to bank- or government-mediated transactions.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "btc-supply-security",
      title: "Supply mechanics and network security",
      objective: "Explain Bitcoin's fixed supply and how the network stays secure.",
      explanation:
        "Bitcoin has a hard-capped total supply of 21 million coins, built into its code — no more can ever be created, which is a deliberate design choice often compared to scarce physical resources. New bitcoins are released gradually through \"mining,\" a process where computers compete to validate transactions and are rewarded with newly created coins; this reward is cut in half on a set schedule (\"halvings\"). Network security relies on this same mining process making it extremely costly to alter transaction history.",
      keyTakeaways: [
        "Total supply is capped at 21 million coins by design.",
        "New coins are released gradually through mining, with rewards halving periodically.",
        "Security relies on making it extremely costly to alter recorded transactions.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "btc-adoption-risk",
      title: "Adoption, volatility, and regulatory risk",
      objective: "Explain what drives Bitcoin's price and the risks specific to it.",
      explanation:
        "Bitcoin's price is influenced heavily by adoption trends — how many individuals, institutions, and companies are willing to hold or transact in it — as well as broader sentiment toward digital assets. It has historically been significantly more volatile than most traditional asset classes, with large price swings over short periods. Regulation is also a meaningful and evolving risk: different countries treat Bitcoin differently, and regulatory changes (for better or worse) can move its price quickly.",
      keyTakeaways: [
        "Price is heavily influenced by adoption trends and market sentiment.",
        "Bitcoin has historically been significantly more volatile than most traditional assets.",
        "Regulatory treatment varies by country and continues to evolve.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "btc-q1",
      lessonId: "btc-what-it-is",
      question: "Who controls the Bitcoin network?",
      options: ["No single company, bank, or government", "A single central bank", "One private company", "The United Nations"],
      correctAnswer: 0,
      explanation: "Bitcoin is decentralized — no single authority controls the network.",
      difficulty: "easy",
    },
    {
      id: "btc-q2",
      lessonId: "btc-what-it-is",
      question: "What is a blockchain, in Bitcoin's context?",
      options: ["A public, shared ledger of transactions", "A type of bank account", "A physical coin", "A government agency"],
      correctAnswer: 0,
      explanation: "The blockchain is Bitcoin's public transaction ledger, maintained by a distributed network.",
      difficulty: "easy",
    },
    {
      id: "btc-q3",
      lessonId: "btc-supply-security",
      question: "What is Bitcoin's total maximum supply?",
      options: ["21 million coins", "Unlimited", "1 million coins", "It changes every year"],
      correctAnswer: 0,
      explanation: "Bitcoin's supply is hard-capped at 21 million coins by design.",
      difficulty: "medium",
    },
    {
      id: "btc-q4",
      lessonId: "btc-supply-security",
      question: "What happens during a Bitcoin \"halving\"?",
      options: [
        "The mining reward for new coins is cut in half",
        "The total supply cap doubles",
        "All existing coins are destroyed",
        "Transactions are halted permanently",
      ],
      correctAnswer: 0,
      explanation: "Halvings periodically cut the reward miners receive for validating new blocks.",
      difficulty: "medium",
    },
    {
      id: "btc-q5",
      lessonId: "btc-adoption-risk",
      question: "How has Bitcoin's volatility historically compared to most traditional assets?",
      options: [
        "Significantly more volatile",
        "Identical to government bonds",
        "Always less volatile",
        "Volatility doesn't apply to Bitcoin",
      ],
      correctAnswer: 0,
      explanation: "Bitcoin has historically shown much larger price swings than most traditional asset classes.",
      difficulty: "hard",
    },
    {
      id: "btc-q6",
      lessonId: "btc-adoption-risk",
      question: "Why is regulation considered a meaningful risk for Bitcoin?",
      options: [
        "Treatment varies by country and continues to evolve, which can move its price",
        "Bitcoin is regulated identically everywhere with no changes possible",
        "Regulation has no effect on any digital asset",
        "Only one country has ever addressed Bitcoin regulation",
      ],
      correctAnswer: 0,
      explanation: "Regulatory approaches differ globally and continue to change, which is itself a source of price risk.",
      difficulty: "hard",
    },
  ],
};
