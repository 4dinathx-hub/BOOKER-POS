import { SimpleCrudPage } from '../components/SimpleCrudPage';

export default function Printers() {
  return (
    <SimpleCrudPage
      title="Printing (KOT / Bill)"
      resourcePath="/printers"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'paperWidth', label: 'Paper width (mm)' },
        { key: 'isDefault', label: 'Default', render: (r) => (r.isDefault ? '✅' : '') },
        { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? '✅' : '❌') },
      ]}
      createFields={[
        { name: 'name', label: 'Printer name' },
        { name: 'type', label: 'Type', type: 'select', options: ['KOT', 'BILL'] },
        { name: 'paperWidth', label: 'Paper width', type: 'select', options: ['58', '80'], defaultValue: '80' },
        { name: 'connection', label: 'Connection (IP/USB path, informational)' },
      ]}
      allowEdit={false}
      allowDelete={false}
    />
  );
}
