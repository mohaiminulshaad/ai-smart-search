import { useState, useEffect, useCallback } from 'react';
import {
  Page, Card, IndexTable, Text, Badge, Button, Modal,
  FormLayout, TextField, Select, BlockStack, Banner,
  SkeletonBodyText, EmptyState, InlineStack,
} from '@shopify/polaris';
import { TitleBar, useAppBridge } from '@shopify/app-bridge-react';
import { DeleteIcon } from '@shopify/polaris-icons';
import { apiKeysApi, type ApiKey } from '../api/api-keys';

const PROVIDER_OPTIONS = [
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'OpenAI ChatGPT', value: 'chatgpt' },
];

export default function ApiKeys() {
  const shopify = useAppBridge();
  const [keys, setKeys]         = useState<ApiKey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [provider, setProvider] = useState<'gemini' | 'chatgpt'>('gemini');
  const [label, setLabel]       = useState('');
  const [apiKey, setApiKey]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    apiKeysApi.getAll().then(setKeys).catch(console.error).finally(() => setLoading(false));
  }, []);

  const resetForm = () => { setProvider('gemini'); setLabel(''); setApiKey(''); setError(''); };

  const handleAdd = useCallback(async () => {
    if (!label || !apiKey) return;
    setSaving(true); setError('');
    try {
      const newKey = await apiKeysApi.create({ provider, label, key: apiKey });
      setKeys(prev => [newKey, ...prev]);
      setAddModalOpen(false);
      resetForm();
      shopify.toast.show('API key saved ✓');
    } catch (err: any) {
      setError(err.message || 'Failed to save API key');
    } finally { setSaving(false); }
  }, [provider, label, apiKey, shopify]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await apiKeysApi.delete(id);
      setKeys(prev => prev.filter(k => k.id !== id));
      setDeleteId(null);
      shopify.toast.show('API key deleted');
    } catch (err: any) {
      shopify.toast.show(err.message || 'Delete failed', { isError: true });
    }
  }, [shopify]);

  if (loading) return <Page title="API Keys"><Card><SkeletonBodyText lines={4} /></Card></Page>;

  return (
    <Page title="API Keys" subtitle="Manage AI provider keys for Smart Search"
      primaryAction={{ content: 'Add API Key', onAction: () => setAddModalOpen(true) }}>
      <TitleBar title="API Keys">
        <button variant="primary" onClick={() => setAddModalOpen(true)}>Add API Key</button>
      </TitleBar>
      <BlockStack gap="400">
        <Banner tone="info">
          Keys are stored securely. Only <strong>Gemini</strong> and <strong>ChatGPT</strong> are supported.
          Select the active key in <strong>Search Settings</strong>.
        </Banner>
        {keys.length === 0 ? (
          <Card>
            <EmptyState heading="No API keys configured" image="">
              <p>Add a Gemini or ChatGPT API key to power the AI search.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              itemCount={keys.length}
              headings={[{ title: 'Label' }, { title: 'Provider' }, { title: 'Key' }, { title: 'Created' }, { title: '' }]}
              selectable={false}>
              {keys.map((key, i) => (
                <IndexTable.Row id={key.id} key={key.id} position={i}>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{key.label}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={key.provider === 'gemini' ? 'info' : 'success'}>
                      {key.provider === 'gemini' ? 'Gemini' : 'ChatGPT'}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" tone="subdued">{key.maskedKey}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{new Date(key.createdAt).toLocaleDateString()}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button icon={DeleteIcon} variant="plain" tone="critical"
                      onClick={() => setDeleteId(key.id)}
                      accessibilityLabel={`Delete ${key.label}`} />
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>

      {/* Add Modal */}
      <Modal open={addModalOpen}
        onClose={() => { setAddModalOpen(false); resetForm(); }}
        title="Add API Key"
        primaryAction={{ content: 'Save Key', onAction: handleAdd, loading: saving, disabled: !label || !apiKey }}
        secondaryActions={[{ content: 'Cancel', onAction: () => { setAddModalOpen(false); resetForm(); } }]}>
        <Modal.Section>
          <BlockStack gap="300">
            {error && <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>}
            <FormLayout>
              <Select label="AI Provider" options={PROVIDER_OPTIONS} value={provider}
                onChange={v => setProvider(v as 'gemini' | 'chatgpt')} />
              <TextField label="Label (e.g. Production Key)" value={label}
                onChange={setLabel} autoComplete="off" placeholder="My Gemini Key" />
              <TextField label="API Key" value={apiKey}
                onChange={setApiKey} autoComplete="off" type="password"
                placeholder="AIza... or sk-..." />
            </FormLayout>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete API Key?"
        primaryAction={{ content: 'Delete', onAction: () => deleteId && handleDelete(deleteId), destructive: true }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteId(null) }]}>
        <Modal.Section>
          <Text as="p">This action cannot be undone. The key will be permanently deleted.</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
