-- CreateTable
CREATE TABLE "brokerage_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "totalValue" REAL,
    "cashAvailable" REAL,
    "cashInPies" REAL,
    "cashReserved" REAL,
    "investedValue" REAL,
    "realizedPnl" REAL,
    "unrealizedPnl" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "brokerage_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "brokerage_accounts_brokerageConnectionId_fkey" FOREIGN KEY ("brokerageConnectionId") REFERENCES "brokerage_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "brokerage_positions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "compassAssetId" TEXT,
    "externalTicker" TEXT NOT NULL,
    "externalName" TEXT,
    "currencyCode" TEXT,
    "quantity" REAL NOT NULL,
    "averagePrice" REAL,
    "currentPrice" REAL,
    "unrealizedPnl" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "brokerage_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "brokerage_positions_brokerageConnectionId_fkey" FOREIGN KEY ("brokerageConnectionId") REFERENCES "brokerage_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "brokerage_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "compassAssetId" TEXT,
    "externalTicker" TEXT NOT NULL,
    "externalName" TEXT,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "quantity" REAL,
    "filledQuantity" REAL,
    "fillPrice" REAL,
    "currencyCode" TEXT,
    "externalCreatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "brokerage_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "brokerage_orders_brokerageConnectionId_fkey" FOREIGN KEY ("brokerageConnectionId") REFERENCES "brokerage_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "brokerage_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currencyCode" TEXT,
    "externalCreatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "brokerage_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "brokerage_transactions_brokerageConnectionId_fkey" FOREIGN KEY ("brokerageConnectionId") REFERENCES "brokerage_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "brokerage_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DIVIDEND',
    "compassAssetId" TEXT,
    "externalTicker" TEXT,
    "externalName" TEXT,
    "quantity" REAL,
    "amount" REAL NOT NULL,
    "grossAmountPerShare" REAL,
    "currencyCode" TEXT,
    "externalCreatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "brokerage_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "brokerage_activities_brokerageConnectionId_fkey" FOREIGN KEY ("brokerageConnectionId") REFERENCES "brokerage_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_brokerage_connections" (
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
    "syncStatus" TEXT NOT NULL DEFAULT 'NEVER_SYNCED',
    "syncError" TEXT,
    CONSTRAINT "brokerage_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_brokerage_connections" ("createdAt", "encryptedApiKey", "encryptedApiSecret", "externalAccountId", "id", "lastConnectedAt", "lastSyncAt", "provider", "status", "updatedAt", "userId") SELECT "createdAt", "encryptedApiKey", "encryptedApiSecret", "externalAccountId", "id", "lastConnectedAt", "lastSyncAt", "provider", "status", "updatedAt", "userId" FROM "brokerage_connections";
DROP TABLE "brokerage_connections";
ALTER TABLE "new_brokerage_connections" RENAME TO "brokerage_connections";
CREATE INDEX "brokerage_connections_userId_idx" ON "brokerage_connections"("userId");
CREATE UNIQUE INDEX "brokerage_connections_userId_provider_key" ON "brokerage_connections"("userId", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "brokerage_accounts_brokerageConnectionId_key" ON "brokerage_accounts"("brokerageConnectionId");

-- CreateIndex
CREATE INDEX "brokerage_accounts_userId_idx" ON "brokerage_accounts"("userId");

-- CreateIndex
CREATE INDEX "brokerage_positions_userId_idx" ON "brokerage_positions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "brokerage_positions_brokerageConnectionId_externalId_key" ON "brokerage_positions"("brokerageConnectionId", "externalId");

-- CreateIndex
CREATE INDEX "brokerage_orders_userId_idx" ON "brokerage_orders"("userId");

-- CreateIndex
CREATE INDEX "brokerage_orders_brokerageConnectionId_externalCreatedAt_idx" ON "brokerage_orders"("brokerageConnectionId", "externalCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "brokerage_orders_brokerageConnectionId_externalId_key" ON "brokerage_orders"("brokerageConnectionId", "externalId");

-- CreateIndex
CREATE INDEX "brokerage_transactions_userId_idx" ON "brokerage_transactions"("userId");

-- CreateIndex
CREATE INDEX "brokerage_transactions_brokerageConnectionId_externalCreatedAt_idx" ON "brokerage_transactions"("brokerageConnectionId", "externalCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "brokerage_transactions_brokerageConnectionId_externalId_key" ON "brokerage_transactions"("brokerageConnectionId", "externalId");

-- CreateIndex
CREATE INDEX "brokerage_activities_userId_idx" ON "brokerage_activities"("userId");

-- CreateIndex
CREATE INDEX "brokerage_activities_brokerageConnectionId_externalCreatedAt_idx" ON "brokerage_activities"("brokerageConnectionId", "externalCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "brokerage_activities_brokerageConnectionId_externalId_key" ON "brokerage_activities"("brokerageConnectionId", "externalId");
