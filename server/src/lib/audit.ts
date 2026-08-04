import { prisma } from './prisma';
import { AuthTokenPayload } from '../middleware/auth';

interface AuditParams {
  restaurantId: string;
  actor: AuthTokenPayload;
  action: string; // e.g. "ORDER_VOIDED", "PRICE_CHANGED"
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}

// Call this after any sensitive mutation: price changes, voids, refunds,
// role changes, discount overrides, employee status changes, settings edits.
// Deliberately fire-and-forget (not awaited by callers that care about
// response latency) but errors ARE logged server-side, unlike the realtime
// broadcast helper — losing an audit write silently is a bigger problem
// than losing a UI refresh ping.
export async function recordAudit(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        restaurantId: params.restaurantId,
        actorType: params.actor.actorType,
        actorId: params.actor.sub,
        actorName: params.actor.name,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeData: params.before as any,
        afterData: params.after as any,
        ipAddress: params.ipAddress,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record audit log', params.action, err);
  }
}
