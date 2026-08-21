-- CreateTable
CREATE TABLE "paper_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cashBalance" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "paper_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "paper_positions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "averageEntryPrice" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "paper_positions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "paper_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "paper_trades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "executionPrice" REAL NOT NULL,
    "realizedPnl" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_trades_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "paper_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "paper_accounts_userId_key" ON "paper_accounts"("userId");

-- CreateIndex
CREATE INDEX "paper_positions_accountId_idx" ON "paper_positions"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_positions_accountId_assetId_key" ON "paper_positions"("accountId", "assetId");

-- CreateIndex
CREATE INDEX "paper_trades_accountId_idx" ON "paper_trades"("accountId");

-- CreateIndex
CREATE INDEX "paper_trades_accountId_assetId_idx" ON "paper_trades"("accountId", "assetId");
