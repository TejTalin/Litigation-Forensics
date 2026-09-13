import * as cheerio from "cheerio";
import { callGroqForJsonContent, GroqError } from "./groqClient.js";
import { logger } from "./logger.js";

/** Google permits 100 Custom Search requests per API key per day on its free tier. */
export const GOOGLE_DAILY_QUOTA = 100;
export const MAX_SEARCH_RESULTS = 10;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_SOURCE_TEXT_CHARS = 8_000;

export type Treatment = "red" | "yellow" | "green" | "neutral";
export type Confidence = "explicit" | "inferred";
export type SourceType = "full_page_fetched" | "search_snippet_only";

export interface CitingCaseResult {
  citing_case: string;
  citing_case_url: string;
  source_url: string;
  source_type: SourceType;
  treatment: Treatment;
  confidence: Confidence;
  supporting_passage: string;
  explanation: string;
  jurisdictional_note: string;
  failed: false;
  error: null;
}
export interface CitationTreatmentResult {
  original_citation: string; resolved_case_title: string; total_citing_cases_found: number;
  analyzed_count: number; note: string | null; results: CitingCaseResult[];
  cache_status: "hit" | "miss"; daily_search_queries_used: number;
}
export class CitationLookupError extends Error {}
export class CitationSearchQuotaError extends CitationLookupError {}

interface GoogleItem { title?: string; link?: string; snippet?: string }
interface SearchSource { title: string; url: string; snippet: string; domain: string }
interface SourceMaterial extends SearchSource { sourceType: SourceType; text: string }
let quotaDay = "", quotaUsed = 0;
const cache = new Map<string, CitationTreatmentResult>();
type Deps = { fetch: typeof fetch; groq: typeof callGroqForJsonContent; now: () => Date };
const defaultDeps: Deps = { fetch, groq: callGroqForJsonContent, now: () => new Date() };
let deps = defaultDeps;

/** Test-only seam; production uses platform fetch and the shared Groq client. */
export function __setCitationTreatmentDependenciesForTest(overrides?: Partial<Deps>) {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps;
  cache.clear(); quotaDay = ""; quotaUsed = 0;
}
function today() { return deps.now().toISOString().slice(0, 10); }
function resetDailyCounter() { const day = today(); if (day !== quotaDay) { quotaDay = day; quotaUsed = 0; } }
export function getCitationSearchQuotaStatus() {
  resetDailyCounter();
  return { day: quotaDay, used: quotaUsed, limit: GOOGLE_DAILY_QUOTA, remaining: GOOGLE_DAILY_QUOTA - quotaUsed };
}
function requiredEnv(name: "GOOGLE_SEARCH_API_KEY" | "GOOGLE_SEARCH_ENGINE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new CitationLookupError(`${name} is not configured. Good Law Citation Checker requires Google Custom Search and will not run without it.`);
  return value;
}
function ensureSearchQuota() {
  resetDailyCounter();
  if (quotaUsed >= GOOGLE_DAILY_QUOTA) throw new CitationSearchQuotaError("Daily Google Custom Search quota reached; try again tomorrow.");
  quotaUsed++;
}

async function googleSearch(citation: string): Promise<SearchSource[]> {
  const key = requiredEnv("GOOGLE_SEARCH_API_KEY"), cx = requiredEnv("GOOGLE_SEARCH_ENGINE_ID");
  ensureSearchQuota();
  const query = `"${citation}" ("cited by" OR overruled OR distinguished OR followed)`;
  let response: Response;
  try { response = await deps.fetch(`https://www.googleapis.com/customsearch/v1?${new URLSearchParams({ key, cx, q: query, num: String(MAX_SEARCH_RESULTS) })}`); }
  catch { throw new CitationLookupError("Google Custom Search is unavailable. Please try again shortly."); }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new CitationSearchQuotaError("Daily Google Custom Search quota reached; try again tomorrow.");
    throw new CitationLookupError("Google Custom Search is unavailable. Please try again shortly.");
  }
  const payload = await response.json() as { items?: GoogleItem[] };
  return (payload.items ?? []).flatMap((item) => {
    if (!item.link || !/^https?:\/\//i.test(item.link)) return [];
    let domain = ""; try { domain = new URL(item.link).hostname; } catch { return []; }
    return [{ title: item.title?.trim() || item.link, url: item.link, snippet: item.snippet?.trim() || "", domain }];
  });
}
function sourceRank(source: SearchSource) {
  const d = source.domain.toLowerCase();
  if (d.endsWith("indiankanoon.org")) return 0;
  if (d === "main.sci.gov.in" || d.endsWith(".gov.in")) return 1;
  if (/sci\.gov\.in|supremecourt\.gov\.in|highcourt/i.test(d)) return 2;
  return 3;
}
async function fetchSource(source: SearchSource): Promise<SourceMaterial> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await deps.fetch(source.url, { signal: controller.signal, headers: { "User-Agent": "LitigationForensics/2.0 legal research" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const $ = cheerio.load(await response.text());
    $("script, style, nav, footer, noscript").remove();
    const text = $("article, main, .judgments, .doc_content, body").first().text().replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_TEXT_CHARS);
    if (text.length < 80) throw new Error("page contained no usable judgment text");
    return { ...source, sourceType: "full_page_fetched", text };
  } catch (error) {
    logger.warn({ url: source.url, error }, "Citation source fetch failed; using search snippet");
    return { ...source, sourceType: "search_snippet_only", text: source.snippet || "Search result returned no snippet." };
  } finally { clearTimeout(timer); }
}

