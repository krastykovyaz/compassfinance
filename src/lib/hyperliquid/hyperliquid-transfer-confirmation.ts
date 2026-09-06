// Real, reproduced bug (2026-09-03): a sendAsset transfer into the XYZ
// HIP-3 dex on testnet reported success (Hyperliquid returned a clean
// {status:"ok"}) but never actually moved any funds — verified directly
// against Hyperliquid's own live testnet API. A "the relay accepted it"
// response is NOT the same fact as "the money actually arrived", and this
// app was treating them as equivalent. This module makes the UI wait for
// and check the SECOND fact — the destination balance actually changing —
// before ever calling a transfer successful. Deliberately checks "did the
// balance change at all" rather than "did it change by exactly the
// transferred amount": simple, hard to get wrong, and correct for this
// narrow window (right after a transfer the user just initiated, no other
// activity expected).

export async function fetchDexWithdrawableBalance(address: string, dex?: string): Promise<number | null> {
  try {
    const url = dex
      ? `/api/hyperliquid/account?address=${address}&dex=${dex}`
      : `/api/hyperliquid/account?address=${address}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { account?: { status: string; account?: { withdrawableBalance: number } } };
    if (json.account?.status !== "ok" || typeof json.account.account?.withdrawableBalance !== "number") {
      return null;
    }
    return json.account.account.withdrawableBalance;
  } catch {
    return null;
  }
}

/** Polls `fetchBalance` until it differs from `baseline` or `attempts` runs
 * out. `fetchBalance`/`sleep` are injected so this stays pure/testable —
 * no fake timers or real network calls needed in tests. Returns true the
 * moment a genuine change is observed, false if it never was. A `null`
 * reading (network hiccup mid-poll) is treated as "no change yet" and
 * simply retried on the next attempt rather than failing the whole
 * confirmation early. */
export async function waitForDexBalanceChange(params: {
  fetchBalance: () => Promise<number | null>;
  baseline: number;
  attempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<boolean> {
  const attempts = params.attempts ?? 5;
  const intervalMs = params.intervalMs ?? 2000;
  const sleep = params.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(intervalMs);
    const current = await params.fetchBalance();
    if (current !== null && Math.abs(current - params.baseline) > 1e-6) {
      return true;
    }
  }
  return false;
}
