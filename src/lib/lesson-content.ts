// Mock educational content for the S&P 500 learning module.
// No LLM involved — this is static demo data.

export type LessonStep = {
  id: string;
  title: string;
  body: string;
};

export const sp500Lesson = {
  slug: "sp500",
  title: "Understanding the S&P 500",
  levelLabel: "Level 4",
  xpReward: 100,
  estimatedMinutes: 4,
};

export const sp500LessonSteps: LessonStep[] = [
  {
    id: "what-is-it",
    title: "What is the S&P 500?",
    body: "The S&P 500 is an index that tracks the stock performance of 500 of the largest publicly traded companies in the United States. It's one of the most widely used gauges of the overall U.S. stock market.",
  },
  {
    id: "companies-inside",
    title: "What companies are inside it?",
    body: "It includes household names across every major industry — from tech giants like Apple and Microsoft, to banks, healthcare companies, retailers, and energy firms. It's a broad snapshot of corporate America.",
  },
  {
    id: "how-calculated",
    title: "How is it calculated?",
    body: "The index is market-cap weighted, meaning bigger companies move it more than smaller ones. A big swing in a company like Apple has more impact on the index than the same swing in a smaller company.",
  },
  {
    id: "why-price-moves",
    title: "Why does its price move?",
    body: "Prices shift based on company earnings, interest rate changes, inflation data, and overall investor sentiment. When investors expect strong growth, prices tend to rise — and vice versa.",
  },
  {
    id: "what-it-represents",
    title: "What does an index actually represent?",
    body: "An index isn't a single stock you can buy directly — it's a benchmark. When people 'invest in the S&P 500', they're usually buying a fund that mirrors the index's performance, spreading risk across all 500 companies.",
  },
];

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const sp500Quiz: QuizQuestion[] = [
  {
    id: "q1",
    prompt: "What does the S&P 500 represent?",
    options: [
      "One company",
      "A group of large U.S. companies",
      "The price of gold",
      "The U.S. dollar",
    ],
    correctIndex: 1,
    explanation:
      "The S&P 500 tracks 500 of the largest U.S. companies, not a single stock or commodity.",
  },
  {
    id: "q2",
    prompt: "How is the S&P 500 weighted?",
    options: [
      "Equally across all companies",
      "By company age",
      "By market capitalization",
      "Alphabetically",
    ],
    correctIndex: 2,
    explanation:
      "It's market-cap weighted, so larger companies have a bigger influence on the index's price.",
  },
  {
    id: "q3",
    prompt: "Which of these could cause the S&P 500 to move?",
    options: [
      "A change in interest rates",
      "The weather in New York",
      "A new phone emoji release",
      "None of the above",
    ],
    correctIndex: 0,
    explanation:
      "Macro factors like interest rates, inflation, and earnings all influence index prices.",
  },
  {
    id: "q4",
    prompt: "Can you buy 'the S&P 500' directly as a single share?",
    options: [
      "Yes, it trades like any single stock",
      "No, but funds exist that track its performance",
      "Only banks are allowed to buy it",
      "It can only be bought with gold",
    ],
    correctIndex: 1,
    explanation:
      "The index itself isn't a tradable share — funds and ETFs are built to mirror its performance.",
  },
  {
    id: "q5",
    prompt: "Why do investors watch the S&P 500 closely?",
    options: [
      "It's a broad benchmark for the U.S. stock market",
      "It only tracks one industry",
      "It guarantees profits",
      "It never changes in value",
    ],
    correctIndex: 0,
    explanation:
      "Because it spans many industries and large companies, it's widely used as a benchmark for market health.",
  },
];
