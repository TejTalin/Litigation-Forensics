import { callGroqForJsonContent, GroqError, GROQ_REQUEST_TIMEOUT_MS } from "./groqClient.js";
import { isFlagConfidence, type FlagConfidence } from "./flagConfidence.js";
import type { PreparedDocument } from "./contradictionTrap.js";

/**
 * Indexing a whole case file is a heavier, once-per-session pass than the
 * live in-hearing query, so it gets a longer ceiling. The live concession
 * check deliberately keeps the platform's standard 15s timeout -- it has to
 * be usable mid-hearing.
 */
export const BACKDROP_INDEX_TIMEOUT_MS = 45_000;

export interface BackdropAssertion {
  /** The pleaded factual assertion or legal position, in the party's own terms. */
  position: string;
  /** Document label + paragraph reference, e.g. "Written Statement - 3 Mar 2025, para 6". */
  source: string;
}

export interface CaseBackdrop {
  factual_assertions: BackdropAssertion[];
  legal_positions: BackdropAssertion[];
}

export type ConcessionSeverity =
  | "direct_contradiction"
  | "undermines_defense"
  | "weakens_argument";

export type ConcessionReversibility =
  | "binding"
  | "difficult_to_reverse"
  | "reversible"
  | "uncertain";

export interface ConcessionFlag {
  concession_text: string;
  conflicting_position: string;
  source: string;
  explanation: string;
  severity: ConcessionSeverity;
  reversibility: ConcessionReversibility;
  reversibility_explanation: string;
  confidence: FlagConfidence;
}

export interface ConcessionResult {
  flags: ConcessionFlag[];
  clean: boolean;
}

const BACKDROP_SYSTEM_PROMPT = `You are a senior litigation analyst indexing a complete case file before a hearing. The documents supplied are every filing available in ONE case (for example a plaint, a written statement, affidavits, and rejoinders).

Your task is to extract a structured index of the case's pleaded positions, so that a proposed concession can later be checked against it. Extract TWO distinct kinds of position:

1. FACTUAL ASSERTIONS -- every distinct factual claim actually pleaded (what happened, when, who did it, what was paid, what was known and when, what was delivered, what was said). State each assertion plainly and self-containedly, so it is understandable without the document in hand.

2. LEGAL POSITIONS AND DEFENCES -- every distinct legal stance taken or defence relied on, together with the factual premise it rests on. Examples: "relies on a limitation defence, contending the cause of action arose on 1 March 2021 because the contract remained in force until then"; "denies privity of contract"; "contends the notice was invalid for want of the contractual 30-day period". Capturing the PREMISE matters, because a concession can destroy a legal position without contradicting any single fact.

Rules:
- Extract only positions actually taken in the documents. Do not infer, invent, or add positions the party has not pleaded.
- Every entry must cite its source: the document label supplied in the input plus the paragraph reference where it appears, e.g. "Written Statement - 3 Mar 2025, para 6".
- Do not merge distinct positions into one entry, and do not repeat the same position twice.
- Keep each entry to one or two sentences.

Respond with ONLY a JSON object in exactly this shape, no prose outside the JSON:
{
  "factual_assertions": [
    { "position": "the pleaded factual assertion", "source": "document label + paragraph reference" }
  ],
  "legal_positions": [
    { "position": "the legal position or defence, including the factual premise it depends on", "source": "document label + paragraph reference" }
  ]
}`;

