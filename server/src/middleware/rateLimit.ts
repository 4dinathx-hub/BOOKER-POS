import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

// Durable, DB-backed sliding-window-ish limiter for the unauthenticated
// QR-ordering surface. Replaces an earlier in-memory Map, which reset
// silently whenever a Netlify Function container recycled — meaning that
// version could be bypassed just by hitting a cold start, without anyone
// doing anything clever. Uses Postgres (already provisioned for
// everything else here) instead of adding a Redis dependency.
//
// This is a raw SQL upsert rather than a Prisma-generated one specifically
// to keep the increment-and-check atomic under concurrent requests hitting
// the same key at once — two nearly-simultaneous requests from the same IP
// must not both read count=0 and both proceed.
export function rateLimit(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);

    try {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_buckets (key, count, expires_at)
        VALUES (${key}, 1, ${expiresAt})
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limit_buckets.expires_at < ${now} THEN 1 ELSE rate_limit_buckets.count + 1 END,
          expires_at = CASE WHEN rate_limit_buckets.expires_at < ${now} THEN ${expiresAt} ELSE rate_limit_buckets.expires_at END
        RETURNING count;
      `;
      const count = rows[0]?.count ?? 1;
      if (count > maxRequests) {
        return res.status(429).json({ error: 'Too many requests, please slow down' });
      }
      next();
    } catch (err) {
      // A rate limiter failing shouldn't take down the ordering flow it's
      // protecting — log and let the request through rather than 500 every
      // guest order because of a transient DB hiccup on this one table.
      console.warn('[rateLimit] check failed, allowing request through:', err);
      next();
    }
  };
}

// Old rows are never queried again once expired, but they do accumulate.
// Call this from a scheduled job (Netlify Scheduled Function, or just a
// cron hitting an authenticated admin endpoint) if the table's growth
// becomes worth caring about — not wired up automatically here since this
// codebase has no scheduler configured yet.
export async function pruneExpiredRateLimitBuckets() {
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE expires_at < NOW();`;
}
