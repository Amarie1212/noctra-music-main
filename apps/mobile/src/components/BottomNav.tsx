import type { Tab } from '../App';

interface Props {
  active: Tab;
  onChange: (t: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'library',   label: 'Library',   icon: '♪' },
  { id: 'playlists', label: 'Playlists', icon: '≡' },
  { id: 'settings',  label: 'Settings',  icon: '⚙' },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`bottom-nav-item ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="bottom-nav-icon">{tab.icon}</span>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
