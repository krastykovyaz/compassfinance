-- CreateTable
CREATE TABLE "brokerage_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "encryptedApiSecret" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastConnectedAt" DATETIME,
    "lastSyncAt" DATETIME,
    CONSTRAINT "brokerage_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "brokerage_connections_userId_idx" ON "brokerage_connections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "brokerage_connections_userId_provider_key" ON "brokerage_connections"("userId", "provider");
