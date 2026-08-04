import { SimpleCrudPage } from '../components/SimpleCrudPage';

export default function Warehouses() {
  return (
    <SimpleCrudPage
      title="Warehouses"
      resourcePath="/inventory/warehouses"
      columns={[{ key: 'name', label: 'Name' }, { key: 'isDefault', label: 'Default', render: (r) => (r.isDefault ? 'Yes' : '') }]}
      createFields={[{ name: 'name', label: 'Name' }, { name: 'isDefault', label: 'Set as default', type: 'checkbox' }]}
      allowEdit={false}
      allowDelete={false}
    />
  );
}
