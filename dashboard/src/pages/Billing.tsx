import { useState } from 'react';

const PLANS = [
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    products: '1,000',
    features: ['AI-powered search', 'Basic analytics', 'Email support', '1,000 products'],
    current: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    products: '10,000',
    features: ['Everything in Starter', 'Advanced analytics', 'Knowledge base', 'Priority support', 'Image search', '10,000 products'],
    current: true,
  },
  {
    name: 'Enterprise',
    price: '$149',
    period: '/month',
    products: 'Unlimited',
    features: ['Everything in Pro', 'Custom AI models', 'Dedicated support', 'SLA guarantee', 'White-label option', 'Unlimited products'],
    current: false,
  },
];

const INVOICES = [
  { date: 'Mar 1, 2026',  amount: '$49.00', status: 'Paid',    id: 'INV-2026-03' },
  { date: 'Feb 1, 2026',  amount: '$49.00', status: 'Paid',    id: 'INV-2026-02' },
  { date: 'Jan 1, 2026',  amount: '$49.00', status: 'Paid',    id: 'INV-2026-01' },
  { date: 'Dec 1, 2025',  amount: '$49.00', status: 'Paid',    id: 'INV-2025-12' },
];

export default function Billing() {
  const [cancelling, setCancelling] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="smart-search-page-header">
        <div>
          <h1 className="smart-search-page-title">Billing</h1>
          <p className="smart-search-page-subtitle">Manage your plan, usage, and invoices.</p>
        </div>
      </div>

      {/* Current plan card */}
      <div className="smart-search-plan-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 4 }}>Current Plan</div>
            <div className="smart-search-plan-card-title">Pro Plan — $49/month</div>
            <div className="smart-search-plan-card-desc">Renews on April 1, 2026 · Next charge: $49.00</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {['AI search', 'Analytics', 'Knowledge base', 'Image search', 'Priority support'].map(f => (
                <span key={f} style={{
                  background: 'rgba(255,255,255,0.18)', borderRadius: 20,
                  padding: '3px 12px', fontSize: 12, color: '#fff',
                }}>{f}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flex: '0 0 auto', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600, color: '#fff' }}>
              ● Active
            </span>
            <button
              className="smart-search-btn"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
              onClick={() => {}}
            >
              Manage Payment
            </button>
          </div>
        </div>

        {/* Usage bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>
            <span>Product Usage</span>
            <span>1,247 / 10,000 products (12.5%)</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: 6, background: '#fff', borderRadius: 3, width: '12.5%' }} />
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="smart-search-card" style={{ marginBottom: 16 }}>
        <div className="smart-search-card-title" style={{ marginBottom: 4 }}>Available Plans</div>
        <div className="smart-search-card-subtitle">Upgrade or downgrade at any time. Changes take effect immediately.</div>

        <div className="smart-search-three-col" style={{ marginTop: 16 }}>
          {PLANS.map(plan => (
            <div
              key={plan.name}
              style={{
                border: plan.current ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                borderRadius: 10, padding: 20, position: 'relative',
                background: plan.current ? '#f5f3ff' : '#fff',
              }}
            >
              {plan.current && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 700,
                  padding: '3px 12px', borderRadius: 20,
                }}>
                  CURRENT PLAN
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 16 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{plan.price}</span>
                <span style={{ fontSize: 13, color: '#64748b' }}>{plan.period}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#374151' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="smart-search-btn"
                style={{
                  width: '100%', justifyContent: 'center',
                  background: plan.current ? '#4f46e5' : '#fff',
                  color: plan.current ? '#fff' : '#374151',
                  border: plan.current ? '1px solid #4f46e5' : '1px solid #d1d5db',
                }}
                onClick={() => {}}
                disabled={plan.current}
              >
                {plan.current ? 'Current Plan' : `Switch to ${plan.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice history */}
      <div className="smart-search-card">
        <div className="smart-search-card-header">
          <div>
            <div className="smart-search-card-title">Invoice History</div>
            <div className="smart-search-card-subtitle">Download past invoices</div>
          </div>
        </div>
        <table className="smart-search-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {INVOICES.map(inv => (
              <tr key={inv.id}>
                <td style={{ fontWeight: 500 }}>{inv.id}</td>
                <td>{inv.date}</td>
                <td style={{ fontWeight: 600 }}>{inv.amount}</td>
                <td>
                  <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                    {inv.status}
                  </span>
                </td>
                <td>
                  <button className="smart-search-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Danger zone */}
      <div className="smart-search-card" style={{ marginTop: 16, borderColor: '#fecaca' }}>
        <div className="smart-search-card-title" style={{ color: '#dc2626', marginBottom: 4 }}>Cancel Subscription</div>
        <div className="smart-search-card-subtitle">
          Cancelling will disable AI search on your store at the end of the billing period.
          Your data will be retained for 30 days.
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            className="smart-search-btn danger"
            onClick={() => setCancelling(true)}
          >
            Cancel Subscription
          </button>
          {cancelling && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
              To confirm cancellation, please{' '}<a href="mailto:support@smart-search-search.ai" className="smart-search-link">contact support</a>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
