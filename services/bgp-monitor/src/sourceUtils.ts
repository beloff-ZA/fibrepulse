import type { HealthStatus, SourceConfidence } from "./types.js";

export function normaliseRpkiState(state: unknown): HealthStatus {
  if (!state) {
    return "unknown";
  }

  const value = String(state).trim().toLowerCase();

  if (value === "valid") {
    return "valid";
  }

  if (value === "invalid") {
    return "invalid";
  }

  if (
    value === "notfound" ||
    value === "not_found" ||
    value === "not found" ||
    value === "unknown"
  ) {
    return "unknown";
  }

  return "unknown";
}

export function confidenceLabel(score: number): SourceConfidence {
  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.45) {
    return "medium";
  }

  if (score > 0) {
    return "low";
  }

  return "unknown";
}

export function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}
