import { callGroqForJsonContent, GroqError, GROQ_REQUEST_TIMEOUT_MS } from "./groqClient.js";
import { isFlagConfidence, type FlagConfidence } from "./flagConfidence.js";

export interface ContradictionFlag {
  statement_a: string;
  source_a: string;
  statement_b: string;
  source_b: string;
  explanation: string;
  legal_basis: string;
  confidence: FlagConfidence;
  source_kind_a: "pleading" | "exhibit" | "other";
  source_kind_b: "pleading" | "exhibit" | "other";
}

export interface ContradictionResult {
  flags: ContradictionFlag[];
  clean: boolean;
}

export interface CaseDocument {
  label: string;
  text: string;
}

type SourceKind = "pleading" | "exhibit" | "other";

function isSourceKind(value: unknown): value is SourceKind {
  return value === "pleading" || value === "exhibit" || value === "other";
}

/**
 * Combined character budget for all documents sent to Groq in one
 * cross-referencing pass. Groq's free tier allows roughly 8,000 tokens per
 * minute; at ~4 characters per token this cap keeps a full multi-document
 * request comfortably inside a single-request share of that budget while
 * leaving room for the system prompt and the response. Any truncation that
 * results is always disclosed to the caller -- never silent.
 */
export const COMBINED_TEXT_CHAR_CAP = 20_000;

/** No single document may be shortened below this, so every document still contributes. */
const MIN_PER_DOCUMENT_CHARS = 1_500;

export interface PreparedDocument {
  label: string;
  text: string;
  truncated: boolean;
}

/**
 * Applies the shared length-cap/chunking rule before a multi-document Groq
 * call. Documents that fit are passed through untouched; when the combined
 * length exceeds the cap, each oversized document is trimmed to its fair
 * share of the budget and marked as truncated so the caller can disclose it.
 */
export function prepareCaseDocuments(
  documents: CaseDocument[],
): PreparedDocument[] {
  const combinedLength = documents.reduce(
    (sum, doc) => sum + doc.text.length,
    0,
  );

  if (combinedLength <= COMBINED_TEXT_CHAR_CAP || documents.length === 0) {
    return documents.map((doc) => ({ ...doc, truncated: false }));
  }

  const perDocumentBudget = Math.max(
    MIN_PER_DOCUMENT_CHARS,
    Math.floor(COMBINED_TEXT_CHAR_CAP / documents.length),
  );

  return documents.map((doc) => {
    if (doc.text.length <= perDocumentBudget) {
      return { ...doc, truncated: false };
    }
    return {
      label: doc.label,
      text: doc.text.slice(0, perDocumentBudget),
      truncated: true,
    };
  });
}

const SYSTEM_PROMPT = `You are a senior litigation analyst reviewing every document filed by ONE party in ONE case (for example a plaint, a written statement, affidavits, and rejoinders). Read all of the supplied documents as one connected factual record belonging to that same party across the case, and cross-reference them against each other.

Your task: identify genuine FACTUAL contradictions -- assertions in one document that cannot both be true alongside an assertion in another document.

Do NOT flag:
(a) a later document adding more specific detail (dates, amounts, names) that does not conflict with an earlier, more general statement;
(b) differences in legal argument, legal characterization, or the label attached to the same underlying facts (e.g. one document calling conduct a "breach" and another calling it a "willful breach" is NOT a contradiction);
(c) normal evolution of a case narrative -- producing evidence for, elaborating on, or explaining something asserted earlier is NOT a contradiction;
(d) differences in tone, emphasis, or rhetorical framing.

DO flag genuine factual conflicts, such as: one document stating a payment was made in cash while another states the same payment was made by cheque; one document stating a meeting occurred on a given date while another explicitly denies that any such meeting took place; a stated timeline of knowledge or events that shifts in a way that cannot be reconciled (e.g. claiming a defect was first discovered in March while another document shows the party already knew of it in January). An explicit denial of a specific event that another document positively says occurred is a direct contradiction, not merely a difference in emphasis.

PRECISION REQUIREMENT: precision matters far more than recall. A tool that over-flags is not trustworthy. Only flag a contradiction a senior litigator would immediately accept as a real, irreconcilable factual conflict. If in doubt, do not flag it. If the documents are consistent, say so plainly and return zero flags -- never invent a contradiction to appear useful.

Every contradiction must cite BOTH sides: quote or closely paraphrase each conflicting assertion, and identify each source using the document label supplied in the input plus the paragraph reference where it appears (e.g. "Plaint - 12 Jan 2025, para 8").

Treat labels containing terms such as plaint, petition, written statement, reply, rejoinder, affidavit, or claim as pleadings. Treat labels containing exhibit, annexure, agreement, deed, invoice, receipt, photograph, report, or schedule as exhibits. Compare pleadings against exhibits explicitly when the exhibit supplies or contradicts the pleaded fact. Return the source kind for each side so counsel can see whether the conflict is pleading-versus-exhibit. If a label is ambiguous, use "other" rather than guessing.

If only one document is supplied, there is nothing to cross-reference: return zero flags and "clean": true.

Respond with ONLY a JSON object in exactly this shape, no prose outside the JSON:
{
  "flags": [
    {
      "statement_a": "the exact or closely-quoted assertion from the first document",
      "source_a": "document label + paragraph reference, e.g. 'Plaint - 12 Jan 2025, para 8'",
      "statement_b": "the exact or closely-quoted contradicting assertion from the second document",
      "source_b": "document label + paragraph reference, e.g. 'Affidavit dated 20 Jun 2025, para 4'",
      "explanation": "concrete reason these two statements cannot both be true",
      "legal_basis": "the applicable doctrine if one applies (e.g. estoppel by conduct), otherwise 'internal factual inconsistency' -- never a specific case citation unless certain it is real, correctly described, and Indian law directly on point",
      "confidence": "explicit | inferred",
      "source_kind_a": "pleading | exhibit | other",
      "source_kind_b": "pleading | exhibit | other"
    }
  ],
  "clean": true or false
}

If there are no genuine factual contradictions, return "flags": [] and "clean": true.`;

