import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const guestApi = axios.create({ baseURL: '/api/guest' });

export default function MenuView() {
  const { restaurantId } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['guest-menu-view', restaurantId],
    queryFn: async () => (await guestApi.get(`/${restaurantId}/menu`)).data,
    enabled: !!restaurantId,
  });

  if (isLoading) return <div style={{ padding: 24, textAlign: 'center' }}>Loading menu…</div>;
  if (!data) return <div style={{ padding: 24, textAlign: 'center' }}>Menu not found.</div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: 24 }}>
      <div style={{ padding: 16, borderBottom: '1px solid #eee', textAlign: 'center' }}>
        <h2 style={{ margin: '4px 0' }}>{data.restaurant.name}</h2>
        {data.restaurant.city && <div style={{ color: '#888', fontSize: 13 }}>{data.restaurant.city}</div>}
      </div>

      {data.categories.map((cat: any) => (
        <div key={cat.id} style={{ padding: '8px 16px' }}>
          <h4 style={{ marginBottom: 6 }}>{cat.name}</h4>
          {cat.items.map((item: any) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <div>{item.name}</div>
                {item.description && <div style={{ fontSize: 12, color: '#888' }}>{item.description}</div>}
              </div>
              <div style={{ whiteSpace: 'nowrap', paddingLeft: 8 }}>₹{item.price}</div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ textAlign: 'center', color: '#888', fontSize: 12, padding: 16 }}>
        Prices shown may not include applicable taxes. To order, please scan the QR code at your table.
      </div>
    </div>
  );
}
