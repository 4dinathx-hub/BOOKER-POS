// Minimal Resend integration — plain fetch() to their HTTP API, no SDK
// install needed. Get a free API key at https://resend.com, verify a
// sending domain (or use their onboarding@resend.dev test address while
// developing), then set RESEND_API_KEY and RESEND_FROM_EMAIL in .env.
//
// Fails SAFELY: if the key isn't set, or the request errors, this logs a
// warning and returns false instead of throwing — a broken email provider
// should never break signup, password reset, or billing actions.

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(`[email] RESEND_API_KEY / RESEND_FROM_EMAIL not set — skipped email to ${to}: "${subject}"`);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      console.warn(`[email] Resend returned ${res.status} sending to ${to}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[email] Failed to send to ${to}:`, err);
    return false;
  }
}

export function passwordResetEmail(company: { name: string }, resetUrl: string) {
  return {
    subject: `Reset your Booker password`,
    html: `
      <h2>Reset your password</h2>
      <p>We received a request to reset the password for <strong>${company.name}</strong>'s Booker account.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Reset password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <p style="color:#888;font-size:12px">Link not working? Paste this into your browser: ${resetUrl}</p>
    `,
  };
}

export function newSignupEmail(restaurant: { name: string; ownerEmail: string | null; ownerPhone: string | null }) {
  return {
    subject: `New Booker signup: ${restaurant.name}`,
    html: `
      <h2>New restaurant signed up</h2>
      <p><strong>${restaurant.name}</strong> just created a Booker account and is on a trial.</p>
      <ul>
        <li>Owner email: ${restaurant.ownerEmail ?? '—'}</li>
        <li>Owner phone: ${restaurant.ownerPhone ?? '—'}</li>
      </ul>
    `,
  };
}
