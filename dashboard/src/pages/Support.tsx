import { useState } from 'react';

const DocIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);
const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const MailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const ExternalIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

const FAQS = [
  {
    q: 'How do I set up the AI search widget?',
    a: 'Go to Search Settings, add your API key, configure the widget appearance, then enable it in Display Settings. The widget will appear on your storefront automatically.',
  },
  {
    q: 'Which AI providers are supported?',
    a: 'Smart Search supports Google Gemini 2.0 Flash (recommended) and OpenAI ChatGPT (GPT-4o-mini). Add your API keys in the API Keys section.',
  },
  {
    q: 'How do I re-index my products?',
    a: 'Click "Re-index All" from the Dashboard to sync all products to the AI vector store. Product updates also sync automatically via webhooks.',
  },
  {
    q: 'What is the Knowledge Base?',
    a: 'Upload Excel Q&A files to supplement product search with custom answers. Great for FAQs, policies, and brand information.',
  },
  {
    q: 'Can I customize the search widget colors?',
    a: 'Yes! Go to Search Settings → Storefront Appearance to customize the accent color, placeholder text, and toggle product prices and images.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 500, color: '#111827', textAlign: 'left',
        }}
      >
        {q}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0, marginLeft: 12 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ fontSize: 13, color: '#64748b', paddingBottom: 14, lineHeight: 1.6 }}>{a}</div>
      )}
    </div>
  );
}

export default function Support() {
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1000));
    setSubmitted(true);
    setSubmitting(false);
    setSubject('');
    setMessage('');
  }

  return (
    <div>
      {/* Header */}
      <div className="smart-search-page-header">
        <div>
          <h1 className="smart-search-page-title">Support</h1>
          <p className="smart-search-page-subtitle">Get help with Smart Search AI.</p>
        </div>
      </div>

      {/* Quick help cards */}
      <div className="smart-search-three-col" style={{ marginBottom: 16 }}>
        <div className="smart-search-support-card">
          <div className="smart-search-support-icon"><DocIcon /></div>
          <div className="smart-search-support-title">Documentation</div>
          <div className="smart-search-support-desc">Browse guides & API docs</div>
          <button
            className="smart-search-btn outlined"
            style={{ width: '100%', justifyContent: 'center', gap: 6 }}
            onClick={() => window.open('https://docs.smart-search-search.ai', '_blank')}
          >
            View Docs <ExternalIcon />
          </button>
        </div>

        <div className="smart-search-support-card">
          <div className="smart-search-support-icon"><ChatIcon /></div>
          <div className="smart-search-support-title">Live Chat</div>
          <div className="smart-search-support-desc">Chat with support team</div>
          <button
            className="smart-search-btn outlined"
            style={{ width: '100%', justifyContent: 'center', gap: 6 }}
            onClick={() => window.open('https://smart-search-search.ai/chat', '_blank')}
          >
            Start Chat <ExternalIcon />
          </button>
        </div>

        <div className="smart-search-support-card">
          <div className="smart-search-support-icon"><MailIcon /></div>
          <div className="smart-search-support-title">Email Support</div>
          <div className="smart-search-support-desc">support@smart-search-search.ai</div>
          <button
            className="smart-search-btn outlined"
            style={{ width: '100%', justifyContent: 'center', gap: 6 }}
            onClick={() => window.location.href = 'mailto:support@smart-search-search.ai'}
          >
            Send Email <ExternalIcon />
          </button>
        </div>
      </div>

      {/* Submit request + FAQ */}
      <div className="smart-search-two-col">
        {/* Submit a Request */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 4 }}>Submit a Request</div>
          <div className="smart-search-card-subtitle">We'll get back to you within 24 hours</div>

          {submitted ? (
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
              padding: '20px', textAlign: 'center', marginTop: 16,
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#15803d', marginBottom: 6 }}>
                Request Submitted!
              </div>
              <div style={{ fontSize: 13, color: '#16a34a' }}>
                We'll respond within 24 hours.
              </div>
              <button
                className="smart-search-btn outlined"
                style={{ marginTop: 16 }}
                onClick={() => setSubmitted(false)}
              >
                Submit Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: 8 }}>
              <div className="smart-search-form-group">
                <label className="smart-search-label">Subject</label>
                <input
                  className="smart-search-input"
                  placeholder="Brief description of your issue"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                />
              </div>
              <div className="smart-search-form-group">
                <label className="smart-search-label">Message</label>
                <textarea
                  className="smart-search-input"
                  placeholder="Describe your issue in detail..."
                  rows={6}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  required
                  style={{ resize: 'vertical' }}
                />
              </div>
              <button
                type="submit"
                className="smart-search-btn primary"
                disabled={submitting || !subject.trim() || !message.trim()}
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </form>
          )}
        </div>

        {/* FAQ */}
        <div className="smart-search-card">
          <div className="smart-search-card-title" style={{ marginBottom: 4 }}>Frequently Asked Questions</div>
          <div className="smart-search-card-subtitle">Quick answers to common questions</div>
          <div style={{ marginTop: 8 }}>
            {FAQS.map(faq => <FAQItem key={faq.q} q={faq.q} a={faq.a} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
