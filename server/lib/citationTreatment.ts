import * as cheerio from "cheerio";
import { callGroqForJsonContent, GroqError } from "./groqClient";
import { logger } from "./logger";

const USER_AGENT =
  "Mozilla/5.0 (compatible; LitigationForensics/1.0; +https://example.com)";
const BASE = "https://indiankanoon.org";
const INDIAN_KANOON_TIMEOUT_MS = 15_000;

/** Never analyse more than this many citing judgments per citation, per spec. */
export const MAX_CITING_CASES = 20;

/** How many citing judgments to fetch and classify concurrently. Kept at 1
 * (fully sequential) because Groq's free tier is roughly 8,000 tokens/minute
 * and up to 20 classification calls per citation would otherwise collide
 * into 429s. */
const CLASSIFICATION_CONCURRENCY = 1;

/** A pause between sequential Groq calls in this module, on top of the
 * shared client's own timeout, to stay under the free-tier rate limit
 * (roughly 8,000 tokens/minute, and each classification call runs to
 * ~2,000-2,500 tokens) across a batch of up to 20 calls. */
const INTER_CALL_DELAY_MS = 16_000;

const RETRY_DELAYS_MS = [15_000, 30_000, 45_000, 60_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  return err instanceof GroqError && /status 429/.test(err.message);
}

/**
 * Calls the Groq classification with retries on 429 (rate limit) only.
 * Any other failure (including a genuine timeout or malformed payload)
 * surfaces immediately -- retrying those would risk masking a real defect.
 */
