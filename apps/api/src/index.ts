import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "@fibrepulse/config";
import { query } from "@fibrepulse/db";
import type { LatestBgpStatus } from "@fibrepulse/types";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fibrepulse-api",
    time: new Date().toISOString(),
  });
});

app.get("/api/bgp/summary", async (_req, res, next) => {
  try {
    const items = await query(`
      select
        provider,
        provider_type,
        asn,

        count(*)::int as prefix_count,

        count(*) filter (
          where overall_status = 'valid'
        )::int as valid_count,

        count(*) filter (
          where overall_status = 'invalid'
        )::int as invalid_count,

        count(*) filter (
          where overall_status = 'unknown'
             or overall_status is null
        )::int as unknown_count,

        max(checked_at) as last_checked_at,

        case
          when count(*) filter (
            where overall_status = 'invalid'
          ) > 0 then 'invalid'

          when count(*) filter (
            where overall_status = 'unknown'
               or overall_status is null
          ) > 0 then 'unknown'

          else 'valid'
        end as overall_status

      from latest_bgp_status

      group by
        provider,
        provider_type,
        asn

      order by provider;
    `);

    res.json({
      generated_at: new Date().toISOString(),
      items,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bgp/status", async (_req, res, next) => {
  try {
    const items = await query<LatestBgpStatus>(`
      select *
      from latest_bgp_status
      order by provider, prefix
    `);

    res.json({
      generated_at: new Date().toISOString(),
      items,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/bgp/status/:provider",
  async (req, res, next) => {
    try {
      const items = await query<LatestBgpStatus>(
        `
        select *
        from latest_bgp_status
        where lower(provider) like lower($1)
        order by provider, prefix
        `,
        [`%${req.params.provider}%`],
      );

      res.json({
        generated_at: new Date().toISOString(),
        provider_search: req.params.provider,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/bgp/history", async (req, res, next) => {
  try {
    const limit = Math.min(
      Number(req.query.limit ?? 100),
      500,
    );

    const items = await query(
      `
      select
        p.name as provider,
        p.provider_type,
        pa.asn,
        mp.prefix::text as prefix,
        bc.bgp_status,
        bc.rpki_status,
        bc.overall_status,
        bc.observed_origin_asns,
        bc.message,
        bc.source_confidence,
        bc.source_agreement,
        bc.source_score,
        bc.checked_at

      from bgp_checks bc

      join monitored_prefixes mp
        on mp.id = bc.monitored_prefix_id

      join provider_asns pa
        on pa.id = mp.provider_asn_id

      join providers p
        on p.id = pa.provider_id

      order by bc.checked_at desc

      limit $1
      `,
      [limit],
    );

    res.json({
      generated_at: new Date().toISOString(),
      limit,
      items,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/bgp/history/:provider",
  async (req, res, next) => {
    try {
      const limit = Math.min(
        Number(req.query.limit ?? 100),
        500,
      );

      const items = await query(
        `
        select
          p.name as provider,
          p.provider_type,
          pa.asn,
          mp.prefix::text as prefix,
          bc.bgp_status,
          bc.rpki_status,
          bc.overall_status,
          bc.observed_origin_asns,
          bc.message,
          bc.source_confidence,
          bc.source_agreement,
          bc.source_score,
          bc.checked_at

        from bgp_checks bc

        join monitored_prefixes mp
          on mp.id = bc.monitored_prefix_id

        join provider_asns pa
          on pa.id = mp.provider_asn_id

        join providers p
          on p.id = pa.provider_id

        where lower(p.name) like lower($1)

        order by bc.checked_at desc

        limit $2
        `,
        [
          `%${req.params.provider}%`,
          limit,
        ],
      );

      res.json({
        generated_at: new Date().toISOString(),
        provider_search: req.params.provider,
        limit,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/bgp/history/:provider/prefix",
  async (req, res, next) => {
    try {
      const prefix = String(
        req.query.prefix ?? "",
      );

      const limit = Math.min(
        Number(req.query.limit ?? 100),
        500,
      );

      if (!prefix) {
        return res.status(400).json({
          error: "missing_prefix",
          message:
            "Please provide a prefix query parameter, for example ?prefix=102.220.176.0/22",
        });
      }

      const items = await query(
        `
        select
          p.name as provider,
          p.provider_type,
          pa.asn,
          mp.prefix::text as prefix,
          bc.bgp_status,
          bc.rpki_status,
          bc.overall_status,
          bc.observed_origin_asns,
          bc.message,
          bc.source_confidence,
          bc.source_agreement,
          bc.source_score,
          bc.checked_at

        from bgp_checks bc

        join monitored_prefixes mp
          on mp.id = bc.monitored_prefix_id

        join provider_asns pa
          on pa.id = mp.provider_asn_id

        join providers p
          on p.id = pa.provider_id

        where lower(p.name) like lower($1)
          and mp.prefix = $2::cidr

        order by bc.checked_at desc

        limit $3
        `,
        [
          `%${req.params.provider}%`,
          prefix,
          limit,
        ],
      );

      res.json({
        generated_at: new Date().toISOString(),
        provider_search: req.params.provider,
        prefix,
        limit,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/bgp/changes", async (req, res, next) => {
  try {
    const limit = Math.min(
      Number(req.query.limit ?? 100),
      500,
    );

    const items = await query(
      `
      with ordered_checks as (
        select
          p.name as provider,
          p.provider_type,
          pa.asn,
          mp.prefix::text as prefix,
          bc.bgp_status,
          bc.rpki_status,
          bc.overall_status,
          bc.observed_origin_asns,
          bc.message,
          bc.source_confidence,
          bc.source_agreement,
          bc.source_score,
          bc.checked_at,

          lag(bc.overall_status) over (
            partition by bc.monitored_prefix_id
            order by bc.checked_at
          ) as previous_overall_status,

          lag(bc.bgp_status) over (
            partition by bc.monitored_prefix_id
            order by bc.checked_at
          ) as previous_bgp_status,

          lag(bc.rpki_status) over (
            partition by bc.monitored_prefix_id
            order by bc.checked_at
          ) as previous_rpki_status

        from bgp_checks bc

        join monitored_prefixes mp
          on mp.id = bc.monitored_prefix_id

        join provider_asns pa
          on pa.id = mp.provider_asn_id

        join providers p
          on p.id = pa.provider_id
      )

      select *
      from ordered_checks

      where previous_overall_status is not null
        and overall_status is distinct from previous_overall_status

      order by checked_at desc

      limit $1
      `,
      [limit],
    );

    res.json({
      generated_at: new Date().toISOString(),
      limit,
      items,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/bgp/changes/:provider",
  async (req, res, next) => {
    try {
      const limit = Math.min(
        Number(req.query.limit ?? 100),
        500,
      );

      const items = await query(
        `
        with ordered_checks as (
          select
            p.name as provider,
            p.provider_type,
            pa.asn,
            mp.prefix::text as prefix,
            bc.bgp_status,
            bc.rpki_status,
            bc.overall_status,
            bc.observed_origin_asns,
            bc.message,
            bc.source_confidence,
            bc.source_agreement,
            bc.source_score,
            bc.checked_at,

            lag(bc.overall_status) over (
              partition by bc.monitored_prefix_id
              order by bc.checked_at
            ) as previous_overall_status,

            lag(bc.bgp_status) over (
              partition by bc.monitored_prefix_id
              order by bc.checked_at
            ) as previous_bgp_status,

            lag(bc.rpki_status) over (
              partition by bc.monitored_prefix_id
              order by bc.checked_at
            ) as previous_rpki_status

          from bgp_checks bc

          join monitored_prefixes mp
            on mp.id = bc.monitored_prefix_id

          join provider_asns pa
            on pa.id = mp.provider_asn_id

          join providers p
            on p.id = pa.provider_id
        )

        select *
        from ordered_checks

        where previous_overall_status is not null
          and overall_status is distinct from previous_overall_status
          and lower(provider) like lower($1)

        order by checked_at desc

        limit $2
        `,
        [
          `%${req.params.provider}%`,
          limit,
        ],
      );

      res.json({
        generated_at: new Date().toISOString(),
        provider_search: req.params.provider,
        limit,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/bgp/incidents",
  async (req, res, next) => {
    try {
      const limit = Math.min(
        Number(req.query.limit ?? 100),
        500,
      );

      const items = await query(
        `
        select *
        from latest_bgp_incidents
        order by started_at desc
        limit $1
        `,
        [limit],
      );

      res.json({
        generated_at: new Date().toISOString(),
        limit,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/bgp/incidents/open",
  async (_req, res, next) => {
    try {
      const items = await query(`
        select *
        from latest_bgp_incidents
        where status = 'open'
        order by started_at desc
      `);

      res.json({
        generated_at: new Date().toISOString(),
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/bgp/incidents/:provider",
  async (req, res, next) => {
    try {
      const limit = Math.min(
        Number(req.query.limit ?? 100),
        500,
      );

      const items = await query(
        `
        select *
        from latest_bgp_incidents
        where lower(provider) like lower($1)
        order by started_at desc
        limit $2
        `,
        [
          `%${req.params.provider}%`,
          limit,
        ],
      );

      res.json({
        generated_at: new Date().toISOString(),
        provider_search: req.params.provider,
        limit,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/sources/health",
  async (_req, res, next) => {
    try {
      const items = await query<{
        source_name: string;
        status:
          | "healthy"
          | "degraded"
          | "offline"
          | "unknown";
        last_success_at: string | null;
        last_failure_at: string | null;
        consecutive_failures: number;
        last_error: string | null;
        response_time_ms: number | null;
        updated_at: string;
      }>(`
        select
          source_name,
          status,
          last_success_at,
          last_failure_at,
          consecutive_failures,
          last_error,
          response_time_ms,
          updated_at

        from source_health

        order by source_name
      `);

      const summary = {
        total: items.length,

        healthy: items.filter(
          (item) => item.status === "healthy",
        ).length,

        degraded: items.filter(
          (item) => item.status === "degraded",
        ).length,

        offline: items.filter(
          (item) => item.status === "offline",
        ).length,

        unknown: items.filter(
          (item) => item.status === "unknown",
        ).length,
      };

      const overallStatus =
        summary.offline > 0
          ? "offline"
          : summary.degraded > 0 ||
              summary.unknown > 0
            ? "degraded"
            : summary.total > 0
              ? "healthy"
              : "unknown";

      res.json({
        generated_at: new Date().toISOString(),
        overall_status: overallStatus,
        summary,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/dashboard/bgp",
  async (_req, res, next) => {
    try {
      const summary = await query<{
        provider: string;
        provider_type: string;
        asn: number;
        prefix_count: number;
        valid_count: number;
        invalid_count: number;
        unknown_count: number;
        last_checked_at: string | null;
        overall_status:
          | "valid"
          | "invalid"
          | "unknown";
      }>(`
        select
          provider,
          provider_type,
          asn,

          count(*)::int as prefix_count,

          count(*) filter (
            where overall_status = 'valid'
          )::int as valid_count,

          count(*) filter (
            where overall_status = 'invalid'
          )::int as invalid_count,

          count(*) filter (
            where overall_status = 'unknown'
               or overall_status is null
          )::int as unknown_count,

          max(checked_at) as last_checked_at,

          case
            when count(*) filter (
              where overall_status = 'invalid'
            ) > 0 then 'invalid'

            when count(*) filter (
              where overall_status = 'unknown'
                 or overall_status is null
            ) > 0 then 'unknown'

            else 'valid'
          end as overall_status

        from latest_bgp_status

        group by
          provider,
          provider_type,
          asn

        order by provider;
      `);

      const openIncidents = await query(`
        select *
        from latest_bgp_incidents
        where status = 'open'
        order by started_at desc
        limit 20;
      `);

      const recentChanges = await query(`
        with ordered_checks as (
          select
            p.name as provider,
            p.provider_type,
            pa.asn,
            mp.prefix::text as prefix,
            bc.bgp_status,
            bc.rpki_status,
            bc.overall_status,
            bc.observed_origin_asns,
            bc.message,
            bc.source_confidence,
            bc.source_agreement,
            bc.source_score,
            bc.checked_at,

            lag(bc.overall_status) over (
              partition by bc.monitored_prefix_id
              order by bc.checked_at
            ) as previous_overall_status,

            lag(bc.bgp_status) over (
              partition by bc.monitored_prefix_id
              order by bc.checked_at
            ) as previous_bgp_status,

            lag(bc.rpki_status) over (
              partition by bc.monitored_prefix_id
              order by bc.checked_at
            ) as previous_rpki_status

          from bgp_checks bc

          join monitored_prefixes mp
            on mp.id = bc.monitored_prefix_id

          join provider_asns pa
            on pa.id = mp.provider_asn_id

          join providers p
            on p.id = pa.provider_id
        )

        select *
        from ordered_checks

        where previous_overall_status is not null
          and overall_status is distinct from previous_overall_status

        order by checked_at desc

        limit 20;
      `);

      const recentChecks = await query(`
        select
          provider,
          provider_type,
          asn,
          prefix,
          bgp_status,
          rpki_status,
          overall_status,
          observed_origin_asns,
          message,
          source_confidence,
          source_agreement,
          source_score,
          checked_at

        from latest_bgp_status

        order by
          checked_at desc nulls last,
          provider,
          prefix

        limit 50;
      `);

      const sourceHealth = await query<{
        source_name: string;
        status:
          | "healthy"
          | "degraded"
          | "offline"
          | "unknown";
        last_success_at: string | null;
        last_failure_at: string | null;
        consecutive_failures: number;
        last_error: string | null;
        response_time_ms: number | null;
        updated_at: string;
      }>(`
        select
          source_name,
          status,
          last_success_at,
          last_failure_at,
          consecutive_failures,
          last_error,
          response_time_ms,
          updated_at

        from source_health

        order by source_name;
      `);

      const providerTotals = {
        total: summary.length,

        valid: summary.filter(
          (item) =>
            item.overall_status === "valid",
        ).length,

        invalid: summary.filter(
          (item) =>
            item.overall_status === "invalid",
        ).length,

        unknown: summary.filter(
          (item) =>
            item.overall_status === "unknown",
        ).length,
      };

      const overallStatus =
        providerTotals.invalid > 0
          ? "invalid"
          : providerTotals.unknown > 0
            ? "unknown"
            : providerTotals.total > 0
              ? "valid"
              : "unknown";

      const sourceTotals = {
        total: sourceHealth.length,

        healthy: sourceHealth.filter(
          (item) =>
            item.status === "healthy",
        ).length,

        degraded: sourceHealth.filter(
          (item) =>
            item.status === "degraded",
        ).length,

        offline: sourceHealth.filter(
          (item) =>
            item.status === "offline",
        ).length,

        unknown: sourceHealth.filter(
          (item) =>
            item.status === "unknown",
        ).length,
      };

      const sourceOverallStatus =
        sourceTotals.offline > 0
          ? "offline"
          : sourceTotals.degraded > 0 ||
              sourceTotals.unknown > 0
            ? "degraded"
            : sourceTotals.total > 0
              ? "healthy"
              : "unknown";

      res.json({
        generated_at: new Date().toISOString(),

        overall_status: overallStatus,

        provider_totals: providerTotals,

        source_health: {
          overall_status:
            sourceOverallStatus,

          totals:
            sourceTotals,

          items:
            sourceHealth,
        },

        summary,

        open_incidents:
          openIncidents,

        recent_changes:
          recentChanges,

        recent_checks:
          recentChecks,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/dashboard", async (_req, res) => {
  res.json({
    service: "FibrePulse",

    available_dashboards: [
      {
        name: "BGP Dashboard",
        endpoint: "/api/dashboard/bgp",
      },
    ],

    generated_at: new Date().toISOString(),
  });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);

    res.status(500).json({
      error: "internal_server_error",

      message:
        err instanceof Error
          ? err.message
          : "Unknown API error",
    });
  },
);

app.listen(config.API_PORT, () => {
  console.log(
    `FibrePulse API listening on port ${config.API_PORT}`,
  );
});
