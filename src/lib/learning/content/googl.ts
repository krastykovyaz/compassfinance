import { AssetLearningPath } from "./types";

export const googlLearningPath: AssetLearningPath = {
  assetId: "googl",
  title: "Understanding Alphabet (Google)",
  shortDescription: "Search advertising, YouTube, Cloud, AI, and regulatory risk.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "googl-search-youtube",
      title: "Search advertising and YouTube",
      objective: "Explain Alphabet's core advertising businesses.",
      explanation:
        "Alphabet is Google's parent company, and the large majority of its revenue still comes from advertising — primarily search ads shown alongside Google Search results, plus display and video advertising, including on YouTube. Advertisers pay to reach the huge audience Search and YouTube attract, which makes advertiser demand (itself tied to the broader economy) a key driver of Alphabet's results.",
      keyTakeaways: [
        "Most of Alphabet's revenue comes from advertising.",
        "Search ads and YouTube ads are the two largest advertising streams.",
        "Advertiser demand is tied to the broader economy.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "googl-cloud-ai",
      title: "Cloud and AI",
      objective: "Describe Alphabet's cloud business and its AI investments.",
      explanation:
        "Google Cloud rents computing infrastructure and services to businesses, competing with AWS and Azure — it's a smaller, faster-growing segment relative to advertising. Alphabet has also invested heavily in AI research and products, both to improve its core Search and advertising products and to compete for enterprise AI customers through Google Cloud. Like its cloud competitors, this investment carries significant cost alongside the opportunity.",
      keyTakeaways: [
        "Google Cloud competes with AWS and Azure in cloud computing.",
        "AI investment supports both Search/advertising and enterprise Cloud customers.",
        "AI infrastructure investment is costly, not just an opportunity.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "googl-regulation-competition",
      title: "Regulation and competition",
      objective: "Explain why regulatory risk is a significant factor for Alphabet.",
      explanation:
        "Because of its size and central role in search and advertising, Alphabet faces significant regulatory scrutiny in multiple countries, including antitrust cases that could affect how its products operate or how it's allowed to structure its business. It also faces competition — from other ad platforms, from AI tools that could change how people search for information, and from rivals in cloud computing. Regulatory outcomes and competitive shifts are both risks that are hard to predict from financial results alone.",
      keyTakeaways: [
        "Alphabet faces significant antitrust and regulatory scrutiny globally.",
        "Competition includes other ad platforms and emerging AI search tools.",
        "Regulatory and competitive risk isn't visible in financial results alone.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "googl-q1",
      lessonId: "googl-search-youtube",
      question: "What is Alphabet's largest source of revenue?",
      options: ["Advertising", "Hardware manufacturing", "Insurance", "Retail banking"],
      correctAnswer: 0,
      explanation: "Search and YouTube advertising make up the large majority of Alphabet's revenue.",
      difficulty: "easy",
    },
    {
      id: "googl-q2",
      lessonId: "googl-search-youtube",
      question: "What drives advertiser demand for Google Search and YouTube ads?",
      options: [
        "The large audience these platforms attract, tied to the broader economy",
        "Government mandates requiring companies to advertise",
        "Advertisers are required by law to use Google",
        "Advertiser demand is unrelated to the economy",
      ],
      correctAnswer: 0,
      explanation: "Advertisers pay to reach Google's large audiences, and that spending is tied to overall economic conditions.",
      difficulty: "easy",
    },
    {
      id: "googl-q3",
      lessonId: "googl-cloud-ai",
      question: "Which two companies does Google Cloud primarily compete with?",
      options: ["AWS and Azure", "Coca-Cola and Pepsi", "Netflix and Disney", "Two airlines"],
      correctAnswer: 0,
      explanation: "Google Cloud competes with Amazon's AWS and Microsoft's Azure in cloud computing.",
      difficulty: "medium",
    },
    {
      id: "googl-q4",
      lessonId: "googl-cloud-ai",
      question: "What is one real cost associated with Alphabet's AI investment?",
      options: [
        "Building AI infrastructure is expensive",
        "AI investment has zero associated cost",
        "AI only benefits Alphabet's competitors",
        "AI requires no computing resources",
      ],
      correctAnswer: 0,
      explanation: "AI infrastructure and research investment carries real, significant cost.",
      difficulty: "medium",
    },
    {
      id: "googl-q5",
      lessonId: "googl-regulation-competition",
      question: "Why does Alphabet face significant regulatory scrutiny?",
      options: [
        "Its size and central role in search and advertising draw antitrust attention",
        "It operates no products people use",
        "Regulation only applies to small companies",
        "It has no market share in any country",
      ],
      correctAnswer: 0,
      explanation: "Alphabet's scale and market position make it a frequent subject of antitrust action globally.",
      difficulty: "hard",
    },
    {
      id: "googl-q6",
      lessonId: "googl-regulation-competition",
      question: "What kind of emerging competition could affect how people use Google Search?",
      options: [
        "AI tools that change how people find information",
        "A shortage of paper",
        "New retail stores",
        "Changes in airline pricing",
      ],
      correctAnswer: 0,
      explanation: "AI-driven tools represent a new kind of competition for traditional search behavior.",
      difficulty: "hard",
    },
  ],
};
