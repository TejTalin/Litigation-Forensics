import {
  LayoutDashboard,
  ScanSearch,
  UserSearch,
  GitCompareArrows,
  Swords,
  ShieldAlert,
  BookMarked,
  CalendarClock,
  HelpCircle,
} from 'lucide-react';
import type { ModuleId } from '../types';
import { MODULES } from '../data';
import { Dock, DockIcon } from './ui/dock';

export type NavId = 'dashboard' | ModuleId | 'guide';

interface NavItem {
  id: NavId;
  label: string;
  icon: typeof LayoutDashboard;
}

const iconMap: Record<string, typeof LayoutDashboard> = {
  'scan-search': ScanSearch,
  'user-search': UserSearch,
  'git-compare-arrows': GitCompareArrows,
  swords: Swords,
  'shield-alert': ShieldAlert,
  'book-marked': BookMarked,
  'calendar-clock': CalendarClock,
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Case Risk Dashboard', icon: LayoutDashboard },
  ...MODULES.map((m) => ({
    id: m.id as NavId,
    label: m.name,
    icon: iconMap[m.icon],
  })),
  { id: 'guide', label: 'Usage Guide', icon: HelpCircle },
];

interface NavRailProps {
  active: NavId;
  onSelect: (id: NavId) => void;
  caseRiskCounts?: Record<string, number>;
}

export function NavRail({ active, onSelect, caseRiskCounts }: NavRailProps) {
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2"
    >
      {/* Wordmark / logo mark */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-transform duration-300 shrink-0"
        onClick={() => onSelect('dashboard')}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08) rotate(-4deg)'; e.currentTarget.style.boxShadow = '0 0 18px var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; e.currentTarget.style.boxShadow = 'none'; }}
        style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
        title="Advinet"
      >
        <span className="font-display font-bold text-xl">A</span>
      </div>

      <Dock
        iconSize={44}
        iconMagnification={60}
        iconDistance={120}
        className="border"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
        } as React.CSSProperties}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          const riskCount = caseRiskCounts?.[item.id];
          return (
            <DockIcon key={item.id} onClick={() => onSelect(item.id)} data-cursor>
              <div
                className="group relative w-full h-full flex items-center justify-center rounded-full transition-colors duration-300"
                style={{
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--accent-bright)' : 'var(--text-tertiary)',
                }}
              >
                <Icon size={20} strokeWidth={1.5} />
                {riskCount && riskCount > 0 ? (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-mono flex items-center justify-center"
                    style={{ background: 'var(--risk-critical)', color: 'var(--bg-base)', animation: 'pulse-ambient 2s ease-in-out infinite' }}
                  >
                    {riskCount}
                  </span>
                ) : null}
                {isActive && (
                  <span
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
                  />
                )}
                <span
                  className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none font-sans transition-opacity duration-200"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  }}
                >
                  {item.label}
                </span>
              </div>
            </DockIcon>
          );
        })}
      </Dock>
    </div>
  );
}
