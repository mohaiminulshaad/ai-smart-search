/**
 * SearchPreview.tsx — Admin panel live preview of the storefront search widget.
 * Shows a modern AI-powered product search UI.
 */
import { useState } from 'react';
import type { SmartSearchSettings } from '../api/smart-search-settings';

interface Props {
  settings: SmartSearchSettings;
}

const SAMPLE_RESULTS = [
  { title: 'Hydra Glow Moisturizer', price: '$29.99', inStock: true },
  { title: 'Vitamin C Serum 30ml', price: '$24.50', inStock: true },
  { title: 'Rose Petal Face Mist', price: '$18.00', inStock: false },
];

export default function SearchPreview({ settings }: Props) {
  const color = settings.primaryColor || '#6366f1';
  const widgetName = settings.name || 'Smart Search';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Widget window */}
      <div style={{
        width: 380, height: 540, border: '2px solid #e1e3e5',
        borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,.10)', background: '#fff',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`,
          color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,.2)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {settings.logoUrl
              ? <img src={settings.logoUrl} alt="" style={{ width: 38, height: 38, objectFit: 'cover' }} />
              : <span style={{ fontSize: 20 }}>🔍</span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2 }}>{widgetName}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>AI-Powered Product Discovery</div>
          </div>
          <div style={{ fontSize: 16, opacity: 0.7, cursor: 'default' }}>✕</div>
        </div>

        {/* Search input area */}
        <div style={{ padding: '14px 16px 8px', background: '#f8f9fb' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#fff', border: '2px solid #e5e7eb',
            borderRadius: 12, padding: '10px 14px',
            transition: 'border-color .15s',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Search products with AI...</span>
          </div>
          <div style={{
            display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap',
          }}>
            {['Moisturizer', 'Serum', 'Under $30'].map(tag => (
              <span key={tag} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                background: `${color}10`, color: color, border: `1px solid ${color}30`,
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Sample results */}
        <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* AI response bubble */}
          <div style={{
            background: '#f0f4ff', borderRadius: '4px 12px 12px 12px',
            padding: '10px 14px', fontSize: 13, lineHeight: 1.5, color: '#374151',
            border: '1px solid #e0e7ff',
          }}>
            Here are the best matches for your search! The <strong style={{ color: '#111' }}>Hydra Glow Moisturizer</strong> is our top pick for dry skin — and it's only $29.99! 🌟
          </div>

          {/* Product cards */}
          {SAMPLE_RESULTS.map((product, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, alignItems: 'center',
              background: '#fff', borderRadius: 10,
              border: '1px solid #e5e7eb', padding: '10px 12px',
              fontSize: 13, transition: 'border-color .15s, box-shadow .15s',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 48, height: 48, background: `${color}12`,
                borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>🛍️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#111', fontSize: 13 }}>{product.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ color, fontWeight: 700 }}>{product.price}</span>
                  <span style={{
                    fontSize: 11,
                    color: product.inStock ? '#16a34a' : '#dc2626',
                  }}>
                    {product.inStock ? '● In stock' : '● Out of stock'}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 14, color: '#9ca3af' }}>›</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center', fontSize: 10.5, color: '#ccc',
          padding: '5px 0 7px', background: '#fff',
          borderTop: '1px solid #f0f0f0',
        }}>
          Powered by Smart Search AI
        </div>
      </div>

      {/* Search Bubble (decorative) */}
      <div style={{
        marginTop: 12, display: 'flex',
        justifyContent: settings.bubblePosition === 'bottom-left' ? 'flex-start' : 'flex-end',
        width: '100%',
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: '50%',
          background: `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,.2)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function adjustColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
