import type { ModuleDef } from './types';
import type { CaseFile, SourceDoc, CourtQueueItem } from './types';

// Presentation metadata only. Analysis results are always fetched from /api.
export const MODULES: ModuleDef[] = [
  { id: 'trapdoor', name: 'Trapdoor Scanner', shortName: 'Trapdoor', description: 'Find admissions, waivers, privilege breaks, and limitation risks before they are weaponised.', icon: 'scan-search', hasUpload: true },
  { id: 'missing-party', name: 'Missing Party Radar', shortName: 'Missing Party', description: 'Review a pleading for necessary-party and procedural defects under the CPC.', icon: 'user-search', hasUpload: true },
  { id: 'prayer-pleading', name: 'Prayer-Pleading Alignment', shortName: 'Prayer Align', description: 'Cross-reference pleaded grounds and reliefs in the prayer clause.', icon: 'git-compare-arrows', hasUpload: true },
  { id: 'contradiction', name: 'Contradiction Trap', shortName: 'Contradiction', description: 'Detect material conflicts across the documents in a case file.', icon: 'swords', hasUpload: true },
  { id: 'concession', name: 'Concession Firewall', shortName: 'Concession', description: 'Model the downstream consequences of a proposed concession.', icon: 'shield-alert', hasUpload: true },
  { id: 'citation', name: 'Good Law Citation Checker', shortName: 'Citations', description: 'Check the latest treatment of an authority using primary source signals.', icon: 'book-marked', hasUpload: false },
  { id: 'court-queue', name: 'Court Queue Alert', shortName: 'Court Queue', description: 'Track cause-list watches through persistent, scheduled serverless polling.', icon: 'calendar-clock', hasUpload: false },
];

// Deliberately empty until a user creates/imports a case; no demo records are shipped.
export const CASES: CaseFile[] = [];
export const SOURCE_DOCS: SourceDoc[] = [];
export const COURT_QUEUE: CourtQueueItem[] = [];
export const DASHBOARD_AGGREGATE = MODULES.map((module) => ({ moduleId: module.id, critical: 0, warning: 0, clean: 0 }));
