import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeCorrespondence, type CorrespondenceDirection } from "../server/lib/groq.js";
import { analyzePleadingForMissingParties } from "../server/lib/partyRadar.js";
import { analyzePrayerAlignment } from "../server/lib/prayerAlignment.js";
import { analyzeContradictions, prepareCaseDocuments } from "../server/lib/contradictionTrap.js";
import { indexCaseBackdrop, checkConcession } from "../server/lib/concessionFirewall.js";
import { analyzeCitationTreatment } from "../server/lib/citationTreatment.js";
import { extractDocumentText, ExtractionError } from "../server/lib/extractText.js";

type InputDocument = { name?: string; text?: string; fileBase64?: string; mimeType?: string };
async function textOf(doc: InputDocument) {
  try {
    return (await extractDocumentText({ text: doc.text, fileBase64: doc.fileBase64, fileName: doc.name, mimeType: doc.mimeType })).text;
  } catch (err) {
    // TEMP DEBUG: surface the real underlying cause in the response so it shows
    // up in the browser network tab, instead of only in Vercel function logs.
    // Remove the `debug` field once the root cause is confirmed fixed.
    if (err instanceof ExtractionError) {
      const debugErr = new Error(err.message) as Error & { debug?: string };
      debugErr.debug = err.details;
      throw debugErr;
    }
    throw err;
  }
}
function fail(res: VercelResponse, status: number, message: string, debug?: string) {
  return res.status(status).json({ success: false, error: message, ...(debug ? { debug } : {}) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  try {
    const { module, documents = [], citation, concessionText, direction = "outgoing", missingPartyContext } = req.body as { module: string; documents?: InputDocument[]; citation?: string; concessionText?: string; direction?: CorrespondenceDirection; missingPartyContext?: string };
    if (module === "citation") {
      if (!citation?.trim()) return fail(res, 400, "Enter a citation to check.");
      const result = await analyzeCitationTreatment(citation.trim());
      return res.json({ success: true, result, disclaimer: "AI-inferred first-pass signal only. Independently verify treatment before relying on it." });
    }
    if (!Array.isArray(documents) || documents.length === 0) return fail(res, 400, "Upload at least one document.");
    const prepared = await Promise.all(documents.map(async (doc, index) => ({ label: doc.name || `Document ${index + 1}`, text: await textOf(doc) })));
    if (prepared.some((doc) => !doc.text.trim())) return fail(res, 422, "Text could not be extracted from one or more documents.");
    if (module === "trapdoor") {
      if (direction !== "incoming" && direction !== "outgoing") return fail(res, 400, "Invalid correspondence direction.");
      const results = await Promise.all(prepared.map(async (doc) => ({ ...doc, ...(await analyzeCorrespondence(doc.text, direction)) })));
      return res.json({ success: true, result: { results, clean: results.every((r) => r.clean), direction } });
    }
    if (module === "missing-party") return res.json({ success: true, result: await analyzePleadingForMissingParties(prepared[0].text) });
    if (module === "prayer-pleading") return res.json({ success: true, result: await analyzePrayerAlignment(prepared[0].text, typeof missingPartyContext === "string" ? missingPartyContext.slice(0, 4_000) : undefined) });
    if (module === "contradiction") return res.json({ success: true, result: await analyzeContradictions(prepareCaseDocuments(prepared)) });
    if (module === "concession") {
      const backdrop = await indexCaseBackdrop(prepareCaseDocuments(prepared));
      if (!concessionText?.trim()) return res.json({ success: true, result: { backdrop, flags: [], clean: true, note: "Case backdrop indexed. Enter a proposed concession to test it." } });
      return res.json({ success: true, result: await checkConcession(backdrop, concessionText) });
    }
    return fail(res, 400, "Unknown analysis module.");
  } catch (error) {
    const debug = error instanceof Error ? (error as Error & { debug?: string }).debug : undefined;
    return fail(res, 502, error instanceof Error ? error.message : "Analysis failed.", debug);
  }
}
