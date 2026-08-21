// Server-only Prisma client singleton.
//
// Uses Prisma's Rust-free "client" engine (see prisma/schema.prisma —
// engineType = "client") with the better-sqlite3 driver adapter, so no
// native query-engine binary is required at runtime.
//
// IMPORTANT (sandbox note, see README "Known environment limitation"): the
// generated client at src/generated/prisma is produced by `npx prisma
// generate`, which itself downloads a schema-engine binary from
// binaries.prisma.sh. That host was not reachable from the sandbox this
// milestone was built in, so the client could not be generated or type-
// checked here. Run `npx prisma generate` locally (normal network access)
// before `npm run build` / `npm run dev`.
import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  var __compassPrisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads in dev so we don't exhaust
// SQLite file handles / open connections on every edit.
export const prisma = globalThis.__compassPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__compassPrisma = prisma;
}
