import { useState } from 'react';

// ── Mock analytics data ────────────────────────────────────────────────────────
const VOLUME_DATA = [
  { day: 'Mon', val: 1100 },
  { day: 'Tue', val: 1420 },
  { day: 'Wed', val: 1580 },
  { day: 'Thu', val: 1760 },
  { day: 'Fri', val: 1900 },
  { day: 'Sat', val: 2150 },
  { day: 'Sun', val: 1980 },
];

const TOP_TERMS = [
  { term: 'wireless earbuds', count: 720 },
  { term: 'phone case',       count: 580 },
  { term: 'charger',          count: 420 },
  { term: 'laptop stand',     count: 310 },
  { term: 'usb cable',        count: 270 },
  { term: 'screen protector', count: 210 },
  { term: 'mouse pad',        count: 160 },
];

const NO_RESULTS = [
  { query: 'solar panel charger', count: 45, last: '2 hrs ago' },
  { query: 'bamboo keyboard',     count: 38, last: '4 hrs ago' },
  { query: 'eco friendly case',   count: 31, last: '6 hrs ago' },
  { query: 'mini projector',      count: 28, last: '1 day ago' },
  { query: 'standing desk mat',   count: 22, last: '1 day ago' },
];

const maxVol  = Math.max(...VOLUME_DATA.map(d => d.val));
const maxTerm = Math.max(...TOP_TERMS.map(d => d.count));

// ── SVG Line Chart ─────────────────────────────────────────────────────────────
function LineChart() {
  const W = 480; const H = 140; const PAD = 20;
  const w = W - PAD * 2; const h = H - PAD * 2;
  const pts = VOLUME_DATA.map((d, i) => ({
    x: PAD + (i / (VOLUME_DATA.length - 1)) * w,
    y: PAD + (1 - d.val / maxVol) * h,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${d} L ${pts[pts.length - 1].x} ${H - PAD} L ${pts[0].x} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4f46e5" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Y-axis grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t}
          x1={PAD} y1={PAD + (1 - t) * h} x2={W - PAD} y2={PAD + (1 - t) * h}
          stroke="#e2e8f0" strokeWidth="1"
        />
      ))}
      {/* Y-axis labels */}
      {[0, 550, 1100, 1650, 2200].map((v, i) => (
        <text key={v} x={PAD - 4} y={PAD + (1 - i / 4) * h + 4}
          textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>
      ))}
      {/* Area fill */}
      <path d={area} fill="url(#grad)" />
      {/* Line */}
      <path d={d} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Points */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#4f46e5" strokeWidth="2.5"/>
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {VOLUME_DATA[i].day}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Horizontal Bar Chart ──────────────────────────────────────────────────────
function BarChart() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {TOP_TERMS.map(({ term, count }) => (
        <div key={term} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 120, fontSize: 12, color: '#374151', textAlign: 'right', flexShrink: 0 }}>{term}</span>
          <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 20, overflow: 'hidden' }}>
            <div style={{
              width: `${(count / maxTerm) * 100}%`,
              height: '100%', background: '#2563eb', borderRadius: 4,
            }} />
          </div>
          <span style={{ width: 36, fontSize: 12, color: '#64748b', textAlign: 'right' }}>{count}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <div style={{ width: 120 }} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
          {[0, 150, 300, 450, 600].map(v => <span key={v}>{v}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── Donut chart ────────────────────────────────────────────────────────────────
function DonutChart({ pct }: { pct: number }) {
  const R = 54; const C = 2 * Math.PI * R;
  const fill = (pct / 100) * C;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox="0 0 130 130" width="160" height="160">
        <circle cx="65" cy="65" r={R} fill="none" stroke="#e2e8f0" strokeWidth="18"/>
        <circle cx="65" cy="65" r={R} fill="none" stroke="#2563eb" strokeWidth="18"
          strokeDasharray={`${fill} ${C}`}
          strokeDashoffset={C * 0.25}
          strokeLinecap="round"
        />
        <text x="65" y="58" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">
          {pct}%
        </text>
        <text x="65" y="76" textAnchor="middle" fontSize="11" fill="#64748b">Clicked</text>
      </svg>
      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#64748b' }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#2563eb', borderRadius: 2, marginRight: 5 }}/>
          Clicked: {pct}%
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#e2e8f0', borderRadius: 2, marginRight: 5 }}/>
          Abandoned: {100 - pct}%
        </span>
      </div>
    </div>
  );
}

// ── Stat mini card ─────────────────────────────────────────────────────────────
function MiniStat({ label, value, delta, positive }: { label: string; value: string; delta: string; positive: boolean }) {
  return (
    <div className="smart-search-stat-card">
      <div className="smart-search-stat-value">{value}</div>
      <div className="smart-search-stat-label">{label}</div>
      <div style={{ marginTop: 6 }}>
        <span className={`smart-search-stat-badge ${positive ? 'green' : 'red'}`}>
          {positive ? '↑' : '↓'} {delta}
        </span>
      </div>
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'custom'>('7d');

  const PERIODS = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: 'Last 7 Days' },
    { key: '30d',   label: 'Last 30 Days' },
    { key: 'custom',label: 'Custom' },
  ] as const;

  return (
    <div>
      {/* Header */}
      <div className="smart-search-page-header">
        <div>
          <h1 className="smart-search-page-title">Analytics</h1>
          <p className="smart-search-page-subtitle">Track search performance and identify content gaps.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="smart-search-time-filters">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`smart-search-time-btn ${period === p.key ? 'active' : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="smart-search-btn outlined" onClick={() => {}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="smart-search-stats-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Total Searches"     value="11,890" delta="+12%"   positive={true} />
        <MiniStat label="Avg Click-Through"  value="68.4%"  delta="+3.2%"  positive={true} />
        <MiniStat label="Conversion Rate"    value="4.7%"   delta="+0.8%"  positive={true} />
        <div className="smart-search-stat-card">
          <div className="smart-search-stat-value">Earbuds Pro</div>
          <div className="smart-search-stat-label">Top Product</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>432 finds</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="smart-search-two-col" style={{ marginBottom: 16 }}>
        {/* Search Volume */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 2 }}>Search Volume</div>
          <div className="smart-search-card-subtitle">Queries per day</div>
          <LineChart />
        </div>

        {/* Top Search Terms */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 2 }}>Top Search Terms</div>
          <div className="smart-search-card-subtitle">Most searched queries</div>
          <BarChart />
        </div>
      </div>

      {/* Bottom row */}
      <div className="smart-search-two-col">
        {/* Click-Through Rate */}
        <div className="smart-search-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ alignSelf: 'flex-start', width: '100%' }}>
            <div className="smart-search-card-title" style={{ marginBottom: 2 }}>Click-Through Rate</div>
            <div className="smart-search-card-subtitle">Clicked vs abandoned</div>
          </div>
          <DonutChart pct={68} />
        </div>

        {/* No Results Queries */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 2 }}>No Results Queries</div>
          <div className="smart-search-card-subtitle">Content gaps — searches with no matches</div>
          <table className="smart-search-table">
            <thead>
              <tr>
                <th>Query</th>
                <th style={{ textAlign: 'right' }}>Count</th>
                <th style={{ textAlign: 'right' }}>Last Searched</th>
              </tr>
            </thead>
            <tbody>
              {NO_RESULTS.map(row => (
                <tr key={row.query}>
                  <td>{row.query}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                  <td style={{ textAlign: 'right', color: '#94a3b8' }}>{row.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
