import { AssetLearningPath } from "./types";

export const nvdaLearningPath: AssetLearningPath = {
  assetId: "nvda",
  title: "Understanding NVIDIA Corp.",
  shortDescription: "GPUs, AI infrastructure, and the risks of a high-growth, high-expectation stock.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "nvda-gpus-ai",
      title: "GPUs and AI infrastructure",
      objective: "Explain what NVIDIA makes and why it matters to AI.",
      explanation:
        "NVIDIA designs graphics processing units (GPUs) — chips originally built for rendering video game graphics, whose architecture also turns out to be extremely well-suited to the parallel math behind training and running AI models. That overlap has made NVIDIA's chips a core building block for the data centers powering modern AI systems, alongside the software tools it builds to make its chips easier for developers to use.",
      keyTakeaways: [
        "NVIDIA's core product is GPUs, originally built for graphics.",
        "GPU architecture is well-suited to the parallel computation AI models need.",
        "Software tools around its chips are also part of NVIDIA's business.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "nvda-cycle-competition",
      title: "Data centers, the semiconductor cycle, and competition",
      objective: "Describe the cyclical and competitive pressures NVIDIA faces.",
      explanation:
        "Demand for NVIDIA's chips is driven heavily by data-center spending from large technology companies building out AI infrastructure — spending that can accelerate quickly but can also slow if those companies pull back. The broader semiconductor industry has historically moved in cycles of high demand followed by oversupply. NVIDIA also faces competition from other chipmakers and from large customers developing their own custom chips, which could reduce reliance on NVIDIA over time.",
      keyTakeaways: [
        "Demand is concentrated in a relatively small number of large data-center customers.",
        "Semiconductors have historically been a cyclical industry.",
        "Competition includes other chipmakers and customers building their own chips.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "nvda-expectation-risk",
      title: "High-growth, high-expectation risk",
      objective: "Explain why a fast-growing stock can be more sensitive to disappointing news.",
      explanation:
        "When a stock's price already reflects expectations of strong, continued growth, even a good quarter that merely meets — rather than exceeds — expectations can disappoint the market and lead to a sharp price move. This isn't unique to NVIDIA, but it's especially relevant for high-growth companies where a large part of the current valuation is based on assumptions about the future, not just today's numbers.",
      keyTakeaways: [
        "High expectations mean \"good\" results can still disappoint the market.",
        "A large share of a high-growth stock's value depends on future assumptions.",
        "This dynamic applies broadly to fast-growing companies, not just NVIDIA.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "nvda-q1",
      lessonId: "nvda-gpus-ai",
      question: "What was NVIDIA's GPU technology originally designed for?",
      options: ["Rendering video game graphics", "Mining precious metals", "Running spreadsheets", "Powering electric vehicles"],
      correctAnswer: 0,
      explanation: "GPUs were originally built for graphics rendering before becoming central to AI workloads.",
      difficulty: "easy",
    },
    {
      id: "nvda-q2",
      lessonId: "nvda-gpus-ai",
      question: "Why are GPUs well-suited to AI workloads?",
      options: [
        "Their architecture handles the parallel math AI training and inference require",
        "They are the cheapest chips available",
        "They were designed specifically for AI from the start",
        "They require no electricity",
      ],
      correctAnswer: 0,
      explanation: "GPU architecture happens to fit the parallel computation AI models need.",
      difficulty: "easy",
    },
    {
      id: "nvda-q3",
      lessonId: "nvda-cycle-competition",
      question: "What could cause a slowdown in demand for NVIDIA's chips?",
      options: [
        "Large customers pulling back on data-center spending",
        "Nothing — demand is guaranteed to grow forever",
        "GPUs becoming illegal",
        "A rise in the price of gold",
      ],
      correctAnswer: 0,
      explanation: "Demand is concentrated among large customers whose spending can slow as well as accelerate.",
      difficulty: "medium",
    },
    {
      id: "nvda-q4",
      lessonId: "nvda-cycle-competition",
      question: "What has historically characterized the semiconductor industry?",
      options: ["Perfectly stable, unchanging demand", "Cycles of high demand followed by oversupply", "No competition of any kind", "Guaranteed annual growth"],
      correctAnswer: 1,
      explanation: "Semiconductors have historically moved through boom-and-oversupply cycles.",
      difficulty: "medium",
    },
    {
      id: "nvda-q5",
      lessonId: "nvda-expectation-risk",
      question: "Why might a stock fall even after reporting strong growth?",
      options: [
        "Strong growth always guarantees a higher stock price",
        "If growth merely matches already-high expectations, it can still disappoint the market",
        "Growth has no relationship to stock price",
        "Stocks only react to losses, never to growth",
      ],
      correctAnswer: 1,
      explanation: "When expectations are already high, meeting (not exceeding) them can still disappoint.",
      difficulty: "hard",
    },
    {
      id: "nvda-q6",
      lessonId: "nvda-expectation-risk",
      question: "For a high-growth company, what does a large part of today's valuation typically depend on?",
      options: [
        "Only last year's results",
        "Assumptions about future growth, not just current numbers",
        "The company's office locations",
        "Nothing — valuation is unrelated to growth expectations",
      ],
      correctAnswer: 1,
      explanation: "High-growth valuations bake in expectations about the future, which is why disappointment on that front can hit the price hard.",
      difficulty: "hard",
    },
  ],
};
