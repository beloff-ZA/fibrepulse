import { db } from "@fibrepulse/db";

import {
  southAfricanFnoRegistry,
  type FnoRegistryEntry,
} from "./fnoRegistry.js";

type ProviderRow = {
  id: number;
  name: string;
};

async function upsertProvider(
  entry: FnoRegistryEntry,
): Promise<ProviderRow> {
  const result = await db.query<ProviderRow>(
    `
    insert into providers (
      name,
      provider_type,
      country,
      verification_status,
      monitoring_mode,
      display_enabled,
      incident_enabled,
      website_url,
      status_page_url,
      notes,
      updated_at
    )
    values (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      now()
    )
    on conflict (name)
    do update set
      provider_type = excluded.provider_type,
      country = excluded.country,
      verification_status =
        excluded.verification_status,
      monitoring_mode =
        excluded.monitoring_mode,
      display_enabled =
        excluded.display_enabled,
      incident_enabled =
        excluded.incident_enabled,
      website_url =
        excluded.website_url,
      status_page_url =
        excluded.status_page_url,
      notes =
        excluded.notes,
      updated_at = now()
    returning
      id,
      name
    `,
    [
      entry.name,
      entry.providerType,
      entry.country,
      entry.verificationStatus,
      entry.monitoringMode,
      entry.displayEnabled,
      entry.incidentEnabled,
      entry.websiteUrl,
      entry.statusPageUrl,
      entry.notes,
    ],
  );

  const provider = result.rows[0];

  if (!provider) {
    throw new Error(
      `Provider upsert returned no row for ${entry.name}`,
    );
  }

  return provider;
}

async function upsertProviderAsns(
  providerId: number,
  entry: FnoRegistryEntry,
): Promise<number> {
  let imported = 0;

  for (const asnEntry of entry.asns) {
    if (!asnEntry.enabled) {
      continue;
    }

    await db.query(
      `
      insert into provider_asns (
        provider_id,
        asn,
        label
      )
      values (
        $1,
        $2,
        $3
      )
      on conflict (
        provider_id,
        asn
      )
      do update set
        label = excluded.label
      `,
      [
        providerId,
        asnEntry.asn,
        asnEntry.label,
      ],
    );

    imported += 1;
  }

  return imported;
}

async function importRegistry(): Promise<void> {
  console.log(
    `Importing ${southAfricanFnoRegistry.length} FNO registry entries...`,
  );

  await db.query("begin");

  try {
    let providerCount = 0;
    let asnCount = 0;

    for (const entry of southAfricanFnoRegistry) {
      const provider = await upsertProvider(entry);

      const importedAsns =
        await upsertProviderAsns(
          provider.id,
          entry,
        );

      providerCount += 1;
      asnCount += importedAsns;

      console.log({
        provider: provider.name,
        verification_status:
          entry.verificationStatus,
        monitoring_mode:
          entry.monitoringMode,
        incident_enabled:
          entry.incidentEnabled,
        imported_asns:
          importedAsns,
      });
    }

    await db.query("commit");

    console.log(
      `Registry import complete: ${providerCount} providers, ${asnCount} ASN mappings.`,
    );
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

importRegistry()
  .catch((error) => {
    console.error(
      "FNO registry import failed:",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
