import * as cheerio from "cheerio";
export interface CourtParserRule { pattern: string; flags: string; notInSessionPattern?: string }

const USER_AGENT =
  "Mozilla/5.0 (compatible; LitigationForensics/1.0; +https://example.com)";
const FETCH_TIMEOUT_MS = 15_000;

export class CourtBoardFetchError extends Error {}

/**
 * Fetches a court's display board and flattens it into normalized,
 * line-per-block text: script/style stripped, and a newline inserted at
 * every table row / list item / div / paragraph boundary so a repeating
 * "Court No / Sl No / Case No" row -- whether it's rendered as a real
 * <table> or a stack of <div>s -- lands on its own line. Both the one-time
 * Groq rule-proposal step and every runtime poll use this exact same
 * normalization, so a rule generated from a sample of the page keeps
 * matching later polls of the same page.
 */
export async function fetchNormalizedBoardText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new CourtBoardFetchError(
          `Display board did not respond within ${FETCH_TIMEOUT_MS / 1000}s.`,
        );
      }
      throw new CourtBoardFetchError(
        `Could not reach display board: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!response.ok) {
      throw new CourtBoardFetchError(
        `Display board returned HTTP ${response.status}.`,
      );
    }
    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }
  return normalizeHtmlToLines(html);
}

export function normalizeHtmlToLines(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  $("tr, div, li, p, br, td, th").each((_, el) => {
    $(el).before("\u0000");
  });
  const raw = $("body").text();
  const lines = raw
    .replace(/\u0000/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0);
  return lines.join("\n");
}

/** Very rough heuristic for "this page is a client-rendered app shell with
 * no server-rendered content" -- a tiny body, or a near-empty root/app div
 * next to script tags, means there is nothing here to parse without a
 * headless browser (explicitly out of scope for this build). */
export function looksLikeJsShell(html: string): boolean {
  const lines = normalizeHtmlToLines(html);
  return lines.length < 3 && /<script[^>]*src=/i.test(html);
}

export interface ParsedBoardResult {
  /** Lowest pending Sl./Item No. found for the requested court number, i.e.
   * the next case coming up in that court -- interpreted as the court's
   * "current running item" for threshold comparison. Null when nothing
   * matched (see `notInSession`). */
  runningItem: number | null;
  notInSession: boolean;
  /** False if the rule produced zero matches anywhere on the page (not just
   * for the requested court), which means the page structure likely
   * changed and the rule can no longer be trusted -- distinct from a
   * genuinely quiet court. */
  ruleStillMatchesPage: boolean;
  caseNo: string | null;
}

/**
 * Deterministic, no-LLM evaluation of a previously-generated parser rule
 * against freshly-fetched, normalized board text.
 */
export function runParserRule(
  text: string,
  rule: CourtParserRule,
  courtNumber: string,
): ParsedBoardResult {
  const normalizedTarget = courtNumber.trim().replace(/^0+(?=\d)/, "");
  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern, rule.flags.includes("g") ? rule.flags : `${rule.flags}g`);
  } catch {
    return { runningItem: null, notInSession: false, ruleStillMatchesPage: false, caseNo: null };
  }

  let anyMatch = false;
  let bestItem: number | null = null;
  let bestCaseNo: string | null = null;

  for (const match of text.matchAll(regex)) {
    anyMatch = true;
    const groups = match.groups ?? {};
    const matchedCourt = (groups["court"] ?? "").trim().replace(/^0+(?=\d)/, "");
    if (matchedCourt !== normalizedTarget) continue;
    const itemRaw = (groups["item"] ?? "").trim();
    const itemNum = parseInt(itemRaw, 10);
    if (!Number.isNaN(itemNum) && (bestItem === null || itemNum < bestItem)) {
      bestItem = itemNum;
      bestCaseNo = groups["caseNo"]?.trim() || null;
    }
  }

  if (bestItem !== null) {
    return { runningItem: bestItem, notInSession: false, ruleStillMatchesPage: true, caseNo: bestCaseNo };
  }

  if (rule.notInSessionPattern) {
    try {
      const notInSessionRegex = new RegExp(rule.notInSessionPattern, "gi");
      for (const line of text.split("\n")) {
        if (line.includes(courtNumber) && notInSessionRegex.test(line)) {
          return { runningItem: null, notInSession: true, ruleStillMatchesPage: anyMatch, caseNo: null };
        }
      }
    } catch {
      // Invalid not-in-session pattern -- ignore and fall through.
    }
  }

  // No rows for this court and no explicit "not in session" marker found.
  // If the rule matched *other* courts fine this poll, this court is simply
  // not currently listed -- treat that the same as "not in session" rather
  // than a failure. If the rule matched nothing at all, that's a real
  // parsing failure (page likely changed shape).
  return { runningItem: null, notInSession: anyMatch, ruleStillMatchesPage: anyMatch, caseNo: null };
}
