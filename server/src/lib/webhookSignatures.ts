import crypto from 'crypto';

// ---- Swiggy & Zomato: HMAC-SHA256 over the raw request body ----
// Both partner APIs (as documented at integration time) sign webhook
// payloads with HMAC-SHA256 using a per-merchant shared secret, sent back
// as a header for you to recompute and compare. The header name and casing
// differ per platform and DO change over time — verify the exact header
// name against your current partner dashboard/docs before going live;
// this defaults to the commonly-used name for each but takes an override.
export function verifyHmacSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws if buffer lengths differ, so guard first —
  // a length mismatch is just "not equal", not a crash.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifySwiggySignature(rawBody: Buffer, req: { headers: Record<string, unknown> }, secret: string): boolean {
  const header = req.headers['x-swiggy-signature'];
  return verifyHmacSignature(rawBody, typeof header === 'string' ? header : undefined, secret);
}

export function verifyZomatoSignature(rawBody: Buffer, req: { headers: Record<string, unknown> }, secret: string): boolean {
  const header = req.headers['x-zomato-signature'];
  return verifyHmacSignature(rawBody, typeof header === 'string' ? header : undefined, secret);
}

// ---- ONDC: NOT a simple HMAC — flagged honestly rather than faked ----
// ONDC runs on the Beckn protocol, which signs requests with Ed25519 keys
// exchanged during network onboarding (registry-based, per-participant
// signing/encryption key pairs, plus a signature over specific request
// headers via the BG-Signature scheme) — meaningfully more involved than
// a shared-secret HMAC check. Implementing this correctly needs your
// actual ONDC subscriber ID and signing keys from network registration,
// which don't exist yet in this codebase. This function intentionally
// always returns false so a real request never gets waved through by
// something that only looks like it verifies ONDC signatures — wire up
// the real Beckn signing/verification flow (there are reference Node
// libraries from ONDC's GitHub org) before enabling the ONDC channel.
export function verifyOndcSignature(_rawBody: Buffer, _req: { headers: Record<string, unknown> }, _secret: string): boolean {
  return false;
}
