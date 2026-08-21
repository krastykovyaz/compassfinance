import { AssetLearningPath } from "./types";

export const msftLearningPath: AssetLearningPath = {
  assetId: "msft",
  title: "Understanding Microsoft Corp.",
  shortDescription: "Software, cloud (Azure), recurring revenue, and AI exposure.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "msft-software-cloud",
      title: "Software and the cloud business",
      objective: "Explain Microsoft's shift from packaged software to cloud services.",
      explanation:
        "Microsoft built its early business on packaged software — Windows and Office sold as one-time purchases. Over the past decade it has shifted heavily toward cloud computing through Azure, which rents out computing power, storage, and services to businesses on a pay-as-you-go or subscription basis. Office itself has also moved to a subscription model (Microsoft 365), turning what used to be one-time sales into recurring revenue.",
      keyTakeaways: [
        "Originally built on one-time packaged software sales (Windows, Office).",
        "Azure rents cloud computing and storage to businesses.",
        "Office has shifted to a subscription model (Microsoft 365).",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "msft-recurring-revenue",
      title: "Recurring revenue and why it matters",
      objective: "Explain why recurring, subscription-based revenue is viewed differently than one-time sales.",
      explanation:
        "Recurring revenue — subscriptions and cloud usage billed regularly — tends to be more predictable than one-time product sales, since a large share of next quarter's revenue is already \"on the books\" from existing subscribers and cloud customers. That predictability is one reason investors often value recurring-revenue businesses differently than businesses that depend on repeatedly winning new one-time sales.",
      keyTakeaways: [
        "Recurring revenue is generally more predictable than one-time sales.",
        "A large share of future revenue is already committed from existing subscribers.",
        "This predictability can influence how investors value the business.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "msft-ai-competition",
      title: "AI exposure, valuation, and competition",
      objective: "Describe how AI investment and competition factor into Microsoft's story.",
      explanation:
        "Microsoft has invested heavily in AI, both by building AI features into its own products (like Copilot across Office and Windows) and through infrastructure investment to support AI workloads on Azure. That investment carries cost as well as opportunity — building and running AI infrastructure is expensive, and Microsoft competes with other major cloud and software providers who are making similar bets. As with any company, price reflects not just current results but what investors expect these investments to produce.",
      keyTakeaways: [
        "AI is being built into products and into Azure's infrastructure.",
        "AI infrastructure investment carries real cost, not just opportunity.",
        "Microsoft competes with other large cloud/software companies making similar AI bets.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "msft-q1",
      lessonId: "msft-software-cloud",
      question: "What was Microsoft's original core business model?",
      options: ["One-time packaged software sales", "Retail grocery", "Oil refining", "Airline operations"],
      correctAnswer: 0,
      explanation: "Windows and Office were originally sold as one-time packaged software.",
      difficulty: "easy",
    },
    {
      id: "msft-q2",
      lessonId: "msft-software-cloud",
      question: "What is Azure?",
      options: ["Microsoft's cloud computing platform", "A social media app", "A hardware retail store", "An airline"],
      correctAnswer: 0,
      explanation: "Azure is Microsoft's cloud computing platform, renting computing power and services to businesses.",
      difficulty: "easy",
    },
    {
      id: "msft-q3",
      lessonId: "msft-recurring-revenue",
      question: "Why is recurring subscription revenue often viewed as more predictable?",
      options: [
        "A large share of it is already committed from existing subscribers",
        "It guarantees the company will never lose money",
        "It's unrelated to customer behavior",
        "Subscriptions are always more expensive than one-time sales",
      ],
      correctAnswer: 0,
      explanation: "Existing subscribers represent revenue that's largely already locked in for the coming period.",
      difficulty: "medium",
    },
    {
      id: "msft-q4",
      lessonId: "msft-recurring-revenue",
      question: "How did Office shift its revenue model over time?",
      options: [
        "From one-time purchases to a subscription model (Microsoft 365)",
        "From subscriptions to one-time purchases",
        "It has always been free",
        "It became a hardware-only product",
      ],
      correctAnswer: 0,
      explanation: "Office moved from one-time packaged sales to a recurring Microsoft 365 subscription.",
      difficulty: "medium",
    },
    {
      id: "msft-q5",
      lessonId: "msft-ai-competition",
      question: "What is a real cost associated with Microsoft's AI investment?",
      options: [
        "Building and running AI infrastructure is expensive",
        "AI investment has zero cost",
        "AI only benefits competitors",
        "There is no infrastructure involved in AI",
      ],
      correctAnswer: 0,
      explanation: "AI infrastructure investment is capital-intensive, not free.",
      difficulty: "hard",
    },
    {
      id: "msft-q6",
      lessonId: "msft-ai-competition",
      question: "What does a stock's price reflect regarding AI investment, beyond current results?",
      options: [
        "Only last year's earnings",
        "What investors expect those investments to eventually produce",
        "Nothing beyond the current quarter",
        "The number of employees at the company",
      ],
      correctAnswer: 1,
      explanation: "Prices incorporate expectations about future returns on investment, not just current performance.",
      difficulty: "hard",
    },
  ],
};
