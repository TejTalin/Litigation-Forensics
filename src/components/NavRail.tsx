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
    <nav
      className="fixed left-0 top-0 h-full w-16 flex flex-col items-center py-4 z-50 border-r"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      {/* Wordmark / logo mark */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-6 cursor-pointer transition-transform duration-300"
        onClick={() => onSelect('dashboard')}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1) rotate(-5deg)'; e.currentTarget.style.boxShadow = '0 0 20px var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; e.currentTarget.style.boxShadow = 'none'; }}
        style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
        title="Advinet"
      >
        <span className="font-display font-bold text-xl">A</span>
      </div>

      <div className="flex flex-col gap-1.5 flex-1">
        {NAV_ITEMS.map((item, idx) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          const riskCount = caseRiskCounts?.[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              data-cursor
              className="group relative w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-300"
              style={{
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--accent-bright)' : 'var(--text-tertiary)',
                animation: `fade-in-up 0.4s ease-out forwards`,
                animationDelay: `${idx * 40}ms`,
                opacity: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              <Icon
                size={20}
                strokeWidth={1.5}
                className="transition-transform duration-300"
                style={{ transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
              />
              {riskCount && riskCount > 0 ? (
                <span
                  className="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] font-mono flex items-center justify-center transition-transform duration-300 group-hover:scale-125"
                  style={{ background: 'var(--risk-critical)', color: 'var(--bg-base)', animation: 'pulse-ambient 2s ease-in-out infinite' }}
                >
                  {riskCount}
                </span>
              ) : null}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full"
                  style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
                />
              )}
              {/* Tooltip */}
              <span
                className="absolute left-full ml-3 px-3 py-1.5 rounded-md text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none font-sans transition-all duration-300 group-hover:translate-x-1"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  transform: 'translateX(-4px)',
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
