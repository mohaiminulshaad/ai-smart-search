/**
 * frontend/src/smart-search/components/ChatPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The full chat window. Handles:
 *  - Guest gate (first name, last name, email) — shown ONCE per browser session.
 *    Guest info is stored in localStorage with a tab-session flag so it persists
 *    across tabs but clears when the browser is fully closed.
 *  - Chat messages persisted to sessionStorage so they survive page refreshes
 *    within the same tab, but clear when the tab is closed.
 *  - Image upload for ALL users → uploaded to Shopify CDN via /api/chat
 *  - Typing indicator, auto-scroll, textarea auto-resize
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SmartSearchSettings, Message, ChatResponse, GuestInfo, ProductCard } from '../types';
import GuestGate from './GuestGate';

interface Props {
  smartSearch:   SmartSearchSettings;
  shop:      string;
  appOrigin: string;
  customer:  { id: string; email?: string; firstName?: string } | null;
  onClose:   () => void;
}

type Phase = 'gate' | 'chat';

// ── sessionStorage flag + BroadcastChannel handshake ─────────────────────────
//
//  How it works:
//  • sessionStorage is cleared by the browser when ALL tabs close — automatically.
//  • On mount, if sessionStorage flag exists → same browser session → load data.
//  • If no flag → new tab or fresh browser open → send REQUEST_SESSION via
//    BroadcastChannel and wait up to 150ms for an existing tab to reply.
//      - Reply arrives  → existing session, restore data, skip gate.
//      - No reply (300ms timeout) → browser was closed/reopened → wipe
//        localStorage and show gate fresh.
//  • The localStorage wipe is intentionally DEFERRED (not in bootstrap) so that
//    existing tabs still have data available to respond to the handshake.
//
//  ✅ Page refresh              → sessionStorage flag alive → load data, skip gate
//  ✅ New tab (browser open)    → handshake replied by existing tab → skip gate
//  ✅ Browser closed + reopened → no tab replies within 300ms → wipe, show gate

const SS_FLAG      = 'smart-search_active';        // sessionStorage – browser-session flag
const LS_GUEST_KEY = 'smart-search_guest_info';    // localStorage   – guest name/email
const LS_MESSAGES  = 'smart-search_chat_messages'; // localStorage   – chat history
const LS_CHAT_ID   = 'smart-search_session_id';    // localStorage   – backend session ID
const BC_CHANNEL   = 'smart-search_session_bc';    // BroadcastChannel name
const HANDSHAKE_TIMEOUT_MS = 300;          // wait this long for a reply

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Bootstrap: only reads, never wipes ───────────────────────────────────────
function bootstrap(): {
  guestInfo: GuestInfo | null;
  messages: Message[];
  chatSessionId: string | null;
  needsHandshake: boolean;
} {
  try {
    const hasFlag = !!sessionStorage.getItem(SS_FLAG);

    if (hasFlag) {
      // Refresh within same tab — load saved data directly, no handshake needed
      const guestInfo     = JSON.parse(localStorage.getItem(LS_GUEST_KEY) || 'null');
      const messages      = JSON.parse(localStorage.getItem(LS_MESSAGES)  || '[]');
      const chatSessionId = localStorage.getItem(LS_CHAT_ID);
      return { guestInfo, messages, chatSessionId, needsHandshake: false };
    }

    // No flag → set it now so refreshes within this tab will work going forward
    sessionStorage.setItem(SS_FLAG, '1');

    // Don't wipe localStorage yet — wait for handshake result first
    return { guestInfo: null, messages: [], chatSessionId: null, needsHandshake: true };

  } catch {
    return { guestInfo: null, messages: [], chatSessionId: null, needsHandshake: false };
  }
}

const boot = bootstrap();

export default function ChatPanel({ smartSearch, shop, appOrigin, customer, onClose }: Props) {
  const color   = smartSearch.primaryColor || '#6366f1';
  const side    = smartSearch.bubblePosition === 'bottom-left' ? { left: '24px' } : { right: '24px' };
  const botName = smartSearch.name || 'Smart Search Beauty AI';

  const [phase,     setPhase]     = useState<Phase>(boot.guestInfo ? 'chat' : 'gate');
  const [guestInfo, setGuestInfo] = useState<GuestInfo | null>(boot.guestInfo);
  const [messages,  setMessages]  = useState<Message[]>(boot.messages);
  const [input,     setInput]     = useState('');
  const [waiting,   setWaiting]   = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview,  setImagePreview]  = useState<string | null>(null);

  const sessionRef    = useRef<string | null>(boot.chatSessionId);
  const messagesEnd   = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const fileRef       = useRef<HTMLInputElement>(null);

  // ── BroadcastChannel: handshake + live sync ──────────────────────────────
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel(BC_CHANNEL); } catch { return; }

    let handshakeResolved = !boot.needsHandshake; // already resolved if not a new tab

    bc.onmessage = (event) => {
      const { type } = event.data || {};

      // ── Responder: an existing tab asking us for session data ──────────────
      // Only reply if WE have an active guest session saved
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

      // ── New tab: received session data from an existing tab ────────────────
      if (type === 'SESSION_DATA' && event.data.guestInfo && !handshakeResolved) {
        handshakeResolved = true;
        try {
          localStorage.setItem(LS_GUEST_KEY, JSON.stringify(event.data.guestInfo));
          if (event.data.messages?.length) localStorage.setItem(LS_MESSAGES, JSON.stringify(event.data.messages));
          if (event.data.chatId) { localStorage.setItem(LS_CHAT_ID, event.data.chatId); sessionRef.current = event.data.chatId; }
        } catch { /* private mode */ }
        setGuestInfo(event.data.guestInfo);
        setMessages(event.data.messages || []);
        setPhase('chat');
        return;
      }

      // ── Another tab just completed the gate — sync to this tab ─────────────
      if (type === 'GUEST_CONFIRMED' && event.data.guestInfo) {
        setGuestInfo(event.data.guestInfo);
        setPhase('chat');
      }
    };

    // ── Send handshake AFTER listener is attached ─────────────────────────────
    // Then wait HANDSHAKE_TIMEOUT_MS for a reply. If none comes, this is a fresh
    // browser session — wipe localStorage and show the gate.
    if (boot.needsHandshake) {
      bc.postMessage({ type: 'REQUEST_SESSION' });

      setTimeout(() => {
        if (!handshakeResolved) {
          handshakeResolved = true;
          // No existing tab replied → browser was closed → clean up stale data
          localStorage.removeItem(LS_GUEST_KEY);
          localStorage.removeItem(LS_MESSAGES);
          localStorage.removeItem(LS_CHAT_ID);
          // State is already gate/empty from bootstrap, nothing to reset
        }
      }, HANDSHAKE_TIMEOUT_MS);
    }

    return () => { bc?.close(); };
  }, []);

  // ── Sync messages and guest info from other tabs ─────────────────────────
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === LS_GUEST_KEY && e.newValue) {
        try { const info = JSON.parse(e.newValue) as GuestInfo; setGuestInfo(info); setPhase('chat'); }
        catch { /* malformed */ }
      }
      if (e.key === LS_MESSAGES && e.newValue) {
        try { setMessages(JSON.parse(e.newValue) as Message[]); }
        catch { /* malformed */ }
      }
      if (e.key === LS_CHAT_ID && e.newValue) {
        sessionRef.current = e.newValue;
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // ── Seed welcome message when entering chat for the first time ────────────
  useEffect(() => {
    if (phase === 'chat' && messages.length === 0) {
      const welcome: Message = { id: uid(), role: 'bot', content: smartSearch.welcomeMessage, ts: Date.now() };
      setMessages([welcome]);
    }
  }, [phase]);

  // ── Persist messages to localStorage on every change ─────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    try { localStorage.setItem(LS_MESSAGES, JSON.stringify(messages)); } catch { /* private mode */ }
  }, [messages]);

  // ── Auto-scroll — always keep chat pinned to latest message ─────────────
  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
  }, []);

  // Scroll on every message change and when waiting state changes
  useEffect(() => { scrollToBottom(); }, [messages, waiting]);

  // Scroll to bottom on initial load (e.g. restored from localStorage)
  useEffect(() => {
    if (phase === 'chat' && messages.length > 0) {
      // Small delay to ensure DOM has rendered
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [phase]);

  // ── Focus textarea when entering chat ─────────────────────────────────────
  useEffect(() => {
    if (phase === 'chat') {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [phase]);

  // ── Gate completion ───────────────────────────────────────────────────────
  function handleGuestComplete(info: GuestInfo) {
    try {
      sessionStorage.setItem(SS_FLAG, '1');
      localStorage.setItem(LS_GUEST_KEY, JSON.stringify(info));
    } catch { /* private mode */ }

    // Notify other open tabs instantly
    try {
      const bc = new BroadcastChannel(BC_CHANNEL);
      bc.postMessage({ type: 'GUEST_CONFIRMED', guestInfo: info });
      bc.close();
    } catch { /* not supported */ }

    setGuestInfo(info);
    setPhase('chat');
  }

  // ── Image selection ───────────────────────────────────────────────────────
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

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedImage) || waiting) return;

    const userMsg: Message = {
      id: uid(), role: 'user',
      content: text || '(image)',
      imageUrl: imagePreview,
      ts: Date.now(),
    };
    setMessages(m => [...m, userMsg]);
    setInput('');
    const imgFile = selectedImage;
    clearImage();
    setWaiting(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const resolvedName  = customer?.firstName || guestInfo?.firstName || null;
    const resolvedEmail = customer?.email     || guestInfo?.email     || null;
    const resolvedId    = customer?.id        || null;

    try {
      let res: Response;

      if (imgFile) {
        const form = new FormData();
        form.append('shop', shop);
        form.append('message', text || 'Please analyse this image.');
        if (sessionRef.current) form.append('session_id', sessionRef.current);
        if (resolvedId)    form.append('customer_id', resolvedId);
        if (resolvedEmail) form.append('guest_email', resolvedEmail);
        form.append('image', imgFile);
        res = await fetch(`${appOrigin}/api/chat/widget`, { method: 'POST', body: form });

        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        if (data.session_id) {
          sessionRef.current = data.session_id;
          try { localStorage.setItem(LS_CHAT_ID, data.session_id); } catch { /* private mode */ }
        }
        setMessages(m => [...m, {
          id: uid(), role: 'bot',
          content: data.reply || 'Sorry, I could not generate a response.',
          products: data.products || undefined,
          similarProducts: data.similar_products || undefined,
          similarCollection: data.similar_collection || undefined,
          ts: Date.now(),
        }]);

      } else {
        res = await fetch(`${appOrigin}/api/chat/rag`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'X-Shop-Domain': shop,
          },
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
        let buffer  = '';
        let botText = '';
        let firstChunkReceived = false;
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
                if (!firstChunkReceived) {
                  firstChunkReceived = true;
                  setMessages(m => [...m, { id: botMsgId, role: 'bot', content: '', ts: Date.now() }]);
                  setWaiting(false);
                }
                botText += event.chunk;
                setMessages(m => m.map(msg =>
                  msg.id === botMsgId ? { ...msg, content: botText } : msg
                ));
              } else if ((event.type === 'session' || event.type === 'session_id') && event.session_id) {
                sessionRef.current = event.session_id;
                try { localStorage.setItem(LS_CHAT_ID, event.session_id); } catch { /* private mode */ }
              } else if (event.type === 'products' && event.products?.length) {
                setMessages(m => m.map(msg =>
                  msg.id === botMsgId ? { ...msg, products: event.products } : msg
                ));
              } else if (event.type === 'similar_products' && event.products?.length) {
                setMessages(m => m.map(msg =>
                  msg.id === botMsgId
                    ? { ...msg, similarProducts: event.products, similarCollection: event.collection || null }
                    : msg
                ));
              }
            } catch { /* malformed line */ }
          }
        }
        return;
      }
    } catch {
      setMessages(m => [...m, {
        id: uid(), role: 'bot',
        content: "Sorry, I'm having trouble connecting right now. Please try again.",
        ts: Date.now(),
      }]);
    } finally {
      setWaiting(false);
    }
  }, [input, selectedImage, imagePreview, waiting, shop, appOrigin, customer, guestInfo]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    position:     'fixed', bottom: '92px', ...side,
    width:        '360px', maxWidth: 'calc(100vw - 32px)',
    height:       '540px', maxHeight: 'calc(100vh - 120px)',
    borderRadius: '16px',  background: '#fff',
    boxShadow:    '0 8px 40px rgba(0,0,0,.18)',
    zIndex:       '2147483646',
    display:      'flex',  flexDirection: 'column',
    overflow:     'hidden',
    fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    animation:    'smart-search-slide-up .22s ease',
  };

  return (
    <div style={panelStyle} role="dialog" aria-label={botName}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: color, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {smartSearch.logoUrl
            ? <img src={smartSearch.logoUrl} alt={botName} style={{ width: 36, height: 36, objectFit: 'cover' }} />
            : <span style={{ fontSize: 18 }}>✨</span>
          }
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{botName}</div>
          <div style={{ fontSize: 11, opacity: .85, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
            Online
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', color: '#fff', opacity: .8, fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {phase === 'gate' ? (
        <GuestGate color={color} appOrigin={appOrigin} shop={shop} onComplete={handleGuestComplete} />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollAreaRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f9fafb' }}>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} color={color} />
            ))}
            {waiting && <TypingIndicator />}
            <div ref={messagesEnd} />
          </div>

          {/* Image preview before send */}
          {imagePreview && (
            <div style={{ padding: '8px 14px', background: '#fff', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <img src={imagePreview} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <div style={{ flex: 1, fontSize: 12, color: '#666', fontFamily: 'inherit' }}>
                {selectedImage?.name}
              </div>
              <button onClick={clearImage} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: '#999', lineHeight: 1 }}>✕</button>
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderTop: '1px solid #e5e7eb', background: '#fff', alignItems: 'flex-end', flexShrink: 0 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />

            <button
              onClick={() => fileRef.current?.click()}
              title="Upload image"
              style={{
                all: 'unset', width: 34, height: 34, borderRadius: 8,
                border: '1.5px solid #e5e7eb', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 16, flexShrink: 0,
              }}
            >📷</button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              disabled={waiting}
              style={{
                flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 20,
                padding: '8px 14px', fontSize: 13, outline: 'none',
                resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
                maxHeight: '100px', overflowY: 'auto', boxSizing: 'border-box',
                transition: 'border-color .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = color; }}
              onBlur={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            />

            <button
              onClick={send}
              disabled={waiting || (!input.trim() && !selectedImage)}
              aria-label="Send"
              style={{
                all: 'unset', width: 34, height: 34, borderRadius: '50%',
                background: color, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                opacity: (waiting || (!input.trim() && !selectedImage)) ? .45 : 1,
                transition: 'opacity .15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 10.5, color: '#ccc', padding: '4px 0 6px', background: '#fff', flexShrink: 0, fontFamily: 'inherit' }}>
        Powered by Smart Search Beauty AI
      </div>
    </div>
  );
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
      if (match.index > last) {
        segments.push(line.slice(last, match.index));
      }
      if (match[2] !== undefined) {
        segments.push(<strong key={`b-${li}-${match.index}`}>{match[2]}</strong>);
      } else if (match[3] !== undefined) {
        segments.push(<em key={`i-${li}-${match.index}`}>{match[3]}</em>);
      } else if (match[4] !== undefined) {
        segments.push(<code key={`c-${li}-${match.index}`} style={{ background: '#f3f4f6', borderRadius: 3, padding: '1px 4px', fontSize: '0.92em' }}>{match[4]}</code>);
      }
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
            background: '#f9fafb', borderRadius: 10,
            border: '1px solid #e5e7eb', padding: '8px 10px',
            fontSize: 13, textDecoration: 'none', color: 'inherit',
            cursor: href ? 'pointer' : 'default',
            transition: 'border-color .15s',
          }}
          onMouseEnter={(e: any) => { if (href) e.currentTarget.style.borderColor = color; }}
          onMouseLeave={(e: any) => { if (href) e.currentTarget.style.borderColor = '#e5e7eb'; }}
          >
            {p.image
              ? <img src={p.image} alt={p.title} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid #e5e7eb' }} />
              : <div style={{ width: 52, height: 52, background: '#e5e7eb', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🛍️</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
              <div style={{ color, fontWeight: 700, marginTop: 2 }}>
                ${typeof p.price === 'number' ? p.price.toFixed(2) : p.price}
              </div>
              <div style={{ fontSize: 11, color: p.available ? '#16a34a' : '#dc2626', marginTop: 1 }}>
                {p.available ? '✓ In stock' : '✗ Out of stock'}
              </div>
            </div>
            {href && <span style={{ fontSize: 14, color: '#9ca3af', flexShrink: 0 }}>›</span>}
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
        maxWidth: '80%', padding: '10px 14px', fontSize: 14, lineHeight: 1.5,
        wordBreak: 'break-word', fontFamily: 'inherit',
        borderRadius: isBot ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        background: isBot ? '#fff' : color,
        color: isBot ? '#111' : '#fff',
        border: isBot ? '1px solid #e5e7eb' : 'none',
        boxShadow: isBot ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
      }}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="uploaded" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: msg.content && msg.content !== '(image)' ? 8 : 0, display: 'block' }} />
        )}
        {msg.content && msg.content !== '(image)' && (
          <span>{renderMarkdown(msg.content)}</span>
        )}
        {isBot && msg.products && msg.products.length > 0 && (
          <ProductCards products={msg.products} color={color} />
        )}
        {isBot && msg.similarProducts && msg.similarProducts.length > 0 && (
          <>
            <div style={{
              marginTop: 14, paddingTop: 12,
              borderTop: '1px dashed #e5e7eb',
            }}>
              <div style={{ fontSize: 12, color: color, fontWeight: 700, marginBottom: 2, letterSpacing: 0.3 }}>
                You might also like
              </div>
              {msg.similarCollection && (
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                  More from {msg.similarCollection}
                </div>
              )}
              <ProductCards products={msg.similarProducts} color={color} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 14px', alignSelf: 'flex-start', background: '#fff', borderRadius: '4px 14px 14px 14px', border: '1px solid #e5e7eb' }}>
      {[0, 200, 400].map(delay => (
        <span key={delay} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#9ca3af',
          display: 'inline-block',
          animation: 'smart-search-bounce 1.2s ease-in-out infinite',
          animationDelay: `${delay}ms`,
        }} />
      ))}
    </div>
  );
}
