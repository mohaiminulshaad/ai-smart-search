/**
 * widget/components/SearchPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modern AI-powered search panel.  Handles:
 *  - Guest gate (first name, last name, email) — shown ONCE per browser session
 *  - Search history persisted to sessionStorage (survives page refresh)
 *  - Image upload → uploaded to Shopify CDN via /api/chat
 *  - SSE streaming for real-time AI responses
 *  - Product cards with links
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SmartSearchSettings, Message, GuestInfo, ProductCard } from '../types';
import GuestGate from './GuestGate';

interface Props {
  smartSearch:   SmartSearchSettings;
  shop:      string;
  appOrigin: string;
  customer:  { id: string; email?: string; firstName?: string } | null;
  onClose:   () => void;
}

type Phase = 'gate' | 'search';

// ── Storage keys ─────────────────────────────────────────────────────────────
const SS_FLAG      = 'ss_active';
const LS_GUEST_KEY = 'ss_guest_info';
const LS_MESSAGES  = 'ss_search_messages';
const LS_CHAT_ID   = 'ss_session_id';
const BC_CHANNEL   = 'ss_session_bc';
const HANDSHAKE_TIMEOUT_MS = 300;

function uid() { return Math.random().toString(36).slice(2, 10); }

function bootstrap() {
  try {
    const hasFlag = !!sessionStorage.getItem(SS_FLAG);
    if (hasFlag) {
      return {
        guestInfo:     JSON.parse(localStorage.getItem(LS_GUEST_KEY) || 'null'),
        messages:      JSON.parse(localStorage.getItem(LS_MESSAGES)  || '[]') as Message[],
        chatSessionId: localStorage.getItem(LS_CHAT_ID),
        needsHandshake: false,
      };
    }
    sessionStorage.setItem(SS_FLAG, '1');
    return { guestInfo: null, messages: [] as Message[], chatSessionId: null, needsHandshake: true };
  } catch {
    return { guestInfo: null, messages: [] as Message[], chatSessionId: null, needsHandshake: false };
  }
}

const boot = bootstrap();

export default function SearchPanel({ smartSearch, shop, appOrigin, customer, onClose }: Props) {
  const color   = smartSearch.primaryColor || '#6366f1';
  const side    = smartSearch.bubblePosition === 'bottom-left' ? { left: '24px' } : { right: '24px' };
  const botName = smartSearch.name || 'Smart Search';

  const [phase,     setPhase]     = useState<Phase>(boot.guestInfo ? 'search' : 'gate');
  const [guestInfo, setGuestInfo] = useState<GuestInfo | null>(boot.guestInfo);
  const [messages,  setMessages]  = useState<Message[]>(boot.messages);
  const [input,     setInput]     = useState('');
  const [waiting,   setWaiting]   = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview,  setImagePreview]  = useState<string | null>(null);

  const sessionRef    = useRef<string | null>(boot.chatSessionId);
  const messagesEnd   = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const fileRef       = useRef<HTMLInputElement>(null);

  // ── BroadcastChannel handshake ───────────────────────────────────────────
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel(BC_CHANNEL); } catch { return; }

    let handshakeResolved = !boot.needsHandshake;

    bc.onmessage = (event) => {
      const { type } = event.data || {};

      if (type === 'REQUEST_SESSION') {
        const raw = localStorage.getItem(LS_GUEST_KEY);
        if (raw) {
          bc!.postMessage({
            type:      'SESSION_DATA',
            guestInfo: JSON.parse(raw),
            messages:  JSON.parse(localStorage.getItem(LS_MESSAGES) || '[]'),
            chatId:    localStorage.getItem(LS_CHAT_ID),
          });
        }
        return;
      }

      if (type === 'SESSION_DATA' && event.data.guestInfo && !handshakeResolved) {
        handshakeResolved = true;
        try {
          localStorage.setItem(LS_GUEST_KEY, JSON.stringify(event.data.guestInfo));
          if (event.data.messages?.length) localStorage.setItem(LS_MESSAGES, JSON.stringify(event.data.messages));
          if (event.data.chatId) { localStorage.setItem(LS_CHAT_ID, event.data.chatId); sessionRef.current = event.data.chatId; }
        } catch {}
        setGuestInfo(event.data.guestInfo);
        setMessages(event.data.messages || []);
        setPhase('search');
        return;
      }

      if (type === 'GUEST_CONFIRMED' && event.data.guestInfo) {
        setGuestInfo(event.data.guestInfo);
        setPhase('search');
      }
    };

    if (boot.needsHandshake) {
      bc.postMessage({ type: 'REQUEST_SESSION' });
      setTimeout(() => {
        if (!handshakeResolved) {
          handshakeResolved = true;
          localStorage.removeItem(LS_GUEST_KEY);
          localStorage.removeItem(LS_MESSAGES);
          localStorage.removeItem(LS_CHAT_ID);
        }
      }, HANDSHAKE_TIMEOUT_MS);
    }

    return () => { bc?.close(); };
  }, []);

  // ── Cross-tab sync ───────────────────────────────────────────────────────
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === LS_GUEST_KEY && e.newValue) {
        try { setGuestInfo(JSON.parse(e.newValue)); setPhase('search'); } catch {}
      }
      if (e.key === LS_MESSAGES && e.newValue) {
        try { setMessages(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === LS_CHAT_ID && e.newValue) sessionRef.current = e.newValue;
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // ── Welcome message ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'search' && messages.length === 0) {
      setMessages([{ id: uid(), role: 'bot', content: smartSearch.welcomeMessage, ts: Date.now() }]);
    }
  }, [phase]);

  // ── Persist messages ─────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    try { localStorage.setItem(LS_MESSAGES, JSON.stringify(messages)); } catch {}
  }, [messages]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, waiting]);
  useEffect(() => {
    if (phase === 'search' && messages.length > 0)
      requestAnimationFrame(() => scrollToBottom(true));
  }, [phase]);

  // ── Focus input ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'search') setTimeout(() => inputRef.current?.focus(), 80);
  }, [phase]);

  // ── Gate completion ──────────────────────────────────────────────────────
  function handleGuestComplete(info: GuestInfo) {
    try {
      sessionStorage.setItem(SS_FLAG, '1');
      localStorage.setItem(LS_GUEST_KEY, JSON.stringify(info));
    } catch {}

    try {
      const bc = new BroadcastChannel(BC_CHANNEL);
      bc.postMessage({ type: 'GUEST_CONFIRMED', guestInfo: info });
      bc.close();
    } catch {}

    setGuestInfo(info);
    setPhase('search');
  }

  // ── Image handling ───────────────────────────────────────────────────────
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Send search query ────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedImage) || waiting) return;

    const userMsg: Message = {
      id: uid(), role: 'user',
      content: text || '(image search)',
      imageUrl: imagePreview,
      ts: Date.now(),
    };
    setMessages(m => [...m, userMsg]);
    setInput('');
    const imgFile = selectedImage;
    clearImage();
    setWaiting(true);

    const resolvedName  = customer?.firstName || guestInfo?.firstName || null;
    const resolvedEmail = customer?.email     || guestInfo?.email     || null;
    const resolvedId    = customer?.id        || null;

    try {
      if (imgFile) {
        const form = new FormData();
        form.append('shop', shop);
        form.append('message', text || 'Please analyse this image.');
        if (sessionRef.current) form.append('session_id', sessionRef.current);
        if (resolvedId)    form.append('customer_id', resolvedId);
        if (resolvedEmail) form.append('guest_email', resolvedEmail);
        form.append('image', imgFile);

        const res = await fetch(`${appOrigin}/api/chat/widget`, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();

        if (data.session_id) {
          sessionRef.current = data.session_id;
          try { localStorage.setItem(LS_CHAT_ID, data.session_id); } catch {}
        }
        setMessages(m => [...m, {
          id: uid(), role: 'bot',
          content: data.reply || 'No results found. Try a different search.',
          products: data.products || undefined,
          similarProducts: data.similar_products || undefined,
          similarCollection: data.similar_collection || undefined,
          ts: Date.now(),
        }]);
      } else {
        const res = await fetch(`${appOrigin}/api/chat/rag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shop-Domain': shop },
          body: JSON.stringify({
            message:     text,
            session_id:  sessionRef.current,
            customer_id: resolvedId,
            guest_name:  resolvedName,
            guest_email: resolvedEmail,
          }),
        });

        if (!res.ok || !res.body) throw new Error('Server error');

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer   = '';
        let botText  = '';
        let firstChunk = false;
        const botMsgId = uid();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'chunk' && event.chunk) {
                if (!firstChunk) {
                  firstChunk = true;
                  setMessages(m => [...m, { id: botMsgId, role: 'bot', content: '', ts: Date.now() }]);
                  setWaiting(false);
                }
                botText += event.chunk;
                setMessages(m => m.map(msg => msg.id === botMsgId ? { ...msg, content: botText } : msg));
              } else if ((event.type === 'session' || event.type === 'session_id') && event.session_id) {
                sessionRef.current = event.session_id;
                try { localStorage.setItem(LS_CHAT_ID, event.session_id); } catch {}
              } else if (event.type === 'products' && event.products?.length) {
                setMessages(m => m.map(msg => msg.id === botMsgId ? { ...msg, products: event.products } : msg));
              } else if (event.type === 'similar_products' && event.products?.length) {
                setMessages(m => m.map(msg =>
                  msg.id === botMsgId
                    ? { ...msg, similarProducts: event.products, similarCollection: event.collection || null }
                    : msg
                ));
              }
            } catch {}
          }
        }
        return;
      }
    } catch {
      setMessages(m => [...m, {
        id: uid(), role: 'bot',
        content: "Sorry, search is temporarily unavailable. Please try again.",
        ts: Date.now(),
      }]);
    } finally {
      setWaiting(false);
    }
  }, [input, selectedImage, imagePreview, waiting, shop, appOrigin, customer, guestInfo]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
  }

  // ── Quick suggestions ────────────────────────────────────────────────────
  const suggestions = ['Best sellers', 'New arrivals', 'Under $50'];

  function handleSuggestion(text: string) {
    setInput(text);
    setTimeout(() => {
      const ev = { trim: () => text } as any;
      // just set input and let user click send, or auto-send:
      setInput(text);
      // auto-send after setting
      const userMsg: Message = { id: uid(), role: 'user', content: text, ts: Date.now() };
      setMessages(m => [...m, userMsg]);
      setInput('');
      setWaiting(true);

      const resolvedName  = customer?.firstName || guestInfo?.firstName || null;
      const resolvedEmail = customer?.email     || guestInfo?.email     || null;
      const resolvedId    = customer?.id        || null;

      fetch(`${appOrigin}/api/chat/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shop-Domain': shop },
        body: JSON.stringify({
          message: text, session_id: sessionRef.current,
          customer_id: resolvedId, guest_name: resolvedName, guest_email: resolvedEmail,
        }),
      }).then(async res => {
        if (!res.ok || !res.body) throw new Error('Server error');
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', botText = '', firstChunk = false;
        const botMsgId = uid();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'chunk' && event.chunk) {
                if (!firstChunk) {
                  firstChunk = true;
                  setMessages(m => [...m, { id: botMsgId, role: 'bot', content: '', ts: Date.now() }]);
                  setWaiting(false);
                }
                botText += event.chunk;
                setMessages(m => m.map(msg => msg.id === botMsgId ? { ...msg, content: botText } : msg));
              } else if ((event.type === 'session' || event.type === 'session_id') && event.session_id) {
                sessionRef.current = event.session_id;
                try { localStorage.setItem(LS_CHAT_ID, event.session_id); } catch {}
              } else if (event.type === 'products' && event.products?.length) {
                setMessages(m => m.map(msg => msg.id === botMsgId ? { ...msg, products: event.products } : msg));
              } else if (event.type === 'similar_products' && event.products?.length) {
                setMessages(m => m.map(msg =>
                  msg.id === botMsgId ? { ...msg, similarProducts: event.products, similarCollection: event.collection || null } : msg
                ));
              }
            } catch {}
          }
        }
      }).catch(() => {
        setMessages(m => [...m, { id: uid(), role: 'bot', content: "Sorry, search is temporarily unavailable.", ts: Date.now() }]);
      }).finally(() => setWaiting(false));
    }, 0);
  }

  // ── Panel styles ─────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    position:     'fixed', bottom: '92px', ...side,
    width:        '380px', maxWidth: 'calc(100vw - 32px)',
    height:       '560px', maxHeight: 'calc(100vh - 120px)',
    borderRadius: '16px',  background: '#fff',
    boxShadow:    '0 8px 40px rgba(0,0,0,.18)',
    zIndex:       '2147483646',
    display:      'flex',  flexDirection: 'column',
    overflow:     'hidden',
    fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    animation:    'ss-slide-up .22s ease',
  };

  return (
    <div style={panelStyle} role="dialog" aria-label={botName}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`,
        color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: '12px',
          background: 'rgba(255,255,255,.2)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
        }}>
          {smartSearch.logoUrl
            ? <img src={smartSearch.logoUrl} alt={botName} style={{ width: 38, height: 38, objectFit: 'cover' }} />
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
              </svg>
          }
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.2px' }}>{botName}</div>
          <div style={{ fontSize: 11, opacity: .85 }}>AI-powered product discovery</div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{
          all: 'unset', cursor: 'pointer', color: '#fff', opacity: .8, fontSize: 18,
          lineHeight: 1, padding: 4, borderRadius: '50%', transition: 'opacity .15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '.8'; }}
        >✕</button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {phase === 'gate' ? (
        <GuestGate color={color} appOrigin={appOrigin} shop={shop} onComplete={handleGuestComplete} />
      ) : (
        <>
          {/* Results area */}
          <div ref={scrollAreaRef} style={{
            flex: 1, overflowY: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 10,
            background: '#fafbfc',
          }}>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} color={color} />
            ))}
            {waiting && <SearchingIndicator color={color} />}
            <div ref={messagesEnd} />

            {/* Quick suggestions — only if no user searches yet */}
            {messages.length <= 1 && !waiting && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => handleSuggestion(s)} style={{
                    all: 'unset', padding: '6px 14px', borderRadius: 20,
                    border: `1.5px solid ${color}20`, background: `${color}08`,
                    color, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    transition: 'all .15s', fontFamily: 'inherit',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}15`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08`; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Image preview */}
          {imagePreview && (
            <div style={{ padding: '8px 14px', background: '#fff', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <img src={imagePreview} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <div style={{ flex: 1, fontSize: 12, color: '#666', fontFamily: 'inherit' }}>{selectedImage?.name}</div>
              <button onClick={clearImage} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: '#999', lineHeight: 1 }}>✕</button>
            </div>
          )}

          {/* Search input row */}
          <div style={{
            display: 'flex', gap: 8, padding: '12px 14px',
            borderTop: '1px solid #e5e7eb', background: '#fff',
            alignItems: 'center', flexShrink: 0,
          }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />

            {smartSearch.imageUploadEnabled && (
              <button
                onClick={() => fileRef.current?.click()}
                title="Search by image"
                style={{
                  all: 'unset', width: 34, height: 34, borderRadius: 10,
                  border: '1.5px solid #e5e7eb', background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'border-color .15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
            )}

            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              border: '1.5px solid #e5e7eb', borderRadius: 12,
              background: '#f9fafb', padding: '0 12px',
              transition: 'border-color .15s, box-shadow .15s',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 8 }}>
                <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search products…"
                disabled={waiting}
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  padding: '9px 0', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.4,
                }}
              />
            </div>

            <button
              onClick={send}
              disabled={waiting || (!input.trim() && !selectedImage)}
              aria-label="Search"
              style={{
                all: 'unset', width: 36, height: 36, borderRadius: 12,
                background: color, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                opacity: (waiting || (!input.trim() && !selectedImage)) ? .45 : 1,
                transition: 'opacity .15s, transform .1s',
              }}
              onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(.95)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 10.5, color: '#ccc', padding: '4px 0 6px', background: '#fff', flexShrink: 0, fontFamily: 'inherit' }}>
        Powered by Smart Search AI
      </div>
    </div>
  );
}

