// Pure helper behind the favorites optimistic update (see
// favorites-provider.tsx). Kept separate from React so the add/remove/
// rollback logic is directly unit-testable without mounting a component
// or mocking fetch/session state.

export function withId(ids: Set<string>, assetId: string): Set<string> {
  const next = new Set(ids);
  next.add(assetId);
  return next;
}

export function withoutId(ids: Set<string>, assetId: string): Set<string> {
  const next = new Set(ids);
  next.delete(assetId);
  return next;
}

/** Applies (or rolls back) a favorite toggle. `add: true` favorites the asset, `add: false` unfavorites it. */
export function applyFavoriteToggle(ids: Set<string>, assetId: string, add: boolean): Set<string> {
  return add ? withId(ids, assetId) : withoutId(ids, assetId);
}
