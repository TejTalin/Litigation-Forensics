/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULES, CASES } from '../data';
import { AlertCircle, AlertTriangle, CheckCircle2, ArrowRight, Clock, Scale } from 'lucide-react';
import type { NavId } from '../components/NavRail';
import { useCardGlow } from '../hooks/useCardGlow';

interface DashboardProps {
  activeCase: typeof CASES[0];
  onNavigate: (id: NavId) => void;
  moduleResults: Record<string, any>;
}

export function Dashboard({ activeCase, onNavigate, moduleResults }: DashboardProps) {
  const aggregate = MODULES.filter(module => module.id !== 'court-queue' && module.id !== 'citation').map(module => {
    const result = moduleResults[module.id];
    const flags = result?.results ? result.results.flatMap((entry: any) => entry.flags ?? []) : result?.flags ?? [];
    const critical = flags.filter((flag: any) => flag.party_type === 'necessary' || flag.risk_type === 'admission' || flag.severity === 'critical').length;
    return { moduleId: module.id, critical, warning: flags.length - critical, clean: result?.clean === true ? 1 : 0, analyzed: Boolean(result) };
  });
  const totalCritical = aggregate.reduce((s, m) => s + m.critical, 0);
  const totalWarning = aggregate.reduce((s, m) => s + m.warning, 0);
  const totalClean = aggregate.reduce((s, m) => s + m.clean, 0);
  const glow = useCardGlow();

  return (
    <div className="pt-14 px-6 pb-6 min-h-screen">
      {/* Case header */}
      <div className="mb-6 stagger-in" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="flex items-center gap-2 mb-1">
          <Scale size={16} style={{ color: 'var(--accent)' }} />
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            Case risk overview
          </span>
        </div>
        <h1 className="font-display text-3xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {activeCase.name}
        </h1>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
            {activeCase.number}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {activeCase.court}
          </span>
          <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <Clock size={14} />
            Next: {new Date(activeCase.nextHearing).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div
          className="inline-block mt-2 px-3 py-1 rounded-md text-xs font-medium"
          style={{ background: 'var(--bg-elevated)', color: 'var(--accent-bright)', border: '1px solid var(--border)' }}
        >
          {activeCase.status}
        </div>
      </div>

      {/* Top metric row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stagger-in" style={{ '--i': 1 } as React.CSSProperties}>
          <MetricTile
            label="Critical flags"
            value={totalCritical}
            icon={<AlertCircle size={20} />}
            color="var(--risk-critical)"
            bg="var(--risk-critical-bg)"
            glow={glow}
          />
        </div>
        <div className="stagger-in" style={{ '--i': 2 } as React.CSSProperties}>
          <MetricTile
            label="Caution flags"
            value={totalWarning}
            icon={<AlertTriangle size={20} />}
            color="var(--risk-warning)"
            bg="var(--risk-warning-bg)"
            glow={glow}
          />
        </div>
        <div className="stagger-in" style={{ '--i': 3 } as React.CSSProperties}>
          <MetricTile
            label="Verified / clean"
            value={totalClean}
            icon={<CheckCircle2 size={20} />}
            color="var(--risk-clean)"
            bg="var(--risk-clean-bg)"
            glow={glow}
          />
        </div>
      </div>

      {/* Per-module breakdown */}
      <h2 className="font-display text-lg font-semibold mb-3 stagger-in" style={{ color: 'var(--text-primary)', '--i': 4 } as React.CSSProperties}>
        Risk by module
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {aggregate.map((agg, idx) => {
          const mod = MODULES.find((m) => m.id === agg.moduleId)!;
          const total = agg.critical + agg.warning + agg.clean;
          const criticalPct = (agg.critical / total) * 100;
          const warningPct = (agg.warning / total) * 100;
          const cleanPct = (agg.clean / total) * 100;

          return (
            <div
              key={agg.moduleId}
              className="stagger-in"
              style={{ '--i': 5 + idx } as React.CSSProperties}
            >
              <button
                onClick={() => onNavigate(agg.moduleId as NavId)}
                onMouseMove={glow}
                className="card-glow w-full text-left rounded-xl border p-4 transition-all duration-300 group"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-surface)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {mod.name}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {agg.analyzed ? `${total} finding${total === 1 ? '' : 's'}` : 'Not yet analyzed'}
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1"
                    style={{ color: 'var(--accent-bright)' }}
                  />
                </div>

                {/* Stacked bar */}
                <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-base)' }}>
                  {agg.critical > 0 && (
                    <div
                      className="transition-all duration-700 ease-out"
                      style={{ width: `${criticalPct}%`, background: 'var(--risk-critical)', animation: 'bar-grow 0.8s ease-out' }}
                    />
                  )}
                  {agg.warning > 0 && (
                    <div
                      className="transition-all duration-700 ease-out"
                      style={{ width: `${warningPct}%`, background: 'var(--risk-warning)', animation: 'bar-grow 0.8s ease-out 0.1s' }}
                    />
                  )}
                  {agg.clean > 0 && (
                    <div
                      className="transition-all duration-700 ease-out"
                      style={{ width: `${cleanPct}%`, background: 'var(--risk-clean)', animation: 'bar-grow 0.8s ease-out 0.2s' }}
                    />
                  )}
                </div>

                {/* Counts */}
                <div className="flex items-center gap-3 mt-3 text-xs font-mono">
                  {agg.critical > 0 && (
                    <span style={{ color: 'var(--risk-critical)' }}>{agg.critical} critical</span>
                  )}
                  {agg.warning > 0 && (
                    <span style={{ color: 'var(--risk-warning)' }}>{agg.warning} caution</span>
                  )}
                  {agg.clean > 0 && (
                    <span style={{ color: 'var(--risk-clean)' }}>{agg.clean} clean</span>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
  color,
  bg,
  glow,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  glow: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onMouseMove={glow}
      className="card-glow rounded-xl border p-5 flex items-center gap-4 transition-transform duration-300"
      style={{ borderColor: 'var(--border)', background: bg }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div
        className="w-12 h-12 rounded-lg flex items-center justify-center"
        style={{ background: color + '20', color }}
      >
        {icon}
      </div>
      <div>
        <div className="font-display text-3xl font-bold" style={{ color, animation: 'count-up 0.6s ease-out' }}>
          {value}
        </div>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      </div>
    </div>
  );
}
