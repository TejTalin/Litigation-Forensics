import { callGroqForJsonContent, GroqError } from "./groqClient";
import { isFlagConfidence, type FlagConfidence } from "./flagConfidence";

export { GroqError } from "./groqClient";

export type RiskType =
  | "admission"
  | "waiver"
  | "privilege_break"
  | "limitation_extension";

export interface GroqFlag {
  excerpt: string;
  risk_type: RiskType;
  explanation: string;
  legal_basis: string;
  suggested_rewrite: string;
  confidence: FlagConfidence;
}

export interface GroqReasoningResult {
  flags: GroqFlag[];
  clean: boolean;
}

export interface ThreadMessage {
  label: string;
  text: string;
}

export interface ThreadAnalysisResult extends GroqReasoningResult {
  message_count: number;
}

const SYSTEM_PROMPT = `You are a senior litigation risk-review assistant. A lawyer is about to send a piece of outgoing correspondence (email, letter, settlement offer, or reply to opposing counsel), written under time pressure. Your job is to read it exactly the way opposing counsel would, and flag language that could unintentionally create legal exposure.

Flag exactly four risk types, and reason about each precisely:

1. ADMISSION -- a statement of fact framed as settled/agreed (not disputed) that concedes fault, timing, causation, or amount. A denial is NOT an admission, even if it contains words like "liable" or "at fault" (e.g. "we do not accept that we are liable" must NOT be flagged).

2. WAIVER -- language that gives up a right, defense, or objection not clearly intended to be waived.

3. PRIVILEGE_BREAK -- settlement/negotiation content that risks losing "without prejudice" protection, either because it contains an admission separable from the negotiation, or because settlement language lacks a without-prejudice marking where one should exist.

4. LIMITATION_EXTENSION -- language that could be read as acknowledging a debt/liability in a way that restarts limitation under Sections 18/19 of the Limitation Act, 1963.

Read the text carefully, including negation and context. Do NOT flag a statement just because it contains risk-adjacent words if the surrounding context is a denial, a hypothetical, or a quotation/restatement of the other side's position. If no genuine risk is found, say so clearly -- do not manufacture a flag to appear more useful. Calibration matters more than sensitivity -- a tool that over-flags is not trustworthy.

Every flag's reasoning must be concrete, not generic. The "explanation" must name the exact phrase and the specific legal consequence it risks -- never vague caution like "this could be risky." The "legal_basis" must cite the actual legal doctrine, section, or principle that makes it risky (e.g. "Sections 18-19, Limitation Act 1963" for a limitation-extension flag; "admission under law of evidence" for an admission flag; "without prejudice privilege doctrine" for a privilege-break flag; "waiver by conduct" for a waiver flag) -- not a made-up or vague citation. If uncertain of the precise section, state the general legal principle rather than inventing a citation.

Respond with ONLY a JSON object in exactly this shape, no prose outside the JSON:
{
  "flags": [
    {
      "excerpt": "the exact problematic phrase from the input",
      "risk_type": "admission | waiver | privilege_break | limitation_extension",
      "explanation": "concrete, specific reason this exact phrase is risky, naming the consequence",
      "legal_basis": "the specific legal doctrine, section, or principle this risk rests on",
      "suggested_rewrite": "a rewritten version that preserves intent without the risk",
      "confidence": "explicit | inferred"
    }
  ],
  "clean": true or false
}

If there are no risks, return "flags": [] and "clean": true.`;

const THREAD_SYSTEM_PROMPT = `You are a senior litigation risk-review assistant analyzing a complete email or letter thread as one connected sequence. The messages are ordered chronologically and may contain risks that emerge only from their combination: for example, an initial denial followed by a later message supplying a detail that effectively admits the denied fact. Do not analyze each message in isolation.

Reason across the full sequence while preserving the exact message boundaries and order. Flag only genuine exposure under these four risk types: admission, waiver, privilege_break, and limitation_extension. A later clarification is not automatically a contradiction or admission; require concrete language and explain the cross-message mechanism.

For every flag, quote the exact relevant phrase(s), explain the specific legal consequence, cite the doctrine or section, suggest a safer rewrite where appropriate, and classify confidence as "explicit" when the risk is directly stated in the thread or "inferred" when it depends on a reasoned combination of messages. Do not manufacture flags.

Respond with ONLY a JSON object in exactly this shape:
{
  "flags": [
    {
      "excerpt": "the exact relevant phrase or short sequence of phrases",
      "risk_type": "admission | waiver | privilege_break | limitation_extension",
      "explanation": "the concrete cross-message reason this creates exposure",
      "legal_basis": "the specific legal doctrine, section, or principle",
      "suggested_rewrite": "a safer rewrite or an empty string if a rewrite is not applicable",
      "confidence": "explicit | inferred"
    }
  ],
  "clean": true or false
}

If the full thread contains no genuine risk, return "flags": [] and "clean": true.`;

function isValidRiskType(value: unknown): value is RiskType {
  return (
    value === "admission" ||
    value === "waiver" ||
    value === "privilege_break" ||
    value === "limitation_extension"
  );
}

function parseReasoningPayload(raw: string): GroqReasoningResult {
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

  const flags: GroqFlag[] = obj["flags"].map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new GroqError(
        `The AI model returned a malformed flag at index ${index}.`,
      );
    }
    const flagObj = item as Record<string, unknown>;
    const {
      excerpt,
      risk_type,
      explanation,
      legal_basis,
      suggested_rewrite,
      confidence,
    } = flagObj;

    if (
      typeof excerpt !== "string" ||
      !isValidRiskType(risk_type) ||
      typeof explanation !== "string" ||
      typeof legal_basis !== "string" ||
      typeof suggested_rewrite !== "string" ||
      !isFlagConfidence(confidence)
    ) {
      throw new GroqError(
        `The AI model returned a flag with missing or invalid fields at index ${index}.`,
      );
    }

    return {
      excerpt,
      risk_type,
      explanation,
      legal_basis,
      suggested_rewrite,
      confidence,
    };
  });

  return { flags, clean: obj["clean"] };
}

/**
 * Calls the Groq API to reason about trapdoor risks in a piece of legal
 * correspondence. Never falls back to another provider and never masks a
 * failure as a clean result -- callers must surface GroqError as success:false.
 */
export async function analyzeCorrespondence(
  text: string,
): Promise<GroqReasoningResult> {
  const content = await callGroqForJsonContent(
    SYSTEM_PROMPT,
    `Analyze the following outgoing correspondence:\n\n"""\n${text}\n"""`,
  );
  return parseReasoningPayload(content);
}

export async function analyzeCorrespondenceThread(
  messages: ThreadMessage[],
): Promise<ThreadAnalysisResult> {
  const thread = messages
    .map(
      (message, index) =>
        `--- MESSAGE ${index + 1}: ${message.label} ---\n${message.text}`,
    )
    .join("\n\n");
  const content = await callGroqForJsonContent(
    THREAD_SYSTEM_PROMPT,
    `Analyze this complete correspondence thread in chronological order. Reason across messages, not one message at a time:\n\n${thread}`,
  );
  const reasoning = parseReasoningPayload(content);
  return { ...reasoning, message_count: messages.length };
}
