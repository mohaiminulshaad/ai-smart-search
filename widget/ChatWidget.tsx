/**
 * frontend/src/search/SearchWidget.tsx
 * Root component. Fetches settings, checks display rules, detects user type.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SmartSearchSettings, DisplaySettings } from './types';
import SearchBubble from './components/SearchBubble';

interface Props {
  shop:       string;
  appOrigin:  string;
}

function getPageType(): string {
  const meta = (window as any).ShopifyAnalytics?.meta?.page?.pageType as string | undefined;
  const path = window.location.pathname;
  if (meta === 'product'    || path.includes('/products/')) return 'products';
  if (meta === 'collection' || path.includes('/collections/')) return 'collections';
  if (meta === 'cart'       || path.includes('/cart')) return 'cart';
  if (path === '/' || meta === 'index') return 'home';
  return 'other';
}

function getCustomer(): { id: string; email?: string; firstName?: string } | null {
  const c = (window as any).Shopify?.customer;
  if (c?.id) return c;
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function adjustColor(hex: string, pct: number): string {
  const n = parseInt((hex || '#000000').replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + pct));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct));
  const b = Math.min(255, Math.max(0, (n & 0xff) + pct));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

interface SearchProduct {
  title:     string;
  price?:    { min?: number; max?: number };
  available: boolean;
  image?:    string;
  vendor?:   string;
  score?:    number;
}

// ── Product Search Popup ──────────────────────────────────────────────────────
interface PopupProps {
  color:     string;
  shop:      string;
  appOrigin: string;
  onClose:   () => void;
}

function ProductSearchPopup({ color, shop, appOrigin, onClose }: PopupProps) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    fetch(`${appOrigin}/api/search/products`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shop-Domain': shop, 'ngrok-skip-browser-warning': '1' },
      body:    JSON.stringify({ query: q, limit: 8 }),
    })
      .then(r => r.json())
      .then(data => { setResults(data.results || []); setSearched(true); })
      .catch(() => { setResults([]); setSearched(true); })
      .finally(() => setLoading(false));
  }, [appOrigin, shop]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(q), 350);
  }

  function formatPrice(price?: { min?: number; max?: number }) {
    if (!price || (price.min == null && price.max == null)) return '';
    const p = price.min ?? price.max ?? 0;
    return `$${(p / 100).toFixed(2)}`;
  }

  const grad = `linear-gradient(135deg, ${color}, ${adjustColor(color, -25)})`;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '80px', animation: 'ss-fade-in .15s ease',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560, background: '#fff',
        borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
        animation: 'ss-slide-down .18s ease',
        margin: '0 16px',
      }}>
        {/* Header bar */}
        <div style={{ background: grad, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>
          </svg>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, flex: 1 }}>Search Products</span>
          <button onClick={onClose} aria-label="Close" style={{
            all: 'unset', cursor: 'pointer', color: 'rgba(255,255,255,.8)', fontSize: 20, lineHeight: 1,
            padding: '2px 4px', borderRadius: 6,
          }}>✕</button>
        </div>

        {/* Search input */}
        <div style={{ padding: '14px 16px 10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            border: `2px solid ${query ? color : '#e5e7eb'}`, borderRadius: 12,
            padding: '11px 14px', background: '#fafafa',
            transition: 'border-color .15s, box-shadow .15s',
            boxShadow: query ? `0 0 0 3px ${color}18` : 'none',
          }}>
            {loading ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, animation: 'ss-spin 0.8s linear infinite' }}>
                <path d="M12 2a10 10 0 1 0 4 19.1"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>
              </svg>
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleChange}
              placeholder="Search products..."
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 15, color: '#111827', fontFamily: 'inherit',
              }}
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }} style={{
                all: 'unset', cursor: 'pointer', width: 22, height: 22,
                borderRadius: '50%', background: '#e5e7eb', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results list */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '0 12px 12px' }}>
          {!query.trim() && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 14 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', margin: '0 auto 10px' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>
              </svg>
              Type to search your store
            </div>
          )}

          {query.trim() && searched && results.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 14 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', margin: '0 auto 10px' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>
              </svg>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
              transition: 'background .12s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {p.image
                  ? <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  {formatPrice(p.price) && (
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{formatPrice(p.price)}</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 500, color: p.available ? '#16a34a' : '#dc2626' }}>
                    {p.available ? '● In stock' : '● Out of stock'}
                  </span>
                  {p.vendor && <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.vendor}</span>}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 18px', borderTop: '1px solid #f1f5f9', background: '#fafafa',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, color: '#9ca3af',
        }}>
          <span>{results.length > 0 ? `${results.length} result${results.length !== 1 ? 's' : ''} found` : 'AI-powered product search'}</span>
          <span>Press <kbd style={{ background: '#e5e7eb', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'inherit' }}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