// ── Helper: darken/lighten a hex colour ──────────────────────────────────────
function adjustColor(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, li) => {
    if (li > 0) nodes.push(<br key={`br-${li}`} />);
    const segments: React.ReactNode[] = [];
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      if (match.index > last) segments.push(line.slice(last, match.index));
      if (match[2] !== undefined) segments.push(<strong key={`b-${li}-${match.index}`}>{match[2]}</strong>);
      else if (match[3] !== undefined) segments.push(<em key={`i-${li}-${match.index}`}>{match[3]}</em>);
      else if (match[4] !== undefined) segments.push(<code key={`c-${li}-${match.index}`} style={{ background: '#f3f4f6', borderRadius: 3, padding: '1px 4px', fontSize: '0.92em' }}>{match[4]}</code>);
      last = match.index + match[0].length;
    }
    if (last < line.length) segments.push(line.slice(last));
    nodes.push(...segments);
  });
  return nodes;
}

function ProductCards({ products, color }: { products: ProductCard[]; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {products.map(p => {
        const href = p.handle ? `/products/${p.handle}` : null;
        const Wrapper = href ? 'a' : 'div';
        const linkProps = href ? { href, target: '_top', rel: 'noopener' } : {};
        return (
          <Wrapper key={p.id} {...linkProps as any} style={{
            display: 'flex', gap: 10, alignItems: 'center',
            background: '#fff', borderRadius: 12,
            border: '1px solid #e5e7eb', padding: '10px 12px',
            fontSize: 13, textDecoration: 'none', color: 'inherit',
            cursor: href ? 'pointer' : 'default',
            transition: 'border-color .15s, box-shadow .15s',
          }}
            onMouseEnter={(e: any) => {
              if (href) {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.boxShadow = `0 2px 8px ${color}20`;
              }
            }}
            onMouseLeave={(e: any) => {
              if (href) {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {p.image
              ? <img src={p.image} alt={p.title} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '1px solid #f0f0f0' }} />
              : <div style={{ width: 56, height: 56, background: '#f3f4f6', borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🛍️</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 }}>{p.title}</div>
              <div style={{ color, fontWeight: 700, marginTop: 2, fontSize: 14 }}>
                ${typeof p.price === 'number' ? p.price.toFixed(2) : p.price}
              </div>
              <div style={{ fontSize: 11, color: p.available ? '#16a34a' : '#dc2626', marginTop: 1 }}>
                {p.available ? '✓ In stock' : '✗ Out of stock'}
              </div>
            </div>
            {href && <span style={{ fontSize: 16, color: '#d1d5db', flexShrink: 0 }}>›</span>}
          </Wrapper>
        );
      })}
    </div>
  );
}

function MessageBubble({ msg, color }: { msg: Message; color: string }) {
  const isBot = msg.role === 'bot';
  return (
    <div style={{ display: 'flex', justifyContent: isBot ? 'flex-start' : 'flex-end' }}>
      <div style={{
        maxWidth: '85%', padding: '10px 14px', fontSize: 14, lineHeight: 1.55,
        wordBreak: 'break-word', fontFamily: 'inherit',
        borderRadius: isBot ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        background: isBot ? '#fff' : color,
        color: isBot ? '#111' : '#fff',
        border: isBot ? '1px solid #e5e7eb' : 'none',
        boxShadow: isBot ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
      }}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="uploaded" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: msg.content && msg.content !== '(image search)' ? 8 : 0, display: 'block' }} />
        )}
        {msg.content && msg.content !== '(image search)' && (
          <span>{renderMarkdown(msg.content)}</span>
        )}
        {isBot && msg.products && msg.products.length > 0 && (
          <ProductCards products={msg.products} color={color} />
        )}
        {isBot && msg.similarProducts && msg.similarProducts.length > 0 && (
          <>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #e5e7eb' }}>
              <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 2, letterSpacing: 0.3 }}>
                You might also like
              </div>
              {msg.similarCollection && (
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>More from {msg.similarCollection}</div>
              )}
              <ProductCards products={msg.similarProducts} color={color} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SearchingIndicator({ color }: { color: string }) {
  return (
    <div style={{
      display: 'flex', gap: 6, padding: '10px 14px', alignSelf: 'flex-start',
      background: '#fff', borderRadius: '4px 14px 14px 14px',
      border: '1px solid #e5e7eb', alignItems: 'center',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{
        animation: 'ss-pulse 1s ease-in-out infinite',
      }}>
        <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
      </svg>
      <span style={{ fontSize: 13, color: '#666', fontFamily: 'inherit' }}>Searching…</span>
    </div>
  );
}
