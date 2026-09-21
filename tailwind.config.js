/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bricolage Grotesque', 'serif'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      borderRadius: {
        lg: '0.875rem',
        xl: '1.25rem',
        '2xl': '1.75rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20, 6, 10, 0.04), 0 8px 24px -4px rgba(42, 14, 24, 0.12)',
        'soft-lg': '0 2px 4px rgba(20, 6, 10, 0.06), 0 16px 40px -8px rgba(42, 14, 24, 0.18)',
      },
      colors: {
        bg: { base: 'var(--bg-base)', surface: 'var(--bg-surface)', 'surface-2': 'var(--bg-surface-2)', elevated: 'var(--bg-elevated)' },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        ink: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', tertiary: 'var(--text-tertiary)' },
        brass: { DEFAULT: 'var(--accent)', bright: 'var(--accent-bright)' },
        oxblood: { DEFAULT: 'var(--oxblood)', dim: 'var(--oxblood-dim)' },
        ivory: 'var(--ivory)',
        risk: {
          critical: 'var(--risk-critical)',
          warning: 'var(--risk-warning)',
          clean: 'var(--risk-clean)',
        },
      },
    },
  },
  plugins: [],
};
