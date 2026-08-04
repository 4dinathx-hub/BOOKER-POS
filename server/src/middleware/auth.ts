import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ActorRole } from '../lib/permissions';

// These MUST be set via env var in production. Falling back silently to a
// hardcoded secret would mean every deployment of this codebase shares the
// same signing key — anyone who's read this file could forge a valid token
// for any account, including SUPER_ADMIN. Dev convenience only applies when
// NODE_ENV isn't 'production'; in production, a missing secret is a startup
// error, not a silent security hole.
function requiredSecret(envVar: string, devFallback: string): string {
  const value = process.env[envVar];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envVar} must be set in production — refusing to start with a hardcoded fallback secret. Set it in Netlify → Site settings → Environment variables.`);
  }
  return devFallback;
}

const ACCESS_SECRET = requiredSecret('JWT_ACCESS_SECRET', 'dev-only-access-secret-change-me');
const REFRESH_SECRET = requiredSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me');
const ACCESS_TTL = '30m';
const REFRESH_TTL = '30d';

// Replaces the old three uncoordinated cookies (booker_owner_company_id,
// booker_super_admin, booker_employee_id) with a single signed token shape.
// NOTE: tokens are sent as a Bearer header, not a cookie — the SPA and the
// API are logically one origin behind Netlify, but keeping this
// header-based (not cookie-based) avoids CSRF entirely and keeps the
// Express layer stateless, which matters for serverless cold starts.
export interface AuthTokenPayload {
  sub: string;               // user id (Company.id for owner, Employee.id for staff, 'super-admin' id for platform admin)
  actorType: 'OWNER' | 'EMPLOYEE' | 'SUPER_ADMIN';
  role: ActorRole;
  companyId: string | null;
  restaurantId: string | null; // active branch, null for OWNER until a branch is selected
  name: string;
}

export function signAccessToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(payload: Pick<AuthTokenPayload, 'sub' | 'actorType'>) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, REFRESH_SECRET) as Pick<AuthTokenPayload, 'sub' | 'actorType'>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
      /** Raw request body bytes, captured by app.ts's express.json({ verify }) hook.
       *  Needed for webhook signature checks (HMAC must run over the exact bytes
       *  the sender signed, not a re-serialized copy of the parsed JSON — those
       *  can differ in key order/whitespace and silently break verification). */
      rawBody?: Buffer;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as AuthTokenPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// For routes that must not leak data across branches: confirms the
// :restaurantId route param (or body.restaurantId) matches the caller's
// active branch, unless they're SUPER_ADMIN.
export function requireSameRestaurant(req: Request, res: Response, next: NextFunction) {
  const targetId = req.params.restaurantId || req.body?.restaurantId || req.query.restaurantId;
  if (!req.auth) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.auth.role === 'SUPER_ADMIN') return next();
  if (!targetId || targetId !== req.auth.restaurantId) {
    return res.status(403).json({ error: 'Restaurant/branch mismatch' });
  }
  next();
}
