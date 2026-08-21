// The one starting balance every new paper-trading account is created
// with. Derived from the project's existing mock starting-capital figure
// (`buyingPowerUsdc: 1250.0` in the old src/lib/mock-data.ts `user`
// object, which is what the pre-Milestone-16 UI displayed as "buying
// power") rather than an invented number — see Milestone 16's "do not
// invent a new balance" requirement. Used everywhere a new account is
// created; never hardcoded a second time.
export const PAPER_TRADING_STARTING_BALANCE = 1250.0;
