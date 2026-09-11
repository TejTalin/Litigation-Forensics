import { MODULES } from '../data';
import {
  ScanSearch,
  UserSearch,
  GitCompareArrows,
  Swords,
  ShieldAlert,
  BookMarked,
  CalendarClock,
  HelpCircle,
} from 'lucide-react';
import type { NavId } from '../components/NavRail';
import { useCardGlow } from '../hooks/useCardGlow';

const ICON_MAP: Record<string, typeof ScanSearch> = {
  'scan-search': ScanSearch,
  'user-search': UserSearch,
  'git-compare-arrows': GitCompareArrows,
  swords: Swords,
  'shield-alert': ShieldAlert,
  'book-marked': BookMarked,
  'calendar-clock': CalendarClock,
};

interface GuidePageProps {
  onNavigate: (id: NavId) => void;
}

export function GuidePage({ onNavigate }: GuidePageProps) {
  const glow = useCardGlow();

  return (
    <div className="pt-14 px-6 pb-6 max-w-4xl mx-auto min-h-screen">
      <div className="mb-8 stagger-in" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle size={18} style={{ color: 'var(--accent)' }} />
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            In-app usage guide
          </span>
        </div>
        <h1 className="font-display text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          How Advinet works
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Advinet is a forensic audit platform for Indian litigators. Each module examines a different
          dimension of your case file — from risky language in correspondence to missing parties, prayer
          mismatches, cross-document contradictions, live concessions, citation validity, and court
          queue tracking. Upload your documents, run a scan, and review findings on the evidence board.
        </p>
      </div>

      <div className="space-y-4">
        {MODULES.map((mod, i) => {
          const Icon = ICON_MAP[mod.icon] || HelpCircle;
          return (
            <div
              key={mod.id}
              onMouseMove={glow}
              className="card-glow rounded-xl border p-5 flex gap-4 transition-all duration-300 stagger-in"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-surface)',
                '--i': 1 + i,
              } as React.CSSProperties}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300"
                style={{ background: 'var(--bg-elevated)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1) rotate(0deg)')}
              >
                <Icon size={20} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {mod.name}
                  </h3>
                  {mod.hasUpload && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-mono"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
                    >
                      document upload
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {mod.description}
                </p>
                <button
                  onClick={() => onNavigate(mod.id as NavId)}
                  className="text-xs mt-2 underline underline-offset-2 transition-all duration-200"
                  style={{ color: 'var(--accent-bright)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.letterSpacing = '0.02em'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-bright)'; e.currentTarget.style.letterSpacing = 'normal'; }}
                >
                  Open {mod.shortName} →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-8 rounded-xl border p-5 stagger-in"
        style={{
          borderColor: 'var(--accent)',
          background: 'var(--bg-elevated)',
          '--i': 8,
        } as React.CSSProperties}
      >
        <h3 className="font-display text-base font-semibold mb-2" style={{ color: 'var(--accent-bright)' }}>
          Reading the evidence board
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Every finding appears as a node on the board, colour-coded by severity — red for critical,
          amber for caution, green for verified. Dashed lines connect related findings, showing you the
          actual evidentiary relationships: a flagged phrase linked to the paragraph it contradicts, a
          missing party linked to the averment that implies them. Click any node to see the flagged text,
          its location, and a suggested remediation.
        </p>
      </div>
    </div>
  );
}
