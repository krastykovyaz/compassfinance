import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, generateKeyPairSync, publicEncrypt, constants as cryptoConstants } from "crypto";

vi.mock("server-only", () => ({}));

import {
  buildInteractiveBrokersAuthenticatedCredentials,
  fetchInteractiveBrokersAccessToken,
  fetchInteractiveBrokersAccountLedger,
  fetchInteractiveBrokersTransactions,
  fetchInteractiveBrokersLiveSessionToken,
  fetchInteractiveBrokersPortfolioAccounts,
  fetchInteractiveBrokersPositions,
  fetchInteractiveBrokersRequestToken,
  getInteractiveBrokersAuthorizeUrl,
} from "./interactive-brokers-client";
import { modPow } from "./interactive-brokers-live-session-token";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const { privateKey: encryptionPrivateKey, publicKey: encryptionPublicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function textResponse(body: string, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    text: async () => body,
  } as Response;
}

function extractHeaderParam(header: string, key: string): string | undefined {
  const match = header.match(new RegExp(`${key}="([^"]*)"`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const original = { ...process.env };

function resetEnv() {
  for (const key of [
    "IBKR_CONSUMER_KEY",
    "IBKR_RSA_PRIVATE_KEY",
    "IBKR_API_BASE_URL",
    "IBKR_AUTHORIZE_BASE_URL",
    "IBKR_RSA_ENCRYPTION_PRIVATE_KEY",
    "IBKR_DH_PRIME",
    "IBKR_REALM",
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

beforeEach(() => {
  process.env.IBKR_CONSUMER_KEY = "test-consumer-key";
  process.env.IBKR_RSA_PRIVATE_KEY = privateKey;
});

afterEach(() => {
  resetEnv();
  vi.unstubAllGlobals();
});

describe("fetchInteractiveBrokersRequestToken", () => {
  it("returns not_configured (never throws) when the consumer key/RSA key aren't set", async () => {
    delete process.env.IBKR_CONSUMER_KEY;
    delete process.env.IBKR_RSA_PRIVATE_KEY;

    const result = await fetchInteractiveBrokersRequestToken();

    expect(result).toEqual({
      ok: false,
      reason: "not_configured",
      message: "Interactive Brokers integration is not configured",
    });
  });

  it("POSTs a signed request to /oauth/request_token with no request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(JSON.stringify({ oauth_token: "req-token-123" })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersRequestToken();

    expect(result).toEqual({ ok: true, data: { requestToken: "req-token-123" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/oauth/request_token");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^OAuth /);
  });

  it("parses a classic form-encoded response body as a fallback to JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("oauth_token=req-token-456"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersRequestToken();

    expect(result).toEqual({ ok: true, data: { requestToken: "req-token-456" } });
  });

  it("classifies a 401/403 as unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", { status: 401 })));
    expect((await fetchInteractiveBrokersRequestToken()).ok).toBe(false);
    const result = await fetchInteractiveBrokersRequestToken();
    if (!result.ok) expect(result.reason).toBe("unauthorized");
  });

  it("classifies a 5xx as provider_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", { status: 503 })));
    const result = await fetchInteractiveBrokersRequestToken();
    if (!result.ok) expect(result.reason).toBe("provider_error");
  });

  it("classifies a network failure as network_error, never leaking the caught error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("secret internal DNS detail that must never leak"))
    );

    const result = await fetchInteractiveBrokersRequestToken();

    expect(result).toEqual({ ok: false, reason: "network_error", message: "Couldn't reach Interactive Brokers" });
  });

  it("classifies a response missing oauth_token as malformed_response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ unexpected: true }))));

    const result = await fetchInteractiveBrokersRequestToken();

    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("never references /iserver anywhere in its request path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(JSON.stringify({ oauth_token: "t" })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchInteractiveBrokersRequestToken();

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("/iserver");
  });
});

