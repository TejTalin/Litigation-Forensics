/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from './theme';
import { Lightfall } from './components/Lightfall';
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
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [activeCase, setActiveCase] = useState<CaseFile>(CASES[0] ?? { id: 'new', name: 'No case selected', number: 'Upload a document to begin', court: '—', nextHearing: new Date().toISOString(), status: 'Awaiting documents' });
  const [sharedFiles, setSharedFiles] = useState<UploadedFile[]>([]);
  const [moduleResults, setModuleResults] = useState<Record<string, any>>({});

  const riskCounts: Record<string, number> = {};
  for (const module of MODULES) {
    const result = moduleResults[module.id];
    const flags = result?.results ? result.results.flatMap((entry: any) => entry.flags ?? []) : result?.flags ?? [];
    riskCounts[module.id] = flags.length;
  }

  const activeModule = MODULES.find((m) => m.id === activeNav);

  return (
    <ThemeProvider>
      <div className="min-h-screen relative" style={{ background: 'var(--bg-base)' }}>
        <Lightfall />
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
    </ThemeProvider>
  );
}

export default App;
