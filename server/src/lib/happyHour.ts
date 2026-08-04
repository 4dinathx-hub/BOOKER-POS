import { prisma } from './prisma';

// Returns a menuItemId -> discounted price map for any items covered by a
// currently-active HappyHourRule, computed against the restaurant's own
// timezone (not server/UTC time) — "5-7pm happy hour" means local 5-7pm.
export async function getHappyHourPrices(restaurantId: string, menuItems: { id: string; price: number; categoryId: string }[]) {
  const rules = await prisma.happyHourRule.findMany({ where: { restaurantId, isEnabled: true } });
  if (rules.length === 0) return new Map<string, number>();

  const branch = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true } });
  const now = new Date();
  // Intl-based local time extraction — avoids a moment/date-fns-tz
  // dependency for what's just "what day/HH:mm is it in this timezone".
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: branch.timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const weekdayShort = parts.find((p) => p.type === 'weekday')!.value;
  const hh = parts.find((p) => p.type === 'hour')!.value.padStart(2, '0');
  const mm = parts.find((p) => p.type === 'minute')!.value.padStart(2, '0');
  const nowHm = `${hh}:${mm}`;
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);

  const activeRules = rules.filter((r) => {
    if (!r.daysOfWeek.includes(dayIndex)) return false;
    // Doesn't handle a window crossing midnight (e.g. 23:00-01:00) —
    // straightforward string comparison assumes startTime < endTime same day.
    return nowHm >= r.startTime && nowHm < r.endTime;
  });
  if (activeRules.length === 0) return new Map<string, number>();

  const discounted = new Map<string, number>();
  for (const item of menuItems) {
    const applicable = activeRules.filter((r) => r.categoryId === null || r.categoryId === item.categoryId);
    if (applicable.length === 0) continue;
    // If multiple rules somehow overlap for the same item, use whichever gives the deepest discount.
    const bestDiscount = Math.max(...applicable.map((r) => r.discountPercent));
    discounted.set(item.id, Math.round(item.price * (1 - bestDiscount / 100)));
  }
  return discounted;
}
