import { AssetLearningPath } from "./types";

export const metaLearningPath: AssetLearningPath = {
  assetId: "meta",
  title: "Understanding Meta Platforms",
  shortDescription: "Advertising, social platforms, AI, Reality Labs, and regulatory risk.",
  category: "stock",
  completionReward: 100,
  lessons: [
    {
      id: "meta-advertising-platforms",
      title: "Advertising and social platforms",
      objective: "Explain how Meta's social platforms generate revenue.",
      explanation:
        "Meta owns Facebook, Instagram, and WhatsApp, and the large majority of its revenue comes from advertising shown across these platforms. Businesses pay to reach Meta's billions of users, often using detailed targeting based on user interests and behavior. Because advertising is Meta's core revenue source, ad spending trends — which rise and fall with the broader economy and with how much time people spend on its apps — directly affect its results.",
      keyTakeaways: [
        "Facebook, Instagram, and WhatsApp are Meta's core platforms.",
        "The large majority of revenue comes from advertising.",
        "Ad spending is tied to the broader economy and to user engagement on Meta's apps.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "meta-ai-reality-labs",
      title: "AI and Reality Labs",
      objective: "Describe Meta's AI investments and its Reality Labs (VR/AR) segment.",
      explanation:
        "Meta has invested heavily in AI, both to improve ad targeting and content recommendations on its existing platforms and through its own AI models and research. Separately, its Reality Labs division builds virtual- and augmented-reality hardware and software (like VR headsets), representing a longer-term bet on new computing platforms. Reality Labs has historically operated at a significant loss, funded by the profitable advertising business — a bet on a future market that hasn't yet proven itself at scale.",
      keyTakeaways: [
        "AI investment supports both existing ad products and new research.",
        "Reality Labs (VR/AR) is a longer-term, currently loss-making bet.",
        "Advertising profits currently fund Reality Labs' investment.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "meta-regulatory-execution-risk",
      title: "Regulatory and execution risk",
      objective: "Explain the regulatory and execution risks specific to Meta.",
      explanation:
        "Meta has faced regulatory scrutiny around data privacy, antitrust concerns given its ownership of multiple major platforms, and content-moderation policy in various countries — any of which could affect how it operates or is structured. On the execution side, continuing to invest heavily in unproven areas like Reality Labs while maintaining the profitability of its advertising business is itself a balancing act that depends on management decisions, not just market conditions.",
      keyTakeaways: [
        "Meta faces scrutiny around data privacy, antitrust, and content policy.",
        "Owning multiple major platforms draws particular antitrust attention.",
        "Balancing profitable advertising against unproven, expensive bets is an execution challenge.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "meta-q1",
      lessonId: "meta-advertising-platforms",
      question: "Which platforms does Meta own?",
      options: ["Facebook, Instagram, and WhatsApp", "YouTube and Gmail", "Amazon and AWS", "Netflix and Spotify"],
      correctAnswer: 0,
      explanation: "Meta's core platforms are Facebook, Instagram, and WhatsApp.",
      difficulty: "easy",
    },
    {
      id: "meta-q2",
      lessonId: "meta-advertising-platforms",
      question: "What is Meta's largest source of revenue?",
      options: ["Advertising", "Hardware sales", "Subscription fees for Facebook", "Retail stores"],
      correctAnswer: 0,
      explanation: "The large majority of Meta's revenue comes from advertising across its platforms.",
      difficulty: "easy",
    },
    {
      id: "meta-q3",
      lessonId: "meta-ai-reality-labs",
      question: "What is Reality Labs?",
      options: ["Meta's VR/AR hardware and software division", "Meta's advertising sales team", "A grocery delivery service", "A cloud computing product"],
      correctAnswer: 0,
      explanation: "Reality Labs builds virtual- and augmented-reality products.",
      difficulty: "medium",
    },
    {
      id: "meta-q4",
      lessonId: "meta-ai-reality-labs",
      question: "How has Reality Labs historically been funded?",
      options: [
        "By profits from Meta's advertising business",
        "It has always been independently profitable",
        "By government subsidies",
        "It requires no funding",
      ],
      correctAnswer: 0,
      explanation: "Reality Labs has operated at a loss, funded by the profitable advertising business.",
      difficulty: "medium",
    },
    {
      id: "meta-q5",
      lessonId: "meta-regulatory-execution-risk",
      question: "Why does Meta face particular antitrust attention?",
      options: [
        "It owns multiple major social platforms",
        "It owns no notable products",
        "Antitrust law doesn't apply to technology companies",
        "It operates in only one small market",
      ],
      correctAnswer: 0,
      explanation: "Owning Facebook, Instagram, and WhatsApp together draws particular antitrust scrutiny.",
      difficulty: "hard",
    },
    {
      id: "meta-q6",
      lessonId: "meta-regulatory-execution-risk",
      question: "What execution challenge does Meta face regarding Reality Labs?",
      options: [
        "Balancing continued investment in an unproven area against advertising profitability",
        "Reality Labs requires no investment decisions",
        "There is no tension between advertising and Reality Labs spending",
        "Meta has stopped investing in new areas entirely",
      ],
      correctAnswer: 0,
      explanation: "Continuing to fund an unproven, loss-making segment while protecting core profitability is a genuine balancing act.",
      difficulty: "hard",
    },
  ],
};
