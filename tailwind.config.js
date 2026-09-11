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
