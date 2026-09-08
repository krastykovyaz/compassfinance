-- AlterTable
ALTER TABLE "brokerage_connections" ADD COLUMN "lastFailedSyncAt" DATETIME;
ALTER TABLE "brokerage_connections" ADD COLUMN "syncStartedAt" DATETIME;

-- CreateIndex
CREATE INDEX "brokerage_connections_provider_status_syncStartedAt_idx" ON "brokerage_connections"("provider", "status", "syncStartedAt");
