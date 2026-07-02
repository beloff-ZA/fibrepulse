import type {
  HealthStatus,
  SourceAgreement,
  SourceResult,
  ValidationDecision,
} from "./types.js";
import {
  confidenceLabel,
  uniqueSortedNumbers,
} from "./sourceUtils.js";

function decideAgreement(statuses: HealthStatus[]): SourceAgreement {
  const meaningfulStatuses = statuses.filter(
    (status) => status !== "unknown",
  );

  if (meaningfulStatuses.length === 0) {
    return "unknown";
  }

  const uniqueStatuses = [...new Set(meaningfulStatuses)];

  if (
    uniqueStatuses.length === 1 &&
    meaningfulStatuses.length === statuses.length
  ) {
    return "full";
  }

  if (uniqueStatuses.length === 1) {
    return "partial";
  }

  return "conflict";
}

function weightedStatus(results: SourceResult[]): HealthStatus {
  const scores = {
    valid: 0,
    invalid: 0,
    unknown: 0,
  };

  for (const result of results) {
    if (!result.ok) {
      continue;
    }

    scores[result.status] += result.confidence;
  }

  if (scores.invalid >= 0.75) {
    return "invalid";
  }

  if (scores.valid >= 0.75 && scores.invalid === 0) {
    return "valid";
  }

  if (scores.valid > scores.invalid && scores.valid >= 0.5) {
    return "valid";
  }

  if (scores.invalid > scores.valid && scores.invalid >= 0.5) {
    return "invalid";
  }

  return "unknown";
}

export function buildValidationDecision(input: {
  expectedOriginAsn: number;
  bgpResults: SourceResult[];
  rpkiResults: SourceResult[];
}): ValidationDecision {
  const allResults = [
    ...input.bgpResults,
    ...input.rpkiResults,
  ];

  const observedOriginAsns = uniqueSortedNumbers(
    allResults.flatMap(
      (result) => result.observedOriginAsns,
    ),
  );

  const bgpStatus = weightedStatus(input.bgpResults);
  const rpkiStatus = weightedStatus(input.rpkiResults);

  let overallStatus: HealthStatus = "unknown";

  if (bgpStatus === "invalid" || rpkiStatus === "invalid") {
    overallStatus = "invalid";
  } else if (
    bgpStatus === "valid" &&
    (rpkiStatus === "valid" || rpkiStatus === "unknown")
  ) {
    overallStatus = "valid";
  }

  const successfulResults = allResults.filter(
    (result) => result.ok,
  );

  const sourceScoreRaw =
    successfulResults.reduce(
      (total, result) => total + result.confidence,
      0,
    ) / Math.max(allResults.length, 1);

  const sourceScore = Number(sourceScoreRaw.toFixed(2));

  const sourceAgreement = decideAgreement(
    allResults.map((result) => result.status),
  );

  const sourceConfidence = confidenceLabel(sourceScore);

  const sources: Record<string, unknown> = {};

  for (const result of allResults) {
    sources[result.source] = {
      ok: result.ok,
      status: result.status,
      confidence: result.confidence,
      observed_origin_asns: result.observedOriginAsns,
      message: result.message,
      error: result.error ?? null,
    };
  }

  let message =
    "Could not determine BGP and RPKI status reliably.";

  if (overallStatus === "valid") {
    message =
      "Prefix is visible, originated by the expected ASN, and source confidence is acceptable.";
  }

  if (overallStatus === "invalid") {
    message =
      "Prefix failed BGP origin validation or RPKI validation.";
  }

  if (sourceAgreement === "conflict") {
    message = `${message} Sources disagree.`;
  }

  return {
    bgpStatus,
    rpkiStatus,
    overallStatus,
    observedOriginAsns,
    sourceConfidence,
    sourceAgreement,
    sourceScore,
    message,
    sources,
  };
}
