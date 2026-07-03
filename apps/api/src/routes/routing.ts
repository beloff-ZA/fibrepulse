import { Router } from "express";
import { query } from "@fibrepulse/db";

const router = Router();
const STALE_MINUTES = Math.max(Number(process.env.ROUTING_STALE_MINUTES ?? 30), 5);

function id(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const latestRoutingCte = `
  with latest as (
    select
      p.id as fno_id,
      p.name as fno_name,
      mp.id as monitored_prefix_id,
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
      c.checked_at,
      case
        when c.checked_at >= now() - ($1::int * interval '1 minute') then 'fresh'
        else 'stale'
      end as freshness
    from monitored_prefixes mp
    join provider_asns pa on pa.id = mp.provider_asn_id
    join providers p on p.id = pa.provider_id
    left join lateral (
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
  )
`;

router.get("/routing/fnos", async (_req, res, next) => {
  try {
    const items = await query(`${latestRoutingCte}
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
        count(*) filter (where freshness = 'fresh')::int as fresh_prefix_count,
        count(*) filter (where freshness = 'stale')::int as stale_prefix_count,
        count(*) filter (where checked_at is null)::int as never_checked_count,
        case
          when count(*) filter (where checked_at is null) = count(*) then 'not_monitored'
          when count(*) filter (where freshness = 'stale') > 0 then 'stale'
          when count(*) filter (where overall_status = 'invalid') > 0 then 'invalid'
          when count(*) filter (where overall_status = 'unknown' or overall_status is null) > 0 then 'unknown'
          else 'valid'
        end as routing_status,
        max(checked_at) as latest_observed_at,
        round(avg(source_score)::numeric, 4) as average_source_score
      from latest
      group by fno_id, fno_name
      order by fno_name;
    `, [STALE_MINUTES]);

    res.json({ generated_at: new Date().toISOString(), stale_after_minutes: STALE_MINUTES, items });
  } catch (error) { next(error); }
});

router.get("/routing/prefixes", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 1000);
    const items = await query(`${latestRoutingCte}
      select * from latest
      order by fno_name, prefix
      limit $2;
    `, [STALE_MINUTES, limit]);
    res.json({ generated_at: new Date().toISOString(), stale_after_minutes: STALE_MINUTES, items });
  } catch (error) { next(error); }
});

router.get("/routing/fnos/:fnoId", async (req, res, next) => {
  try {
    const fnoId = id(req.params.fnoId);
    if (!fnoId) return res.status(400).json({ error: "invalid_fno_id" });

    const [providerRows, prefixes, incidents, history] = await Promise.all([
      query(`select id, name, verification_status, monitoring_mode from providers where id = $1 and provider_type = 'FNO'`, [fnoId]),
      query(`${latestRoutingCte} select * from latest where fno_id = $2 order by prefix`, [STALE_MINUTES, fnoId]),
      query(`
        select bi.id, bi.status, bi.severity, bi.previous_status, bi.current_status,
               bi.started_at, bi.resolved_at, bi.summary, mp.prefix::text as prefix
        from bgp_incidents bi
        join monitored_prefixes mp on mp.id = bi.monitored_prefix_id
        join provider_asns pa on pa.id = mp.provider_asn_id
        where pa.provider_id = $1
        order by bi.started_at desc
        limit 50
      `, [fnoId]),
      query(`
        select bc.checked_at, bc.bgp_status, bc.rpki_status, bc.overall_status,
               bc.source_score, mp.prefix::text as prefix
        from bgp_checks bc
        join monitored_prefixes mp on mp.id = bc.monitored_prefix_id
        join provider_asns pa on pa.id = mp.provider_asn_id
        where pa.provider_id = $1
          and bc.checked_at >= now() - interval '7 days'
        order by bc.checked_at desc
        limit 500
      `, [fnoId]),
    ]);

    if (!providerRows[0]) return res.status(404).json({ error: "fno_not_found" });
    res.json({
      generated_at: new Date().toISOString(),
      stale_after_minutes: STALE_MINUTES,
      provider: providerRows[0],
      prefixes,
      incidents,
      history,
    });
  } catch (error) { next(error); }
});

router.get("/routing/collector", async (_req, res, next) => {
  try {
    const rows = await query(`
      select
        count(*)::int as monitored_prefixes,
        count(*) filter (where latest.checked_at is not null)::int as checked_prefixes,
        count(*) filter (where latest.checked_at >= now() - ($1::int * interval '1 minute'))::int as fresh_prefixes,
        count(*) filter (where latest.checked_at < now() - ($1::int * interval '1 minute'))::int as stale_prefixes,
        max(latest.checked_at) as last_check_at
      from monitored_prefixes mp
      left join lateral (
        select checked_at from bgp_checks bc
        where bc.monitored_prefix_id = mp.id
        order by checked_at desc limit 1
      ) latest on true
      where mp.monitor_enabled = true;
    `, [STALE_MINUTES]);
    res.json({ generated_at: new Date().toISOString(), stale_after_minutes: STALE_MINUTES, ...rows[0] });
  } catch (error) { next(error); }
});

export { router as routingRouter };
