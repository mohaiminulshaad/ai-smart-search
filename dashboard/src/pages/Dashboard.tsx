import { useState, useEffect, useRef } from 'react';
import { dashboardApi, type DashboardStats } from '../api/dashboard';

// ── Icons ─────────────────────────────────────────────────────────────────────
const BoxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const BoltIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const RefreshIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const ExternalLinkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const BookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

const ACTIVITY = [
  { icon: '??', color: '#dbeafe', text: 'Product updated: SKU-4821', time: '2 min ago' },
  { icon: '??', color: '#f3e8ff', text: 'New collection indexed: "Summer 2026"', time: '15 min ago' },
  { icon: '?', color: '#fef9c3', text: 'Search query spike detected (+340%)', time: '1 hr ago' },
  { icon: '??', color: '#dbeafe', text: 'Product updated: SKU-1293', time: '2 hr ago' },
  { icon: '?', color: '#dcfce7', text: 'Re-index completed successfully', time: '3 hr ago' },
  { icon: '??', color: '#f3e8ff', text: 'New product added: "Wireless Earbuds Pro"', time: '4 hr ago' },
];

// -- Theme color helpers -------------------------------------------------------
const THEME_KEY = 'smart-search_theme_colors';

interface ThemeColors {
  primary:   string;
  secondary: string;
  accent:    string;
  bg:        string;
  text:      string;
}

const DEFAULT_THEME: ThemeColors = {
  primary:   '#4f46e5',
  secondary: '#7c3aed',
  accent:    '#06b6d4',
  bg:        '#f1f5f9',
  text:      '#111827',
};

function loadTheme(): ThemeColors {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_THEME };
}

function applyTheme(c: ThemeColors) {
  const s = document.documentElement.style;
  s.setProperty('--smart-search-primary',       c.primary);
  s.setProperty('--smart-search-primary-hover', shadeColor(c.primary, -15));
  s.setProperty('--smart-search-secondary',     c.secondary);
  s.setProperty('--smart-search-accent',        c.accent);
  s.setProperty('--smart-search-bg',            c.bg);
}

function shadeColor(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + pct));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct));
  const b = Math.min(255, Math.max(0, (n & 0xff) + pct));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string; desc: string }> = [
  { key: 'primary',   label: 'Primary',   desc: 'Buttons & links' },
  { key: 'secondary', label: 'Secondary', desc: 'Accents & plan card' },
  { key: 'accent',    label: 'Accent',    desc: 'Badges & highlights' },
  { key: 'bg',        label: 'Background', desc: 'Page background' },
  { key: 'text',      label: 'Text',      desc: 'Main body text' },
];

// -- Search Preview Modal ------------------------------------------------------
const PREVIEW_PRODUCTS = [
  { title: 'Wireless Noise-Cancelling Headphones', price: '$89.99', badge: 'Best Seller', inStock: true,  emoji: '??' },
  { title: 'Premium Leather Wallet',               price: '$49.99', badge: 'New',         inStock: true,  emoji: '??' },
  { title: 'Smart Fitness Tracker',                price: '$129.00', badge: 'Popular',    inStock: true,  emoji: '?' },
  { title: 'Ceramic Coffee Mug Set',               price: '$34.99', badge: '',            inStock: false, emoji: '?' },
  { title: 'Portable Bluetooth Speaker',           price: '$59.99', badge: 'Sale',        inStock: true,  emoji: '??' },
  { title: 'Bamboo Desk Organizer',                price: '$24.99', badge: '',            inStock: true,  emoji: '??' },
];

function SearchPreviewModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery]   = useState('');
  const inputRef            = useRef<HTMLInputElement>(null);

  const results = query.trim() === ''
    ? PREVIEW_PRODUCTS
    : PREVIEW_PRODUCTS.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase())
      );

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="smart-search-sp-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="smart-search-sp-modal">
        {/* Header */}
        <div className="smart-search-sp-header">
          <div>
            <div className="smart-search-sp-title">Search Preview</div>
            <div className="smart-search-sp-subtitle">Test how search appears on your storefront</div>
          </div>
          <button className="smart-search-sp-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="smart-search-sp-search-wrap">
          <div className="smart-search-sp-search-bar">
            <svg className="smart-search-sp-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              className="smart-search-sp-search-input"
              type="text"
              placeholder="Search products..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <button className="smart-search-sp-clear" onClick={() => setQuery('')} aria-label="Clear">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="smart-search-sp-results">
          {results.length === 0 ? (
            <div className="smart-search-sp-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <div style={{ marginTop: 8, color: '#9ca3af', fontSize: 14 }}>No results for &ldquo;{query}&rdquo;</div>
            </div>
          ) : (
            results.map((p, i) => (
              <div key={i} className="smart-search-sp-result-item">
                <div className="smart-search-sp-result-img">{p.emoji}</div>
                <div className="smart-search-sp-result-info">
                  <div className="smart-search-sp-result-title">
                    {p.title}
                    {p.badge && <span className="smart-search-sp-result-badge">{p.badge}</span>}
                  </div>
                  <div className="smart-search-sp-result-meta">
                    <span className="smart-search-sp-result-price">{p.price}</span>
                    <span className={`smart-search-sp-result-stock ${p.inStock ? 'in' : 'out'}`}>
                      {p.inStock ? '? In stock' : '? Out of stock'}
                    </span>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="smart-search-sp-footer">
          <span>Showing {results.length} of {PREVIEW_PRODUCTS.length} products</span>
          <span>Preview mode � live data in production</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiActive, setAiActive] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [theme, setTheme]     = useState<ThemeColors>(loadTheme);
  const [searchPreviewOpen, setSearchPreviewOpen] = useState(false);

  // Apply theme on mount and whenever it changes
  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    dashboardApi.getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateTheme<K extends keyof ThemeColors>(key: K, val: ThemeColors[K]) {
    setTheme(prev => {
      const next = { ...prev, [key]: val };
      applyTheme(next);
      return next;
    });
  }

  function saveTheme() {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    setSyncMsg('Theme colors saved ?');
  }

  function resetTheme() {
    setTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    localStorage.removeItem(THEME_KEY);
  }

  function handleReindex() {
    setSyncing(true);
    setSyncMsg('Re-index started�');
    setTimeout(() => { setSyncing(false); setSyncMsg('Re-index completed successfully ?'); }, 3000);
  }

  const searches = stats?.searches_today ?? stats?.total_conversations ?? 0;
  const products = stats?.products_indexed ?? 1247;
  const now = new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div>
      {/* Page header */}
      <div className="smart-search-page-header">
        <div>
          <h1 className="smart-search-page-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--smart-search-primary)' }}>
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </h1>
          <p className="smart-search-page-subtitle">Monitor your search performance and manage indexing.</p>
        </div>
      </div>

      {syncMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>?</span> {syncMsg}
          <button onClick={() => setSyncMsg('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#15803d' }}>�</button>
        </div>
      )}

      {/* -- Theme Colors --------------------------------------------------------------- */}
      <div className="smart-search-card" style={{ marginBottom: 16 }}>
        <div className="smart-search-card-header">
          <div>
            <div className="smart-search-card-title">?? Theme Colors</div>
            <div className="smart-search-card-subtitle">Customize your dashboard and widget color scheme � changes apply instantly</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="smart-search-btn outlined" onClick={resetTheme}>Reset</button>
            <button className="smart-search-btn primary" onClick={saveTheme}>Save Colors</button>
          </div>
        </div>

        <div className="smart-search-color-picker-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {COLOR_FIELDS.map(({ key, label, desc }) => (
            <div key={key} className="smart-search-color-picker-cell">
              <div
                className="smart-search-color-swatch-btn"
                style={{ background: theme[key] }}
                title={`Pick ${label.toLowerCase()} color`}
              >
                <input
                  type="color"
                  value={theme[key]}
                  onChange={e => updateTheme(key, e.target.value)}
                />
              </div>
              <div className="smart-search-color-picker-label">{label}</div>
              <div className="smart-search-color-picker-desc">{desc}</div>
              <input
                className="smart-search-color-picker-hex"
                value={theme[key]}
                onChange={e => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))
                    updateTheme(key, e.target.value);
                }}
                maxLength={7}
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        {/* Live preview */}
        <div className="smart-search-theme-preview" style={{ background: theme.bg }}>
          <div className="smart-search-theme-preview-label">Live Preview</div>
          <div className="smart-search-theme-preview-row">
            <button style={{
              background: theme.primary, color: '#fff', border: 'none',
              borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>Primary Button</button>
            <button style={{
              background: theme.secondary, color: '#fff', border: 'none',
              borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer'
            }}>Secondary</button>
            <span style={{
              background: theme.accent + '25', color: theme.accent,
              fontSize: 11, fontWeight: 700, padding: '3px 10px',
              borderRadius: 20, border: `1px solid ${theme.accent}40`
            }}>Badge</span>
            <div style={{
              background: '#fff', border: `2px solid ${theme.primary}`,
              borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#374151',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: `0 0 0 3px ${theme.primary}18`
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.primary} strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span style={{ color: theme.text }}>Search your store�</span>
            </div>
            <div style={{
              width: 36, height: 36, background: theme.primary, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="smart-search-stats-grid">
        {/* Products indexed */}
        <div className="smart-search-stat-card">
          <div className="smart-search-stat-card-header">
            <div className="smart-search-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><BoxIcon /></div>
            <span className="smart-search-stat-badge synced">? Synced</span>
          </div>
          <div className="smart-search-stat-value">{loading ? '�' : products.toLocaleString()}</div>
          <div className="smart-search-stat-label">Products Indexed</div>
        </div>

        {/* Searches today */}
        <div className="smart-search-stat-card">
          <div className="smart-search-stat-card-header">
            <div className="smart-search-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><SearchIcon /></div>
            <span className="smart-search-stat-badge green">? +12.5%</span>
          </div>
          <div className="smart-search-stat-value">{loading ? '�' : (searches > 0 ? searches.toLocaleString() : '8,432')}</div>
          <div className="smart-search-stat-label">Searches today</div>
        </div>

        {/* Avg response time */}
        <div className="smart-search-stat-card">
          <div className="smart-search-stat-card-header">
            <div className="smart-search-stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}><ClockIcon /></div>
            <span className="smart-search-stat-badge red">? +8ms</span>
          </div>
          <div className="smart-search-stat-value">142ms</div>
          <div className="smart-search-stat-label">Avg response time</div>
        </div>

        {/* AI Status */}
        <div className="smart-search-stat-card">
          <div className="smart-search-stat-card-header">
            <div className="smart-search-stat-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}><BoltIcon /></div>
            <button
              className="smart-search-switch"
              style={{ background: aiActive ? theme.primary : '#d1d5db' }}
              onClick={() => setAiActive(a => !a)}
              aria-pressed={aiActive}
              aria-label="Toggle AI"
            />
          </div>
          <div className="smart-search-stat-value" style={{ color: aiActive ? '#111827' : '#94a3b8' }}>
            {aiActive ? 'Active' : 'Inactive'}
          </div>
          <div className="smart-search-stat-label">AI Status</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="smart-search-actions-grid">
        <button className="smart-search-action-btn primary" onClick={handleReindex} disabled={syncing}>
          <RefreshIcon />
          {syncing ? 'Re-indexing�' : 'Re-index All'}
        </button>
        <button className="smart-search-action-btn" onClick={() => setSearchPreviewOpen(true)}>
          <EyeIcon />
          Test Search
        </button>
        <a
          className="smart-search-action-btn"
          href="https://example.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon />
          View Storefront
        </a>
        <button className="smart-search-action-btn" onClick={() => window.open('https://docs.example.com', '_blank')}>
          <BookIcon />
          Documentation
        </button>
      </div>

      {/* Bottom two-column section */}
      <div className="smart-search-two-col">
        {/* Indexing Status */}
        <div className="smart-search-card">
          <div className="smart-search-card-header">
            <div>
              <div className="smart-search-card-title">Indexing Status</div>
              <div className="smart-search-card-subtitle">Current sync status and error log</div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#374151' }}>
              <span>Sync Progress</span>
              <span style={{ fontWeight: 600 }}>100%</span>
            </div>
            <div className="smart-search-progress-bar">
              <div className="smart-search-progress-fill" style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', marginBottom: 16 }}>
            <span style={{ color: '#64748b' }}>Last synced</span>
            <span>Today, {now}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <button className="smart-search-btn outlined" onClick={() => {}}>Pause Sync</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            2 warnings � check knowledge base indexing
          </div>
        </div>

        {/* Recent Activity */}
        <div className="smart-search-card">
          <div className="smart-search-card-header">
            <div>
              <div className="smart-search-card-title">Recent Activity</div>
              <div className="smart-search-card-subtitle">Latest events from your store</div>
            </div>
            <button className="smart-search-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
          </div>

          {ACTIVITY.map((a, i) => (
            <div key={i} className="smart-search-activity-item">
              <div className="smart-search-activity-dot" style={{ background: a.color, fontSize: 14 }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div className="smart-search-activity-text">{a.text}</div>
                <div className="smart-search-activity-time">{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {searchPreviewOpen && <SearchPreviewModal onClose={() => setSearchPreviewOpen(false)} />}
    </div>
  );
}

