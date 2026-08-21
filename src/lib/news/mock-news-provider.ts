// Mock news provider. Used when NEWS_PROVIDER=mock, or automatically as a
// fallback when MARKETAUX_API_TOKEN isn't set, so local dev and CI never
// require a real API token.

import { NewsItem, NewsProvider } from "./news-types";

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

const MOCK_ITEMS: NewsItem[] = [
  {
    id: "mock-1",
    title: "NVIDIA reports strong AI demand",
    description:
      "NVIDIA's latest results show continued demand for AI infrastructure, with data center revenue leading the beat.",
    source: "Reuters",
    url: "https://example.com/news/nvidia-ai-demand",
    imageUrl: null,
    publishedAt: minutesAgo(120),
    symbols: ["NVDA"],
    entities: ["NVIDIA Corporation"],
    category: "earnings",
  },
  {
    id: "mock-2",
    title: "S&P 500 hits new record high led by tech rally",
    description:
      "Investors remain optimistic ahead of key earnings reports later this week as major indices push to fresh highs.",
    source: "Market Wire",
    url: "https://example.com/news/sp500-record-high",
    imageUrl: null,
    publishedAt: minutesAgo(180),
    symbols: ["SPX", "SPY"],
    entities: ["S&P 500"],
    category: "indices",
  },
  {
    id: "mock-3",
    title: "Apple unveils new AI features across its device lineup",
    description:
      "New on-device tools aim to expand productivity and privacy across the company's product line.",
    source: "Business Hour",
    url: "https://example.com/news/apple-ai-features",
    imageUrl: null,
    publishedAt: minutesAgo(240),
    symbols: ["AAPL"],
    entities: ["Apple Inc."],
    category: "stocks",
  },
  {
    id: "mock-4",
    title: "Fed signals rate cuts could start later this year",
    description:
      "Inflation cools as the economy shows early signs of stabilizing, according to the latest minutes.",
    source: "Market Watch Daily",
    url: "https://example.com/news/fed-rate-signal",
    imageUrl: null,
    publishedAt: minutesAgo(360),
    symbols: ["DJI", "DIA"],
    entities: ["Federal Reserve"],
    category: "general",
  },
  {
    id: "mock-5",
    title: "Tesla beats delivery estimates for the quarter",
    description:
      "Shares climbed after the company reported stronger than expected quarterly vehicle deliveries.",
    source: "Trade Desk News",
    url: "https://example.com/news/tesla-deliveries-beat",
    imageUrl: null,
    publishedAt: minutesAgo(420),
    symbols: ["TSLA"],
    entities: ["Tesla, Inc."],
    category: "earnings",
  },
  {
    id: "mock-6",
    title: "Bitcoin climbs above key resistance level",
    description:
      "BTC extended its rally as institutional inflows into spot funds continued for a third straight week.",
    source: "Ledger Weekly",
    url: "https://example.com/news/bitcoin-resistance-level",
    imageUrl: null,
    publishedAt: minutesAgo(540),
    symbols: ["BTC"],
    entities: ["Bitcoin"],
    category: "crypto",
  },
];

export const mockNewsProvider: NewsProvider = {
  id: "mock",
  async getLatestNews(): Promise<NewsItem[]> {
    return MOCK_ITEMS;
  },
};
