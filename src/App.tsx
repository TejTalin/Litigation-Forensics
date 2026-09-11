import { useState } from 'react';
import { ThemeProvider } from './theme';
import { AmbientBackground } from './components/AmbientBackground';
import { CustomCursor } from './components/CustomCursor';
import { NavRail, type NavId } from './components/NavRail';
import { TopBar } from './components/TopBar';
import { PageTransition } from './components/PageTransition';
import { Dashboard } from './views/Dashboard';
import { ModuleView } from './views/ModuleView';
import { CourtQueueView } from './views/CourtQueueView';
import { GuidePage } from './views/GuidePage';
import { MODULES, DASHBOARD_AGGREGATE } from './data';
import type { CaseFile } from './types';
import { CASES } from './data';

function App() {
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [activeCase, setActiveCase] = useState<CaseFile>(CASES[0] ?? { id: 'new', name: 'No case selected', number: 'Upload a document to begin', court: '—', nextHearing: new Date().toISOString(), status: 'Awaiting documents' });

  const riskCounts: Record<string, number> = {};
  for (const agg of DASHBOARD_AGGREGATE) {
    riskCounts[agg.moduleId] = agg.critical;
  }

  const activeModule = MODULES.find((m) => m.id === activeNav);

  return (
    <ThemeProvider>
      <div className="min-h-screen relative" style={{ background: 'var(--bg-base)' }}>
        <AmbientBackground />
        <CustomCursor />
        <NavRail active={activeNav} onSelect={setActiveNav} caseRiskCounts={riskCounts} />
        <TopBar activeCase={activeCase} onCaseChange={setActiveCase} />

        <main className="relative ml-16" style={{ zIndex: 1 }}>
          <PageTransition viewKey={activeNav}>
            {activeNav === 'dashboard' && <Dashboard activeCase={activeCase} onNavigate={setActiveNav} />}
            {activeNav === 'guide' && <GuidePage onNavigate={setActiveNav} />}
            {activeNav === 'court-queue' && <CourtQueueView />}
            {activeModule && activeNav !== 'court-queue' && activeNav !== 'dashboard' && activeNav !== 'guide' && (
              <ModuleView key={activeModule.id} module={activeModule} />
            )}
          </PageTransition>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