const CONCESSION_SYSTEM_PROMPT = `You are a senior litigation strategist sitting behind counsel during a live hearing or negotiation. Counsel is considering making an on-the-spot concession. You are given (a) an index of every position already pleaded in this case, with sources, and (b) the concession counsel is considering.

Your task: identify which of the already-pleaded positions the proposed concession would contradict, undermine, or materially weaken if it were made.

Reason about the concession EXACTLY as stated. Do not assume intent, hedging, or wording beyond what was typed.

If -- and only if -- the concession is phrased hypothetically or exploratorily ("if we were to concede X...", "just exploring...", "suppose we accepted..."), reason about the impact it WOULD have if actually made, but do not treat it as identical to an unconditional concession. In that case every explanation you give must open by acknowledging the hedged framing in words (for example: "This is framed hypothetically and has not been conceded; if it were made, ...") and must then describe the damage conditionally. For an unconditional concession, do not add any such hedging language.

For each conflict, classify the severity:
- "direct_contradiction": the concession asserts the opposite of a pleaded factual assertion.
- "undermines_defense": the concession removes or destroys a factual premise that a pleaded legal position or defence depends on, even if no single fact is directly contradicted.
- "weakens_argument": the concession does not destroy a position, but materially reduces its force.

PROCEDURAL CONCESSIONS: a concession about the conduct of the proceedings rather than the merits -- consenting to an adjournment or to an extension of time for a filing, agreeing to a forum, transfer, or listing, agreeing to attend mediation, agreeing to a mode of service, or not opposing a procedural application -- does NOT put a pleaded substantive position at risk, and must not be flagged, unless it directly alters a pleaded FACT relied on by that position. In particular, consenting to more time for a step in the case does not waive, surrender, or weaken a limitation defence: a limitation defence rests on when the cause of action accrued and when the suit was instituted, neither of which a procedural indulgence changes. Do not construct waiver, estoppel, or acquiescence theories out of ordinary case-management courtesies.

PRECISION REQUIREMENT: precision matters far more than recall. Only flag a real, explicable conflict whose mechanism you can state concretely -- name the pleaded position at risk and explain exactly how the concession damages it. Do NOT flag a vague, speculative or merely topical connection ("this could theoretically relate to..."). A concession that touches the same subject matter as a pleaded position but does not actually conflict with it is NOT a flag. If nothing in the index is contradicted, undermined, or materially weakened, return zero flags and say so plainly -- never invent a conflict to appear useful.

Every flag must cite the source of the conflicting position exactly as it appears in the supplied index.

Respond with ONLY a JSON object in exactly this shape, no prose outside the JSON:
{
  "flags": [
    {
      "concession_text": "the proposed concession as typed by counsel",
      "conflicting_position": "the existing pleaded position or defence at risk",
      "source": "document label + paragraph reference for the conflicting position",
      "explanation": "the concrete mechanism: exactly how making this concession would undermine or contradict the cited position",
      "severity": "direct_contradiction | undermines_defense | weakens_argument",
      "reversibility": "binding | difficult_to_reverse | reversible | uncertain",
      "reversibility_explanation": "short practical explanation of whether this on-record concession would be difficult to withdraw",
      "confidence": "explicit | inferred"
    }
  ],
  "clean": true or false
}

If there is no conflict, return "flags": [] and "clean": true.`;

function parseJsonObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new GroqError(
      "The AI model returned a response that was not valid JSON.",
      err instanceof Error ? err.message : String(err),
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GroqError("The AI model returned an unexpected response shape.");
  }
  return parsed as Record<string, unknown>;
}

function parseAssertionList(
  value: unknown,
  field: string,
): BackdropAssertion[] {
  if (!Array.isArray(value)) {
    throw new GroqError(
      `The AI model response was missing a valid '${field}' array.`,
    );
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(
        `The AI model returned a malformed ${field} entry at index ${index}.`,
      );
    }
    const obj = item as Record<string, unknown>;
    const position = obj["position"];
    const source = obj["source"];
    if (
      typeof position !== "string" ||
      typeof source !== "string" ||
      position.trim().length === 0 ||
      source.trim().length === 0
    ) {
      throw new GroqError(
        `The AI model returned a ${field} entry with missing or empty fields at index ${index}.`,
      );
    }
    return { position, source };
  });
}

function parseBackdropPayload(raw: string): CaseBackdrop {
  const obj = parseJsonObject(raw);
  const backdrop: CaseBackdrop = {
    factual_assertions: parseAssertionList(
      obj["factual_assertions"],
      "factual_assertions",
    ),
    legal_positions: parseAssertionList(
      obj["legal_positions"],
      "legal_positions",
    ),
  };

  // An empty index would silently make every later concession check return
  // "clean", which is the exact failure this platform must never produce.
  if (
    backdrop.factual_assertions.length === 0 &&
    backdrop.legal_positions.length === 0
  ) {
    throw new GroqError(
      "No pleaded positions could be extracted from the case file, so no concession could be checked against it.",
    );
  }

  return backdrop;
}

const SEVERITIES: ConcessionSeverity[] = [
  "direct_contradiction",
  "undermines_defense",
  "weakens_argument",
];

