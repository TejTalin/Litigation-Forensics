export type FlagConfidence = "explicit" | "inferred";

export function isFlagConfidence(value: unknown): value is FlagConfidence {
  return value === "explicit" || value === "inferred";
}