const SYSTEM_PROMPT = `You classify how an Indian judgment or search result treats an original cited authority. Return JSON only.
Never invent a case, citation, URL, quotation, or fact not supplied. Classify treatment as red (overrules/sets aside), yellow (distinguishes/doubts), green (follows/relies on), or neutral (no clear treatment). Use neutral where uncertain.
Set confidence to explicit only where supplied text directly and unambiguously states the treatment; otherwise inferred. supporting_passage must be a short exact quotation or close paraphrase traceable to supplied material. Give a concise explanation.
Return exactly: {"treatment":"red|yellow|green|neutral","confidence":"explicit|inferred","supporting_passage":"...","explanation":"..."}`;
function parseClassification(raw: string): Pick<CitingCaseResult, "treatment" | "confidence" | "supporting_passage" | "explanation"> {
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw) as Record<string, unknown>; } catch { throw new GroqError("The AI model's treatment classification was not valid JSON."); }
  if (!(["red", "yellow", "green", "neutral"] as string[]).includes(value.treatment as string) || !(["explicit", "inferred"] as string[]).includes(value.confidence as string) || typeof value.supporting_passage !== "string" || !value.supporting_passage.trim() || typeof value.explanation !== "string" || !value.explanation.trim()) throw new GroqError("The AI model returned an incomplete or invalid grounded classification.");
  return value as Pick<CitingCaseResult, "treatment" | "confidence" | "supporting_passage" | "explanation">;
}
function courtNote(source: SourceMaterial) {
  if (/main\.sci\.gov\.in|supremecourt/i.test(source.domain)) return "Source appears to be a Supreme Court of India publication; independently verify the judgment and its binding effect.";
  if (/\.gov\.in$/i.test(source.domain)) return "Source appears to be an official Indian court/government publication; independently verify the court hierarchy and judgment text.";
  return "Court hierarchy could not be confirmed from this source. Independently verify the judgment and its precedential effect.";
}
async function classify(citation: string, source: SourceMaterial): Promise<CitingCaseResult> {
  const raw = await deps.groq(SYSTEM_PROMPT, `ORIGINAL CITATION: ${citation}\n\nSEARCH RESULT TITLE: ${source.title}\nSOURCE URL: ${source.url}\nSOURCE TYPE: ${source.sourceType}\n\nSOURCE MATERIAL:\n${source.text}`);
  const parsed = parseClassification(raw);
  return { citing_case: source.title, citing_case_url: source.url, source_url: source.url, source_type: source.sourceType, ...parsed, jurisdictional_note: courtNote(source), failed: false, error: null };
}
export async function analyzeCitationTreatment(citation: string): Promise<CitationTreatmentResult> {
  const normalized = citation.trim().replace(/\s+/g, " ");
  if (!normalized) throw new CitationLookupError("Enter a citation to check.");
  const cached = cache.get(normalized.toLowerCase());
  if (cached) return { ...cached, results: [...cached.results], cache_status: "hit", daily_search_queries_used: getCitationSearchQuotaStatus().used };
  const sources = (await googleSearch(normalized)).sort((a, b) => sourceRank(a) - sourceRank(b));
  if (!sources.length) {
    const empty: CitationTreatmentResult = { original_citation: normalized, resolved_case_title: normalized, total_citing_cases_found: 0, analyzed_count: 0, note: "Few/no citing cases found in the configured authoritative Google search sources.", results: [], cache_status: "miss", daily_search_queries_used: getCitationSearchQuotaStatus().used };
    cache.set(normalized.toLowerCase(), empty); return empty;
  }
  const materials = await Promise.all(sources.map(fetchSource));
  const results: CitingCaseResult[] = [];
  for (const source of materials) {
    try { results.push(await classify(normalized, source)); }
    catch (error) { logger.warn({ url: source.url, error }, "Grounded citation classification skipped after Groq failure"); }
  }
  const result: CitationTreatmentResult = {
    original_citation: normalized, resolved_case_title: normalized, total_citing_cases_found: sources.length, analyzed_count: results.length,
    note: results.length ? (materials.some((item) => item.sourceType === "search_snippet_only") ? "One or more source pages could not be fetched; those findings are grounded in Google search snippets and marked accordingly." : null) : "Search results were found, but none could be classified. Please try again shortly.",
    results, cache_status: "miss", daily_search_queries_used: getCitationSearchQuotaStatus().used,
  };
  if (results.length) cache.set(normalized.toLowerCase(), result);
  return result;
}
