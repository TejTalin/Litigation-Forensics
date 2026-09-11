import { useState } from 'react';
import { MODULES } from '../data';
import type { EvidenceNode, ModuleDef } from '../types';
import { UploadZone, type UploadedFile } from '../components/UploadZone';
import { EvidenceBoard } from '../components/EvidenceBoard';

interface Props { module: ModuleDef; }
async function base64(file: File) { const data = new Uint8Array(await file.arrayBuffer()); let binary = ''; data.forEach(b => binary += String.fromCharCode(b)); return btoa(binary); }
function asNodes(moduleId: ModuleDef['id'], result: any): EvidenceNode[] {
  const groups = result.results || [result]; const flags = groups.flatMap((g: any) => g.flags || g.result?.flags || []);
  return flags.map((f: any, i: number) => ({ id: `${moduleId}-${i}`, label: f.risk_type || f.party_role || f.pleaded_ground || f.topic_a || f.concession || 'Review signal', detail: f.explanation || f.suggested_rewrite || f.prayer_gap || f.summary || JSON.stringify(f), ref: f.paragraph_reference || f.ground_paragraph_reference || f.legal_basis || 'AI analysis', severity: (f.severity === 'critical' || f.risk_type === 'admission' || f.party_type === 'necessary') ? 'critical' : 'warning', docId: 'analysis', page: 1, x: 15 + (i * 21) % 70, y: 20 + (i * 17) % 60, suggestion: f.suggested_rewrite || f.recommendation || undefined }));
}
export function ModuleView({ module }: Props) {
  const [phase, setPhase] = useState<'upload'|'results'>(module.hasUpload ? 'upload' : 'results'); const [result, setResult] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [citation, setCitation] = useState('');
  async function run(files: UploadedFile[]) { setBusy(true); setError(''); try { const documents = await Promise.all(files.map(async f => ({ name:f.name, mimeType:f.file.type, fileBase64:await base64(f.file) }))); const response = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({module:module.id, documents}) }); const payload = await response.json(); if (!response.ok || !payload.success) throw new Error(payload.error || 'The analysis could not be completed.'); setResult(payload.result); setPhase('results'); } catch (e) { setError(e instanceof Error ? e.message : 'The analysis could not be completed.'); } finally { setBusy(false); } }
  async function runCitation() { setBusy(true); setError(''); try { const response = await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module:'citation',citation})}); const payload=await response.json(); if(!response.ok||!payload.success) throw new Error(payload.error||'Citation check failed.'); setResult(payload.result); } catch(e){setError(e instanceof Error?e.message:'Citation check failed.');} finally {setBusy(false);} }
  const nodes = result ? asNodes(module.id, result) : [];
  return <div className="flex flex-col h-full pt-14 px-6 pb-6" style={{minHeight:'calc(100vh - 3.5rem)'}}><div className="mb-5 stagger-in" style={{'--i':0} as React.CSSProperties}><h1 className="font-display text-2xl font-semibold" style={{color:'var(--text-primary)'}}>{module.name}</h1><p className="text-sm mt-1 max-w-2xl" style={{color:'var(--text-tertiary)'}}>{module.description}</p></div>
    {error && <div className="mb-4 p-3 rounded-lg text-sm" style={{color:'var(--risk-critical)',background:'var(--risk-critical-bg)'}}>{error}</div>}
    {module.id === 'citation' && <div className="max-w-2xl rounded-xl border p-5" style={{borderColor:'var(--border)',background:'var(--bg-surface)'}}><label className="text-sm" style={{color:'var(--text-secondary)'}}>Citation to verify</label><div className="flex gap-2 mt-2"><input value={citation} onChange={e=>setCitation(e.target.value)} placeholder="e.g. (2024) 1 SCC 100" className="flex-1 rounded-lg px-3 py-2 bg-transparent border" style={{borderColor:'var(--border)',color:'var(--text-primary)'}}/><button disabled={busy} onClick={runCitation} className="px-4 rounded-lg" style={{background:'var(--accent)',color:'var(--bg-base)'}}>{busy?'Checking…':'Check'}</button></div></div>}
    {module.hasUpload && phase==='upload' && <div className="flex-1 flex items-center justify-center py-8"><UploadZone moduleLabel={module.shortName} onAnalyze={run} busy={busy}/></div>}
    {result && <><button onClick={()=>{setPhase('upload');setResult(null);}} className="text-xs w-fit px-3 py-1.5 rounded-md border mb-3" style={{borderColor:'var(--border)',color:'var(--text-secondary)'}}>← New analysis</button><EvidenceBoard nodes={nodes} links={[]} summary={nodes.length ? `${nodes.length} real analysis signal${nodes.length===1?'':'s'} returned.` : 'Analysis completed with no review signals.'} moduleId={module.id}/></>}
  </div>;
}
export { MODULES };
