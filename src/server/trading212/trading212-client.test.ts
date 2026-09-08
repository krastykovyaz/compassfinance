import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchTrading212AccountInfo,
  getTrading212BaseUrl,
  fetchTrading212AccountSummary,
  fetchTrading212Positions,
  fetchTrading212OrderHistoryPage,
  fetchTrading212DividendsPage,
  fetchTrading212TransactionsPage,
} from "./trading212-client";

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTrading212BaseUrl", () => {
  const original = { ...process.env };
  afterEach(() => {
    // Assigning `undefined` to a process.env key stores the literal
    // string "undefined" instead of deleting it (a real Node.js
    // process.env gotcha) — delete outright when there was nothing to
    // restore, or this leaks a truthy "undefined" into later tests.
    if (original.TRADING212_ENVIRONMENT === undefined) delete process.env.TRADING212_ENVIRONMENT;
    else process.env.TRADING212_ENVIRONMENT = original.TRADING212_ENVIRONMENT;
    if (original.TRADING212_API_BASE_URL === undefined) delete process.env.TRADING212_API_BASE_URL;
    else process.env.TRADING212_API_BASE_URL = original.TRADING212_API_BASE_URL;
  });

  it("defaults to the real live environment, never silently defaulting to demo", () => {
    delete process.env.TRADING212_ENVIRONMENT;
    delete process.env.TRADING212_API_BASE_URL;
    expect(getTrading212BaseUrl()).toBe("https://live.trading212.com/api/v0");
  });

  it("uses the demo environment only when explicitly configured", () => {
    process.env.TRADING212_ENVIRONMENT = "demo";
    delete process.env.TRADING212_API_BASE_URL;
    expect(getTrading212BaseUrl()).toBe("https://demo.trading212.com/api/v0");
  });

  it("an explicit base URL override always wins", () => {
    process.env.TRADING212_API_BASE_URL = "https://custom.example.com/api/v0";
    expect(getTrading212BaseUrl()).toBe("https://custom.example.com/api/v0");
  });
});

