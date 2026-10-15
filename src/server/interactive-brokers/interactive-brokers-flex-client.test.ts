import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchFlexReport, requestFlexReport } from "./interactive-brokers-flex-client";

const CREDENTIALS = { token: "SECRETTOKEN123456", queryId: "424242" };

const SEND_OK = `<FlexStatementResponse timestamp="x"><Status>Success</Status><ReferenceCode>987654</ReferenceCode><Url>https://example.invalid/GetStatement</Url></FlexStatementResponse>`;
const REPORT = `<FlexQueryResponse queryName="q" type="AF"><FlexStatements count="1"><FlexStatement accountId="U1" /></FlexStatements></FlexQueryResponse>`;

function envelope(status: string, code?: string) {
  return `<FlexStatementResponse timestamp="x"><Status>${status}</Status>${code ? `<ErrorCode>${code}</ErrorCode><ErrorMessage>raw upstream text SECRETTOKEN123456</ErrorMessage>` : ""}</FlexStatementResponse>`;
}

function xml(body: string, init?: ResponseInit) {
  return new Response(body, { status: 200, headers: { "content-type": "text/xml" }, ...init });
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const noSleep = { sleep: async () => undefined };

describe("requestFlexReport", () => {
  it("asks SendRequest with the token, the query id and v=3, and returns the reference code", async () => {
    fetchMock.mockResolvedValue(xml(SEND_OK));

    const result = await requestFlexReport(CREDENTIALS);

    expect(result).toEqual({ ok: true, data: { referenceCode: "987654" } });
    const [url, init] = fetchMock.mock.calls[0];
    const asked = new URL(String(url));
    expect(asked.origin + asked.pathname).toBe("https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest");
    expect(asked.searchParams.get("t")).toBe(CREDENTIALS.token);
    expect(asked.searchParams.get("q")).toBe("424242");
    expect(asked.searchParams.get("v")).toBe("3");
    expect(init.headers["User-Agent"]).toBeTruthy(); // IBKR rejects requests without one
  });

  it("refuses redirects, which would forward the token (in the URL) to another address", async () => {
    fetchMock.mockResolvedValue(xml(SEND_OK));
    await requestFlexReport(CREDENTIALS);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
  });

  it.each([
    ["1015", "invalid_token"],
    ["1012", "token_expired"],
    ["1013", "ip_restricted"],
    ["1014", "invalid_query"],
    ["1018", "rate_limited"],
    ["1019", "not_ready"],
    ["1020", "provider_error"],
  ])("maps IBKR error code %s to %s", async (code, reason) => {
    fetchMock.mockResolvedValue(xml(envelope("Fail", code)));

    const result = await requestFlexReport(CREDENTIALS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("never puts the token, a URL or IBKR's own error text in a message", async () => {
    fetchMock.mockResolvedValue(xml(envelope("Fail", "1020")));
    const result = await requestFlexReport(CREDENTIALS);
    expect(JSON.stringify(result)).not.toContain("SECRETTOKEN");
    expect(JSON.stringify(result)).not.toContain("raw upstream");
    expect(JSON.stringify(result)).not.toContain("http");
  });

  it("drops a network error entirely, since some runtimes echo the request URL in it", async () => {
    fetchMock.mockRejectedValue(new Error(`getaddrinfo failed for https://x/?t=${CREDENTIALS.token}`));

    const result = await requestFlexReport(CREDENTIALS);

    expect(result).toEqual({ ok: false, reason: "network_error", message: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("SECRETTOKEN");
  });

  it("treats HTTP 429 as rate limiting and other statuses as a provider error with only the digits", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    expect(await requestFlexReport(CREDENTIALS)).toMatchObject({ ok: false, reason: "rate_limited" });
    fetchMock.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 503 }));
    const result = await requestFlexReport(CREDENTIALS);
    expect(result).toMatchObject({ ok: false, reason: "provider_error", message: "Interactive Brokers returned an error (code 503)." });
  });

  it("rejects a success answer with no usable reference code", async () => {
    fetchMock.mockResolvedValue(xml("<FlexStatementResponse><Status>Success</Status></FlexStatementResponse>"));
    expect(await requestFlexReport(CREDENTIALS)).toMatchObject({ ok: false, reason: "malformed_response" });
  });
});

describe("fetchFlexReport", () => {
  it("returns the report XML after the two calls", async () => {
    fetchMock.mockResolvedValueOnce(xml(SEND_OK)).mockResolvedValueOnce(xml(REPORT));

    const result = await fetchFlexReport(CREDENTIALS, noSleep);

    expect(result).toEqual({ ok: true, data: REPORT });
    const second = new URL(String(fetchMock.mock.calls[1][0]));
    expect(second.pathname.endsWith("/GetStatement")).toBe(true);
    expect(second.searchParams.get("q")).toBe("987654"); // the reference code, not the query id
  });

  it("asks again while IBKR says the statement is still being generated", async () => {
    fetchMock
      .mockResolvedValueOnce(xml(SEND_OK))
      .mockResolvedValueOnce(xml(envelope("Warn", "1019")))
      .mockResolvedValueOnce(xml(envelope("Warn", "1019")))
      .mockResolvedValueOnce(xml(REPORT));
    const sleep = vi.fn(async () => undefined);

    const result = await fetchFlexReport(CREDENTIALS, { sleep });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up with not_ready instead of waiting forever", async () => {
    fetchMock.mockResolvedValueOnce(xml(SEND_OK));
    // A Response body can be read once, so every poll gets its own.
    fetchMock.mockImplementation(async () => xml(envelope("Warn", "1019")));

    const result = await fetchFlexReport(CREDENTIALS, noSleep);

    expect(result).toMatchObject({ ok: false, reason: "not_ready" });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1 + 5);
  });

  it("stops at once on a real failure while collecting the report", async () => {
    fetchMock.mockResolvedValueOnce(xml(SEND_OK)).mockResolvedValueOnce(xml(envelope("Fail", "1012")));

    const result = await fetchFlexReport(CREDENTIALS, noSleep);

    expect(result).toMatchObject({ ok: false, reason: "token_expired" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a response that declares itself larger than the cap", async () => {
    fetchMock.mockResolvedValueOnce(xml(SEND_OK)).mockResolvedValueOnce(xml("x", { headers: { "content-length": String(50 * 1024 * 1024) } }));

    const result = await fetchFlexReport(CREDENTIALS, noSleep);

    expect(result).toMatchObject({ ok: false, reason: "too_large" });
  });
});
