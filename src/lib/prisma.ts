import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in development to avoid
// exhausting database connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Pooled/serverless Postgres (Neon) has much higher per-query latency than a
// local database, so bursty traffic (e.g. inspection autosave) can hold every
// connection at once and fail with P2024 "Timed out fetching a new connection
// from the connection pool". Widen the pool and the checkout timeout unless the
// deployment already specifies its own values in DATABASE_URL.
function tunedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "20");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "30");
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "15");
    return url.toString();
  } catch {
    return raw;
  }
}

const datasourceUrl = tunedDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
