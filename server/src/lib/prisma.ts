import { PrismaClient } from '@prisma/client';

// Netlify Functions are short-lived but can reuse a warm container between
// invocations, so we still cache the client on `global` the same way the
// old Next.js app did — avoids exhausting the Postgres connection pool
// (via pgbouncer, see DATABASE_URL) under bursty traffic.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
