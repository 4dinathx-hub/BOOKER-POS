import { SimpleCrudPage } from '../components/SimpleCrudPage';

export default function Taxes() {
  return (
    <SimpleCrudPage
      title="Taxes & GST"
      resourcePath="/taxes"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'cgstRate', label: 'CGST %' },
        { key: 'sgstRate', label: 'SGST %' },
        { key: 'hsnCode', label: 'HSN' },
        { key: 'isDefault', label: 'Default', render: (r) => (r.isDefault ? '✅' : '') },
      ]}
      createFields={[
        { name: 'name', label: 'Name (e.g. GST 5%)' },
        { name: 'cgstRate', label: 'CGST %', type: 'number' },
        { name: 'sgstRate', label: 'SGST %', type: 'number' },
        { name: 'hsnCode', label: 'HSN/SAC code' },
        { name: 'isTaxInclusive', label: 'Prices are tax-inclusive', type: 'checkbox', defaultValue: true },
        { name: 'isDefault', label: 'Set as branch default', type: 'checkbox' },
      ]}
    />
  );
}
