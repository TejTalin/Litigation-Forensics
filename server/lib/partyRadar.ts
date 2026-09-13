import { callGroqForJsonContent, GroqError, GROQ_REQUEST_TIMEOUT_MS } from "./groqClient.js";
import { isFlagConfidence, type FlagConfidence } from "./flagConfidence.js";

export type PartyType = "necessary" | "proper";
export type ProceedingType = "plaint" | "appeal" | "writ_petition";

export interface PartyFlag {
  party_role: string;
  paragraph_reference: string;
  explanation: string;
  legal_basis: string;
  party_type: PartyType;
  confidence: FlagConfidence;
}

export type PartyDefectType =
  | "misjoinder"
  | "missing_guardian"
  | "deceased_without_legal_representative";

export interface PartyDefect {
  party_name_or_role: string;
  paragraph_reference: string;
  explanation: string;
  legal_basis: string;
  defect_type: PartyDefectType;
  confidence: FlagConfidence;
}

export interface PartyRadarResult {
  flags: PartyFlag[];
  defects: PartyDefect[];
  clean: boolean;
}

const BASE_SYSTEM_PROMPT = `You are a senior litigation review assistant specializing in Indian civil procedure. A lawyer has drafted a litigation document and wants to know if any legally necessary party is missing before filing.

Perform two passes, both through careful reading of the document -- never through keyword/pattern matching:

PASS 1 -- Extract the cause title's formally named parties: every person/entity named as plaintiff/petitioner/defendant/respondent, usually near the top of the document.

PASS 2 -- Extract role-described entities from the body of pleaded facts (not the cause title): every person/entity described by a role suggesting a direct legal interest in the subject matter of the suit -- for example a co-owner of the property in dispute, a guarantor of the loan in question, a joint-venture partner in the transaction, or a statutory/sanctioning authority whose approval is central to the claim. A role can be described without ever using an expected label like "guarantor" or "co-owner" -- read the substance of what is described, not just specific words.

CROSS-REFERENCE: for each role-described entity from Pass 2, check whether they already appear as a formally named party from Pass 1. If they do not, this is a candidate missing-party flag.

NECESSARY vs. PROPER PARTY TEST -- apply this distinction to every candidate, do not flag everyone unnamed:
- NECESSARY PARTY: without whom no effective order or decree can be passed, or whose legal interest would be directly and materially affected by the relief sought in this specific proceeding. This should be flagged.
- PROPER PARTY: someone whose presence would merely be convenient, or who has only a general/peripheral interest, or who is a witness or bystander mentioned in passing -- NOT required for effective adjudication. This must NOT be flagged.

Only flag entities whose described role makes their legal interest directly and necessarily affected by the relief sought in THIS proceeding. Do not flag every third party mentioned in the facts. Precision matters more than recall -- a tool that over-flags is not trustworthy. If the document is not a recognizable litigation proceeding, or if genuinely no necessary party appears to be missing, say so clearly and do not fabricate flags.

Every flag's reasoning must be concrete and case-specific. The "explanation" must name the specific role and the specific reason their absence creates risk in this case (e.g. "X is described as co-owner of the disputed property in para 4; without impleading them, any decree affecting title cannot bind their share"). The "legal_basis" must cite Order 1 Rule 9, CPC, 1908 or Order 1 Rule 10, CPC, 1908 as applicable, and briefly say why that rule applies -- never a vague or invented citation. Never cite a specific named judicial precedent (e.g. "X v. Y") in this field unless you are certain it is a real, correctly-described, binding Indian authority directly on point -- when in doubt, cite only the statute, section, or doctrine by name, with no case citation at all. An invented or wrong-jurisdiction case name is a more serious error than a generic doctrinal citation.

Only entities you judge to be "necessary" should ever appear in the "flags" array. If you identify only "proper" (non-necessary) candidates and no necessary ones, treat the document as clean (flags: [], clean: true) -- do not mix proper-party candidates into the main flag list.

Also check for distinct procedural defects:
- MISJOINDER: a named party is unnecessary or wrongly joined under Order 1 Rule 10(2), CPC 1908. Do not flag a proper party merely because their presence is convenient.
- MISSING_GUARDIAN: the document identifies a minor party but does not identify a next friend or guardian where one is required.
- DECEASED_WITHOUT_LEGAL_REPRESENTATIVE: the document says or clearly establishes that a named party has died, but no legal representative is shown.
Only report these defects when the document itself supplies explicit or strongly grounded facts. Do not infer age, death, or representation from names alone.

Respond with ONLY a JSON object in exactly this shape, no prose outside the JSON:
{
  "flags": [
    {
      "party_role": "short description of the inferred missing party's role, e.g. 'Co-owner of disputed property'",
      "paragraph_reference": "the paragraph number or a short quoted locator where this role is described",
      "explanation": "concrete, case-specific reason this party's absence is a legal risk",
      "legal_basis": "Order 1 Rule 9, CPC, 1908 or Order 1 Rule 10, CPC, 1908 -- specify which, and briefly why",
      "party_type": "necessary",
      "confidence": "explicit | inferred"
    }
  ],
  "defects": [
    {
      "party_name_or_role": "name or role of the affected party",
      "paragraph_reference": "paragraph or short locator",
      "explanation": "case-specific explanation of the procedural defect",
      "legal_basis": "Order 1 Rule 10(2), CPC, 1908 or Order 22, CPC, 1908",
      "defect_type": "misjoinder | missing_guardian | deceased_without_legal_representative",
      "confidence": "explicit | inferred"
    }
  ],
  "clean": true or false
}

If there are no missing necessary parties, return "flags": [] and "clean": true.`;

