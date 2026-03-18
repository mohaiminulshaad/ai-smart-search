/**
 * widget/components/GuestGate.tsx
 * Shown to guest (non-logged-in) users before they can search.
 * Collects name + email, registers them as a Shopify subscriber.
 */

import { useState } from 'react';
import type { GuestInfo } from '../types';

interface Props {
  color:      string;
  appOrigin:  string;
  shop:       string;
  onComplete: (info: GuestInfo) => void;
}

export default function GuestGate({ color, appOrigin, shop, onComplete }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [error,     setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return setError('Please enter your first name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email address.');
    setError('');
    setSubmitting(true);

    try {
      // Register as Shopify subscriber (fire-and-forget — don't block the chat)
      fetch(`${appOrigin}/api/chat/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, firstName, lastName, email }),
      }).catch(() => {}); // silently ignore if fails

      onComplete({ firstName, lastName, email });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      flex: 1, padding: '28px 24px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', overflowY: 'auto', background: '#fff',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>�</div>
      <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#111', fontFamily: 'inherit' }}>
        Before you search…
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#666', fontFamily: 'inherit' }}>
        Enter your details so we can personalise your search results.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="First name *" value={firstName}
            onChange={e => setFirstName(e.target.value)} required
            style={inputStyle(color)}
          />
          <input
            type="text" placeholder="Last name" value={lastName}
            onChange={e => setLastName(e.target.value)}
            style={inputStyle(color)}
          />
        </div>
        <input
          type="email" placeholder="Email address *" value={email}
          onChange={e => setEmail(e.target.value)} required
          style={inputStyle(color)}
        />
        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, margin: '-4px 0 0', textAlign: 'left', fontFamily: 'inherit' }}>
            {error}
          </p>
        )}
        <button
          type="submit" disabled={submitting}
          style={{
            padding: '11px', border: 'none', borderRadius: 10,
            background: color, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1, transition: 'opacity .15s',
            fontFamily: 'inherit',
          }}
        >
          {submitting ? 'Starting…' : 'Start searching →'}
        </button>
      </form>

      <p style={{ fontSize: 12, color: '#999', marginTop: 14, fontFamily: 'inherit' }}>
       
        Your details are only used to personalise your experience.
      </p>
    </div>
  );
}

function inputStyle(color: string): React.CSSProperties {
  return {
    flex: 1, width: '100%', padding: '10px 14px',
    border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color .15s',
  };
}
