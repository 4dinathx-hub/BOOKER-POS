import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { hashSecret, verifySecret } from '../lib/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken, requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import crypto from 'crypto';
import { ownerLoginSchema, employeeLoginSchema, refreshSchema, signupSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas';
import { recordAudit } from '../lib/audit';
import { sendEmail, passwordResetEmail } from '../lib/email';

const router = Router();

// ---- Owner signup ----
router.post('/signup', validate(signupSchema), async (req, res) => {
  const { name, email, phone, password } = req.body;
  const existing = await prisma.company.findFirst({ where: { ownerEmail: email } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await hashSecret(password);
  const company = await prisma.company.create({
    data: { name, ownerEmail: email, ownerPhone: phone, ownerPasswordHash: passwordHash },
  });

  const accessToken = signAccessToken({
    sub: company.id, actorType: 'OWNER', role: 'OWNER', companyId: company.id, restaurantId: null, name: company.name,
  });
  const refreshToken = signRefreshToken({ sub: company.id, actorType: 'OWNER' });
  res.status(201).json({ accessToken, refreshToken, company: { id: company.id, name: company.name, onboardingStep: company.onboardingStep } });
});

// ---- Owner login ----
router.post('/login', validate(ownerLoginSchema), async (req, res) => {
  const { email, password } = req.body;
  const company = await prisma.company.findFirst({ where: { ownerEmail: email } });
  if (!company?.ownerPasswordHash || !(await verifySecret(password, company.ownerPasswordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const defaultBranch = await prisma.restaurant.findFirst({ where: { companyId: company.id, isDefaultBranch: true } });

  const accessToken = signAccessToken({
    sub: company.id, actorType: 'OWNER', role: 'OWNER', companyId: company.id,
    restaurantId: defaultBranch?.id ?? null, name: company.name,
  });
  const refreshToken = signRefreshToken({ sub: company.id, actorType: 'OWNER' });
  res.json({ accessToken, refreshToken, company: { id: company.id, name: company.name }, activeBranchId: defaultBranch?.id ?? null });
});

// ---- Owner: switch active branch (re-issues access token scoped to the new branch) ----
router.post('/switch-branch', requireAuth, async (req, res) => {
  if (req.auth!.actorType !== 'OWNER') return res.status(403).json({ error: 'Only the owner can switch branches' });
  const { restaurantId } = req.body as { restaurantId: string };
  const branch = await prisma.restaurant.findFirst({ where: { id: restaurantId, companyId: req.auth!.companyId! } });
  if (!branch) return res.status(404).json({ error: 'Branch not found' });

  const accessToken = signAccessToken({ ...req.auth!, restaurantId: branch.id });
  res.json({ accessToken });
});

// ---- Employee PIN login (captain/staff) ----
router.post('/employee-login', validate(employeeLoginSchema), async (req, res) => {
  const { restaurantId, code, pin } = req.body;
  const employee = await prisma.employee.findUnique({ where: { restaurantId_code: { restaurantId, code } } });
  if (!employee || employee.status !== 'ACTIVE' || !(await verifySecret(pin, employee.pinHash))) {
    return res.status(401).json({ error: 'Invalid code or PIN' });
  }

  const accessToken = signAccessToken({
    sub: employee.id, actorType: 'EMPLOYEE', role: employee.role, companyId: null,
    restaurantId: employee.restaurantId, name: employee.name,
  });
  const refreshToken = signRefreshToken({ sub: employee.id, actorType: 'EMPLOYEE' });
  res.json({ accessToken, refreshToken, employee: { id: employee.id, name: employee.name, role: employee.role } });
});

// ---- Refresh ----
router.post('/refresh', validate(refreshSchema), async (req, res) => {
  try {
    const decoded = verifyRefreshToken(req.body.refreshToken);
    if (decoded.actorType === 'OWNER') {
      const company = await prisma.company.findUniqueOrThrow({ where: { id: decoded.sub } });
      const branch = await prisma.restaurant.findFirst({ where: { companyId: company.id, isDefaultBranch: true } });
      const accessToken = signAccessToken({
        sub: company.id, actorType: 'OWNER', role: 'OWNER', companyId: company.id, restaurantId: branch?.id ?? null, name: company.name,
      });
      return res.json({ accessToken });
    }
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: decoded.sub } });
    const accessToken = signAccessToken({
      sub: employee.id, actorType: 'EMPLOYEE', role: employee.role, companyId: null, restaurantId: employee.restaurantId, name: employee.name,
    });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ---- Forgot password: request a reset link ----
// Always responds 200 with a generic message, whether or not the email
// exists — never leak account existence to an unauthenticated caller.
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const { email } = req.body;
  const company = await prisma.company.findFirst({ where: { ownerEmail: email } });

  if (company) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.company.update({ where: { id: company.id }, data: { resetTokenHash, resetTokenExpiresAt } });

    const resetUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/reset-password?token=${rawToken}`;
    const { subject, html } = passwordResetEmail(company, resetUrl);
    const sent = await sendEmail(email, subject, html);
    if (!sent) {
      // No email provider configured (or it failed) — still useful in dev/self-hosted setups.
      console.warn(`[auth] Password reset link for ${email}: ${resetUrl}`);
    }
  }

  res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
});

// ---- Reset password: consume the token ----
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const company = await prisma.company.findFirst({
    where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
  });
  if (!company) return res.status(400).json({ error: 'This reset link is invalid or has expired' });

  const ownerPasswordHash = await hashSecret(password);
  await prisma.company.update({
    where: { id: company.id },
    data: { ownerPasswordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });

  res.json({ message: 'Password updated — you can now log in.' });
});

// ---- Whoami ----
router.get('/me', requireAuth, (req, res) => res.json(req.auth));

// ---- Logout (client just drops tokens; endpoint exists for audit trail) ----
router.post('/logout', requireAuth, async (req, res) => {
  if (req.auth!.restaurantId) {
    await recordAudit({ restaurantId: req.auth!.restaurantId, actor: req.auth!, action: 'LOGOUT', entityType: 'Session' });
  }
  res.status(204).send();
});

export default router;
