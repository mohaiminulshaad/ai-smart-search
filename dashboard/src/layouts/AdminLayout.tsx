import { useState, useEffect, useRef, useCallback } from 'react';
import { Frame } from '@shopify/polaris';
import { NavMenu } from '@shopify/app-bridge-react';
import { useLocation, useNavigate } from 'react-router-dom';

// All navigable pages
const NAV_PAGES = [
  { path: '/dashboard',        label: 'Dashboard',        emoji: '', desc: 'Overview, stats and re-index actions',      tags: ['home', 'overview', 'stats', 'index'] },
  { path: '/search-settings',  label: 'Search Settings',  emoji: '', desc: 'AI models, search behavior, widget colors',  tags: ['ai', 'color', 'embedding', 'model', 'widget'] },
  { path: '/analytics',        label: 'Analytics',        emoji: '', desc: 'Search performance metrics and charts',      tags: ['chart', 'performance', 'metrics', 'report'] },
  { path: '/billing',          label: 'Billing',          emoji: '', desc: 'Plans, subscription and usage',             tags: ['plan', 'pay', 'upgrade', 'subscription'] },
  { path: '/support',          label: 'Support',          emoji: '', desc: 'Help center and documentation',             tags: ['help', 'docs', 'contact', 'guide'] },
  { path: '/knowledge-base',   label: 'Knowledge Base',   emoji: '', desc: 'Custom content and FAQ management',         tags: ['faq', 'content', 'custom', 'articles'] },
  { path: '/api-keys',         label: 'API Keys',         emoji: '', desc: 'Manage your API credentials',              tags: ['api', 'key', 'openai', 'gemini', 'credentials'] },
  { path: '/display-settings', label: 'Display Settings', emoji: '', desc: 'Widget visibility and page targeting',      tags: ['visibility', 'mobile', 'pages', 'show', 'hide'] },
];

function usePageMeta() {
  const { pathname } = useLocation();
  return NAV_PAGES.find(p => pathname.startsWith(p.path)) ?? { label: 'Dashboard', emoji: '', path: '/dashboard' };
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--smart-search-primary)', color: '#fff', borderRadius: 3, padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SearchPopup({ onClose }: { onClose: () => void }) {
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const inputRef            = useRef<HTMLInputElement>(null);
  const navigate            = useNavigate();

  const results = query.trim() === ''
    ? NAV_PAGES
    : NAV_PAGES.filter(p => {
        const q = query.toLowerCase();
        return p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.tags.some(t => t.includes(q));
      });

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [results.length]);

  const go = useCallback((path: string) => { navigate(path); onClose(); }, [navigate, onClose]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter')     { if (results[active]) go(results[active].path); }
    if (e.key === 'Escape')    { onClose(); }
  }

  return (
    <div className="smart-search-search-overlay" onClick={onClose}>
      <div className="smart-search-search-popup" onClick={e => e.stopPropagation()} role="dialog" aria-modal aria-label="Quick search">
        <div className="smart-search-search-input-row">
          <svg className="smart-search-search-popup-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="smart-search-search-popup-input"
            placeholder="Search pages, settings, features"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="smart-search-search-clear" onClick={() => setQuery('')} aria-label="Clear">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          <kbd className="smart-search-search-esc" onClick={onClose}>Esc</kbd>
        </div>

        <div className="smart-search-search-results">
          {results.length === 0 ? (
            <div className="smart-search-search-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <div style={{ marginTop: 10, color: '#64748b', fontSize: 14 }}>No results for "<strong>{query}</strong>"</div>
            </div>
          ) : (
            <>
              <div className="smart-search-search-section-label">
                {query ? `${results.length} result${results.length !== 1 ? 's' : ''}` : 'All pages'}
              </div>
              {results.map((page, i) => (
                <button
                  key={page.path}
                  className={`smart-search-search-result-item${i === active ? ' active' : ''}`}
                  onClick={() => go(page.path)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="smart-search-search-result-emoji">{page.emoji}</span>
                  <div className="smart-search-search-result-body">
                    <div className="smart-search-search-result-label">{highlightMatch(page.label, query)}</div>
                    <div className="smart-search-search-result-desc">{page.desc}</div>
                  </div>
                  <svg className="smart-search-search-result-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="smart-search-search-footer">
          <span><kbd></kbd><kbd></kbd> navigate</span>
          <span><kbd></kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const page = usePageMeta();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Frame>
      <NavMenu>
        <a href="/dashboard">Dashboard</a>
        <a href="/search-settings">Search Settings</a>
        <a href="/analytics">Analytics</a>
        <a href="/billing">Billing</a>
        <a href="/support">Support</a>
        <a href="/knowledge-base">Knowledge Base</a>
        <a href="/api-keys">API Keys</a>
        <a href="/display-settings">Display Settings</a>
      </NavMenu>

      <div className="smart-search-page-wrapper">
        <div className="smart-search-topbar">
          <div className="smart-search-breadcrumb">
            <span className="smart-search-breadcrumb-app">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Smart Search
            </span>
            <svg className="smart-search-breadcrumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            <span className="smart-search-breadcrumb-page">
              <span className="smart-search-breadcrumb-emoji">{page.emoji}</span>
              {page.label}
            </span>
          </div>

          <button className="smart-search-topbar-search-btn" onClick={() => setSearchOpen(true)} aria-label="Open search (Ctrl+K)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        <div className="smart-search-page-content">
          {children}
        </div>
      </div>

      {searchOpen && <SearchPopup onClose={() => setSearchOpen(false)} />}
    </Frame>
  );
}