function parseContradictionPayload(raw: string): ContradictionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new GroqError(
      "The AI model returned a response that was not valid JSON.",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new GroqError("The AI model returned an unexpected response shape.");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj["clean"] !== "boolean") {
    throw new GroqError(
      "The AI model response was missing a valid 'clean' field.",
    );
  }

  if (!Array.isArray(obj["flags"])) {
    throw new GroqError(
      "The AI model response was missing a valid 'flags' array.",
    );
  }

  const flags: ContradictionFlag[] = obj["flags"].map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(
        `The AI model returned a malformed flag at index ${index}.`,
      );
    }
    const flagObj = item as Record<string, unknown>;
    const {
      statement_a,
      source_a,
      statement_b,
      source_b,
      explanation,
      legal_basis,
      confidence,
      source_kind_a,
      source_kind_b,
    } = flagObj;

    if (
      typeof statement_a !== "string" ||
      typeof source_a !== "string" ||
      typeof statement_b !== "string" ||
      typeof source_b !== "string" ||
      typeof explanation !== "string" ||
      typeof legal_basis !== "string" ||
      !isFlagConfidence(confidence) ||
      !isSourceKind(source_kind_a) ||
      !isSourceKind(source_kind_b)
    ) {
      throw new GroqError(
        `The AI model returned a flag with missing or invalid fields at index ${index}.`,
      );
    }

    return {
      statement_a,
      source_a,
      statement_b,
      source_b,
      explanation,
      legal_basis,
      confidence,
      source_kind_a,
      source_kind_b,
    };
  });

  const clean = obj["clean"];

  // Never trust the boolean independently of the flags it is meant to
  // summarise: an inconsistent payload could otherwise hide contradictions
  // behind a clean verdict. Treat the disagreement as an analysis failure.
  if (clean !== (flags.length === 0)) {
    throw new GroqError(
      "The AI model returned an inconsistent result and the analysis could not be trusted.",
      `clean=${String(clean)} but ${flags.length} contradiction(s) were returned.`,
    );
  }

  return { flags, clean };
}

/**
 * Calls the Groq API ONCE with every document in the case set together, so
 * the model can genuinely cross-reference them against each other. Never
 * falls back to another provider and never masks a failure as a clean
 * result -- callers must surface GroqError as success:false.
 */
export async function analyzeContradictions(
  documents: PreparedDocument[],
): Promise<ContradictionResult> {
  const body = documents
    .map(
      (doc) =>
        `--- DOCUMENT: ${doc.label}${
          doc.truncated ? " (text shortened to fit length limits)" : ""
        } ---\n${doc.text}`,
    )
    .join("\n\n");

  const content = await callGroqForJsonContent(
    SYSTEM_PROMPT,
    `The following ${documents.length} document${
      documents.length === 1 ? "" : "s"
    } were all filed by the same party in the same case. Cross-reference them for genuine factual contradictions:\n\n${body}`,
    GROQ_REQUEST_TIMEOUT_MS,
    2,
  );

  return parseContradictionPayload(content);
}
