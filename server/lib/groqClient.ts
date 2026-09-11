import { logger } from "./logger";

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_REQUEST_TIMEOUT_MS = 15_000;

function parseRetryAfterMs(bodyText: string): number | null {
  const match = bodyText.match(/try again in ([\d.]+)\s*s/i);
  if (!match || !match[1]) return null;
  const seconds = Number(match[1]);
  if (Number.isNaN(seconds)) return null;
  return Math.ceil(seconds * 1000) + 500;
}

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "GroqError";
  }
}

/**
 * Shared low-level Groq chat-completion caller used by every reasoning
 * module in this platform (Trapdoor Scanner, Missing Party Radar, and any
 * future module). Always calls the Groq API directly with the platform's
 * single API key and model, enforces the 15s timeout, and requests a JSON
 * object response. Never falls back to another provider and never masks a
 * failure -- callers must surface GroqError as success:false rather than a
 * clean/no-risk result.
 */
export async function callGroqForJsonContent(
  systemPrompt: string,
  userContent: string,
  /**
   * Optional override for the request timeout. Defaults to the platform's
   * standard 15 seconds, which every interactive reasoning call uses. Only
   * a genuinely heavier one-off pass (e.g. indexing a whole case file before
   * a hearing, rather than a live in-hearing query) should raise it.
   */
  timeoutMs: number = GROQ_REQUEST_TIMEOUT_MS,
  /**
   * Number of automatic retries on a 429 (rate limit) response, waiting the
   * duration the API itself reports before trying again. Defaults to 0 (no
   * retries) to preserve every existing caller's behavior; only a batch/
   * setup-style caller that can tolerate extra latency should raise this.
   */
  retriesOn429: number = 0,
): Promise<string> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    throw new GroqError(
      "GROQ_API_KEY is not configured. The AI reasoning cannot run without it.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // The timer stays armed until the response BODY has been consumed, not
  // just until headers arrive -- a stalled body would otherwise let a "live"
  // call hang well past its budget.
  try {
    let response: Response;
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new GroqError(
          `The Groq API did not respond within ${Math.round(
            timeoutMs / 1000,
          )} seconds. The request was cancelled.`,
        );
      }
      throw new GroqError(
        "Failed to reach the Groq API.",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        // ignore
      }
      logger.error(
        { status: response.status, body: bodyText },
        "Groq API returned a non-OK response",
      );
      if (response.status === 429 && retriesOn429 > 0) {
        const waitMs = parseRetryAfterMs(bodyText) ?? 15_000;
        logger.warn(
          { waitMs, retriesLeft: retriesOn429 },
          "Groq rate limited -- waiting before retry",
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return callGroqForJsonContent(
          systemPrompt,
          userContent,
          timeoutMs,
          retriesOn429 - 1,
        );
      }
      throw new GroqError(
        `Groq API request failed with status ${response.status}.`,
        bodyText.slice(0, 500),
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new GroqError(
          `The Groq API did not finish sending its response within ${Math.round(
            timeoutMs / 1000,
          )} seconds. The request was cancelled.`,
        );
      }
      throw new GroqError(
        "The Groq API response could not be parsed as JSON.",
        err instanceof Error ? err.message : String(err),
      );
    }

    const choice = (
      json as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
      }
    )?.choices?.[0];
    const content = choice?.message?.content;

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new GroqError(
        "The Groq API response did not contain any reasoning content.",
      );
    }

    // A completion cut short (e.g. finish_reason "length") can still parse as
    // text but represents an incomplete analysis, which must never be passed
    // off as a finished one.
    if (
      typeof choice?.finish_reason === "string" &&
      choice.finish_reason !== "stop"
    ) {
      throw new GroqError(
        "The AI model did not finish its analysis, so the result could not be trusted.",
        `finish_reason=${choice.finish_reason}`,
      );
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}