function parseConcessionPayload(raw: string): ConcessionResult {
  const obj = parseJsonObject(raw);

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

  const flags: ConcessionFlag[] = obj["flags"].map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(
        `The AI model returned a malformed flag at index ${index}.`,
      );
    }
    const flagObj = item as Record<string, unknown>;
    const {
      concession_text,
      conflicting_position,
      source,
      explanation,
      severity,
      reversibility,
      reversibility_explanation,
      confidence,
    } = flagObj;

    if (
      typeof concession_text !== "string" ||
      typeof conflicting_position !== "string" ||
      typeof source !== "string" ||
      typeof explanation !== "string" ||
      typeof reversibility !== "string" ||
      typeof reversibility_explanation !== "string" ||
      typeof severity !== "string" ||
      !isFlagConfidence(confidence) ||
      concession_text.trim().length === 0 ||
      conflicting_position.trim().length === 0 ||
      source.trim().length === 0 ||
      explanation.trim().length === 0
      || reversibility_explanation.trim().length === 0
    ) {
      throw new GroqError(
        `The AI model returned a flag with missing or empty fields at index ${index}.`,
      );
    }
    if (!SEVERITIES.includes(severity as ConcessionSeverity)) {
      throw new GroqError(
        `The AI model returned an unrecognised severity at index ${index}.`,
        severity,
      );
    }
    if (
      ![
        "binding",
        "difficult_to_reverse",
        "reversible",
        "uncertain",
      ].includes(reversibility)
    ) {
      throw new GroqError(
        `The AI model returned an unrecognised reversibility at index ${index}.`,
        reversibility,
      );
    }

    return {
      concession_text,
      conflicting_position,
      source,
      explanation,
      severity: severity as ConcessionSeverity,
      reversibility: reversibility as ConcessionReversibility,
      reversibility_explanation,
      confidence,
    };
  });

  const clean = obj["clean"];

  // Never trust the boolean independently of the flags it summarises: an
  // inconsistent payload could otherwise hide a conflict behind a clean
  // verdict. Treat the disagreement as an analysis failure.
  if (clean !== (flags.length === 0)) {
    throw new GroqError(
      "The AI model returned an inconsistent result and the analysis could not be trusted.",
      `clean=${String(clean)} but ${flags.length} conflict(s) were returned.`,
    );
  }

  return { flags, clean };
}

/**
 * Phase 1. Calls Groq ONCE with the whole prepared case file and returns the
 * structured backdrop (pleaded facts + legal positions with sources) that is
 * then stored for the session and reused by every later concession check.
 * The raw documents are never sent again.
 */
export async function indexCaseBackdrop(
  documents: PreparedDocument[],
): Promise<CaseBackdrop> {
  const body = documents
    .map(
      (doc) =>
        `--- DOCUMENT: ${doc.label}${
          doc.truncated ? " (text shortened to fit length limits)" : ""
        } ---\n${doc.text}`,
    )
    .join("\n\n");

  const content = await callGroqForJsonContent(
    BACKDROP_SYSTEM_PROMPT,
    `The following ${documents.length} document${
      documents.length === 1 ? "" : "s"
    } are the case file. Index every pleaded factual assertion and every legal position or defence taken in them:\n\n${body}`,
    BACKDROP_INDEX_TIMEOUT_MS,
    2,
  );

  return parseBackdropPayload(content);
}

function renderBackdrop(backdrop: CaseBackdrop): string {
  const facts = backdrop.factual_assertions
    .map((a, i) => `F${i + 1}. ${a.position}  [source: ${a.source}]`)
    .join("\n");
  const positions = backdrop.legal_positions
    .map((a, i) => `L${i + 1}. ${a.position}  [source: ${a.source}]`)
    .join("\n");

  return `PLEADED FACTUAL ASSERTIONS:\n${
    facts || "(none recorded)"
  }\n\nPLEADED LEGAL POSITIONS AND DEFENCES:\n${
    positions || "(none recorded)"
  }`;
}

/**
 * Phase 2. Calls Groq ONCE per typed concession, against the already-indexed
 * backdrop rather than the raw documents, at the platform's standard 15s
 * timeout so it stays usable mid-hearing.
 */
export async function checkConcession(
  backdrop: CaseBackdrop,
  concession: string,
): Promise<ConcessionResult> {
  const content = await callGroqForJsonContent(
    CONCESSION_SYSTEM_PROMPT,
    `INDEX OF POSITIONS ALREADY PLEADED IN THIS CASE:\n${renderBackdrop(
      backdrop,
    )}\n\nCONCESSION COUNSEL IS CONSIDERING MAKING, EXACTLY AS TYPED:\n"${concession}"\n\nIdentify every pleaded position above that this concession would contradict, undermine, or materially weaken.`,
    GROQ_REQUEST_TIMEOUT_MS,
    2,
  );

  return parseConcessionPayload(content);
}
