// widget/components/SearchBubble.tsx — floating search button

interface Props {
  color:    string;
  position: 'bottom-right' | 'bottom-left';
  isOpen:   boolean;
  onClick:  () => void;
}

export default function SearchBubble({ color, position, isOpen, onClick }: Props) {
  const side = position === 'bottom-left' ? { left: '24px' } : { right: '24px' };

  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Close search' : 'Open search'}
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
        animation:    isOpen ? 'none' : 'ss-pulse 2s ease-in-out infinite',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(0,0,0,.3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.25)'; }}
    >
      {isOpen ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="21" y2="21"/>
        </svg>
      )}
    </button>
  );
}