const PROCEEDING_GUIDANCE: Record<ProceedingType, string> = {
  plaint: `SCOPE: This is a plaint or original civil petition. Treat the formally named plaintiffs and defendants as the cause-title parties. Focus on co-owners, co-obligors, guarantors, transferees, authorities, and other persons whose interests would be directly bound by the original relief sought. Apply the existing Order 1 Rules 9/10 CPC necessary/proper-party distinction.`,
  appeal: `SCOPE: This is an appeal. Analyze missing necessary respondents, not only missing defendants from the original suit. Check the challenged judgment/decree, the relief sought in the memorandum of appeal, and the parties or affected persons whose interests would be directly altered, affirmed, reversed, or extinguished by the appellate outcome. Treat a person who was merely a witness or peripheral party as proper, not necessary. Flag a respondent only when the appeal cannot be effectively or fairly decided without their participation.`,
  writ_petition: `SCOPE: This is a writ petition. Analyze missing necessary respondents in the constitutional/public-law proceeding. Check for the public authority or statutory decision-maker whose action is challenged, private beneficiaries or adverse parties whose rights would be directly affected, and any authority or person required for an effective writ order. Do not flag every government department, formal witness, or interested observer; distinguish a necessary respondent from a proper respondent with a peripheral role.`,
};

export function buildSystemPrompt(proceedingType: ProceedingType): string {
  return `${BASE_SYSTEM_PROMPT}

${PROCEEDING_GUIDANCE[proceedingType]}

Use the scope above consistently in both passes and in every flag explanation.`;
}

function isValidPartyType(value: unknown): value is PartyType {
  return value === "necessary" || value === "proper";
}

export function parsePartyRadarPayload(raw: string): PartyRadarResult {
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

  if (!Array.isArray(obj["flags"]) || !Array.isArray(obj["defects"])) {
    throw new GroqError(
      "The AI model response was missing valid 'flags' and 'defects' arrays.",
    );
  }

  const allFlags: PartyFlag[] = obj["flags"].map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(
        `The AI model returned a malformed flag at index ${index}.`,
      );
    }
    const flagObj = item as Record<string, unknown>;
    const {
      party_role,
      paragraph_reference,
      explanation,
      legal_basis,
      party_type,
      confidence,
    } = flagObj;

    if (
      typeof party_role !== "string" ||
      typeof paragraph_reference !== "string" ||
      typeof explanation !== "string" ||
      typeof legal_basis !== "string" ||
      !isValidPartyType(party_type) ||
      !isFlagConfidence(confidence)
    ) {
      throw new GroqError(
        `The AI model returned a flag with missing or invalid fields at index ${index}.`,
      );
    }

    return {
      party_role,
      paragraph_reference,
      explanation,
      legal_basis,
      party_type,
      confidence,
    };
  });

  const defects: PartyDefect[] = obj["defects"].map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(`The AI model returned a malformed defect at index ${index}.`);
    }
    const defect = item as Record<string, unknown>;
    const defectType = defect["defect_type"];
    if (
      typeof defect["party_name_or_role"] !== "string" ||
      typeof defect["paragraph_reference"] !== "string" ||
      typeof defect["explanation"] !== "string" ||
      typeof defect["legal_basis"] !== "string" ||
      typeof defectType !== "string" ||
      !["misjoinder", "missing_guardian", "deceased_without_legal_representative"].includes(defectType) ||
      !isFlagConfidence(defect["confidence"])
    ) {
      throw new GroqError(`The AI model returned a defect with missing or invalid fields at index ${index}.`);
    }
    return {
      party_name_or_role: defect["party_name_or_role"],
      paragraph_reference: defect["paragraph_reference"],
      explanation: defect["explanation"],
      legal_basis: defect["legal_basis"],
      defect_type: defectType as PartyDefectType,
      confidence: defect["confidence"],
    };
  });

  // `flags` is the necessary-party output channel. Silently dropping a model
  // response labelled "proper" here used to turn a potentially material
  // finding into a clean result. Reject that malformed contract instead.
  if (allFlags.some((flag) => flag.party_type !== "necessary")) {
    throw new GroqError(
      "The AI model placed a non-necessary party in the necessary-party flags array; the analysis could not be trusted.",
    );
  }
  const computedClean = allFlags.length === 0 && defects.length === 0;

  // A contradictory clean value is not safe to interpret. In particular, do
  // not turn an uncertain model response into a successful clean review.
  if (obj["clean"] !== computedClean) {
    throw new GroqError(
      "The AI model response was internally inconsistent about whether the document was clean.",
    );
  }

  return {
    flags: allFlags,
    defects,
    clean: computedClean,
  };
}

/**
 * Calls the Groq API to identify missing necessary parties in a draft
 * plaint/petition via genuine two-pass legal reasoning. Never falls back to
 * another provider and never masks a failure as a clean result -- callers
 * must surface GroqError as success:false.
 */
export async function analyzePleadingForMissingParties(
  text: string,
  proceedingType: ProceedingType = "plaint",
): Promise<PartyRadarResult> {
  const content = await callGroqForJsonContent(
    buildSystemPrompt(proceedingType),
    `Analyze the following ${proceedingType.replace("_", " ")} for missing necessary parties/respondents:\n\n"""\n${text}\n"""`,
    GROQ_REQUEST_TIMEOUT_MS,
    2,
  );
  return parsePartyRadarPayload(content);
}
