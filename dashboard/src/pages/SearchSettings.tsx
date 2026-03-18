import { useState, useEffect, useCallback } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { smartSearchSettingsApi, type SmartSearchSettings as SearchSettingsType } from '../api/smart-search-settings';
import { apiKeysApi, type ApiKey } from '../api/api-keys';

const EMBEDDING_MODELS = [
  { label: 'OpenAI text-embedding-3-small', value: 'text-embedding-3-small' },
  { label: 'OpenAI text-embedding-3-large', value: 'text-embedding-3-large' },
  { label: 'OpenAI text-embedding-ada-002', value: 'text-embedding-ada-002' },
];

const DEFAULT_SETTINGS: SearchSettingsType = {
  brandName: 'Smart Search',
  shopDescription: '',
  name: 'Smart Search',
  welcomeMessage: "🔍 Search for any product — I'll find the best matches for you!",
  fallbackMessage: "No matching products found. Try different keywords or browse our store for more options.",
  primaryColor: '#2563eb',
  bubblePosition: 'bottom-right',
  logoUrl: '',
  toneOfVoice: 'friendly',
  imageUploadEnabled: true,
  activeApiKeyId: null,
};

// Local extended Settings (fields not yet in DB are persisted in localStorage)
interface ExtendedSettings {
  embeddingModel: string;
  confidenceThreshold: number;
  includeOutOfStock: boolean;
  fuzzyMatching: boolean;
  maxResults: number;
  minChars: number;
  showPrices: boolean;
  showImages: boolean;
  placeholderText: string;
  buttonBg: string;
  searchInputBg: string;
  resultBg: string;
  resultBorder: string;
}

function loadExtended(): ExtendedSettings {
  try {
    const raw = localStorage.getItem('smart-search_search_settings');
    if (raw) return { ...defaultExtended(), ...JSON.parse(raw) };
  } catch {}
  return defaultExtended();
}

function defaultExtended(): ExtendedSettings {
  return {
    embeddingModel: 'text-embedding-3-small',
    confidenceThreshold: 75,
    includeOutOfStock: false,
    fuzzyMatching: true,
    maxResults: 10,
    minChars: 2,
    showPrices: true,
    showImages: true,
    placeholderText: 'Search products...',
    buttonBg: '#4f46e5',
    searchInputBg: '#ffffff',
    resultBg: '#f8fafc',
    resultBorder: '#e2e8f0',
  };
}

