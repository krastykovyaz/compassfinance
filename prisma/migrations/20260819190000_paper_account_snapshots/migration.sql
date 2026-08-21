-- CreateTable
CREATE TABLE "paper_account_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "portfolioValue" REAL NOT NULL,
    "cashBalance" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_account_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "paper_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "paper_account_snapshots_accountId_createdAt_idx" ON "paper_account_snapshots"("accountId", "createdAt");
