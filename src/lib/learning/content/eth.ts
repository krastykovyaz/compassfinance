import { AssetLearningPath } from "./types";

export const ethLearningPath: AssetLearningPath = {
  assetId: "eth",
  title: "Understanding Ethereum",
  shortDescription: "Smart contracts, network activity, and how ETH differs from Bitcoin.",
  category: "crypto",
  completionReward: 100,
  lessons: [
    {
      id: "eth-network-role",
      title: "The Ethereum network and ETH's role",
      objective: "Explain what Ethereum is and what ETH is used for.",
      explanation:
        "Ethereum is a decentralized network designed to run programs — called smart contracts — rather than just record simple currency transfers. ETH, its native token, has two main roles: it's used to pay for computation on the network (often called \"gas fees\") and it functions as an asset in its own right that can be held or traded. This dual role — a currency and the \"fuel\" that powers network activity — is a key difference from Bitcoin's simpler, single-purpose design.",
      keyTakeaways: [
        "Ethereum is a network designed to run programs (smart contracts), not just transfer currency.",
        "ETH is used to pay for computation (\"gas fees\") on the network.",
        "ETH also functions as a tradable asset in its own right.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "eth-smart-contracts",
      title: "Smart contracts and network activity",
      objective: "Explain what smart contracts are and why network activity matters for ETH.",
      explanation:
        "A smart contract is code that runs automatically on the Ethereum network when certain conditions are met — used for things like decentralized apps, digital tokens, and automated financial agreements. Because every action on these smart contracts requires paying gas fees in ETH, higher network activity (more apps and users transacting) generally means more demand for ETH to pay those fees, which is one factor — among many — that can influence its price.",
      keyTakeaways: [
        "Smart contracts are self-executing code that powers apps built on Ethereum.",
        "Every action on the network requires paying gas fees in ETH.",
        "Higher network activity is one factor that can influence ETH demand.",
      ],
      estimatedMinutes: 2,
    },
    {
      id: "eth-competition-risk",
      title: "Competition, upgrades, and risk",
      objective: "Explain the competitive landscape and risks specific to Ethereum.",
      explanation:
        "Ethereum competes with other blockchain networks that also aim to support smart contracts and decentralized applications, some of which are designed to process transactions faster or more cheaply. Ethereum itself has undergone significant technical upgrades over time to address speed, cost, and energy use, and further changes remain possible. Like other crypto assets, ETH carries meaningful volatility and regulatory risk, and its value depends heavily on continued developer and user activity on the network.",
      keyTakeaways: [
        "Ethereum competes with other smart-contract-capable blockchain networks.",
        "The network has undergone major technical upgrades and may see more.",
        "Value depends heavily on continued developer/user activity, alongside volatility and regulatory risk.",
      ],
      estimatedMinutes: 2,
    },
  ],
  quizQuestions: [
    {
      id: "eth-q1",
      lessonId: "eth-network-role",
      question: "What is Ethereum primarily designed to do beyond simple currency transfers?",
      options: ["Run programs called smart contracts", "Print physical currency", "Replace banks entirely by law", "Store only text documents"],
      correctAnswer: 0,
      explanation: "Ethereum's core design purpose is running smart contracts, not just transferring currency.",
      difficulty: "easy",
    },
    {
      id: "eth-q2",
      lessonId: "eth-network-role",
      question: "What are ETH \"gas fees\" used for?",
      options: ["Paying for computation on the network", "A government tax", "Buying physical gasoline", "A subscription fee to use the internet"],
      correctAnswer: 0,
      explanation: "Gas fees pay for the computational work involved in processing transactions and smart contracts.",
      difficulty: "easy",
    },
    {
      id: "eth-q3",
      lessonId: "eth-smart-contracts",
      question: "What is a smart contract?",
      options: [
        "Code that runs automatically on the network when conditions are met",
        "A legal document signed by a lawyer",
        "A type of bank loan",
        "A physical contract stored on paper",
      ],
      correctAnswer: 0,
      explanation: "Smart contracts are self-executing code running on the Ethereum network.",
      difficulty: "medium",
    },
    {
      id: "eth-q4",
      lessonId: "eth-smart-contracts",
      question: "How can higher network activity affect ETH?",
      options: [
        "More activity generally means more demand for ETH to pay gas fees",
        "Network activity has no relationship to ETH demand",
        "Higher activity always eliminates gas fees",
        "It only affects Bitcoin, not Ethereum",
      ],
      correctAnswer: 0,
      explanation: "More apps and users transacting means more gas fees paid in ETH, which is one demand driver.",
      difficulty: "medium",
    },
    {
      id: "eth-q5",
      lessonId: "eth-competition-risk",
      question: "What does Ethereum compete with?",
      options: [
        "Other blockchain networks that support smart contracts",
        "Traditional grocery stores",
        "Nothing — it has no competition",
        "Only physical currencies",
      ],
      correctAnswer: 0,
      explanation: "Other smart-contract-capable blockchains compete for developers and users.",
      difficulty: "hard",
    },
    {
      id: "eth-q6",
      lessonId: "eth-competition-risk",
      question: "What does Ethereum's value depend heavily on, beyond price speculation?",
      options: [
        "Continued developer and user activity on the network",
        "Nothing beyond the price chart",
        "A fixed government-guaranteed value",
        "The price of gold",
      ],
      correctAnswer: 0,
      explanation: "Ongoing developer and user activity is central to the network's — and ETH's — long-term relevance.",
      difficulty: "hard",
    },
  ],
};
