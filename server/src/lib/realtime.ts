// Ported as-is from the Next.js app: a fire-and-forget POST to Supabase
// Realtime Broadcast, consumed by src/hooks/useRealtime.ts on the client.
// Still best-effort/non-blocking by design (see audit.ts for the contrast —
// this is for "someone should refresh their screen", not anything transactional).
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export type RealtimeEvent = 'orders' | 'tables' | 'reservations' | 'service' | 'kitchen' | 'inventory';

export function notifyRestaurant(restaurantId: string, event: RealtimeEvent) {
  if (!supabaseUrl || !supabaseAnonKey) return;

  fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `restaurant:${restaurantId}`, event, payload: { at: Date.now() } }],
    }),
  }).catch(() => {
    // Worst case: the other screen waits for its next manual refresh.
  });
}
