import assert from "node:assert/strict";
import test from "node:test";
import {
  __setCitationTreatmentDependenciesForTest,
  analyzeCitationTreatment,
  getCitationSearchQuotaStatus,
} from "./citationTreatment.js";

process.env.GOOGLE_SEARCH_API_KEY = "test-key";
process.env.GOOGLE_SEARCH_ENGINE_ID = "test-engine";

function response(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}
const groundedJson = JSON.stringify({
  treatment: "green", confidence: "explicit",
  supporting_passage: "This Court follows the cited authority.",
  explanation: "The supplied material expressly follows it.",
});

test("uses real Google-result URLs, fetched text, confidence, and cache", async () => {
  let googleCalls = 0, groqCalls = 0;
  __setCitationTreatmentDependenciesForTest({
    fetch: (async (url: string | URL) => {
      if (String(url).startsWith("https://www.googleapis.com/")) {
        googleCalls++;
        return response({ items: [{ title: "Official citing decision", link: "https://main.sci.gov.in/judgment/42", snippet: "This Court follows the cited authority." }] });
      }
      return response("<html><body><main>This Court follows the cited authority. The remaining official judgment text makes this a sufficiently long fetched source for the pipeline test.</main></body></html>");
    }) as typeof fetch,
    groq: async () => { groqCalls++; return groundedJson; },
  });
  const first = await analyzeCitationTreatment("2024 INSC 122");
  assert.equal(first.cache_status, "miss");
  assert.equal(first.results[0].source_type, "full_page_fetched");
  assert.equal(first.results[0].source_url, "https://main.sci.gov.in/judgment/42");
  assert.equal(first.results[0].confidence, "explicit");
  const second = await analyzeCitationTreatment("2024 INSC 122");
  assert.equal(second.cache_status, "hit");
  assert.equal(googleCalls, 1); assert.equal(groqCalls, 1);
  assert.equal(getCitationSearchQuotaStatus().used, 1);
});

test("returns a valid few/no-results outcome", async () => {
  __setCitationTreatmentDependenciesForTest({
    fetch: (async () => response({ items: [] })) as typeof fetch,
    groq: async () => { throw new Error("must not reason without a result"); },
  });
  const result = await analyzeCitationTreatment("No Such Citation");
  assert.equal(result.results.length, 0);
  assert.match(result.note ?? "", /Few\/no citing cases/);
});

test("falls back to a search snippet when every page fetch fails", async () => {
  __setCitationTreatmentDependenciesForTest({
    fetch: (async (url: string | URL) => String(url).startsWith("https://www.googleapis.com/")
      ? response({ items: [{ title: "Citing case", link: "https://example.test/case", snippet: "The earlier decision is distinguished on facts." }] })
      : response("blocked", 403)) as typeof fetch,
    groq: async () => JSON.stringify({ treatment: "yellow", confidence: "explicit", supporting_passage: "distinguished on facts", explanation: "The snippet expressly distinguishes the authority." }),
  });
  const result = await analyzeCitationTreatment("2010 SCC 1");
  assert.equal(result.results[0].source_type, "search_snippet_only");
  assert.equal(result.results[0].source_url, "https://example.test/case");
  assert.equal(result.results[0].confidence, "explicit");
});

test("surfaces quota/search failures without a raw provider dump", async () => {
  __setCitationTreatmentDependenciesForTest({
    fetch: (async () => response({ error: { message: "provider internals" } }, 429)) as typeof fetch,
  });
  await assert.rejects(analyzeCitationTreatment("2024 INSC 999"), /Daily Google Custom Search quota reached/);
});
