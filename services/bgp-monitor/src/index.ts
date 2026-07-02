import { db } from "./repository.js";
import type {
  HealthStatus,
  MonitoredPrefix,
} from "./types.js";

import {
  getLatestCheck,
  getMonitoredPrefixes,
  getOpenIncident,
  openIncident,
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
    observedOriginAsns: decision.observedOriginAsns,
    sources: decision.sources,
    message: decision.message,
    sourceConfidence: decision.sourceConfidence,
    sourceAgreement: decision.sourceAgreement,
    sourceScore: decision.sourceScore,
  });

  await processIncident({
    monitoredPrefixId: row.monitored_prefix_id,
    provider: row.provider_name,
    prefix: row.prefix,
    previousStatus:
      previousCheck?.overall_status ?? null,
    currentStatus: decision.overallStatus,
  });

  return {
    provider: row.provider_name,
    prefix: row.prefix,
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

  console.log(
    `Checking ${prefixes.length} BGP prefixes...`,
  );

  for (const prefix of prefixes) {
    try {
      const result =
        await checkPrefix(prefix);

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
