-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_brokerage_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "currencyCode" TEXT,
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
INSERT INTO "new_brokerage_accounts" ("brokerageConnectionId", "cashAvailable", "cashInPies", "cashReserved", "createdAt", "currencyCode", "id", "investedValue", "provider", "realizedPnl", "totalValue", "unrealizedPnl", "updatedAt", "userId") SELECT "brokerageConnectionId", "cashAvailable", "cashInPies", "cashReserved", "createdAt", "currencyCode", "id", "investedValue", "provider", "realizedPnl", "totalValue", "unrealizedPnl", "updatedAt", "userId" FROM "brokerage_accounts";
DROP TABLE "brokerage_accounts";
ALTER TABLE "new_brokerage_accounts" RENAME TO "brokerage_accounts";
CREATE UNIQUE INDEX "brokerage_accounts_brokerageConnectionId_key" ON "brokerage_accounts"("brokerageConnectionId");
CREATE INDEX "brokerage_accounts_userId_idx" ON "brokerage_accounts"("userId");
CREATE TABLE "new_brokerage_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerageConnectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "compassAssetId" TEXT,
    "externalTicker" TEXT NOT NULL,
    "externalName" TEXT,
    "side" TEXT,
    "status" TEXT,
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
INSERT INTO "new_brokerage_orders" ("brokerageConnectionId", "compassAssetId", "createdAt", "currencyCode", "externalCreatedAt", "externalId", "externalName", "externalTicker", "fillPrice", "filledQuantity", "id", "provider", "quantity", "side", "status", "updatedAt", "userId") SELECT "brokerageConnectionId", "compassAssetId", "createdAt", "currencyCode", "externalCreatedAt", "externalId", "externalName", "externalTicker", "fillPrice", "filledQuantity", "id", "provider", "quantity", "side", "status", "updatedAt", "userId" FROM "brokerage_orders";
DROP TABLE "brokerage_orders";
ALTER TABLE "new_brokerage_orders" RENAME TO "brokerage_orders";
CREATE INDEX "brokerage_orders_userId_idx" ON "brokerage_orders"("userId");
CREATE INDEX "brokerage_orders_brokerageConnectionId_externalCreatedAt_idx" ON "brokerage_orders"("brokerageConnectionId", "externalCreatedAt");
CREATE UNIQUE INDEX "brokerage_orders_brokerageConnectionId_externalId_key" ON "brokerage_orders"("brokerageConnectionId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