async function classifyWithRetry(
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callGroqForJsonContent(systemPrompt, userContent);
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === RETRY_DELAYS_MS.length) {
        throw err;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

export type Treatment = "red" | "yellow" | "green" | "neutral";

export interface CitingCaseResult {
  citing_case: string;
  citing_case_url: string;
  treatment: Treatment | null;
  supporting_passage: string | null;
  explanation: string | null;
  jurisdictional_note: string;
  failed: boolean;
  error: string | null;
}

export interface CitationTreatmentResult {
  original_citation: string;
  resolved_case_title: string;
  total_citing_cases_found: number;
  analyzed_count: number;
  note: string | null;
  results: CitingCaseResult[];
}

export class CitationLookupError extends Error {}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  try {
    const responsePromise = fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        throw new CitationLookupError(
          `Indian Kanoon returned status ${response.status} for ${url}.`,
        );
      }
      return response.text();
    });

    const timeoutPromise = new Promise<string>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new CitationLookupError(
            `Indian Kanoon did not respond within ${Math.round(
              INDIAN_KANOON_TIMEOUT_MS / 1000,
            )} seconds.`,
          ),
        );
      }, INDIAN_KANOON_TIMEOUT_MS);
    });

    return await Promise.race([responsePromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof CitationLookupError) throw err;
    throw new CitationLookupError(
      `Failed to reach Indian Kanoon: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

interface ResolvedCitation {
  docId: string;
  title: string;
}

/**
 * Resolves a free-text citation to an Indian Kanoon document id by using the
 * public search page (the paid API returned 401 on the free tier during
 * investigation, so this is a direct HTML fetch + parse of the public page,
 * not the paid API).
 */
export async function resolveCitation(
  citation: string,
): Promise<ResolvedCitation> {
  const url = `${BASE}/search/?formInput=${encodeURIComponent(citation)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const firstResult = $("article.result h4.result_title a").first();
  if (firstResult.length === 0) {
    throw new CitationLookupError(
      `No case could be found on Indian Kanoon matching "${citation}". Check the citation and try again.`,
    );
  }

  const href = firstResult.attr("href") ?? "";
  const match = href.match(/\/doc(?:fragment)?\/(\d+)\//);
  if (!match) {
    throw new CitationLookupError(
      `Indian Kanoon returned a result for "${citation}" that could not be resolved to a document.`,
    );
  }

  return { docId: match[1], title: firstResult.text().trim() };
}

interface DocInfo {
  title: string;
  totalCitedBy: number;
  courtName: string | null;
  courtLevel: "supreme_court" | "high_court" | "other" | null;
}

interface CourtIdentity {
  name: string | null;
  level: DocInfo["courtLevel"];
}

function identifyCourt($: cheerio.CheerioAPI): CourtIdentity {
  const metadata = $(
    ".docsource_main, .docsource, .doc_bench, .docmetadata, .judgment-head",
  )
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const text =
    metadata || $("body").text().replace(/\s+/g, " ").trim().slice(0, 2500);
  const supreme = text.match(/Supreme Court(?: of India)?/i);
  if (supreme) {
    return { name: "Supreme Court of India", level: "supreme_court" };
  }
  const highCourt = text.match(
    /([A-Z][A-Za-z.'()& -]{2,80}High Court(?: of [A-Z][A-Za-z.'()& -]+)?)/i,
  );
  if (highCourt) {
    return {
      name: highCourt[1].replace(/\s+/g, " ").trim(),
      level: "high_court",
    };
  }
  return { name: null, level: null };
}

function buildJurisdictionalNote(
  original: CourtIdentity,
  citing: CourtIdentity,
): string {
  if (!citing.name || !original.name || !citing.level || !original.level) {
    return `Court hierarchy could not be confirmed from Indian Kanoon metadata (original: ${
      original.name ?? "unidentified"
    }; citing: ${citing.name ?? "unidentified"}). Treat this treatment signal as requiring independent jurisdictional verification.`;
  }
  if (
    citing.level === "supreme_court" &&
    original.level !== "supreme_court"
  ) {
    return `Citing court: ${citing.name}. This is a higher court than the original ${original.name}; its treatment may be binding subject to the judgment's actual ratio.`;
  }
  if (
    original.level === "supreme_court" &&
    citing.level !== "supreme_court"
  ) {
    return `Citing court: ${citing.name}. This is below the original ${original.name}; the treatment is not binding on the Supreme Court precedent.`;
  }
  if (citing.name.toLowerCase() === original.name.toLowerCase()) {
    return `Citing court: ${citing.name}. This is the same court as the original judgment; verify the applicable bench and precedent rules before relying on the signal.`;
  }
  if (citing.level === "high_court" && original.level === "high_court") {
    return `Citing court: ${citing.name}; original court: ${original.name}. This is a different High Court, so the treatment is ordinarily persuasive rather than binding.`;
  }
  return `Citing court: ${citing.name}; original court: ${original.name}. Verify the applicable hierarchy and binding effect before relying on the treatment signal.`;
}

async function getDocInfo(docId: string): Promise<DocInfo> {
  const html = await fetchHtml(`${BASE}/doc/${docId}/`);
  const $ = cheerio.load(html);

  const title = $("h2.doc_title").first().text().trim();
  const court = identifyCourt($);

  let totalCitedBy = 0;
  const citetopText = $(".citetop").first().text();
  const citedByMatch = citetopText.match(/Cited by\s+(\d+)/i);
  if (citedByMatch) {
    totalCitedBy = parseInt(citedByMatch[1], 10);
  }

  return {
    title: title || `Document ${docId}`,
    totalCitedBy,
    courtName: court.name,
    courtLevel: court.level,
  };
}

interface CitingCaseRef {
  docId: string;
  title: string;
}

/**
 * Fetches the "Cited By" list for a document, sorted most-recent-first, and
 * caps it at MAX_CITING_CASES. Indian Kanoon returns 10 results per page.
 */
async function getCitedByList(docId: string): Promise<CitingCaseRef[]> {
  const refs: CitingCaseRef[] = [];
  const pagesNeeded = Math.ceil(MAX_CITING_CASES / 10);

  for (let page = 0; page < pagesNeeded; page++) {
    const url = `${BASE}/search/?formInput=${encodeURIComponent(
      `citedby:${docId}`,
    )}&sortby=mostrecent&pagenum=${page}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const articles = $("article.result");

    if (articles.length === 0) break;

    articles.each((_, el) => {
      const link = $(el).find("h4.result_title a").first();
      const href = link.attr("href") ?? "";
      const match = href.match(/\/doc(?:fragment)?\/(\d+)\//);
      if (match) {
        refs.push({ docId: match[1], title: link.text().trim() });
      }
    });

    if (refs.length >= MAX_CITING_CASES) break;
  }

  return refs.slice(0, MAX_CITING_CASES);
}

/** Character window kept on each side of an in-text citation link when
 * extracting the passage to send to the model. */
const CONTEXT_WINDOW_CHARS = 900;
/** Hard cap on how much excerpt text is sent to Groq per citing case. */
const MAX_EXCERPT_CHARS = 6_000;

/**
 * Fetches a citing judgment and extracts the passage(s) around every place
 * it links back to the original case (Indian Kanoon auto-links citations to
 * their target document within the judgment text), so the excerpt sent to
 * the model is genuinely about the cited case rather than an arbitrary slice
 * of a possibly very long judgment.
 */
async function getSupportingExcerpt(
  citingDocId: string,
  originalDocId: string,
): Promise<{
  excerpt: string;
  usedFallback: boolean;
  court: CourtIdentity;
}> {
  const html = await fetchHtml(`${BASE}/doc/${citingDocId}/`);
  const $ = cheerio.load(html);
  const court = identifyCourt($);

  const body = $("div.judgments, div.doc_content, body").first();
  const fullText = body.length > 0 ? body.text() : $.text();

  const anchors = $(`a[href^="/doc/${originalDocId}/"]`);

  if (anchors.length === 0) {
    // The two documents are linked in Indian Kanoon's own citation graph, but
    // the in-text link could not be located (e.g. a different anchor form).
    // Fall back to an early slice of the judgment rather than failing outright,
    // and tell the caller this is a fallback so it can be reflected downstream.
    return {
      excerpt: fullText.trim().slice(0, MAX_EXCERPT_CHARS),
      usedFallback: true,
      court,
    };
  }

  const snippets: string[] = [];
  const seen = new Set<string>();

  anchors.each((_, el) => {
    if (snippets.join("\n").length >= MAX_EXCERPT_CHARS) return;
    const linkText = $(el).text();
    // Walk up to a reasonably sized containing block so the snippet reads as
    // prose, not a bare anchor.
    let container = $(el).closest("blockquote, p, div");
    if (container.length === 0) container = $(el).parent();
    const containerText = container.text().replace(/\s+/g, " ").trim();

    let snippet = containerText;
    if (snippet.length > CONTEXT_WINDOW_CHARS * 2) {
      const idx = snippet.indexOf(linkText);
      const start = Math.max(0, (idx === -1 ? 0 : idx) - CONTEXT_WINDOW_CHARS);
      snippet = snippet.slice(start, start + CONTEXT_WINDOW_CHARS * 2);
    }

    if (snippet.length > 20 && !seen.has(snippet)) {
      seen.add(snippet);
      snippets.push(snippet);
    }
  });

  const excerpt = snippets.join("\n---\n").slice(0, MAX_EXCERPT_CHARS);
  return {
    excerpt: excerpt.length > 0 ? excerpt : fullText.trim().slice(0, MAX_EXCERPT_CHARS),
    usedFallback: excerpt.length === 0,
    court,
  };
}

const TREATMENT_SYSTEM_PROMPT = `You are a legal research assistant classifying how one Indian judgment treats a case it cites.

You will be given:
- The name/citation of the ORIGINAL case being cited.
- An excerpt from a CITING judgment, taken from around the point(s) where it references the original case.

Classify the treatment of the original case in this excerpt as exactly one of:
- "red": the citing judgment overrules the original case, or sets it aside / declares it no longer good law.
- "yellow": the citing judgment distinguishes the original case (finds its facts or reasoning inapplicable here) or doubts/questions its correctness without overruling it.
- "green": the citing judgment follows, relies on, or affirms the original case as good law.
- "neutral": the original case is mentioned only in passing, as background, or in a list of authorities, with no clear treatment signal either way.

Courts rarely use the words "overruled", "distinguished", or "followed" explicitly. You must reason about what the passage is actually doing to the original case's authority, not search for keywords.

CRITICAL RULES:
- Only choose red, yellow, or green when the treatment is reasonably clear from the excerpt. If it is not clear, choose "neutral" -- do not guess or force a classification.
- You must always provide "supporting_passage": an exact quotation or very close paraphrase of specific text from the excerpt you were given that supports your classification. Never classify without a specific supporting excerpt. Never invent or quote text that is not in the excerpt provided.
- "explanation" must be a brief, plain-language reason (1-3 sentences) connecting the supporting passage to the classification.

Respond with a single JSON object of exactly this shape:
{
  "treatment": "red" | "yellow" | "green" | "neutral",
  "supporting_passage": "<quote or close paraphrase from the excerpt>",
  "explanation": "<brief reason>"
}`;

interface RawTreatmentPayload {
  treatment?: unknown;
  supporting_passage?: unknown;
  explanation?: unknown;
}

function parseTreatmentPayload(raw: string): {
  treatment: Treatment;
  supporting_passage: string;
  explanation: string;
} {
  let parsed: RawTreatmentPayload;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new GroqError(
      "The AI model's treatment classification was not valid JSON.",
      err instanceof Error ? err.message : String(err),
    );
  }

  const { treatment, supporting_passage, explanation } = parsed;
  const validTreatments: Treatment[] = ["red", "yellow", "green", "neutral"];

  if (
    typeof treatment !== "string" ||
    !validTreatments.includes(treatment as Treatment)
  ) {
    throw new GroqError(
      `The AI model returned an invalid treatment classification: ${String(treatment)}.`,
    );
  }
  if (
    typeof supporting_passage !== "string" ||
    supporting_passage.trim().length === 0
  ) {
    throw new GroqError(
      "The AI model classified a treatment without a supporting passage.",
    );
  }
  if (typeof explanation !== "string" || explanation.trim().length === 0) {
    throw new GroqError(
      "The AI model classified a treatment without an explanation.",
    );
  }

  return {
    treatment: treatment as Treatment,
    supporting_passage,
    explanation,
  };
}

/**
 * Runs an array of async tasks with bounded concurrency, preserving order.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function analyzeCitationTreatment(
  citation: string,
): Promise<CitationTreatmentResult> {
  const resolved = await resolveCitation(citation);
  const docInfo = await getDocInfo(resolved.docId);

  if (docInfo.totalCitedBy === 0) {
    return {
      original_citation: citation,
      resolved_case_title: docInfo.title,
      total_citing_cases_found: 0,
      analyzed_count: 0,
      note: "No citing cases were found for this case on Indian Kanoon.",
      results: [],
    };
  }

  const citingRefs = await getCitedByList(resolved.docId);
  const capped = docInfo.totalCitedBy > MAX_CITING_CASES;

  const results = await mapWithConcurrency(
    citingRefs,
    CLASSIFICATION_CONCURRENCY,
    async (citing, index): Promise<CitingCaseResult> => {
      if (index > 0) await sleep(INTER_CALL_DELAY_MS);
      const citingUrl = `${BASE}/doc/${citing.docId}/`;
      try {
        const { excerpt, court } = await getSupportingExcerpt(
          citing.docId,
          resolved.docId,
        );
        if (excerpt.trim().length === 0) {
          return {
            citing_case: citing.title,
            citing_case_url: citingUrl,
            treatment: "neutral",
            supporting_passage: null,
            explanation:
              "No text referencing the original case could be extracted from this judgment.",
            jurisdictional_note: `Citing court metadata was not available because no supporting text could be extracted. Original court: ${
              docInfo.courtName ?? "unidentified"
            }. Verify hierarchy independently.`,
            failed: false,
            error: null,
          };
        }

        const userContent = `ORIGINAL CASE: ${docInfo.title} (searched as "${citation}")\n\nCITING JUDGMENT: ${citing.title}\n\nEXCERPT FROM CITING JUDGMENT:\n${excerpt}`;
        const raw = await classifyWithRetry(TREATMENT_SYSTEM_PROMPT, userContent);
        const parsedPayload = parseTreatmentPayload(raw);

        return {
          citing_case: citing.title,
          citing_case_url: citingUrl,
          treatment: parsedPayload.treatment,
          supporting_passage: parsedPayload.supporting_passage,
          explanation: parsedPayload.explanation,
          jurisdictional_note: buildJurisdictionalNote(
            {
              name: docInfo.courtName,
              level: docInfo.courtLevel,
            },
            court,
          ),
          failed: false,
          error: null,
        };
      } catch (err) {
        const message =
          err instanceof GroqError || err instanceof CitationLookupError
            ? err.message
            : "Failed to analyze this citing judgment.";
        logger.warn(
          { citingDocId: citing.docId, err },
          "Citation treatment classification failed for one citing case",
        );
        return {
          citing_case: citing.title,
          citing_case_url: citingUrl,
          treatment: null,
          supporting_passage: null,
          explanation: null,
          jurisdictional_note: `Jurisdictional status could not be established because this citing judgment failed analysis. Original court: ${
            docInfo.courtName ?? "unidentified"
          }.`,
          failed: true,
          error: message,
        };
      }
    },
  );

  const notes: string[] = [];
  if (capped) {
    notes.push(
      `Analysis limited to the ${MAX_CITING_CASES} most recent of ${docInfo.totalCitedBy} citing cases.`,
    );
  }
  const failedCount = results.filter((r) => r.failed).length;
  if (failedCount > 0) {
    notes.push(
      `${failedCount} of ${results.length} citing judgments could not be analyzed and are marked with an error below.`,
    );
  }

  return {
    original_citation: citation,
    resolved_case_title: docInfo.title,
    total_citing_cases_found: docInfo.totalCitedBy,
    analyzed_count: results.length,
    note: notes.length > 0 ? notes.join(" ") : null,
    results,
  };
}