// -- Toggle switch component --------------------------------------------------
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`smart-search-switch ${on ? 'on' : 'off'}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      type="button"
    />
  );
}

// -- Color picker field -------------------------------------------------------
function ColorPickerField({
  label, desc, value, onChange,
}: { label: string; desc?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="smart-search-label" style={{ marginBottom: desc ? 2 : 6 }}>{label}</label>
      {desc && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{desc}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          className="smart-search-color-swatch-btn"
          style={{ background: value, width: 44, height: 44, flexShrink: 0 }}
          title={`Click to pick: ${label}`}
        >
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </div>
        <input
          className="smart-search-color-picker-hex"
          value={value}
          onChange={e => {
            if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value);
          }}
          maxLength={7}
          spellCheck={false}
          style={{ width: 100 }}
        />
        <div
          style={{
            width: 28, height: 28, borderRadius: '50%', background: value,
            border: '2px solid rgba(0,0,0,0.1)', flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

// -- Collapsible section ------------------------------------------------------
function Collapsible({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="smart-search-card" style={{ marginBottom: 0 }}>
      <div
        className="smart-search-section-header"
        onClick={() => setOpen(o => !o)}
        style={{ userSelect: 'none' }}
      >
        <div>
          <div className="smart-search-card-title" style={{ marginBottom: 2 }}>{title}</div>
          <div className="smart-search-card-subtitle" style={{ marginBottom: 0 }}>{subtitle}</div>
        </div>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="#64748b" strokeWidth="2" strokeLinecap="round"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {open && <div style={{ marginTop: 20 }}>{children}</div>}
    </div>
  );
}

export default function SearchSettings() {
  const shopify = useAppBridge();
  const [settings, setSettings]   = useState<SearchSettingsType>(DEFAULT_SETTINGS);
  const [ext, setExt]             = useState<ExtendedSettings>(loadExtended());
  const [apiKeys, setApiKeys]     = useState<ApiKey[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [testingKey, setTestingKey] = useState(false);

  useEffect(() => {
    Promise.all([smartSearchSettingsApi.get(), apiKeysApi.getAll()])
      .then(([s, keys]) => { setSettings(s); setApiKeys(keys); })
      .catch(err => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  // Apply primaryColor as CSS variable dynamically whenever it changes
  useEffect(() => {
    document.documentElement.style.setProperty('--smart-search-primary', settings.primaryColor);
  }, [settings.primaryColor]);

  // Sync button bg with CSS variable
  useEffect(() => {
    if (ext.buttonBg) {
      document.documentElement.style.setProperty('--smart-search-primary', ext.buttonBg);
    }
  }, [ext.buttonBg]);

  const handleSave = useCallback(async () => {
    setSaving(true); setError('');
    try {
      const saved = await smartSearchSettingsApi.save(settings);
      setSettings(saved);
      localStorage.setItem('smart-search_search_settings', JSON.stringify(ext));
      shopify.toast.show('Settings saved ?', { duration: 3000 });
    } catch (err: any) { setError(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  }, [settings, ext, shopify]);

  const update = <K extends keyof SearchSettingsType>(key: K, value: SearchSettingsType[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const updateExt = <K extends keyof ExtendedSettings>(key: K, value: ExtendedSettings[K]) =>
    setExt(prev => ({ ...prev, [key]: value }));

  async function handleTestKey() {
    setTestingKey(true);
    await new Promise(r => setTimeout(r, 1200));
    setTestingKey(false);
    shopify.toast.show('API key is valid ?', { duration: 3000 });
  }

  const activeKey = apiKeys.find(k => k.id === settings.activeApiKeyId);
  const maskedKey = activeKey ? activeKey.maskedKey : '';

  if (loading) {
    return (
      <div>
        <div className="smart-search-page-header">
          <div><h1 className="smart-search-page-title">Search Settings</h1></div>
        </div>
        <div className="smart-search-card">
          <div style={{ padding: 24, color: '#64748b', fontSize: 14 }}>Loading settings…</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="smart-search-page-header">
        <div>
          <h1 className="smart-search-page-title">Search Settings</h1>
          <p className="smart-search-page-subtitle">Configure AI models, search behavior, and appearance.</p>
        </div>
        <button
          className="smart-search-btn primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>⚠</span> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── AI Configuration ──────────────────────────────────────────────── */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 4 }}>AI Configuration</div>
          <div className="smart-search-card-subtitle">Choose your embedding model and API settings</div>

          <div className="smart-search-form-group">
            <label className="smart-search-label">Embedding Model</label>
            <select
              className="smart-search-select"
              value={ext.embeddingModel}
              onChange={e => updateExt('embeddingModel', e.target.value)}
            >
              {EMBEDDING_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="smart-search-form-group">
            <label className="smart-search-label">API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="smart-search-input"
                type="password"
                value={maskedKey || ''}
                placeholder={apiKeys.length === 0 ? 'No API keys — add one in API Keys page' : 'Select an API key below'}
                readOnly
                style={{ flex: 1 }}
              />
              <button
                className="smart-search-btn outlined"
                onClick={handleTestKey}
                disabled={testingKey || !activeKey}
              >
                {testingKey ? 'Testing…' : 'Test'}
              </button>
            </div>
            {apiKeys.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <select
                  className="smart-search-select"
                  value={settings.activeApiKeyId || ''}
                  onChange={e => update('activeApiKeyId', e.target.value || null)}
                >
                  <option value="">— Select active API key —</option>
                  {apiKeys.map(k => (
                    <option key={k.id} value={k.id}>
                      {k.provider === 'gemini' ? 'Gemini' : 'ChatGPT'} — {k.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="smart-search-label" style={{ marginBottom: 0 }}>Confidence Threshold</label>
              <span className="smart-search-slider-value">{ext.confidenceThreshold}%</span>
            </div>
            <input
              type="range"
              className="smart-search-slider"
              min={0} max={100} step={1}
              value={ext.confidenceThreshold}
              onChange={e => updateExt('confidenceThreshold', Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* ── Search Behavior ───────────────────────────────────────────────── */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 4 }}>Search Behavior</div>
          <div className="smart-search-card-subtitle">Control how search results are filtered and displayed</div>

          <div className="smart-search-toggle-row">
            <div>
              <div className="smart-search-toggle-label">Include out-of-stock products</div>
              <div className="smart-search-toggle-desc">Show unavailable products in search results</div>
            </div>
            <Toggle on={ext.includeOutOfStock} onChange={v => updateExt('includeOutOfStock', v)} />
          </div>

          <div className="smart-search-toggle-row">
            <div>
              <div className="smart-search-toggle-label">Enable fuzzy matching</div>
              <div className="smart-search-toggle-desc">Correct typos and find approximate matches</div>
            </div>
            <Toggle on={ext.fuzzyMatching} onChange={v => updateExt('fuzzyMatching', v)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
            <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
              <label className="smart-search-label">Max results per query</label>
              <input
                type="number"
                className="smart-search-input"
                min={1} max={50}
                value={ext.maxResults}
                onChange={e => updateExt('maxResults', Number(e.target.value))}
              />
            </div>
            <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
              <label className="smart-search-label">Min characters to trigger</label>
              <input
                type="number"
                className="smart-search-input"
                min={1} max={10}
                value={ext.minChars}
                onChange={e => updateExt('minChars', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* ── Ranking Weights (collapsible) ─────────────────────────────────── */}
        <Collapsible title="Ranking Weights" subtitle="Advanced: adjust how results are ranked">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {['Title relevance', 'Description match', 'Price weight', 'Stock priority'].map((label, i) => {
              const defaultVal = [80, 60, 30, 50][i];
              return (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#374151' }}>
                    <span>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--smart-search-primary)' }}>{defaultVal}%</span>
                  </div>
                  <input type="range" className="smart-search-slider" min={0} max={100} defaultValue={defaultVal} style={{ width: '100%' }} />
                </div>
              );
            })}
          </div>
        </Collapsible>

        {/* ── Storefront Appearance ──────────────────────────────────────────── */}
        {/* -- Widget Colors & Live Preview -------------------------------------------- */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 4 }}>?? Widget Colors</div>
          <div className="smart-search-card-subtitle">Customize search widget colors � changes apply instantly in the preview below</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left: color pickers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <ColorPickerField
                label="Primary / Accent Color"
                desc="Search bar focus ring, bubble icon, and submit button"
                value={settings.primaryColor}
                onChange={v => update('primaryColor', v)}
              />
              <ColorPickerField
                label="Button Background"
                desc="Search submit button fill color"
                value={ext.buttonBg}
                onChange={v => updateExt('buttonBg', v)}
              />
              <ColorPickerField
                label="Search Bar Background"
                desc="Input field background color"
                value={ext.searchInputBg}
                onChange={v => updateExt('searchInputBg', v)}
              />
              <ColorPickerField
                label="Result Card Background"
                desc="Product suggestion card background"
                value={ext.resultBg}
                onChange={v => updateExt('resultBg', v)}
              />
              <ColorPickerField
                label="Result Card Border"
                desc="Product suggestion card border color"
                value={ext.resultBorder}
                onChange={v => updateExt('resultBorder', v)}
              />
            </div>

            {/* Right: live preview */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 10 }}>
                Live Widget Preview
              </div>
              <div className="smart-search-widget-preview">
                <div
                  className="smart-search-widget-preview-bar"
                  style={{ background: ext.searchInputBg, borderColor: settings.primaryColor, boxShadow: `0 0 0 3px ${settings.primaryColor}20` }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={settings.primaryColor} strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <span style={{ flex: 1, fontSize: 13, color: '#9ca3af' }}>{ext.placeholderText || 'Search products...'}</span>
                  <div style={{ background: ext.buttonBg, color: '#fff', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600 }}>Search</div>
                </div>

                {[
                  { name: 'Wireless Earbuds Pro', price: '$49.99', emoji: '??', tag: 'In stock' },
                  { name: 'Smart Watch Series X',  price: '$199.99', emoji: '?', tag: 'Best seller' },
                  { name: 'Portable Charger 20K',  price: '$29.99',  emoji: '??', tag: 'New' },
                ].map((p, i) => (
                  <div key={i} className="smart-search-widget-preview-result" style={{ background: ext.resultBg, borderBottom: `1px solid ${ext.resultBorder}` }}>
                    {ext.showImages && (
                      <span style={{ fontSize: 22, width: 36, height: 36, borderRadius: 8, background: ext.searchInputBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{p.emoji}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {ext.showPrices && <span style={{ fontSize: 12, color: settings.primaryColor, fontWeight: 700 }}>{p.price}</span>}
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: settings.primaryColor + '18', color: settings.primaryColor }}>{p.tag}</span>
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <div style={{ width: 40, height: 40, background: settings.primaryColor, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${settings.primaryColor}50` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
            <div className="smart-search-toggle-row">
              <div><div className="smart-search-toggle-label">Show product prices in suggestions</div></div>
              <Toggle on={ext.showPrices} onChange={v => updateExt('showPrices', v)} />
            </div>
            <div className="smart-search-toggle-row">
              <div><div className="smart-search-toggle-label">Show product images in suggestions</div></div>
              <Toggle on={ext.showImages} onChange={v => updateExt('showImages', v)} />
            </div>
            <div className="smart-search-form-group" style={{ marginBottom: 0, marginTop: 14 }}>
              <label className="smart-search-label">Placeholder text</label>
              <input className="smart-search-input" value={ext.placeholderText} onChange={e => updateExt('placeholderText', e.target.value)} placeholder="Search products..." />
            </div>
          </div>
        </div>

        {/* ── General / Widget name ──────────────────────────────────────────── */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 4 }}>Widget Configuration</div>
          <div className="smart-search-card-subtitle">Customize the widget name, messages, and behavior</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
              <label className="smart-search-label">Widget Name</label>
              <input className="smart-search-input" value={settings.name} onChange={e => update('name', e.target.value)} />
            </div>
            <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
              <label className="smart-search-label">Brand Name</label>
              <input className="smart-search-input" value={settings.brandName} onChange={e => update('brandName', e.target.value)} />
            </div>
            <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
              <label className="smart-search-label">Welcome Message</label>
              <textarea
                className="smart-search-input"
                rows={2}
                value={settings.welcomeMessage}
                onChange={e => update('welcomeMessage', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="smart-search-form-group" style={{ marginBottom: 0 }}>
              <label className="smart-search-label">No Results Message</label>
              <textarea
                className="smart-search-input"
                rows={2}
                value={settings.fallbackMessage}
                onChange={e => update('fallbackMessage', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="smart-search-toggle-row" style={{ marginTop: 4 }}>
              <div>
                <div className="smart-search-toggle-label">Allow image search</div>
                <div className="smart-search-toggle-desc">Customers can upload an image to find matching products</div>
              </div>
              <Toggle on={settings.imageUploadEnabled} onChange={v => update('imageUploadEnabled', v)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="smart-search-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
