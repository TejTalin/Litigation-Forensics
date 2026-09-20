/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider, useTheme } from './theme';
import Lightfall from './components/Lightfall';
import { CustomCursor } from './components/CustomCursor';
import { NavRail, type NavId } from './components/NavRail';
import { TopBar } from './components/TopBar';
import { PageTransition } from './components/PageTransition';
import { Dashboard } from './views/Dashboard';
import { ModuleView } from './views/ModuleView';
import { CourtQueueView } from './views/CourtQueueView';
import { GuidePage } from './views/GuidePage';
import { MODULES } from './data';
import type { CaseFile } from './types';
import { CASES } from './data';
import type { UploadedFile } from './components/UploadZone';

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const { theme } = useTheme();
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [activeCase, setActiveCase] = useState<CaseFile>(CASES[0] ?? { id: 'new', name: 'No case selected', number: 'Upload a document to begin', court: '—', nextHearing: new Date().toISOString(), status: 'Awaiting documents' });
  const [sharedFiles, setSharedFiles] = useState<UploadedFile[]>([]);
  const [moduleResults, setModuleResults] = useState<Record<string, any>>({});
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  const riskCounts: Record<string, number> = {};
  for (const module of MODULES) {
    const result = moduleResults[module.id];
    const flags = result?.results ? result.results.flatMap((entry: any) => entry.flags ?? []) : result?.flags ?? [];
    riskCounts[module.id] = flags.length;
  }

  const activeModule = MODULES.find((m) => m.id === activeNav);

  // Real per-theme background hex (matches --bg-base in index.css for each theme).
  // Passing the string "transparent" here previously resolved to black inside
  // the shader, which was invisible on the dark theme but showed as a visible
  // gray wash on the light theme -- this is the fix.
  const lightfallBg = theme === 'dark' ? '#2a0e18' : '#f4ecd8';
  const lightfallColors = theme === 'dark'
    ? ['#C29A4F', '#8B1A2F', '#A08040']
    : ['#8c6b32', '#a07f3f', '#6b4a3a'];

  return (
      <div className="min-h-screen relative isolate" style={{ background: 'transparent' }}>
        <Lightfall
          className="lightfall-viewport"
          colors={lightfallColors}
          backgroundColor={lightfallBg}
          speed={0.4}
          streakCount={2}
          glow={theme === 'dark' ? 0.6 : 0.35}
          density={0.4}
          backgroundGlow={theme === 'dark' ? 0.5 : 0.15}
          opacity={theme === 'dark' ? 0.5 : 0.3}
          paused={prefersReducedMotion}
        />
        <CustomCursor />
        <NavRail active={activeNav} onSelect={setActiveNav} caseRiskCounts={riskCounts} />
        <TopBar activeCase={activeCase} onCaseChange={setActiveCase} />

        <main className="relative pb-24" style={{ zIndex: 1 }}>
          <PageTransition viewKey={activeNav}>
            {activeNav === 'dashboard' && <Dashboard activeCase={activeCase} onNavigate={setActiveNav} moduleResults={moduleResults} />}
            {activeNav === 'guide' && <GuidePage onNavigate={setActiveNav} />}
            {activeNav === 'court-queue' && <CourtQueueView />}
            {activeModule && activeNav !== 'court-queue' && activeNav !== 'dashboard' && activeNav !== 'guide' && (
              <ModuleView key={activeModule.id} module={activeModule} sharedFiles={sharedFiles} onSharedFiles={setSharedFiles} moduleResults={moduleResults} onResult={(moduleId, result) => setModuleResults(current => ({...current, [moduleId]: result}))} />
            )}
          </PageTransition>
        </main>
        <Analytics />
      </div>
  );
}

export default App;
