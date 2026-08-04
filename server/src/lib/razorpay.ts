import crypto from 'crypto';

// Real Razorpay Orders API — no SDK needed, it's a plain REST call with
// HTTP Basic Auth using the key ID/secret from your Razorpay dashboard.
// Get test keys at https://dashboard.razorpay.com/app/keys (test mode is
// free and fully functional for development).
const RAZORPAY_API = 'https://api.razorpay.com/v1';

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  return getCredentials() !== null;
}

// Creates a Razorpay order to open in the client-side checkout widget.
// amountRupees is converted to paise (Razorpay's base unit) here so callers
// always work in rupees, matching every other amount in this codebase.
export async function createRazorpayOrder(amountRupees: number, receipt: string): Promise<{ id: string; amount: number; currency: string; keyId: string }> {
  const creds = getCredentials();
  if (!creds) throw new Error('Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');

  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order creation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { id: data.id, amount: data.amount, currency: data.currency, keyId: creds.keyId };
}

// Verifies the signature Razorpay's checkout returns to the client after a
// successful payment — per their documented scheme:
// expected = HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
// This MUST be checked server-side before ever marking an order paid;
// trusting a client-reported "success" without this is how someone bills
// a ₹5000 order and tells your server it paid ₹5.
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const creds = getCredentials();
  if (!creds) return false;

  const expected = crypto.createHmac('sha256', creds.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
