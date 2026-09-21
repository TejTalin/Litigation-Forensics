import { Search, Bell, Sun, Moon, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../theme';
import { CASES } from '../data';
import type { CaseFile } from '../types';

interface TopBarProps {
  activeCase: CaseFile;
  onCaseChange: (c: CaseFile) => void;
}

export function TopBar({ activeCase, onCaseChange }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const [caseMenuOpen, setCaseMenuOpen] = useState(false);

  return (
    <header
      className="fixed top-0 left-0 right-0 h-14 z-40 flex items-center px-6 gap-4"
      style={{
        background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 1px 0 color-mix(in srgb, var(--border) 70%, transparent), 0 8px 24px -8px rgba(42, 14, 24, 0.15)',
      }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-2 mr-2">
        <span className="font-display text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Advinet
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          forensic audit
        </span>
      </div>

      {/* Case selector */}
      <div className="relative">
        <button
          onClick={() => setCaseMenuOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-base)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {activeCase.name}
          </span>
          <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {activeCase.number}
          </span>
          <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        {caseMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCaseMenuOpen(false)} />
            <div
              className="absolute top-full mt-1 left-0 min-w-80 rounded-lg border py-2 z-50 max-h-96 overflow-y-auto scrollbar-thin"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              {CASES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onCaseChange(c);
                    setCaseMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-opacity-50 transition-colors"
                  style={{
                    background: c.id === activeCase.id ? 'var(--bg-surface-2)' : 'transparent',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = c.id === activeCase.id ? 'var(--bg-surface-2)' : 'transparent')}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {c.name}
                  </div>
                  <div className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {c.number} · {c.court}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
        />
        <input
          type="text"
          placeholder="Search findings, citations, documents…"
          className="pl-9 pr-4 py-1.5 rounded-md text-sm w-72 border outline-none transition-colors"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-bright)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        title="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Notifications */}
      <button
        className="w-9 h-9 flex items-center justify-center rounded-md transition-colors relative"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-bright)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        title="Notifications"
      >
        <Bell size={18} />
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
          style={{ background: 'var(--risk-critical)' }}
        />
      </button>

      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium cursor-pointer"
        style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
        title="Adv. R. Venkatesan"
      >
        RV
      </div>
    </header>
  );
}
