import { db } from "./repository.js";

import type {
  HealthStatus,
  MonitoredPrefix,
  SourceName,
  SourceResult,
} from "./types.js";

import {
  getLatestCheck,
  getMonitoredPrefixes,
  getOpenIncident,
  openIncident,
  recordSourceFailure,
  recordSourceSuccess,
  resolveIncident,
  writeCheck,
} from "./repository.js";

import {
  checkRipeBgpState,
  checkRipePrefixOverview,
  checkRipeRpkiValidation,
} from "./ripestatSources.js";

import {
  checkRouteViewsRpki,
} from "./routeviewsSources.js";

import {
  buildValidationDecision,
} from "./validators.js";

type SourceResultCollection = Map<
  SourceName,
  SourceResult[]
>;

function collectSourceResult(
  collection: SourceResultCollection,
  result: SourceResult,
): void {
  const existing = collection.get(result.source) ?? [];

  existing.push(result);
  collection.set(result.source, existing);
}

function averageResponseTime(
  results: SourceResult[],
): number {
  if (results.length === 0) {
    return 0;
  }

  const total = results.reduce(
    (sum, result) =>
      sum + Math.max(0, result.responseTimeMs),
    0,
  );

  return Math.round(total / results.length);
}

async function recordCycleSourceHealth(
  collection: SourceResultCollection,
): Promise<void> {
  for (const [sourceName, results] of collection) {
    const failedResults = results.filter(
      (result) => !result.ok,
    );

    const responseTimeMs =
      averageResponseTime(results);

    if (failedResults.length === 0) {
      await recordSourceSuccess({
        sourceName,
        responseTimeMs,
      });

      console.log(
        `Source healthy: ${sourceName} ` +
          `(${results.length} checks, ` +
          `${responseTimeMs}ms average)`,
      );

      continue;
    }

    const errors = [
      ...new Set(
        failedResults.map(
          (result) =>
            result.error ||
            result.message ||
            "Unknown source failure",
        ),
      ),
    ];

    const errorSummary =
      `${failedResults.length}/${results.length} ` +
      `requests failed: ${errors.join("; ")}`;

    await recordSourceFailure({
      sourceName,
      error: errorSummary,
      responseTimeMs,
    });

    console.error(
      `Source degraded: ${sourceName} - ` +
        errorSummary,
    );
  }
}

async function processIncident(input: {
  monitoredPrefixId: number;
  provider: string;
  prefix: string;
  previousStatus: HealthStatus | null;
  currentStatus: HealthStatus;
}): Promise<void> {
  const openExistingIncident = await getOpenIncident(
    input.monitoredPrefixId,
  );

  if (
    input.currentStatus === "invalid" &&
    input.previousStatus !== "invalid" &&
    !openExistingIncident
  ) {
    await openIncident({
      monitoredPrefixId: input.monitoredPrefixId,
      severity: "critical",
      previousStatus: input.previousStatus,
      currentStatus: input.currentStatus,
      summary:
        `${input.provider} prefix ${input.prefix} changed from ` +
        `${input.previousStatus ?? "none"} to invalid.`,
    });

    console.log(
      `Incident opened for ${input.provider} ${input.prefix}`,
    );

    return;
  }

  if (
    input.currentStatus === "valid" &&
    openExistingIncident
  ) {
    await resolveIncident({
      incidentId: openExistingIncident.id,
      currentStatus: input.currentStatus,
    });

    console.log(
      `Incident resolved for ${input.provider} ${input.prefix}`,
    );

    return;
  }

  if (
    input.currentStatus === "unknown" &&
    input.previousStatus === "valid" &&
    !openExistingIncident
  ) {
    await openIncident({
      monitoredPrefixId: input.monitoredPrefixId,
      severity: "warning",
      previousStatus: input.previousStatus,
      currentStatus: input.currentStatus,
      summary:
        `${input.provider} prefix ${input.prefix} changed ` +
        "from valid to unknown.",
    });

    console.log(
      `Warning incident opened for ${input.provider} ${input.prefix}`,
    );
  }
}

async function checkPrefix(
  row: MonitoredPrefix,
  sourceResults: SourceResultCollection,
) {
  const previousCheck = await getLatestCheck(
    row.monitored_prefix_id,
  );

  const [
    ripeBgpState,
    ripePrefixOverview,
    ripeRpkiValidation,
    routeViewsRpki,
  ] = await Promise.all([
    checkRipeBgpState(
      row.prefix,
      row.expected_origin_asn,
    ),

    checkRipePrefixOverview(
      row.prefix,
      row.expected_origin_asn,
    ),

    checkRipeRpkiValidation(
      row.prefix,
      row.expected_origin_asn,
    ),

    checkRouteViewsRpki(
      row.prefix,
      row.expected_origin_asn,
    ),
  ]);

  const currentSourceResults = [
    ripeBgpState,
    ripePrefixOverview,
    ripeRpkiValidation,
    routeViewsRpki,
  ];

  for (const result of currentSourceResults) {
    collectSourceResult(sourceResults, result);
  }

  const decision = buildValidationDecision({
    expectedOriginAsn: row.expected_origin_asn,

    bgpResults: [
      ripeBgpState,
      ripePrefixOverview,
    ],

    rpkiResults: [
      ripeRpkiValidation,
      routeViewsRpki,
    ],
  });

  await writeCheck({
    monitoredPrefixId: row.monitored_prefix_id,
    bgpStatus: decision.bgpStatus,
    rpkiStatus: decision.rpkiStatus,
    overallStatus: decision.overallStatus,
    observedOriginAsns:
      decision.observedOriginAsns,
    sources: decision.sources,
    message: decision.message,
    sourceConfidence:
      decision.sourceConfidence,
    sourceAgreement:
      decision.sourceAgreement,
    sourceScore: decision.sourceScore,
  });

  await processIncident({
    monitoredPrefixId:
      row.monitored_prefix_id,

    provider:
      row.provider_name,

    prefix:
      row.prefix,

    previousStatus:
      previousCheck?.overall_status ?? null,

    currentStatus:
      decision.overallStatus,
  });

  return {
    provider:
      row.provider_name,

    prefix:
      row.prefix,

    expected_origin_asn:
      row.expected_origin_asn,

    observed_origin_asns:
      decision.observedOriginAsns,

    bgp_status:
      decision.bgpStatus,

    rpki_status:
      decision.rpkiStatus,

    overall_status:
      decision.overallStatus,

    source_confidence:
      decision.sourceConfidence,

    source_agreement:
      decision.sourceAgreement,

    source_score:
      decision.sourceScore,

    message:
      decision.message,
  };
}

async function main(): Promise<void> {
  const prefixes =
    await getMonitoredPrefixes();

  const sourceResults: SourceResultCollection =
    new Map();

  console.log(
    `Checking ${prefixes.length} BGP prefixes...`,
  );

  for (const prefix of prefixes) {
    try {
      const result = await checkPrefix(
        prefix,
        sourceResults,
      );

      console.log(result);
    } catch (error) {
      console.error(
        `Failed checking ${prefix.provider_name} ` +
          `${prefix.prefix}:`,
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }

  try {
    await recordCycleSourceHealth(
      sourceResults,
    );
  } catch (error) {
    console.error(
      "Could not record cycle source health:",
      error instanceof Error
        ? error.message
        : error,
    );
  }

  await db.end();
}

main().catch(
  async (error) => {
    console.error(
      "BGP monitor failed:",
      error,
    );

    await db.end();
    process.exit(1);
  },
);
