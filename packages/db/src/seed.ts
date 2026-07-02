import { db } from "./index.js";

async function seed() {
  console.log("Seeding providers and monitored prefixes...");

  await db.query(`
    insert into providers (name, provider_type)
    values
      ('Vumatel', 'FNO'),
      ('Frogfoot', 'FNO'),
      ('MetroFibre', 'FNO'),
      ('Openserve / Telkom SA', 'FNO')
    on conflict (name) do nothing;
  `);

  await db.query(`
    insert into provider_asns (provider_id, asn, label)
    select id, 328829, 'Vumatel'
    from providers where name = 'Vumatel'
    on conflict do nothing;
  `);

  await db.query(`
    insert into provider_asns (provider_id, asn, label)
    select id, 22355, 'Frogfoot'
    from providers where name = 'Frogfoot'
    on conflict do nothing;
  `);

  await db.query(`
    insert into provider_asns (provider_id, asn, label)
    select id, 327782, 'MetroFibre'
    from providers where name = 'MetroFibre'
    on conflict do nothing;
  `);

  await db.query(`
    insert into provider_asns (provider_id, asn, label)
    select id, 5713, 'Openserve / Telkom SA'
    from providers where name = 'Openserve / Telkom SA'
    on conflict do nothing;
  `);

  await db.query(`
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      description
    )
    select id, '102.220.176.0/22', 328829, 'Vumatel aggregate'
    from provider_asns where asn = 328829
    on conflict do nothing;
  `);

  await db.query(`
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      description
    )
    select id, '41.85.0.0/17', 22355, 'Frogfoot aggregate'
    from provider_asns where asn = 22355
    on conflict do nothing;
  `);

  await db.query(`
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      description
    )
    select id, '41.206.192.0/19', 22355, 'Frogfoot aggregate'
    from provider_asns where asn = 22355
    on conflict do nothing;
  `);

  await db.query(`
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      description
    )
    select id, '196.1.56.0/21', 22355, 'Frogfoot aggregate'
    from provider_asns where asn = 22355
    on conflict do nothing;
  `);

  await db.query(`
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      description
    )
    select id, '102.32.0.0/15', 327782, 'MetroFibre aggregate'
    from provider_asns where asn = 327782
    on conflict do nothing;
  `);

  await db.query(`
    insert into monitored_prefixes (
      provider_asn_id,
      prefix,
      expected_origin_asn,
      description
    )
    select id, '196.50.192.0/18', 327782, 'MetroFibre aggregate'
    from provider_asns where asn = 327782
    on conflict do nothing;
  `);

  console.log("Seed complete.");
  await db.end();
}

seed().catch(async (error) => {
  console.error("Seed failed:", error);
  await db.end();
  process.exit(1);
});
