import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import path from "path";

function createPrismaClient() {
  // On Windows, path.join returns backslashes — libsql requires forward slashes
  const dbPath = path.join(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  const url = `file:${dbPath}`;
  console.log("[DB] Connecting to:", url);
  const libsql = createClient({ url });
  const adapter = new PrismaLibSql(libsql);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
