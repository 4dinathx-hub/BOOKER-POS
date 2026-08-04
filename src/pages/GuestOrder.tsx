import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';

// Deliberately separate from src/api/client.ts — that client is wired for
// authenticated staff sessions (attaches a Bearer token, redirects to
// /login on 401). This page is public and unauthenticated by design.
const guestApi = axios.create({ baseURL: '/api/guest' });

// Razorpay's checkout is a client-side script, not an npm package — this
// loads it once and caches the promise so repeated calls don't re-inject it.
let razorpayScriptPromise: Promise<boolean> | null = null;
function loadRazorpayScript(): Promise<boolean> {
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

interface CartLine { menuItemId: string; name: string; price: number; quantity: number; }

export default function GuestOrder() {
  const { restaurantId, tableId } = useParams();
  const base = `/${restaurantId}/${tableId}`;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [serviceRequestSent, setServiceRequestSent] = useState<string | null>(null);
  const [payOnlineError, setPayOnlineError] = useState<string | null>(null);
  const [payingOnline, setPayingOnline] = useState(false);

  async function payOnline() {
    if (!placedOrderId) return;
    setPayOnlineError(null);
    setPayingOnline(true);
    try {
      const { data: order } = await guestApi.post(`${base}/order/${placedOrderId}/create-payment-order`);
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error('Could not load the payment page — check your connection and try again');

      const razorpay = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.razorpayOrderId,
        name: 'Pay your bill',
        handler: async (response: any) => {
          try {
            await guestApi.post(`${base}/order/${placedOrderId}/verify-payment`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
          } catch {
            setPayOnlineError('Payment succeeded but verification failed — please show staff your payment confirmation.');
          } finally {
            setPayingOnline(false);
          }
        },
        modal: { ondismiss: () => setPayingOnline(false) },
      });
      razorpay.open();
    } catch (err: any) {
      setPayOnlineError(err.response?.data?.error ?? err.message ?? 'Could not start payment');
      setPayingOnline(false);
    }
  }

  const { data: menu, isLoading } = useQuery({
    queryKey: ['guest-menu', restaurantId, tableId],
    queryFn: async () => (await guestApi.get(`${base}/menu`)).data,
    enabled: !!restaurantId && !!tableId,
  });

  const { data: orderStatus } = useQuery({
    queryKey: ['guest-order-status', placedOrderId],
    queryFn: async () => (await guestApi.get(`${base}/order/${placedOrderId}/status`)).data,
    enabled: !!placedOrderId,
    refetchInterval: 8000,
  });

  const placeOrder = useMutation({
    mutationFn: async () =>
      (await guestApi.post(`${base}/order`, { items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })) })).data,
    onSuccess: (data) => { setPlacedOrderId(data.orderId); setCart([]); setError(null); },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to place order — some items may no longer be available'),
  });

  const requestService = useMutation({
    mutationFn: async (type: 'CALL_WAITER' | 'REQUEST_BILL') => (await guestApi.post(`${base}/service-request`, { type })).data,
    onSuccess: (_data, type) => setServiceRequestSent(type),
  });

  const sendFeedback = useMutation({
    mutationFn: async () => (await guestApi.post(`${base}/feedback`, { rating: feedbackRating, comment: feedbackComment || undefined })).data,
    onSuccess: () => setFeedbackSent(true),
  });

  function addToCart(item: any) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) return prev.map((c) => (c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }
  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) => prev.map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c)).filter((c) => c.quantity > 0));
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  if (isLoading) return <div style={{ padding: 24, textAlign: 'center' }}>Loading menu…</div>;
  if (!menu) return <div style={{ padding: 24, textAlign: 'center' }}>This table's ordering link isn't valid. Ask staff for help.</div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: cart.length ? 90 : 24, fontFamily: 'sans-serif' }}>
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #eee' }}>
        <div style={{ fontSize: 12, color: '#888' }}>Table {menu.table.label}</div>
        <h2 style={{ margin: '4px 0' }}>Menu</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => requestService.mutate('CALL_WAITER')} disabled={requestService.isPending} style={{ fontSize: 12, padding: '6px 10px' }}>
            🔔 Call waiter
          </button>
          <button onClick={() => requestService.mutate('REQUEST_BILL')} disabled={requestService.isPending} style={{ fontSize: 12, padding: '6px 10px' }}>
            🧾 Request bill
          </button>
        </div>
        {serviceRequestSent && (
          <div style={{ fontSize: 12, color: 'green', marginTop: 6 }}>
            {serviceRequestSent === 'CALL_WAITER' ? 'A waiter has been notified.' : 'Bill requested — someone will be with you shortly.'}
          </div>
        )}
      </div>

      {placedOrderId && (
        <div style={{ margin: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>Order placed ✅</div>
          <div style={{ fontSize: 13, color: '#555' }}>Status: {orderStatus?.status ?? 'Sent to kitchen'}</div>

          {orderStatus?.status && orderStatus.status !== 'BILLED' && (
            <div style={{ marginTop: 10 }}>
              <button onClick={payOnline} disabled={payingOnline} style={{ width: '100%' }}>
                {payingOnline ? 'Opening payment…' : `Pay online · ₹${orderStatus?.total ?? cartTotal}`}
              </button>
              {payOnlineError && <div style={{ color: 'red', fontSize: 12, marginTop: 4 }}>{payOnlineError}</div>}
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Or pay staff directly with cash/card at your table.</div>
            </div>
          )}
          {orderStatus?.status === 'BILLED' && !feedbackSent && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>How was it?</div>
              <div style={{ marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} onClick={() => setFeedbackRating(n)} style={{ cursor: 'pointer', fontSize: 22, color: n <= feedbackRating ? '#f5a623' : '#ccc' }}>★</span>
                ))}
              </div>
              <textarea
                placeholder="Anything you'd like to tell us? (optional)"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                style={{ width: '100%', minHeight: 50, marginBottom: 6 }}
              />
              <button onClick={() => sendFeedback.mutate()} disabled={!feedbackRating || sendFeedback.isPending} style={{ width: '100%' }}>
                Submit feedback
              </button>
            </div>
          )}
          {feedbackSent && <div style={{ marginTop: 8, color: 'green', fontSize: 13 }}>Thanks for the feedback!</div>}
        </div>
      )}

      {menu.categories.map((cat: any) => (
        <div key={cat.id} style={{ padding: '8px 16px' }}>
          <h4 style={{ marginBottom: 6 }}>{cat.name}</h4>
          {cat.items.map((item: any) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <div>{item.name}</div>
                <div style={{ fontSize: 13, color: '#888' }}>₹{item.price}</div>
              </div>
              <button onClick={() => addToCart(item)}>Add</button>
            </div>
          ))}
        </div>
      ))}

      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #ddd', padding: 12, maxWidth: 480, margin: '0 auto' }}>
          {cart.map((c) => (
            <div key={c.menuItemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 4 }}>
              <span>{c.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => changeQty(c.menuItemId, -1)} style={{ padding: '2px 8px' }}>-</button>
                {c.quantity}
                <button onClick={() => changeQty(c.menuItemId, 1)} style={{ padding: '2px 8px' }}>+</button>
                <span style={{ width: 50, textAlign: 'right' }}>₹{c.price * c.quantity}</span>
              </span>
            </div>
          ))}
          {error && <div style={{ color: 'red', fontSize: 12, marginBottom: 6 }}>{error}</div>}
          <button onClick={() => placeOrder.mutate()} disabled={placeOrder.isPending} style={{ width: '100%', padding: 10, fontWeight: 600 }}>
            {placeOrder.isPending ? 'Placing order…' : `Place order · ₹${cartTotal}`}
          </button>
        </div>
      )}
    </div>
  );
}