describe("fetchTrading212AccountInfo", () => {
  it("sends real HTTP Basic auth (API Key as username, API Secret as password) to the account-info endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 12345678, currencyCode: "USD" }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTrading212AccountInfo("my-key", "my-secret");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://live.trading212.com/api/v0/equity/account/info");
    const expectedAuth = `Basic ${Buffer.from("my-key:my-secret").toString("base64")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
  });

  it("returns the account id (stringified) and currency on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: 12345678, currencyCode: "USD" })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: true, data: { id: "12345678", currencyCode: "USD" } });
  });

  it("classifies a 401 as unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "unauthorized" }, { status: 401 })));

    const result = await fetchTrading212AccountInfo("bad-key", "bad-secret");

    expect(result).toEqual({ ok: false, reason: "unauthorized", message: expect.any(String) });
  });

  it("classifies a 403 as unauthorized too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 403 })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unauthorized");
  });

  it("classifies a 429 as rate_limited, distinct from unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 429 })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("classifies a network failure as network_error, never throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: false, reason: "network_error", message: expect.any(String) });
  });

  it("classifies a response missing an account id as malformed, never fabricating one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ currencyCode: "USD" })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: false, reason: "malformed_response", message: expect.any(String) });
  });

  it("classifies unparseable JSON as malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response)
    );

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: false, reason: "malformed_response", message: expect.any(String) });
  });

  it("never logs the API key, API secret, or Authorization header for any outcome", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await fetchTrading212AccountInfo("super-secret-key-123", "super-secret-value-456");

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((arg) => JSON.stringify(arg))
      .join(" ");
    expect(allLoggedText).not.toContain("super-secret-key-123");
    expect(allLoggedText).not.toContain("super-secret-value-456");
    expect(allLoggedText).not.toContain("Basic ");

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("fetchTrading212AccountSummary — defensive field parsing", () => {
  it("reads the nested cash/investments shape when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          currency: "USD",
          totalValue: 10500.5,
          cash: { availableToTrade: 200, inPies: 50, reservedForOrders: 10 },
          investments: { currentValue: 10250.5, realizedProfitLoss: 30, unrealizedProfitLoss: 120 },
        })
      )
    );

    const result = await fetchTrading212AccountSummary("key", "secret");

    expect(result).toEqual({
      ok: true,
      data: {
        currencyCode: "USD",
        totalValue: 10500.5,
        cashAvailable: 200,
        cashInPies: 50,
        cashReserved: 10,
        investedValue: 10250.5,
        realizedPnl: 30,
        unrealizedPnl: 120,
      },
    });
  });

  it("never fabricates a value for a field that's genuinely absent from the response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ currencyCode: "USD" })));

    const result = await fetchTrading212AccountSummary("key", "secret");

    expect(result).toEqual({
      ok: true,
      data: {
        currencyCode: "USD",
        totalValue: undefined,
        cashAvailable: undefined,
        cashInPies: undefined,
        cashReserved: undefined,
        investedValue: undefined,
        realizedPnl: undefined,
        unrealizedPnl: undefined,
      },
    });
  });

  it("propagates a network failure as network_error, never throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const result = await fetchTrading212AccountSummary("key", "secret");
    expect(result).toEqual({ ok: false, reason: "network_error", message: expect.any(String) });
  });
});

describe("fetchTrading212Positions — defensive field parsing", () => {
  it("reads a flat position shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { ticker: "AAPL_US_EQ", quantity: 10, averagePrice: 150, currentPrice: 181.42, ppl: 314.2 },
        ])
      )
    );

    const result = await fetchTrading212Positions("key", "secret");

    expect(result).toEqual({
      ok: true,
      data: [
        {
          externalTicker: "AAPL_US_EQ",
          externalName: undefined,
          currencyCode: undefined,
          quantity: 10,
          averagePrice: 150,
          currentPrice: 181.42,
          unrealizedPnl: 314.2,
        },
      ],
    });
  });

  it("reads a nested instrument/walletImpact position shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            quantity: 5,
            averagePricePaid: 200,
            instrument: { ticker: "NVDA_US_EQ", name: "NVIDIA Corp.", currency: "USD" },
            walletImpact: { unrealizedProfitLoss: 45.5 },
          },
        ])
      )
    );

    const result = await fetchTrading212Positions("key", "secret");

    expect(result).toEqual({
      ok: true,
      data: [
        {
          externalTicker: "NVDA_US_EQ",
          externalName: "NVIDIA Corp.",
          currencyCode: "USD",
          quantity: 5,
          averagePrice: 200,
          currentPrice: undefined,
          unrealizedPnl: 45.5,
        },
      ],
    });
  });

  it("drops an entry with no identifiable ticker or quantity instead of fabricating one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ currentPrice: 100 }])));

    const result = await fetchTrading212Positions("key", "secret");

    expect(result).toEqual({ ok: true, data: [] });
  });

  it("classifies a non-array response as malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ not: "an array" })));

    const result = await fetchTrading212Positions("key", "secret");

    expect(result).toEqual({ ok: false, reason: "malformed_response", message: expect.any(String) });
  });
});

describe("fetchTrading212OrderHistoryPage — pagination", () => {
  it("parses items and extracts a direct nextCursor field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 555,
              ticker: "AAPL_US_EQ",
              side: "BUY",
              status: "FILLED",
              quantity: 10,
              filledQuantity: 10,
              fillPrice: 181.42,
              currency: "USD",
              dateCreated: "2026-08-12T10:00:00.000Z",
            },
          ],
          nextCursor: "abc123",
        })
      )
    );

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          {
            externalId: "555",
            externalTicker: "AAPL_US_EQ",
            externalName: undefined,
            side: "BUY",
            status: "FILLED",
            quantity: 10,
            filledQuantity: 10,
            fillPrice: 181.42,
            currencyCode: "USD",
            externalCreatedAt: "2026-08-12T10:00:00.000Z",
          },
        ],
        nextCursor: "abc123",
      },
    });
  });

  it("extracts a cursor from a nextPagePath URL when no direct cursor field exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [],
          nextPagePath: "/equity/history/orders?cursor=xyz789&limit=50",
        })
      )
    );

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.nextCursor).toBe("xyz789");
  });

  it("returns a null nextCursor (terminating pagination) when the response carries neither", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [] })));

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.nextCursor).toBeNull();
  });

  it("drops an order with no id, ticker, or creation time", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [{ side: "BUY" }] })));

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result).toEqual({ ok: true, data: { items: [], nextCursor: null } });
  });

  it("classifies a 429 as rate_limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 429 })));

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result).toEqual({ ok: false, reason: "rate_limited", message: expect.any(String) });
  });

  it("Phase 4 fix: keeps a genuine per-unit fillPrice separate from the aggregate filledValue, never conflating them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 1,
              ticker: "AAPL_US_EQ",
              filledQuantity: 5,
              fillPrice: 180.2, // a genuine per-unit field
              filledValue: 901.0, // the real aggregate — NOT the same number, must not be swapped
              dateCreated: "2026-09-06T00:00:00.000Z",
            },
          ],
        })
      )
    );

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].fillPrice).toBe(180.2);
      expect(result.data.items[0].filledValue).toBe(901.0);
    }
  });

  it("derives a per-unit fillPrice from filledValue/filledQuantity only when no genuine per-unit field exists — a real division, not a fabrication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 2,
              ticker: "NVDA_US_EQ",
              filledQuantity: 5,
              filledValue: 901.0,
              dateCreated: "2026-09-06T00:00:00.000Z",
            },
          ],
        })
      )
    );

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].fillPrice).toBeCloseTo(180.2);
      expect(result.data.items[0].filledValue).toBe(901.0);
    }
  });

  it("never derives a fillPrice when there's no filledQuantity to divide by (would-be division by zero/undefined)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ id: 3, ticker: "AAPL_US_EQ", filledValue: 901.0, dateCreated: "2026-09-06T00:00:00.000Z" }],
        })
      )
    );

    const result = await fetchTrading212OrderHistoryPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.items[0].fillPrice).toBeUndefined();
  });
});

describe("fetchTrading212DividendsPage", () => {
  it("parses a dividend and falls back to a composite id when no reference/id is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ ticker: "AAPL_US_EQ", amount: 4.32, paidOn: "2026-08-01T00:00:00.000Z" }],
        })
      )
    );

    const result = await fetchTrading212DividendsPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toEqual([
        {
          externalId: "AAPL_US_EQ:2026-08-01T00:00:00.000Z:4.32",
          externalTicker: "AAPL_US_EQ",
          externalName: undefined,
          quantity: undefined,
          amount: 4.32,
          grossAmountPerShare: undefined,
          currencyCode: undefined,
          externalCreatedAt: "2026-08-01T00:00:00.000Z",
        },
      ]);
    }
  });

  it("uses a real reference id when Trading 212 provides one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [{ reference: "div-ref-1", amount: 1, paidOn: "2026-08-01T00:00:00.000Z" }] })
      )
    );

    const result = await fetchTrading212DividendsPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.items[0].externalId).toBe("div-ref-1");
  });

  it("drops a dividend with no amount or paid date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [{ ticker: "AAPL_US_EQ" }] })));

    const result = await fetchTrading212DividendsPage("key", "secret");

    expect(result).toEqual({ ok: true, data: { items: [], nextCursor: null } });
  });
});

describe("fetchTrading212TransactionsPage", () => {
  it("parses a deposit/withdrawal/fee transaction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ type: "DEPOSIT", amount: 500, dateTime: "2026-07-01T00:00:00.000Z" }],
        })
      )
    );

    const result = await fetchTrading212TransactionsPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]).toEqual({
        externalId: "DEPOSIT:2026-07-01T00:00:00.000Z:500",
        type: "DEPOSIT",
        amount: 500,
        currencyCode: undefined,
        externalCreatedAt: "2026-07-01T00:00:00.000Z",
      });
    }
  });

  it("handles a raw array response (no items wrapper) the same as a wrapped one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ type: "FEE", amount: -1.5, dateTime: "2026-07-02T00:00:00.000Z" }]))
    );

    const result = await fetchTrading212TransactionsPage("key", "secret");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.items).toHaveLength(1);
  });
});
