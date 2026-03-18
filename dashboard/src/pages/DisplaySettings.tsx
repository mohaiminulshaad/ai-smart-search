import { useState, useEffect, useCallback } from 'react';
import {
  Page, Card, FormLayout, Select, Button, BlockStack,
  InlineStack, Text, Banner, SkeletonBodyText, Checkbox,
} from '@shopify/polaris';
import { TitleBar, useAppBridge } from '@shopify/app-bridge-react';
import { displaySettingsApi, type DisplaySettings as DisplaySettingsType } from '../api/display-settings';

const DISPLAY_OPTIONS = [
  { label: 'All Pages',      value: 'all' },
  { label: 'Home Page Only', value: 'home' },
  { label: 'Product Pages',  value: 'products' },
  { label: 'Cart Page',      value: 'cart' },
];

export default function DisplaySettings() {
  const shopify = useAppBridge();
  const [settings, setSettings] = useState<DisplaySettingsType>({ enabled: true, displayOn: 'all', mobileVisible: true });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    displaySettingsApi.get()
      .then(setSettings)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true); setError('');
    try {
      const saved = await displaySettingsApi.save(settings);
      setSettings(saved);
      shopify.toast.show('Display settings saved ✓', { duration: 3000 });
    } catch (err: any) { setError(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  }, [settings, shopify]);

  if (loading) return <Page title="Display Settings"><Card><SkeletonBodyText lines={6} /></Card></Page>;

  return (
    <Page title="Display Settings" subtitle="Control search widget visibility on your storefront">
      <TitleBar title="Display Settings">
        <button variant="primary" onClick={handleSave}>Save Settings</button>
      </TitleBar>
      <BlockStack gap="500">
        {error && <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>}

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Search Widget Visibility</Text>
            <Checkbox
              label="Enable search widget on storefront"
              checked={settings.enabled}
              onChange={v => setSettings(p => ({ ...p, enabled: v }))}
            />
            {!settings.enabled && (
              <Banner tone="warning">
                The search widget is <strong>disabled</strong> and will not appear on your storefront.
              </Banner>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Page Targeting</Text>
            <FormLayout>
              <Select
                label="Display search widget on"
                options={DISPLAY_OPTIONS}
                value={settings.displayOn}
                onChange={v => setSettings(p => ({ ...p, displayOn: v as DisplaySettingsType['displayOn'] }))}
                disabled={!settings.enabled}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Mobile</Text>
            <Checkbox
              label="Show search widget on mobile devices"
              checked={settings.mobileVisible}
              onChange={v => setSettings(p => ({ ...p, mobileVisible: v }))}
              disabled={!settings.enabled}
            />
            <Text as="p" variant="bodySm" tone="subdued">
              When disabled, the search widget will only appear on desktop browsers.
            </Text>
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSave} loading={saving}>Save Display Settings</Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
