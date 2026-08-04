import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { sendEmail } from '../lib/email';

const router = Router();
router.use(requireAuth);

const SEGMENTS = ['ALL', 'INACTIVE_30D', 'TOP_SPENDERS'] as const;
type Segment = (typeof SEGMENTS)[number];

async function customersInSegment(restaurantId: string, segment: Segment) {
  if (segment === 'INACTIVE_30D') {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return prisma.customer.findMany({
      where: { restaurantId, OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }] },
    });
  }
  if (segment === 'TOP_SPENDERS') {
    return prisma.customer.findMany({ where: { restaurantId }, orderBy: { totalSpend: 'desc' }, take: 100 });
  }
  return prisma.customer.findMany({ where: { restaurantId } });
}

router.get('/segments/:segment/count', requirePermission('marketing:read'), async (req, res) => {
  const segment = req.params.segment as Segment;
  if (!SEGMENTS.includes(segment)) return res.status(400).json({ error: 'Unknown segment' });
  const customers = await customersInSegment(req.auth!.restaurantId!, segment);
  res.json({ audienceSize: customers.length, withEmail: customers.filter((c) => c.email).length });
});

router.get('/', requirePermission('marketing:read'), async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(campaigns);
});

const sendCampaignSchema = z.object({
  segment: z.enum(SEGMENTS),
  subject: z.string().min(1),
  body: z.string().min(1),
});

router.post('/send', requirePermission('marketing:write'), validate(sendCampaignSchema), async (req, res) => {
  const { segment, subject, body } = req.body;
  const restaurantId = req.auth!.restaurantId!;
  const customers = await customersInSegment(restaurantId, segment);
  const withEmail = customers.filter((c) => c.email);

  // Sent sequentially, not Promise.all — a marketing blast to a real
  // customer list has no reason to hammer the email provider's rate limit,
  // and one bad address shouldn't race-condition the sentCount.
  let sentCount = 0;
  for (const customer of withEmail) {
    const html = `<p>Hi ${customer.name},</p><div>${body}</div>`;
    const ok = await sendEmail(customer.email!, subject, html);
    if (ok) sentCount++;
  }

  const campaign = await prisma.campaign.create({
    data: {
      restaurantId, segment, subject, body,
      audienceSize: customers.length,
      sentCount,
      sentById: req.auth!.actorType === 'EMPLOYEE' ? req.auth!.sub : null,
    },
  });

  res.status(201).json({
    ...campaign,
    skippedNoEmail: customers.length - withEmail.length,
  });
});

export default router;
