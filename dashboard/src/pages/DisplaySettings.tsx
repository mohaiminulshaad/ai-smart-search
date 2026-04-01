import { useState, useEffect, useCallback } from 'react';
import {
  Page, Card, FormLayout, Select, Button, BlockStack,
  InlineStack, Text, Banner, SkeletonBodyText, Checkbox, RadioButton, List,
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
  const [settings, setSettings] = useState<DisplaySettingsType>({ enabled: true, displayOn: 'all', mobileVisible: true, widgetType: 'bubble' });
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

  const showEmbedInstructions = settings.widgetType === 'embed' || settings.widgetType === 'both';
  const showBubbleInstructions = settings.widgetType === 'bubble' || settings.widgetType === 'both';

  return (
    <Page title="Display Settings" subtitle="Control search widget visibility on your storefront">
      <TitleBar title="Display Settings">
        <button variant="primary" onClick={handleSave}>Save Settings</button>
      </TitleBar>
      <BlockStack gap="500">
        {error && <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>}

        {/* ── Visibility ── */}
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

        {/* ── Widget Type ── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Widget Type</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Choose how the search widget appears on your storefront.
            </Text>

            <RadioButton
              label="Floating Bubble"
              helpText="A floating circle button fixed at the bottom corner of every page. No theme changes needed."
              checked={settings.widgetType === 'bubble'}
              onChange={() => setSettings(p => ({ ...p, widgetType: 'bubble' }))}
              disabled={!settings.enabled}
            />

            <RadioButton
              label="Embed in Theme (Header / Footer)"
              helpText="A search icon placed directly inside your theme header or footer via App Embeds."
              checked={settings.widgetType === 'embed'}
              onChange={() => setSettings(p => ({ ...p, widgetType: 'embed' }))}
              disabled={!settings.enabled}
            />

            <RadioButton
              label="Both — Bubble + Theme Embed"
              helpText="Show the floating bubble AND a search icon inside your theme at the same time."
              checked={settings.widgetType === 'both'}
              onChange={() => setSettings(p => ({ ...p, widgetType: 'both' }))}
              disabled={!settings.enabled}
            />

            {/* Instructions for embed modes */}
            {showEmbedInstructions && settings.enabled && (
              <Banner tone="info" title="How to enable the Theme Embed search icon">
                <Text as="p" variant="bodySm">To show the search icon in your header or footer:</Text>
                <List type="number">
                  <List.Item>Go to your Shopify Admin → <strong>Online Store → Themes</strong></List.Item>
                  <List.Item>Click <strong>Customize</strong> on your active theme</List.Item>
                  <List.Item>In the left sidebar, click <strong>App embeds</strong> (the puzzle piece icon)</List.Item>
                  <List.Item>Find <strong>Smart Search</strong> and toggle it <strong>ON</strong></List.Item>
                  <List.Item>Click <strong>Save</strong> in the theme editor</List.Item>
                </List>
              </Banner>
            )}

            {/* Instructions for bubble-only mode */}
            {showBubbleInstructions && settings.enabled && settings.widgetType === 'bubble' && (
              <Banner tone="success" title="Floating bubble is active">
                The search bubble will appear automatically on your storefront. No theme changes needed.
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* ── Page Targeting ── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Page Targeting</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Controls which pages the <strong>floating bubble</strong> appears on. The theme embed appears on all pages.
            </Text>
            <FormLayout>
              <Select
                label="Show floating bubble on"
                options={DISPLAY_OPTIONS}
                value={settings.displayOn}
                onChange={v => setSettings(p => ({ ...p, displayOn: v as DisplaySettingsType['displayOn'] }))}
                disabled={!settings.enabled || settings.widgetType === 'embed'}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        {/* ── Mobile ── */}
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
              When disabled, the floating bubble will only appear on desktop browsers.
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
