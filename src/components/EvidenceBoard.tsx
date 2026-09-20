import { useState, useRef } from 'react';
import type { EvidenceNode, EvidenceLink } from '../types';
import { SOURCE_DOCS } from '../data';
import { AlertTriangle, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useCardGlow } from '../hooks/useCardGlow';
import { BorderBeam } from './ui/border-beam';

interface EvidenceBoardProps {
  nodes: EvidenceNode[];
  links: EvidenceLink[];
  summary: string;
  moduleId: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--risk-critical)',
  warning: 'var(--risk-warning)',
  clean: 'var(--risk-clean)',
};

const SEVERITY_BG: Record<string, string> = {
  critical: 'var(--risk-critical-bg)',
  warning: 'var(--risk-warning-bg)',
  clean: 'var(--risk-clean-bg)',
};

export function EvidenceBoard({ nodes, links, summary }: EvidenceBoardProps) {
  const [selected, setSelected] = useState<EvidenceNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const glow = useCardGlow();
  const boardRef = useRef<HTMLDivElement>(null);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const W = 100;
  const H = 100;

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      {/* Board area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Summary bar */}
        <div
          className="rounded-lg border px-4 py-3 mb-3 flex items-center justify-between stagger-in"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', '--i': 0 } as React.CSSProperties}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {summary}
          </p>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--risk-critical)' }}>
              <AlertCircle size={14} />
              {nodes.filter((n) => n.severity === 'critical').length} critical
            </span>
            <span className="flex items-center gap-1.5" style={{ color: 'var(--risk-warning)' }}>
              <AlertTriangle size={14} />
              {nodes.filter((n) => n.severity === 'warning').length} caution
            </span>
            {nodes.some((n) => n.severity === 'clean') && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--risk-clean)' }}>
                <CheckCircle2 size={14} />
                {nodes.filter((n) => n.severity === 'clean').length} clean
              </span>
            )}
          </div>
        </div>

        {/* The board itself */}
        <div
          ref={boardRef}
          className="relative flex-1 rounded-xl border overflow-hidden stagger-in"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-surface)',
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)`,
            backgroundSize: '24px 24px',
            minHeight: 480,
            '--i': 1,
          } as React.CSSProperties}
        >
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {/* Draw links */}
            {links.map((link, i) => {
              const from = nodeMap.get(link.from);
              const to = nodeMap.get(link.to);
              if (!from || !to) return null;
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2 - 5;
              const isHighlighted = hovered === link.from || hovered === link.to;
              return (
                <g key={i}>
                  <path
                    d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
                    className={isHighlighted ? 'evidence-line-flow' : 'evidence-line'}
                    style={{
                      animation: isHighlighted
                        ? 'dash-flow 1s linear infinite'
                        : 'line-draw 1.2s ease-out forwards',
                      opacity: isHighlighted ? 0.9 : 0.5,
                      strokeWidth: isHighlighted ? 1.5 : 1,
                      transition: 'opacity 0.3s ease, stroke-width 0.3s ease',
                    }}
                  />
                  {/* Link label */}
                  <text
                    x={mx}
                    y={my - 1}
                    fontSize="1.4"
                    fill="var(--text-tertiary)"
                    textAnchor="middle"
                    style={{ opacity: isHighlighted ? 1 : 0.4, transition: 'opacity 0.3s ease', fontFamily: 'Geist Mono, monospace' }}
                  >
                    {link.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Draw nodes */}
          {nodes.map((node, i) => (
            <button
              key={node.id}
              onClick={() => setSelected(node)}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              className="absolute group"
              data-cursor
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)',
                animation: `fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                animationDelay: `${200 + i * 80}ms`,
                opacity: 0,
              }}
            >
              {/* Expanding pulse rings for critical */}
              {node.severity === 'critical' && (
                <>
                  <span
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: SEVERITY_COLOR[node.severity],
                      opacity: 0.2,
                      animation: 'pulse-ring 2.5s ease-out infinite',
                    }}
                  />
                  <span
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: SEVERITY_COLOR[node.severity],
                      opacity: 0.15,
                      animation: 'pulse-ring 2.5s ease-out infinite 1.2s',
                    }}
                  />
                </>
              )}
              <div
                className="relative rounded-lg px-3 py-2 text-left max-w-48 transition-all duration-300 group-hover:scale-110 group-hover:z-20"
                style={{
                  background: SEVERITY_BG[node.severity],
                  border: `1px solid ${SEVERITY_COLOR[node.severity]}`,
                  boxShadow: hovered === node.id
                    ? `0 0 20px ${SEVERITY_COLOR[node.severity]}40, 0 4px 12px rgba(0,0,0,0.2)`
                    : '0 2px 8px rgba(0,0,0,0.15)',
                }}
              >
                {node.severity === 'critical' && (
                  <BorderBeam size={50} duration={5} colorFrom="var(--accent-bright)" colorTo="var(--risk-critical)" />
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 transition-all duration-300 group-hover:scale-150"
                    style={{ background: SEVERITY_COLOR[node.severity] }}
                  />
                  <span
                    className="text-xs font-medium leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {node.label}
                  </span>
                </div>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {node.ref.split(';')[0]}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Source ledger */}
      <div className="w-64 shrink-0 stagger-in" style={{ '--i': 2 } as React.CSSProperties}>
        <SourceLedger glow={glow} />
      </div>

      {/* Detail drawer */}
      {selected && <NodeDrawer node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SourceLedger({ glow }: { glow: (e: React.MouseEvent<HTMLElement>) => void }) {
  return (
    <div
      className="rounded-xl border p-4 overflow-y-auto scrollbar-thin h-full"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <h3 className="font-display text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        Source Ledger
      </h3>
      <div className="space-y-2">
        {SOURCE_DOCS.map((doc, i) => (
          <div
            key={doc.id}
            onMouseMove={glow}
            className="card-glow rounded-lg border p-3 transition-all duration-300 cursor-pointer"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-base)',
              animation: `fade-in-up 0.4s ease-out forwards`,
              animationDelay: `${300 + i * 60}ms`,
              opacity: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateX(3px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateX(0)'; }}
          >
            <div className="text-xs font-medium leading-tight mb-1" style={{ color: 'var(--text-primary)' }}>
              {doc.name}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {doc.type}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {doc.pages}p · {doc.findings} findings
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeDrawer({ node, onClose }: { node: EvidenceNode; onClose: () => void }) {
  const doc = SOURCE_DOCS.find((d) => d.id === node.docId);
  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-14 bottom-0 w-96 z-50 overflow-y-auto scrollbar-thin border-l"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--bg-elevated)',
          animation: 'slide-in-right 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: SEVERITY_COLOR[node.severity], animation: 'pulse-ambient 2s ease-in-out infinite' }}
              />
              <span
                className="text-xs uppercase tracking-wider font-medium"
                style={{ color: SEVERITY_COLOR[node.severity] }}
              >
                {node.severity}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'rotate(90deg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.transform = 'rotate(0deg)'; }}
            >
              <X size={16} />
            </button>
          </div>

          <h3 className="font-display text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {node.label}
          </h3>

          <div className="mb-5" style={{ animation: 'fade-in-up 0.4s ease-out 0.1s both' }}>
            <div className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Flagged text
            </div>
            <blockquote
              className="text-sm italic leading-relaxed p-3 rounded-lg border-l-2"
              style={{
                color: 'var(--text-primary)',
                background: 'var(--bg-surface)',
                borderLeftColor: SEVERITY_COLOR[node.severity],
              }}
            >
              {node.detail}
            </blockquote>
          </div>

          <div className="mb-5" style={{ animation: 'fade-in-up 0.4s ease-out 0.2s both' }}>
            <div className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Location
            </div>
            <div className="font-mono text-xs p-3 rounded-lg" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
              {node.ref}
              {doc && (
                <div className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {doc.name} · p.{node.page}
                </div>
              )}
            </div>
          </div>

          {node.suggestion && (
            <div className="mb-5" style={{ animation: 'fade-in-up 0.4s ease-out 0.3s both' }}>
              <div className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--accent-bright)' }}>
                Suggested remediation
              </div>
              <div
                className="text-sm leading-relaxed p-3 rounded-lg border"
                style={{
                  color: 'var(--text-primary)',
                  background: 'var(--bg-surface)',
                  borderColor: 'var(--accent)',
                }}
              >
                {node.suggestion}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
