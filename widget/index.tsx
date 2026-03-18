import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SearchWidget from './ChatWidget';

// __APP_URL__ is baked in at build time by vite.widget.config.ts.
declare const __APP_URL__: string;

(function () {
  if ((window as any).__smartSearchLoaded) return;
  (window as any).__smartSearchLoaded = true;

  const appOrigin: string = (typeof __APP_URL__ !== 'undefined' && __APP_URL__)
    ? __APP_URL__
    : window.location.origin;

  const shopFromShopify = (window as any).Shopify?.shop as string | undefined;
  const ourScript = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
    .find(s => s.src.includes('smart-search-widget.js') || s.src.includes('smart-search.js'));
  const shopFromScript = ourScript ? new URL(ourScript.src).searchParams.get('shop') : null;

  const shop: string | undefined = shopFromShopify || shopFromScript || undefined;

  console.log('[SmartSearch] shop:', shop, '| appOrigin:', appOrigin);

  if (!shop) {
    console.warn('[SmartSearch] Could not determine shop — widget not loaded.');
    return;
  }

  function mount() {
    if (!document.body) { setTimeout(mount, 60); return; }
    if (document.getElementById('smart-search-root')) return;

    const mountEl = document.createElement('div');
    mountEl.id = 'smart-search-root';
    mountEl.setAttribute('style', [
      'display: block',
      'position: fixed',
      'top: 0', 'left: 0',
      'width: 0', 'height: 0',
      'z-index: 2147483640',
    ].join('; '));

    document.body.appendChild(mountEl);
    createRoot(mountEl).render(
      <StrictMode>
        <SearchWidget shop={shop as string} appOrigin={appOrigin} />
      </StrictMode>
    );
    console.log('[SmartSearch] Widget mounted');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
