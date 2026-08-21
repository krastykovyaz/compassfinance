import { AssetLearningPath } from "./types";

export const brentOilLearningPath: AssetLearningPath = {
  assetId: "brent-oil",
  title: "Understanding Brent Crude Oil",
  shortDescription: "Global oil pricing, supply and demand, and why oil is an especially volatile commodity.",
  category: "commodity",
  completionReward: 100,
  lessons: [
    {
      id: "brent-what-it-represents",
      title: "What Brent crude represents",
      objective: "Explain what \"Brent\" is and why it's used as a global benchmark.",
      explanation:
        "Brent crude is oil sourced from fields in the North Sea, and its price is widely used as an international benchmark for buying and selling oil — roughly two-thirds of globally traded crude oil is priced with reference to Brent. It's one of a few major oil benchmarks (another is WTI, or West Texas Intermediate, used more in the U.S.), and its price reflects the value of a barrel of crude oil before it's refined into products like gasoline, diesel, or jet fuel.",
      keyTakeaways: [
        "Brent crude is sourced from the North Sea and used as a global pricing benchmark.",
        "Most internationally traded oil is priced with reference to Brent.",
        "It represents unrefined crude — refining turns it into fuels and other products.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "brent-supply-demand",
      title: "Global supply and demand",
      objective: "Explain the basic supply/demand forces behind oil's price.",
      explanation:
        "Oil's price responds to the balance between global supply — how much is being pumped by producers around the world — and global demand, which is closely tied to economic activity, transportation, and industrial use. Because oil is central to so much of the global economy, even modest imbalances between supply and demand can move prices meaningfully, and those imbalances can shift quickly due to weather events, production decisions, or changes in economic growth expectations.",
      keyTakeaways: [
        "Price reflects the balance between global oil supply and demand.",
        "Demand is closely tied to overall economic activity.",
        "Supply/demand imbalances can shift quickly and move prices meaningfully.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "brent-opec-geopolitics",
      title: "OPEC, geopolitics, and volatility",
      objective: "Explain how OPEC and geopolitical events add to oil's price volatility.",
      explanation:
        "OPEC (the Organization of the Petroleum Exporting Countries) and its allied producers coordinate on production levels, and their decisions to raise or cut output can move prices significantly. Oil is also unusually exposed to geopolitical events — conflicts, sanctions, or instability in major oil-producing regions can disrupt supply with little warning. This combination of concentrated production decisions and geopolitical exposure is a big reason oil is known as one of the more volatile major commodities.",
      keyTakeaways: [
        "OPEC production decisions can move prices significantly.",
        "Geopolitical events in producing regions can disrupt supply with little warning.",
        "This combination makes oil one of the more volatile major commodities.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "brent-q1",
      lessonId: "brent-what-it-represents",
      question: "Where is Brent crude oil sourced from?",
      options: ["The North Sea", "The Amazon rainforest", "The Sahara Desert", "The Great Lakes"],
      correctAnswer: 0,
      explanation: "Brent crude is sourced from North Sea oil fields.",
      difficulty: "easy",
    },
    {
      id: "brent-q2",
      lessonId: "brent-what-it-represents",
      question: "What is Brent crude used as?",
      options: ["A global benchmark for pricing oil", "A currency", "A stock market index", "A type of bond"],
      correctAnswer: 0,
      explanation: "Brent is one of the world's major benchmarks for pricing internationally traded oil.",
      difficulty: "easy",
    },
    {
      id: "brent-q3",
      lessonId: "brent-supply-demand",
      question: "What is oil demand closely tied to?",
      options: ["Global economic activity", "The stock market's opening hours", "Currency exchange rates only", "Weather in a single city"],
      correctAnswer: 0,
      explanation: "Oil demand is closely linked to transportation, industrial use, and overall economic activity.",
      difficulty: "medium",
    },
    {
      id: "brent-q4",
      lessonId: "brent-supply-demand",
      question: "Why can even modest supply/demand imbalances move oil prices meaningfully?",
      options: [
        "Oil is central to a large part of the global economy",
        "Oil has no connection to global demand",
        "Oil prices never change",
        "Supply is always perfectly matched to demand",
      ],
      correctAnswer: 0,
      explanation: "Because oil is so central to the global economy, small imbalances can still move prices a lot.",
      difficulty: "medium",
    },
    {
      id: "brent-q5",
      lessonId: "brent-opec-geopolitics",
      question: "What is OPEC?",
      options: [
        "A group of oil-producing countries that coordinates on production levels",
        "A global stock exchange",
        "A central bank",
        "An oil company headquartered in the U.S.",
      ],
      correctAnswer: 0,
      explanation: "OPEC is an organization of oil-exporting countries that coordinates production decisions.",
      difficulty: "hard",
    },
    {
      id: "brent-q6",
      lessonId: "brent-opec-geopolitics",
      question: "Why is oil considered one of the more volatile major commodities?",
      options: [
        "Concentrated production decisions and geopolitical exposure can disrupt supply quickly",
        "Oil demand never changes",
        "Oil has no exposure to global events",
        "Oil prices are set once a year and never adjusted",
      ],
      correctAnswer: 0,
      explanation: "The combination of OPEC's coordinated decisions and geopolitical risk in producing regions drives significant volatility.",
      difficulty: "hard",
    },
  ],
};
