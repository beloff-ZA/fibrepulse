import axios from "axios";
import ipaddr from "ipaddr.js";

import { config } from "@fibrepulse/config";
import { db } from "@fibrepulse/db";

type ProviderAsnRow = {
  provider_id: number;
  provider_name: string;
  verification_status:
    | "verified"
    | "candidate"
    | "rejected"
    | "unsupported";
  monitoring_mode:
    | "full"
    | "observation"
    | "probe_only"
    | "disabled";
  incident_enabled: boolean;
  provider_asn_id: number;
  asn: number;
  label: string | null;
};

type DiscoveredPrefix = {
  prefix: string;
  first_seen: string | null;
  last_seen: string | null;
};

type RipeTimeline = {
  starttime?: string;
  endtime?: string;
};

type RipePrefixEntry = {
  prefix?: string;
  timelines?: RipeTimeline[];
};

function isPublicIpv4Prefix(prefix: string): boolean {
  try {
    const [address] = prefix.split("/");

    if (!address) {
      return false;
    }

    const parsed = ipaddr.parse(address);

    if (parsed.kind() !== "ipv4") {
      return false;
    }

    const range = parsed.range();

    return range === "unicast";
  } catch {
    return false;
  }
}

function latestTimelineValue(
  timelines: RipeTimeline[],
  field: "starttime" | "endtime",
): string | null {
  const values = timelines
    .map((timeline) => timeline[field])
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.length > 0,
    )
    .sort();

  return values.at(-1) ?? null;
}

async function getProviderAsns(): Promise<
  ProviderAsnRow[]
> {
  const result = await db.query<ProviderAsnRow>(`
    select
      p.id as provider_id,
      p.name as provider_name,
      p.verification_status,
      p.monitoring_mode,
      p.incident_enabled,
      pa.id as provider_asn_id,
      pa.asn,
      pa.label

    from providers p

    join provider_asns pa
      on pa.provider_id = p.id

    where p.provider_type = 'FNO'
      and p.display_enabled = true
      and p.monitoring_mode in (
        'full',
        'observation'
      )

    order by
      p.name,
      pa.asn;
  `);

  return result.rows;
}

async function discoverPrefixes(
  asn: number,
): Promise<DiscoveredPrefix[]> {
  const response = await axios.get(
    "https://stat.ripe.net/data/announced-prefixes/data.json",
    {
      timeout: 30_000,

      params: {
        resource: `AS${asn}`,
        min_peers_seeing: 10,
        sourceapp: config.SOURCE_APP,
      },

      headers: {
        Accept: "application/json",
        "User-Agent": "FibrePulse/1.0",
      },
    },
  );

  const entries: RipePrefixEntry[] =
    response.data?.data?.prefixes ?? [];

  const discovered: DiscoveredPrefix[] = [];

  for (const entry of entries) {
    const prefix = entry.prefix;

    if (
      typeof prefix !== "string" ||
      !isPublicIpv4Prefix(prefix)
    ) {
      continue;
    }

    const timelines = Array.isArray(entry.timelines)
      ? entry.timelines
      : [];

    discovered.push({
      prefix,
      first_seen: latestTimelineValue(
        timelines,
        "starttime",
      ),
      last_seen: latestTimelineValue(
        timelines,
        "endtime",
      ),
    });
  }

  return discovered.sort((a, b) =>
    a.prefix.localeCompare(b.prefix),
  );
}

async function discoverAll(): Promise<void> {
  const providerAsns = await getProviderAsns();

  console.log(
    `Discovering IPv4 prefixes for ${providerAsns.length} FNO ASN mappings...`,
  );

  let totalPrefixes = 0;

  for (const row of providerAsns) {
    console.log("");
    console.log(
      `${row.provider_name} - AS${row.asn}`,
    );

    console.log({
      verification_status:
        row.verification_status,
      monitoring_mode:
        row.monitoring_mode,
      incident_enabled:
        row.incident_enabled,
      label:
        row.label,
    });

    try {
      const prefixes = await discoverPrefixes(
        row.asn,
      );

      totalPrefixes += prefixes.length;

      if (prefixes.length === 0) {
        console.log(
          "No globally visible IPv4 prefixes discovered.",
        );

        continue;
      }

      console.table(
        prefixes.map((item) => ({
          prefix: item.prefix,
          first_seen:
            item.first_seen ?? "unknown",
          last_seen:
            item.last_seen ?? "currently visible",
        })),
      );

      console.log(
        `${prefixes.length} IPv4 prefixes discovered.`,
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? [
            error.response?.status
              ? `HTTP ${error.response.status}`
              : null,
            error.code || null,
            error.message || null,
          ]
            .filter(Boolean)
            .join(" - ")
        : error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `Prefix discovery failed for ${row.provider_name} AS${row.asn}: ${message}`,
      );
    }
  }

  console.log("");
  console.log(
    `Discovery complete: ${totalPrefixes} IPv4 prefixes found.`,
  );
}

discoverAll()
  .catch((error) => {
    console.error(
      "FNO prefix discovery failed:",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
