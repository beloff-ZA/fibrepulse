import { Router } from "express";
import { query } from "@fibrepulse/db";

const router = Router();

router.get("/routing/fnos", async (_req, res, next) => {
  try {
    const items = await query(`
      with latest as (
        select
          p.id as fno_id,
          p.name as fno_name,
          mp.prefix::text as prefix,
          c.bgp_status,
          c.rpki_status,
          c.overall_status,
          c.source_score,
          c.checked_at
        from monitored_prefixes mp
        join provider_asns pa on pa.id = mp.provider_asn_id
        join providers p on p.id = pa.provider_id
        join lateral (
          select
            bc.bgp_status,
            bc.rpki_status,
            bc.overall_status,
            bc.source_score,
            bc.checked_at
          from bgp_checks bc
          where bc.monitored_prefix_id = mp.id
          order by bc.checked_at desc
          limit 1
        ) c on true
        where p.provider_type = 'FNO'
          and p.display_enabled = true
          and mp.monitor_enabled = true
      )
      select
        fno_id,
        fno_name,
        count(*)::int as prefix_count,
        count(*) filter (where bgp_status = 'valid')::int as bgp_valid_count,
        count(*) filter (where bgp_status = 'invalid')::int as bgp_invalid_count,
        count(*) filter (where bgp_status = 'unknown' or bgp_status is null)::int as bgp_unknown_count,
        count(*) filter (where rpki_status = 'valid')::int as rpki_valid_count,
        count(*) filter (where rpki_status = 'invalid')::int as rpki_invalid_count,
        count(*) filter (where rpki_status = 'unknown' or rpki_status is null)::int as rpki_unknown_count,
        count(*) filter (where overall_status = 'valid')::int as overall_valid_count,
        count(*) filter (where overall_status = 'invalid')::int as overall_invalid_count,
        count(*) filter (where overall_status = 'unknown' or overall_status is null)::int as overall_unknown_count,
        case
          when count(*) filter (where overall_status = 'invalid') > 0 then 'invalid'
          when count(*) filter (where overall_status = 'unknown' or overall_status is null) > 0 then 'unknown'
          else 'valid'
        end as routing_status,
        max(checked_at) as latest_observed_at,
        round(avg(source_score)::numeric, 4) as average_source_score
      from latest
      group by fno_id, fno_name
      order by fno_name;
    `);

    res.json({
      generated_at: new Date().toISOString(),
      meaning: "Current BGP and RPKI routing observations; not proof of last-mile availability.",
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/routing/prefixes", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 1000);
    const items = await query(
      `
        select
          p.id as fno_id,
          p.name as fno_name,
          mp.prefix::text as prefix,
          mp.expected_origin_asn,
          c.observed_origin_asns,
          c.bgp_status,
          c.rpki_status,
          c.overall_status,
          c.source_confidence,
          c.source_agreement,
          c.source_score,
          c.message,
          c.checked_at
        from monitored_prefixes mp
        join provider_asns pa on pa.id = mp.provider_asn_id
        join providers p on p.id = pa.provider_id
        join lateral (
          select
            bc.observed_origin_asns,
            bc.bgp_status,
            bc.rpki_status,
            bc.overall_status,
            bc.source_confidence,
            bc.source_agreement,
            bc.source_score,
            bc.message,
            bc.checked_at
          from bgp_checks bc
          where bc.monitored_prefix_id = mp.id
          order by bc.checked_at desc
          limit 1
        ) c on true
        where p.provider_type = 'FNO'
          and p.display_enabled = true
          and mp.monitor_enabled = true
        order by p.name, mp.prefix
        limit $1;
      `,
      [limit],
    );

    res.json({
      generated_at: new Date().toISOString(),
      meaning: "Prefix-level routing and RPKI observations only.",
      limit,
      items,
    });
  } catch (error) {
    next(error);
  }
});

export { router as routingRouter };
