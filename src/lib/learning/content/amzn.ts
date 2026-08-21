import { AssetLearningPath } from "./types";

export const amznLearningPath: AssetLearningPath = {
  assetId: "amzn",
  title: "Understanding Amazon.com Inc.",
  shortDescription: "E-commerce, AWS, advertising, margins, and execution risk.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "amzn-ecommerce-aws",
      title: "E-commerce and AWS",
      objective: "Explain Amazon's two largest, most different businesses.",
      explanation:
        "Amazon is best known for e-commerce — an online retail marketplace with famously thin margins, since retail is a high-volume, price-competitive business. Less visible to most shoppers is Amazon Web Services (AWS), its cloud-computing division, which rents servers, storage, and software infrastructure to other businesses. AWS is a smaller share of revenue than retail but has historically contributed a much larger share of profit, since cloud infrastructure carries higher margins than retail.",
      keyTakeaways: [
        "E-commerce is Amazon's largest, most visible business but has thin margins.",
        "AWS (cloud computing) is a smaller share of revenue but a larger share of profit.",
        "Retail and cloud computing are very different businesses under one company.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "amzn-advertising-margins",
      title: "Advertising and margins",
      objective: "Describe Amazon's advertising business and why margins vary so much across segments.",
      explanation:
        "Amazon has also built a large advertising business, selling ad placements to brands and sellers on its marketplace — a high-margin business layered on top of its retail traffic. Because Amazon's segments (retail, AWS, advertising) have such different margin profiles, investors watch not just total revenue but the mix between segments, since a shift toward higher-margin businesses like AWS or advertising can matter more to profitability than overall sales growth.",
      keyTakeaways: [
        "Advertising is a high-margin business built on top of Amazon's retail traffic.",
        "Different segments have very different margin profiles.",
        "The mix between segments matters as much to profit as total revenue growth.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "amzn-execution-risk",
      title: "Growth and execution risk",
      objective: "Explain what execution risk means for a company operating at Amazon's scale.",
      explanation:
        "Amazon operates a large, complex logistics and fulfillment network, invests heavily in new initiatives, and competes across retail, cloud, advertising, and other markets simultaneously. That scale creates \"execution risk\" — the chance that operational missteps, over-investment in an underperforming initiative, or slower-than-expected growth in a key segment like AWS could weigh on results, independent of the broader economy.",
      keyTakeaways: [
        "Operating at large scale across many businesses increases operational complexity.",
        "Execution risk means results depend on management delivering well, not just market conditions.",
        "A slowdown in a key segment like AWS can weigh on overall results.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "amzn-q1",
      lessonId: "amzn-ecommerce-aws",
      question: "What is AWS?",
      options: ["Amazon's cloud-computing division", "Amazon's grocery delivery app", "A movie studio", "An airline"],
      correctAnswer: 0,
      explanation: "AWS is Amazon Web Services, Amazon's cloud computing business.",
      difficulty: "easy",
    },
    {
      id: "amzn-q2",
      lessonId: "amzn-ecommerce-aws",
      question: "Why is e-commerce generally a thin-margin business?",
      options: [
        "It's a high-volume, price-competitive business",
        "It has no competition",
        "It requires no logistics",
        "Retail always has the highest margins",
      ],
      correctAnswer: 0,
      explanation: "Retail is high-volume and price-competitive, which tends to compress margins.",
      difficulty: "easy",
    },
    {
      id: "amzn-q3",
      lessonId: "amzn-advertising-margins",
      question: "How does Amazon's advertising business relate to its retail business?",
      options: [
        "It's built on top of retail traffic, selling ad placements to brands and sellers",
        "It's completely unrelated to retail",
        "It replaced retail entirely",
        "It only exists outside the Amazon marketplace",
      ],
      correctAnswer: 0,
      explanation: "Advertising leverages the same shopper traffic that retail generates.",
      difficulty: "medium",
    },
    {
      id: "amzn-q4",
      lessonId: "amzn-advertising-margins",
      question: "Why do investors watch Amazon's segment mix, not just total revenue?",
      options: [
        "Different segments have very different margin profiles",
        "Segment mix has no effect on profitability",
        "Only total revenue matters to investors",
        "AWS and retail have identical margins",
      ],
      correctAnswer: 0,
      explanation: "A shift toward higher-margin segments can affect profitability more than overall revenue growth.",
      difficulty: "medium",
    },
    {
      id: "amzn-q5",
      lessonId: "amzn-execution-risk",
      question: "What does \"execution risk\" mean in Amazon's context?",
      options: [
        "The risk that operational missteps or slower growth in a key segment weigh on results",
        "The risk of running out of legal paperwork",
        "A risk that only applies to small companies",
        "A risk that has nothing to do with management decisions",
      ],
      correctAnswer: 0,
      explanation: "Execution risk is about whether the company delivers operationally, independent of the broader economy.",
      difficulty: "hard",
    },
    {
      id: "amzn-q6",
      lessonId: "amzn-execution-risk",
      question: "Why can a slowdown in AWS specifically matter so much to Amazon's overall results?",
      options: [
        "AWS contributes a large share of profit despite being a smaller share of revenue",
        "AWS is Amazon's only business",
        "AWS has no effect on profitability",
        "AWS and retail always move in opposite directions",
      ],
      correctAnswer: 0,
      explanation: "Because AWS is disproportionately profitable relative to its revenue share, its performance matters a lot to overall profit.",
      difficulty: "hard",
    },
  ],
};
