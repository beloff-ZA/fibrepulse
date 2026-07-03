import { db } from "./index.js";

const provinces = [
  ["EC", "Eastern Cape"],
  ["FS", "Free State"],
  ["GP", "Gauteng"],
  ["KZN", "KwaZulu-Natal"],
  ["LP", "Limpopo"],
  ["MP", "Mpumalanga"],
  ["NC", "Northern Cape"],
  ["NW", "North West"],
  ["WC", "Western Cape"],
] as const;

async function seedTopology(): Promise<void> {
  console.log("Seeding topology roots...");
  await db.query("begin");

  try {
    const countryResult = await db.query<{ id: string }>(`
      insert into locations (
        parent_location_id,
        location_type,
        name,
        canonical_name,
        country_code,
        verification_status,
        source_metadata
      ) values (
        null,
        'country',
        'South Africa',
        'south-africa',
        'ZA',
        'verified',
        '{"source":"ISO 3166","seeded_by":"fibrepulse"}'::jsonb
      )
      on conflict (location_type, canonical_name, country_code)
        where parent_location_id is null
      do update set
        name = excluded.name,
        verification_status = 'verified',
        updated_at = now()
      returning id;
    `);

    const countryId = Number(countryResult.rows[0]?.id);

    if (!countryId) {
      throw new Error("Could not resolve South Africa location id");
    }

    for (const [provinceCode, provinceName] of provinces) {
      const canonicalName = provinceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await db.query(
        `
          insert into locations (
            parent_location_id,
            location_type,
            name,
            canonical_name,
            country_code,
            province_code,
            verification_status,
            source_metadata
          ) values (
            $1,
            'province',
            $2,
            $3,
            'ZA',
            $4,
            'verified',
            jsonb_build_object(
              'source', 'South African provincial structure',
              'seeded_by', 'fibrepulse'
            )
          )
          on conflict (
            parent_location_id,
            location_type,
            canonical_name
          ) do update set
            name = excluded.name,
            province_code = excluded.province_code,
            verification_status = 'verified',
            updated_at = now();
        `,
        [countryId, provinceName, canonicalName, provinceCode],
      );
    }

    await db.query("commit");
    console.log("Topology roots seeded.");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

seedTopology().catch((error) => {
  console.error("Topology seed failed:", error);
  process.exit(1);
});
