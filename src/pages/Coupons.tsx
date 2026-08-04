import { SimpleCrudPage } from '../components/SimpleCrudPage';

export default function Coupons() {
  return (
    <SimpleCrudPage
      title="Coupons & Discounts"
      resourcePath="/coupons"
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'discountType', label: 'Type' },
        { key: 'discountValue', label: 'Value' },
        { key: 'timesUsed', label: 'Times used' },
        { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? '✅' : '❌') },
      ]}
      createFields={[
        { name: 'code', label: 'Code (e.g. WELCOME10)' },
        { name: 'description', label: 'Description' },
        { name: 'discountType', label: 'Type', type: 'select', options: ['PERCENT', 'FLAT'], defaultValue: 'PERCENT' },
        { name: 'discountValue', label: 'Value', type: 'number' },
      ]}
    />
  );
}
