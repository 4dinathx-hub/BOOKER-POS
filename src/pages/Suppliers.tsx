import { SimpleCrudPage } from '../components/SimpleCrudPage';

export default function Suppliers() {
  return (
    <SimpleCrudPage
      title="Suppliers"
      resourcePath="/suppliers"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'contactPerson', label: 'Contact' },
        { key: 'phone', label: 'Phone' },
        { key: 'paymentTerms', label: 'Payment terms' },
      ]}
      createFields={[
        { name: 'name', label: 'Name' },
        { name: 'contactPerson', label: 'Contact person' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email' },
        { name: 'gstin', label: 'GSTIN' },
        { name: 'paymentTerms', label: 'Payment terms (e.g. NET_30)' },
      ]}
    />
  );
}
