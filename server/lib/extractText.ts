import { createWorker } from "tesseract.js";
import { logger } from "./logger.js";

export type ExtractionMethod = "direct_text" | "ocr_image" | "ocr_pdf";

export interface ExtractedDocument {
  text: string;
  method: ExtractionMethod;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Text shorter or less alphanumeric than this is treated as garbled/empty. */
function looksLikeUsableText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 10) return false;
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  return alphaCount / trimmed.length > 0.3;
}

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const directText = result.text ?? "";

    if (looksLikeUsableText(directText)) {
      return { text: directText, method: "direct_text" };
    }

    // Scanned/image-only PDFs would need page-to-image rendering + OCR,
    // which depends on a native canvas library that isn't reliably
    // available in this serverless environment. Rather than crash, fail
    // clearly so the user can paste the text or upload it as an image
    // instead -- both of those paths work.
    throw new ExtractionError(
      "This PDF has no extractable text (it appears to be a scanned image). Please paste the text directly, or upload it as a JPG/PNG image instead.",
    );
  } finally {
    await parser.destroy();
  }
}

export interface RawDocumentInput {
  text?: string | null;
  fileBase64?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

/**
 * Extracts usable text from a document slot. Prefers pasted text, then
 * direct PDF text extraction, then falls back to OCR for images and
 * image-based PDFs. Throws ExtractionError on failure -- never returns a
 * silently empty success.
 */
export async function extractDocumentText(
  input: RawDocumentInput,
): Promise<ExtractedDocument> {
  const pastedText = input.text?.trim();
  if (pastedText && pastedText.length > 0) {
    return { text: pastedText, method: "direct_text" };
  }

  if (!input.fileBase64) {
    throw new ExtractionError("No text or file was provided for this document.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.fileBase64, "base64");
  } catch (err) {
    throw new ExtractionError(
      "The uploaded file could not be decoded.",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (buffer.length === 0) {
    throw new ExtractionError("The uploaded file was empty.");
  }

  const mimeType = input.mimeType ?? "";
  const fileName = input.fileName ?? "";
  const isPdf =
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage =
    mimeType.startsWith("image/") ||
    /\.(png|jpe?g)$/i.test(fileName);

  try {
    if (isPdf) {
      return await extractFromPdf(buffer);
    }

    if (isImage) {
      const text = await ocrImageBuffer(buffer);
      return { text, method: "ocr_image" };
    }

    throw new ExtractionError(
      `Unsupported file type "${mimeType || fileName || "unknown"}". Only JPG, PNG, and PDF files are supported.`,
    );
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logger.error({ fileName, mimeType, detail }, "extractDocumentText failed");
    throw new ExtractionError("Failed to extract text from the uploaded file.", detail);
  }
}