describe("getInteractiveBrokersAuthorizeUrl", () => {
  it("builds a real interactivebrokers.com URL carrying the request token", () => {
    const url = getInteractiveBrokersAuthorizeUrl("req-token-abc");
    expect(url).toBe("https://interactivebrokers.com/authorize?oauth_token=req-token-abc");
  });
});

describe("fetchInteractiveBrokersAccessToken", () => {
  it("signs the request with oauth_token and oauth_verifier included, and returns the access token pair", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(textResponse(JSON.stringify({ oauth_token: "access-tok", oauth_token_secret: "access-secret" })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersAccessToken("req-token-abc", "verifier-xyz");

    expect(result).toEqual({ ok: true, data: { accessToken: "access-tok", accessTokenSecret: "access-secret" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/oauth/access_token");
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toContain('oauth_token="req-token-abc"');
    expect(auth).toContain('oauth_verifier="verifier-xyz"');
  });

  it("returns not_configured without ever calling fetch when unconfigured", async () => {
    delete process.env.IBKR_CONSUMER_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersAccessToken("req-token-abc", "verifier-xyz");

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies a response missing the access token secret as malformed_response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ oauth_token: "access-tok" }))));

    const result = await fetchInteractiveBrokersAccessToken("req-token-abc", "verifier-xyz");

    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — Live Session Token + /portfolio/* reads.
// ---------------------------------------------------------------------------

const DH_PRIME = (BigInt(1) << BigInt(256)) - BigInt(189);
const DH_GENERATOR = BigInt(2);

function setUpSyncConfig() {
  process.env.IBKR_RSA_ENCRYPTION_PRIVATE_KEY = encryptionPrivateKey;
  process.env.IBKR_DH_PRIME = DH_PRIME.toString(16);
}

/** Encrypts a known hex secret exactly the way IBKR's own Access Token
 * Secret is documented to arrive: PKCS#1 v1.5-encrypted, base64-encoded. */
function encryptAccessTokenSecret(secretHex: string): string {
  return publicEncrypt(
    { key: encryptionPublicKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(secretHex, "hex")
  ).toString("base64");
}

/** Plays IBKR's own side of the Diffie-Hellman exchange for a test:
 * reads the client's diffie_hellman_challenge out of the real
 * Authorization header the code under test just sent, picks its own
 * server-side exponent, and independently computes the SAME shared
 * secret + Live Session Token + verification signature — duplicating a
 * small amount of the derivation logic deliberately, since a real test
 * of a two-party protocol needs an independent "other party," not a
 * mock that just echoes back whatever makes the code under test pass. */
function simulateIbkrLiveSessionTokenResponse(authorizationHeader: string, prependHex: string) {
  const clientChallengeHex = extractHeaderParam(authorizationHeader, "diffie_hellman_challenge")!;
  const clientChallenge = BigInt(`0x${clientChallengeHex}`);
  const serverRandom = BigInt(999983);
  const dhResponse = modPow(DH_GENERATOR, serverRandom, DH_PRIME);
  const sharedSecret = modPow(clientChallenge, serverRandom, DH_PRIME);

  let hex = sharedSecret.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let keyBytes = Buffer.from(hex, "hex");
  if (keyBytes.length > 0 && (keyBytes[0] & 0x80) !== 0) keyBytes = Buffer.concat([Buffer.from([0]), keyBytes]);

  const lst = createHmac("sha1", keyBytes).update(Buffer.from(prependHex, "hex")).digest("base64");
  const lstSignatureHex = createHmac("sha1", Buffer.from(lst, "base64")).update("test-consumer-key", "utf8").digest("hex");

  return {
    diffie_hellman_response: dhResponse.toString(16),
    live_session_token_signature: lstSignatureHex,
    live_session_token_expiration: Date.now() + 24 * 60 * 60 * 1000,
    expectedLst: lst,
  };
}

describe("fetchInteractiveBrokersLiveSessionToken", () => {
  it("returns not_configured (never calling fetch) when Phase 2 config is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersLiveSessionToken("access-tok", "irrelevant-secret");

    expect(result).toEqual({ ok: false, reason: "not_configured", message: "Interactive Brokers portfolio sync is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("derives, verifies, and returns a Live Session Token that agrees with an independently-computed server side", async () => {
    setUpSyncConfig();
    const prependHex = "deadbeefcafef00d";
    const accessTokenSecret = encryptAccessTokenSecret(prependHex);

    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      const serverResponse = simulateIbkrLiveSessionTokenResponse(auth, prependHex);
      return textResponse(JSON.stringify(serverResponse));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersLiveSessionToken("access-tok", accessTokenSecret);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/oauth/live_session_token");
    expect((init.headers as Record<string, string>).Authorization).toContain('oauth_signature_method="RSA-SHA256"');
  });

  it("returns malformed_response when the derived LST fails IBKR's own verification", async () => {
    setUpSyncConfig();
    const prependHex = "deadbeefcafef00d";
    const accessTokenSecret = encryptAccessTokenSecret(prependHex);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        textResponse(
          JSON.stringify({
            diffie_hellman_response: "1234",
            live_session_token_signature: "0".repeat(40), // wrong on purpose
            live_session_token_expiration: Date.now(),
          })
        )
      )
    );

    const result = await fetchInteractiveBrokersLiveSessionToken("access-tok", accessTokenSecret);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("returns malformed_response, never throwing, when the Access Token Secret can't be decrypted", async () => {
    setUpSyncConfig();
    vi.stubGlobal("fetch", vi.fn());

    const result = await fetchInteractiveBrokersLiveSessionToken("access-tok", "not-valid-encrypted-data");

    expect(result).toEqual({ ok: false, reason: "malformed_response", message: "Couldn't decrypt the stored Interactive Brokers credentials" });
  });

  it("returns malformed_response when IBKR's response is missing required fields", async () => {
    setUpSyncConfig();
    const accessTokenSecret = encryptAccessTokenSecret("aabbcc");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ unexpected: true }))));

    const result = await fetchInteractiveBrokersLiveSessionToken("access-tok", accessTokenSecret);

    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});

describe("fetchInteractiveBrokersPortfolioAccounts", () => {
  const credentials = buildInteractiveBrokersAuthenticatedCredentials("test-consumer-key", "access-tok", Buffer.from("lst").toString("base64"));

  it("calls GET /portfolio/accounts with an HMAC-signed Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(JSON.stringify([{ accountId: "U1234567", currency: "USD", type: "DEMO" }])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersPortfolioAccounts(credentials);

    expect(result).toEqual({
      ok: true,
      data: [{ accountId: "U1234567", currency: "USD", type: "DEMO", clearingStatus: null, accountTitle: null, accountAlias: null }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/portfolio/accounts");
    expect((init.headers as Record<string, string>).Authorization).toContain('oauth_signature_method="HMAC-SHA256"');
  });

  it("drops an account entry with no usable id — never fabricates one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify([{ currency: "USD" }, { accountId: "U1" }]))));

    const result = await fetchInteractiveBrokersPortfolioAccounts(credentials);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].accountId).toBe("U1");
    }
  });

  it("falls back to the bare `id` field when `accountId` is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify([{ id: "U9999999" }]))));

    const result = await fetchInteractiveBrokersPortfolioAccounts(credentials);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].accountId).toBe("U9999999");
  });

  it("returns an empty list, not an error, for a genuinely empty account response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify([]))));

    const result = await fetchInteractiveBrokersPortfolioAccounts(credentials);

    expect(result).toEqual({ ok: true, data: [] });
  });

  it("classifies a 429 as rate_limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", { status: 429 })));

    const result = await fetchInteractiveBrokersPortfolioAccounts(credentials);

    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });
});

