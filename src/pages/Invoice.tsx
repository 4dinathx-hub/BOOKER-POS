import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Invoice() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const { data: order, isLoading: loadingOrder } = useQuery({
    queryKey: ['/orders', orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data,
    enabled: !!orderId && !!user,
  });
  const { data: restaurant, isLoading: loadingRestaurant } = useQuery({
    queryKey: ['/restaurant/settings'],
    queryFn: async () => (await api.get('/restaurant/settings')).data,
    enabled: !!user,
  });

  if (authLoading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (loadingOrder || loadingRestaurant) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!order) return <p style={{ padding: 24 }}>Order not found.</p>;

  const subtotal = order.items.reduce((s: number, i: any) => s + i.priceEach * i.quantity, 0);
  const tax = Number(order.taxAmount ?? 0);
  const discount = Number(order.discountAmount ?? 0);
  // GST on intra-state restaurant supply is conventionally split evenly into
  // CGST + SGST (both at half the total rate); inter-state would be IGST
  // instead, but that's not a realistic case for dine-in/delivery within
  // one city — flagging the assumption rather than silently baking it in.
  const cgst = tax / 2;
  const sgst = tax / 2;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, fontFamily: 'monospace', fontSize: 13 }}>
      <style>{`
        @media print {
          .no-print { display: none; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="secondary" onClick={() => navigate(-1)}>Back</button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{restaurant.name}</div>
        {restaurant.address && <div>{restaurant.address}</div>}
        {(restaurant.city || restaurant.state || restaurant.pincode) && (
          <div>{[restaurant.city, restaurant.state, restaurant.pincode].filter(Boolean).join(', ')}</div>
        )}
        {restaurant.phone && <div>Ph: {restaurant.phone}</div>}
        {restaurant.gstin && <div>GSTIN: {restaurant.gstin}</div>}
        {restaurant.fssai && <div>FSSAI: {restaurant.fssai}</div>}
      </div>

      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Invoice #{order.id.slice(0, 8).toUpperCase()}</span>
        <span>{new Date(order.createdAt).toLocaleString()}</span>
      </div>
      {order.table && <div>Table: {order.table.label}</div>}
      <div>Type: {order.type}{order.channel !== 'IN_HOUSE' ? ` · ${order.channel}` : ''}</div>
      <hr />

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>Item</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i: any) => (
            <tr key={i.id}>
              <td>{i.menuItem?.name ?? 'Item'}</td>
              <td style={{ textAlign: 'center' }}>{i.quantity}</td>
              <td style={{ textAlign: 'right' }}>₹{i.priceEach}</td>
              <td style={{ textAlign: 'right' }}>₹{i.priceEach * i.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
      {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>-₹{discount.toFixed(2)}</span></div>}
      {tax > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST</span><span>₹{cgst.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST</span><span>₹{sgst.toFixed(2)}</span></div>
        </>
      )}
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
        <span>Total</span><span>₹{order.total}</span>
      </div>

      {order.payments?.length > 0 && (
        <div style={{ marginTop: 8, color: '#555' }}>
          Paid via {order.payments.map((p: any) => p.method).join(', ')}
        </div>
      )}

      {restaurant.upiVpa && !(order.payments?.length > 0) && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>Scan to pay ₹{order.total}</div>
          <div style={{ background: 'white', padding: 8, display: 'inline-block' }}>
            <QRCodeSVG
              value={`upi://pay?pa=${encodeURIComponent(restaurant.upiVpa)}&pn=${encodeURIComponent(restaurant.name)}&am=${order.total}&cu=INR`}
              size={140}
            />
          </div>
        </div>
      )}
      {!restaurant.gstin && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#888' }}>
          No GSTIN on file for this branch — set one in Settings for this to be a valid tax invoice.
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 20 }}>Thank you — visit again!</div>
    </div>
  );
}
