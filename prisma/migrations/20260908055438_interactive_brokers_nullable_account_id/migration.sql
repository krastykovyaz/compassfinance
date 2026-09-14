-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_brokerage_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "encryptedApiSecret" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastConnectedAt" DATETIME,
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'NEVER_SYNCED',
    "syncError" TEXT,
    "syncStartedAt" DATETIME,
    "lastFailedSyncAt" DATETIME,
    CONSTRAINT "brokerage_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_brokerage_connections" ("createdAt", "encryptedApiKey", "encryptedApiSecret", "externalAccountId", "id", "lastConnectedAt", "lastFailedSyncAt", "lastSyncAt", "provider", "status", "syncError", "syncStartedAt", "syncStatus", "updatedAt", "userId") SELECT "createdAt", "encryptedApiKey", "encryptedApiSecret", "externalAccountId", "id", "lastConnectedAt", "lastFailedSyncAt", "lastSyncAt", "provider", "status", "syncError", "syncStartedAt", "syncStatus", "updatedAt", "userId" FROM "brokerage_connections";
DROP TABLE "brokerage_connections";
ALTER TABLE "new_brokerage_connections" RENAME TO "brokerage_connections";
CREATE INDEX "brokerage_connections_userId_idx" ON "brokerage_connections"("userId");
CREATE INDEX "brokerage_connections_provider_status_syncStartedAt_idx" ON "brokerage_connections"("provider", "status", "syncStartedAt");
CREATE UNIQUE INDEX "brokerage_connections_userId_provider_key" ON "brokerage_connections"("userId", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