describe("fetchInteractiveBrokersAccountLedger", () => {
  const credentials = buildInteractiveBrokersAuthenticatedCredentials("test-consumer-key", "access-tok", Buffer.from("lst").toString("base64"));

  it("reads the BASE currency entry from GET /portfolio/{accountId}/ledger", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      textResponse(
        JSON.stringify({
          USD: { netliquidationvalue: 1, currency: "USD" },
          BASE: {
            netliquidationvalue: 215721776.0,
            cashbalance: 215100080.0,
            unrealizedpnl: 39907.37,
            realizedpnl: 0.0,
            currency: "BASE",
          },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersAccountLedger("U1234567", credentials);

    expect(result).toEqual({
      ok: true,
      data: { currencyCode: "BASE", netLiquidationValue: 215721776.0, cashBalance: 215100080.0, unrealizedPnl: 39907.37, realizedPnl: 0.0 },
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/portfolio/U1234567/ledger");
  });

  it("falls back to settledcash when cashbalance is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(textResponse(JSON.stringify({ BASE: { settledcash: 500, currency: "BASE" } })))
    );

    const result = await fetchInteractiveBrokersAccountLedger("U1234567", credentials);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.cashBalance).toBe(500);
  });

  it("returns malformed_response when there is no BASE entry at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ USD: { netliquidationvalue: 1 } }))));

    const result = await fetchInteractiveBrokersAccountLedger("U1234567", credentials);

    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("leaves missing numeric fields null rather than substituting zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ BASE: { currency: "BASE" } }))));

    const result = await fetchInteractiveBrokersAccountLedger("U1234567", credentials);

    expect(result).toEqual({
      ok: true,
      data: { currencyCode: "BASE", netLiquidationValue: null, cashBalance: null, unrealizedPnl: null, realizedPnl: null },
    });
  });
});

describe("fetchInteractiveBrokersPositions", () => {
  const credentials = buildInteractiveBrokersAuthenticatedCredentials("test-consumer-key", "access-tok", Buffer.from("lst").toString("base64"));

  it("calls GET /portfolio2/{accountId}/positions and normalizes every documented field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      textResponse(
        JSON.stringify([
          {
            conid: 9408,
            position: 12.0,
            avgCost: 266.2,
            avgPrice: 266.2,
            currency: "USD",
            description: "MCD",
            marketPrice: 258.83,
            marketValue: 3105.96,
            realizedPnl: 0.0,
            unrealizedPnl: 88.55,
            assetClass: "STK",
            secType: "STK",
            sector: "Consumer, Cyclical",
            group: "Retail",
          },
        ])
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersPositions("U1234567", credentials);

    expect(result).toEqual({
      ok: true,
      data: [
        {
          conid: "9408",
          symbol: "MCD",
          quantity: 12.0,
          averagePrice: 266.2,
          marketPrice: 258.83,
          marketValue: 3105.96,
          unrealizedPnl: 88.55,
          realizedPnl: 0.0,
          currency: "USD",
          assetClass: "STK",
          sector: "Consumer, Cyclical",
          expiry: null,
          strike: null,
          multiplier: null,
          underlyingConid: null,
        },
      ],
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/portfolio2/U1234567/positions");
  });

  it("also accepts the v1-style mktPrice/mktValue/contractDesc field names (IBKR's own docs use both)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        textResponse(
          JSON.stringify([
            { conid: 756733, position: 5.0, mktPrice: 471.16, mktValue: 2355.8, contractDesc: "SPY", currency: "USD", assetClass: "STK" },
          ])
        )
      )
    );

    const result = await fetchInteractiveBrokersPositions("U1234567", credentials);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].symbol).toBe("SPY");
      expect(result.data[0].marketPrice).toBe(471.16);
      expect(result.data[0].marketValue).toBe(2355.8);
    }
  });

  it("drops a position with no conid — never fabricates one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(textResponse(JSON.stringify([{ position: 5.0 }, { conid: 42, position: 1.0 }])))
    );

    const result = await fetchInteractiveBrokersPositions("U1234567", credentials);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].conid).toBe("42");
    }
  });

  it("preserves an options position's derivatives-only fields (expiry/strike/multiplier/underlying)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        textResponse(
          JSON.stringify([
            {
              conid: 999,
              position: 1.0,
              assetClass: "OPT",
              secType: "OPT",
              expiry: "20261218",
              strike: 150.0,
              putOrCall: "C",
              multiplier: 100,
              undConid: 265598,
              currency: "USD",
            },
          ])
        )
      )
    );

    const result = await fetchInteractiveBrokersPositions("U1234567", credentials);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].assetClass).toBe("OPT");
      expect(result.data[0].expiry).toBe("20261218");
      expect(result.data[0].strike).toBe(150.0);
      expect(result.data[0].multiplier).toBe(100);
      expect(result.data[0].underlyingConid).toBe("265598");
    }
  });

  it("returns an empty list, not an error, when the account has no positions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify([]))));

    const result = await fetchInteractiveBrokersPositions("U1234567", credentials);

    expect(result).toEqual({ ok: true, data: [] });
  });

  it("classifies a malformed (non-array) body as malformed_response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ not: "an array" }))));

    const result = await fetchInteractiveBrokersPositions("U1234567", credentials);

    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});

