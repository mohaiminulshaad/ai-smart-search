// frontend/src/smart-search/components/ChatBubble.tsx

interface Props {
  color:    string;
  position: 'bottom-right' | 'bottom-left';
  isOpen:   boolean;
  onClick:  () => void;
}

export default function ChatBubble({ color, position, isOpen, onClick }: Props) {
  const side = position === 'bottom-left' ? { left: '24px' } : { right: '24px' };

  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
      aria-expanded={isOpen}
      style={{
        all:          'unset',
        position:     'fixed',
        bottom:       '24px',
        ...side,
        width:        '56px',
        height:       '56px',
        borderRadius: '50%',
        background:   color,
        cursor:       'pointer',
        boxShadow:    '0 4px 20px rgba(0,0,0,.25)',
        zIndex:       '2147483647',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        transition:   'transform .2s, box-shadow .2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(0,0,0,.3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.25)'; }}
    >
      {isOpen ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      ) : (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
          <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
        </svg>
      )}
    </button>
  );
}