// ── Embedded Search Bar ───────────────────────────────────────────────────────
interface EmbeddedBarProps {
  color:    string;
  position: 'bottom-right' | 'bottom-left';
  onClick:  () => void;
}

function EmbeddedSearchBar({ color, position, onClick }: EmbeddedBarProps) {
  const side = position === 'bottom-left' ? { left: '24px' } : { right: '24px' };
  const grad = `linear-gradient(135deg, ${color}, ${adjustColor(color, -25)})`;

  return (
    <button
      onClick={onClick}
      aria-label="Open product search"
      style={{
        all:          'unset',
        position:     'fixed',
        bottom:       '94px',
        ...side,
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        background:   '#fff',
        border:       `2px solid ${color}`,
        borderRadius: 50,
        padding:      '9px 16px 9px 12px',
        cursor:       'pointer',
        boxShadow:    `0 4px 20px ${color}30`,
        zIndex:       2147483646,
        fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        transition:   'transform .18s, box-shadow .18s',
        animation:    'ss-bar-in .3s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = `0 8px 28px ${color}45`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = `0 4px 20px ${color}30`;
      }}
    >
      {/* Icon circle */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: grad,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7.5"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
        </svg>
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Search products…</span>
    </button>
  );
}

export default function SearchWidget({ shop, appOrigin }: Props) {
  const [smartSearch,  setSmartSearch]  = useState<SmartSearchSettings | null>(null);
  const [display,  setDisplay]  = useState<DisplaySettings | null>(null);
  const [visible,  setVisible]  = useState(false);
  const [searchPopupOpen, setSearchPopupOpen] = useState(false);

  const customer   = getCustomer();

  useEffect(() => {
    console.log('[SmartSearch] Fetching settings for shop:', shop, 'from:', appOrigin);
    fetch(`${appOrigin}/api/widget/settings?shop=${encodeURIComponent(shop)}`, {
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Accept': 'application/json',
        },
      })
      .then(r => {
        console.log('[SmartSearch] Settings response status:', r.status);
        return r.json();
      })
      .then(data => {
        console.log('[SmartSearch] Settings loaded');
        setSmartSearch(data.smartSearch);
        setDisplay(data.display);
      })
      .catch(err => console.warn('[SmartSearch] Could not load widget settings:', err));
  }, [shop, appOrigin]);

  useEffect(() => {
    if (!display || !smartSearch) return;
    if (!display.enabled) return;
    if (!display.mobileVisible && window.innerWidth < 768) return;

    if (display.displayOn !== 'all') {
      const page = getPageType();
      if (display.displayOn === 'home'     && page !== 'home')     return;
      if (display.displayOn === 'products' && page !== 'products') return;
      if (display.displayOn === 'cart'     && page !== 'cart')     return;
    }

    setVisible(true);
  }, [display, smartSearch]);

  if (!visible || !smartSearch) return null;

  return (
    <>
      <style>{`
        @keyframes ss-slide-up {
          from { opacity:0; transform:translateY(16px) scale(.97); }
          to   { opacity:1; transform:translateY(0)   scale(1);   }
        }
        @keyframes ss-slide-down {
          from { opacity:0; transform:translateY(-12px) scale(.97); }
          to   { opacity:1; transform:translateY(0)    scale(1);   }
        }
        @keyframes ss-fade-in {
          from { opacity:0; }
          to   { opacity:1; }
        }
        @keyframes ss-bar-in {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes ss-pulse {
          0%,100% { box-shadow: 0 4px 20px rgba(0,0,0,.25); }
          50%     { box-shadow: 0 4px 30px rgba(0,0,0,.35); }
        }
        @keyframes ss-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Embedded search bar — sits above the bubble */}
      <EmbeddedSearchBar
        color={smartSearch.primaryColor}
        position={smartSearch.bubblePosition}
        onClick={() => setSearchPopupOpen(true)}
      />

      {/* Floating bubble — opens product search */}
      <SearchBubble
        color={smartSearch.primaryColor}
        position={smartSearch.bubblePosition}
        isOpen={searchPopupOpen}
        onClick={() => setSearchPopupOpen(o => !o)}
      />

      {searchPopupOpen && (
        <ProductSearchPopup
          color={smartSearch.primaryColor}
          shop={shop}
          appOrigin={appOrigin}
          onClose={() => setSearchPopupOpen(false)}
        />
      )}
    </>
  );
}