describe("fetchInteractiveBrokersTransactions", () => {
  const credentials = buildInteractiveBrokersAuthenticatedCredentials("test-consumer-key", "access-tok", Buffer.from("lst").toString("base64"));

  it("POSTs to /pa/transactions with exactly one conid, signed the same way as the GET calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      textResponse(
        JSON.stringify({
          transactions: [
            { date: "Mon Dec 11 00:00:00 EST 2023", cur: "USD", pr: 192.26, qty: -5, acctid: "U1234567", amt: 961.3, conid: 265598, type: "Sell", desc: "Apple Inc" },
          ],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.ibkr.com/v1/api/pa/transactions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ acctIds: ["U1234567"], conids: [265598], currency: "USD", days: 90 });
    expect((init.headers as Record<string, string>).Authorization).toContain('oauth_signature_method="HMAC-SHA256"');
  });

  it("normalizes a real transaction row, parsing IBKR's Java-style date into ISO", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        textResponse(
          JSON.stringify({
            transactions: [
              { date: "Mon Dec 11 00:00:00 EST 2023", cur: "USD", pr: 192.26, qty: -5, acctid: "U1234567", amt: 961.3, conid: 265598, type: "Sell", desc: "Apple Inc" },
            ],
          })
        )
      )
    );

    const result = await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    expect(result).toEqual({
      ok: true,
      data: [
        { conid: 265598, description: "Apple Inc", type: "Sell", quantity: -5, price: 192.26, amount: 961.3, currencyCode: "USD", occurredAt: "2023-12-11T05:00:00.000Z" },
      ],
    });
  });

  it("returns an empty list, not an error, when there is no transaction history in the window", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ transactions: [] }))));

    const result = await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    expect(result).toEqual({ ok: true, data: [] });
  });

  it("drops a row with an unparseable date rather than storing a fabricated timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        textResponse(JSON.stringify({ transactions: [{ date: "not-a-real-date", cur: "USD", pr: 1, qty: 1, amt: 1, conid: 1, type: "Buy" }] }))
      )
    );

    const result = await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    expect(result).toEqual({ ok: true, data: [] });
  });

  it("classifies a malformed (missing transactions array) body as malformed_response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(JSON.stringify({ unexpected: true }))));

    const result = await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("respects a caller-supplied lookback window instead of always using the 90-day default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(JSON.stringify({ transactions: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials, 30);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).days).toBe(30);
  });

  it("classifies a 429 as rate_limited — the exact outcome IBKR's own 1-req/15-min limit produces", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", { status: 429 })));

    const result = await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("never references /iserver anywhere in its request path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(JSON.stringify({ transactions: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchInteractiveBrokersTransactions("U1234567", 265598, credentials);

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("/iserver");
  });
});
