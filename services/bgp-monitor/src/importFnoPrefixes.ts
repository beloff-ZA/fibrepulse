import axios from "axios";
import ipaddr from "ipaddr.js";

import { config } from "@fibrepulse/config";
import { db } from "@fibrepulse/db";

type VerificationStatus =
  | "verified"
  | "candidate"
  | "rejected"
  | "unsupported";

type MonitoringMode =
  | "full"
  | "observation"
  | "probe_only"
  | "disabled";

type ProviderAsnRow = {
  provider_id: number;
  provider_name: string;
  verification_status: VerificationStatus;
  monitoring_mode: MonitoringMode;
  incident_enabled: boolean;
  provider_asn_id: number;
  asn: number;
};

type PrefixCandidate = {
  prefix: string;
  prefixLength: number;
};

type RipePrefixEntry = {
  prefix?: string;
};

function parseIpv4Prefix(
  prefix: string,
): PrefixCandidate | null {
  try {
    const [address, lengthText] =
      prefix.split("/");

    if (!address || !lengthText) {
      return null;
    }

    const parsed = ipaddr.parse(address);
    const prefixLength = Number(lengthText);

    if (
      parsed.kind() !== "ipv4" ||
      !Number.isInteger(prefixLength) ||
      prefixLength < 0 ||
      prefixLength > 32
    ) {
      return null;
    }

    if (parsed.range() !== "unicast") {
      return null;
    }

    return {
      prefix,
      prefixLength,
    };
  } catch {
    return null;
  }
}

function prefixContains(
  parent: PrefixCandidate,
  child: PrefixCandidate,
): boolean {
  try {
    const parentParsed =
      ipaddr.parseCIDR(parent.prefix);

    const childAddress =
      ipaddr.parse(
        child.prefix.split("/")[0] ?? "",
      );

    return childAddress.match(parentParsed);
  } catch {
    return false;
  }
}

function removeContainedPrefixes(
  prefixes: PrefixCandidate[],
): PrefixCandidate[] {
  const sorted = [...prefixes].sort(
    (a, b) =>
      a.prefixLength - b.prefixLength ||
      a.prefix.localeCompare(b.prefix),
  );

  const selected: PrefixCandidate[] = [];

  for (const candidate of sorted) {
    const alreadyCovered = selected.some(
      (parent) =>
        parent.prefixLength <=
          candidate.prefixLength &&
        prefixContains(parent, candidate),
    );

    if (!alreadyCovered) {
      selected.push(candidate);
    }
  }

  return selected;
}

function prefixLimit(
  row: ProviderAsnRow,
): number {
  if (
    row.verification_status === "verified" &&
    row.monitoring_mode === "full"
  ) {
    return 12;
  }

  if (
    row.monitoring_mode === "observation"
  ) {
    return 6;
  }

  return 0;
}

async function getProviderAsns(): Promise<
  ProviderAsnRow[]
> {
  const result =
    await db.query<ProviderAsnRow>(`
      select
        p.id as provider_id,
        p.name as provider_name,
        p.verification_status,
        p.monitoring_mode,
        p.incident_enabled,
        pa.id as provider_asn_id,
        pa.asn

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
): Promise<PrefixCandidate[]> {
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

  const prefixes = entries
    .map((entry) =>
      typeof entry.prefix === "string"
        ? parseIpv4Prefix(entry.prefix)
        : null,
    )
    .filter(
      (
        item,
      ): item is PrefixCandidate =>
        item !== null,
    );

  return removeContainedPrefixes(prefixes);
}

async function importPrefix(
  row: ProviderAsnRow,
  prefix: PrefixCandidate,
): Promise<void> {
  await db.query(
    `
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      monitor_enabled
    )
    values (
      $1,
      $2::cidr,
      $3,
      true
    )
    on conflict (
      provider_asn_id,
      prefix
    )
    do update set
      expected_origin_asn =
        excluded.expected_origin_asn,
      monitor_enabled = true
    `,
    [
      row.provider_asn_id,
      prefix.prefix,
      row.asn,
    ],
  );
}

async function importAll(): Promise<void> {
  const rows = await getProviderAsns();

  console.log(
    `Importing controlled prefixes for ${rows.length} FNO ASN mappings...`,
  );

  let importedTotal = 0;

  for (const row of rows) {
    const limit = prefixLimit(row);

    if (limit === 0) {
      console.log(
        `Skipping ${row.provider_name} AS${row.asn}: monitoring mode does not permit BGP checks.`,
      );

      continue;
    }

    console.log("");
    console.log(
      `${row.provider_name} - AS${row.asn}`,
    );

    try {
      const discovered =
        await discoverPrefixes(row.asn);

      const selected = discovered
        .sort(
          (a, b) =>
            a.prefixLength -
              b.prefixLength ||
            a.prefix.localeCompare(
              b.prefix,
            ),
        )
        .slice(0, limit);

      if (selected.length === 0) {
        console.log(
          "No suitable IPv4 prefixes found.",
        );

        continue;
      }

      await db.query("begin");

      try {
        for (const prefix of selected) {
          await importPrefix(
            row,
            prefix,
          );
        }

        await db.query("commit");
      } catch (error) {
        await db.query("rollback");
        throw error;
      }

      importedTotal += selected.length;

      console.table(
        selected.map((item) => ({
          prefix: item.prefix,
          prefix_length:
            item.prefixLength,
          mode: row.monitoring_mode,
          incidents:
            row.incident_enabled
              ? "enabled"
              : "disabled",
        })),
      );

      console.log(
        `${selected.length}/${discovered.length} aggregate prefixes imported.`,
      );
    } catch (error) {
      const message =
        axios.isAxiosError(error)
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
        `Import failed for ${row.provider_name} AS${row.asn}: ${message}`,
      );
    }
  }

  console.log("");
  console.log(
    `Controlled prefix import complete: ${importedTotal} prefixes enabled.`,
  );
}

importAll()
  .catch((error) => {
    console.error(
      "FNO prefix import failed:",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
