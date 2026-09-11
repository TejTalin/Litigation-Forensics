export type RiskLevel = 'critical' | 'warning' | 'clean';

export type ModuleId =
  | 'trapdoor'
  | 'missing-party'
  | 'prayer-pleading'
  | 'contradiction'
  | 'concession'
  | 'citation'
  | 'court-queue';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  hasUpload: boolean;
}

export interface SourceDoc {
  id: string;
  name: string;
  type: string;
  pages: number;
  findings: number;
  dateFiled: string;
}

export interface EvidenceNode {
  id: string;
  label: string;
  detail: string;
  ref: string;
  severity: RiskLevel;
  docId: string;
  page: number;
  x: number;
  y: number;
  suggestion?: string;
}

export interface EvidenceLink {
  from: string;
  to: string;
  label: string;
}

export interface CaseFile {
  id: string;
  name: string;
  number: string;
  court: string;
  nextHearing: string;
  status: string;
}

export interface ModuleResult {
  moduleId: ModuleId;
  nodes: EvidenceNode[];
  links: EvidenceLink[];
  summary: string;
  stats: { critical: number; warning: number; clean: number };
}

export interface AnalysisResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface CourtQueueItem {
  id: string;
  caseName: string;
  caseNumber: string;
  court: string;
  itemNumber: string;
  status: 'listed' | 'likely-reached' | 'adjourned' | 'disposed';
  estimatedTime: string;
  lastUpdated: string;
}
