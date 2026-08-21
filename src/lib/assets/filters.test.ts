import { describe, expect, it } from "vitest";
import { ALL_ASSETS } from "./catalog";
import { filterAssets } from "./filters";

const ctx = (favorites: string[], portfolio: string[]) => ({
  isFavorite: (id: string) => favorites.includes(id),
  isInPortfolio: (id: string) => portfolio.includes(id),
});

describe("filterAssets", () => {
  it("'all' returns every asset unfiltered", () => {
    expect(filterAssets(ALL_ASSETS, "all", ctx([], []))).toHaveLength(ALL_ASSETS.length);
  });

  it("'favorites' returns only favorited assets", () => {
    const result = filterAssets(ALL_ASSETS, "favorites", ctx(["aapl", "btc"], []));
    expect(result.map((a) => a.id)).toEqual(["aapl", "btc"]);
  });

  it("'favorites' is an empty list when nothing is favorited", () => {
    expect(filterAssets(ALL_ASSETS, "favorites", ctx([], []))).toEqual([]);
  });

  it("'portfolio' returns only assets with an open position", () => {
    const result = filterAssets(ALL_ASSETS, "portfolio", ctx([], ["sp500"]));
    expect(result.map((a) => a.id)).toEqual(["sp500"]);
  });

  it("'portfolio' is an empty list when nothing is held", () => {
    expect(filterAssets(ALL_ASSETS, "portfolio", ctx([], []))).toEqual([]);
  });

  it("category filters (stock/index/commodity/crypto) match the catalog category", () => {
    expect(filterAssets(ALL_ASSETS, "index", ctx([], [])).every((a) => a.category === "index")).toBe(
      true
    );
    expect(filterAssets(ALL_ASSETS, "stock", ctx([], [])).every((a) => a.category === "stock")).toBe(
      true
    );
    expect(
      filterAssets(ALL_ASSETS, "commodity", ctx([], [])).every((a) => a.category === "commodity")
    ).toBe(true);
    expect(filterAssets(ALL_ASSETS, "crypto", ctx([], [])).every((a) => a.category === "crypto")).toBe(
      true
    );
  });

  it("an asset can be simultaneously favorited AND in the portfolio, independently", () => {
    const favContext = ctx(["sp500"], ["sp500"]);
    expect(filterAssets(ALL_ASSETS, "favorites", favContext).map((a) => a.id)).toContain("sp500");
    expect(filterAssets(ALL_ASSETS, "portfolio", favContext).map((a) => a.id)).toContain("sp500");
  });

  it("favorite and portfolio status are independent — removing one leaves the other", () => {
    // sp500 favorited but NOT in portfolio
    const onlyFavorite = ctx(["sp500"], []);
    expect(filterAssets(ALL_ASSETS, "favorites", onlyFavorite).map((a) => a.id)).toContain("sp500");
    expect(filterAssets(ALL_ASSETS, "portfolio", onlyFavorite).map((a) => a.id)).not.toContain("sp500");
  });
});
