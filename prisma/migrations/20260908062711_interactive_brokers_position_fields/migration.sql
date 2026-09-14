-- AlterTable
ALTER TABLE "brokerage_positions" ADD COLUMN "assetClass" TEXT;
ALTER TABLE "brokerage_positions" ADD COLUMN "expiry" TEXT;
ALTER TABLE "brokerage_positions" ADD COLUMN "multiplier" REAL;
ALTER TABLE "brokerage_positions" ADD COLUMN "realizedPnl" REAL;
ALTER TABLE "brokerage_positions" ADD COLUMN "sector" TEXT;
ALTER TABLE "brokerage_positions" ADD COLUMN "strike" REAL;
ALTER TABLE "brokerage_positions" ADD COLUMN "underlyingConid" TEXT;
