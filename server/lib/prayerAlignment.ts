import { callGroqForJsonContent, GroqError } from "./groqClient.js";
import { isFlagConfidence, type FlagConfidence } from "./flagConfidence.js";

export type MismatchType = "no_corresponding_relief" | "missing_companion_prayer";

export interface PrayerFlag {
  pleaded_ground: string;
  ground_paragraph_reference: string;
  prayer_gap: string;
  explanation: string;
  legal_basis: string;
  mismatch_type: MismatchType;
  confidence: FlagConfidence;
}

export interface PrayerAlignmentResult {
  flags: PrayerFlag[];
  clean: boolean;
}

const SYSTEM_PROMPT = `You are a senior litigation review assistant specializing in Indian civil procedure. A lawyer has drafted a plaint/petition and wants to know whether every ground pleaded in the body of the document is actually matched by a corresponding relief in the prayer clause, before filing.

Perform two passes, both through careful legal reading -- never through keyword/pattern matching:

PASS 1 -- Extract every distinct pleaded ground/cause of action from the body of the document (the narrative of facts and legal contentions), each with its paragraph reference (e.g. "fraud, para 6"; "breach of contract, para 9"; "negligence, para 12"). A "ground" is a substantive factual/legal basis for relief -- not every sentence, just the distinct causes of action or wrongs alleged.

PASS 2 -- Extract every relief sought in the prayer clause (usually a lettered/numbered list near the end of the document, often starting with words like "it is prayed that" or "the plaintiff prays for").

CROSS-REFERENCE, in two distinct ways:
1. For each pleaded ground from Pass 1, check whether ANY plausible corresponding relief exists in Pass 2 -- read for substantive alignment, not exact phrase matching. Different wording that achieves the same substantive relief (e.g. ground "unlawful termination" matched by prayer "declaration that termination is void and consequential reinstatement") counts as aligned and must NOT be flagged. If a ground has no plausible matching relief at all, flag it with mismatch_type "no_corresponding_relief".
2. Separately, for grounds that have a well-established doctrinal companion relief, check whether that specific companion is present even if some other relief was granted for the same ground. Doctrinally well-established ground-to-expected-relief pairs include (non-exhaustive -- use sound legal judgment for other clearly well-established pairs, but do NOT invent novel or speculative doctrinal links):
   - Fraud/misrepresentation -> rescission and/or damages
   - Breach of contract -> damages and/or specific performance
   - Trespass/encroachment -> injunction and/or damages. Note specifically: if the encroachment/trespass is ongoing or the encroaching structure still exists, damages alone do not stop the intrusion or remove the encroachment -- a prayer for injunctive relief (to restrain further trespass and/or to remove the encroachment) is the well-established companion to damages in that situation and its absence should be flagged.
   - Wrongful termination of a statutory/contractual right -> declaration and/or consequential relief
   If the specific well-established companion relief is missing, flag it with mismatch_type "missing_companion_prayer".

PRECISION REQUIREMENT: only flag a missing companion prayer where the doctrinal connection is well-established and would be immediately recognized as correct by a senior litigator -- never a speculative or novel inference. If every pleaded ground has a plausible corresponding relief (even if worded differently) and no well-established companion relief is missing, the document is aligned -- say so clearly and do not fabricate a mismatch. Precision matters more than recall -- a tool that over-flags is not trustworthy.

STRUCTURAL GAP: if the document has no prayer clause at all, or the prayer clause is missing/unidentifiable, this is itself a serious flag -- do not silently treat this as "clean". Flag it clearly (mismatch_type "no_corresponding_relief" is appropriate, describing the missing prayer clause itself as the gap).

Every flag's reasoning must be concrete and case-specific. The "explanation" must name the specific pleaded ground, the specific gap in the prayer clause, and why it matters (e.g. "Fraud is pleaded at para 6 as the basis for setting aside the sale deed, but the prayer clause at para 14 seeks only a permanent injunction -- no prayer for rescission of the deed itself is present, which would be needed to actually undo the transaction."). The "legal_basis" must cite the actual doctrinal principle connecting the ground to its expected relief -- never a vague or invented citation.

Respond with ONLY a JSON object in exactly this shape, no prose outside the JSON:
{
  "flags": [
    {
      "pleaded_ground": "short description of the pleaded ground, e.g. 'Fraud in execution of sale deed'",
      "ground_paragraph_reference": "paragraph number/locator where the ground is pleaded",
      "prayer_gap": "short description of what's missing or misaligned in the prayer clause",
      "explanation": "concrete, case-specific reason this misalignment matters",
      "legal_basis": "the doctrinal principle connecting the ground to its expected relief",
      "mismatch_type": "no_corresponding_relief | missing_companion_prayer",
      "confidence": "explicit | inferred"
    }
  ],
  "clean": true or false
}

If every pleaded ground is properly matched by relief in the prayer clause, return "flags": [] and "clean": true.`;

function isValidMismatchType(value: unknown): value is MismatchType {
  return value === "no_corresponding_relief" || value === "missing_companion_prayer";
}

function parsePrayerAlignmentPayload(raw: string): PrayerAlignmentResult {
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

  const flags: PrayerFlag[] = obj["flags"].map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(
        `The AI model returned a malformed flag at index ${index}.`,
      );
    }
    const flagObj = item as Record<string, unknown>;
    const {
      pleaded_ground,
      ground_paragraph_reference,
      prayer_gap,
      explanation,
      legal_basis,
      mismatch_type,
      confidence,
    } = flagObj;

    if (
      typeof pleaded_ground !== "string" ||
      typeof ground_paragraph_reference !== "string" ||
      typeof prayer_gap !== "string" ||
      typeof explanation !== "string" ||
      typeof legal_basis !== "string" ||
      !isValidMismatchType(mismatch_type) ||
      !isFlagConfidence(confidence)
    ) {
      throw new GroqError(
        `The AI model returned a flag with missing or invalid fields at index ${index}.`,
      );
    }

    return {
      pleaded_ground,
      ground_paragraph_reference,
      prayer_gap,
      explanation,
      legal_basis,
      mismatch_type,
      confidence,
    };
  });

  return { flags, clean: obj["clean"] };
}

/**
 * Calls the Groq API to cross-check pleaded grounds against the prayer
 * clause of a draft plaint/petition via genuine two-pass legal reasoning.
 * Never falls back to another provider and never masks a failure as an
 * aligned/clean result -- callers must surface GroqError as success:false.
 */
export async function analyzePrayerAlignment(
  text: string,
): Promise<PrayerAlignmentResult> {
  const content = await callGroqForJsonContent(
    SYSTEM_PROMPT,
    `Analyze the following draft plaint/petition for alignment between pleaded grounds and the prayer clause:\n\n"""\n${text}\n"""`,
  );
  return parsePrayerAlignmentPayload(content);
}
