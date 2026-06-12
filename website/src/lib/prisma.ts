import fs from "fs";
import path from "path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Resolve relative SQLite paths against both the app folder and the repo root,
 * so `next dev`/`next start` work no matter which directory launched them.
 * (Production uses Postgres with a full connection URL — see README §Database.)
 */
function resolveSqliteUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath)) return url;
  const candidates = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), "website", filePath),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return "file:" + (found ?? candidates[0]);
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: resolveSqliteUrl(process.env.DATABASE_URL ?? "file:./prisma/dev.db"),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
