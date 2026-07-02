import { useEffect, useState } from "react";
import "./index.css";

type HealthStatus =
  | "valid"
  | "invalid"
  | "unknown";

type SourceHealthStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "unknown";

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

type ProviderSummary = {
  provider: string;
  provider_type: string;

  verification_status: VerificationStatus;
  monitoring_mode: MonitoringMode;
  incident_enabled: boolean;

  asn: number | null;
  asns: number[];

  prefix_count: number;
  valid_count: number;
  invalid_count: number;
  unknown_count: number;

  last_checked_at: string | null;
  overall_status: HealthStatus;
};

type Incident = {
  id: number;
  provider: string;
  provider_type: string;
  asn: number;
  prefix: string;
  status: "open" | "resolved";
  severity: "warning" | "major" | "critical";
  previous_status: HealthStatus | null;
  current_status: HealthStatus;
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number;
  summary: string;
};

type RecentCheck = {
  provider: string;
  provider_type: string;
  asn: number;
  prefix: string;
  bgp_status: HealthStatus | null;
  rpki_status: HealthStatus | null;
  overall_status: HealthStatus | null;
  observed_origin_asns: number[] | null;
  message: string | null;
  source_confidence:
    | "high"
    | "medium"
    | "low"
    | "unknown"
    | null;
  source_agreement:
    | "full"
    | "partial"
    | "conflict"
    | "unknown"
    | null;
  source_score: string | number | null;
  checked_at: string | null;
};

type SourceHealthItem = {
  source_name: string;
  status: SourceHealthStatus;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  response_time_ms: number | null;
  updated_at: string;
};

type SourceHealth = {
  overall_status: SourceHealthStatus;

  totals: {
    total: number;
    healthy: number;
    degraded: number;
    offline: number;
    unknown: number;
  };

  items: SourceHealthItem[];
};

type DashboardData = {
  generated_at: string;
  overall_status: HealthStatus;

  provider_totals: {
    total: number;
    valid: number;
    invalid: number;
    unknown: number;
  };

  source_health: SourceHealth;

  summary: ProviderSummary[];
  open_incidents: Incident[];
  recent_changes: unknown[];
  recent_checks: RecentCheck[];
};

function humaniseName(value: string): string {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function statusLabel(
  status:
    | HealthStatus
    | SourceHealthStatus
    | null
    | undefined,
): string {
  if (!status) {
    return "Unknown";
  }

  return (
    status.charAt(0).toUpperCase() +
    status.slice(1)
  );
}

function providerStatusClasses(
  status: HealthStatus | null | undefined,
): string {
  switch (status) {
    case "valid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "invalid":
      return "border-red-200 bg-red-50 text-red-700";

    case "unknown":
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function providerDotClasses(
  status: HealthStatus | null | undefined,
): string {
  switch (status) {
    case "valid":
      return "bg-emerald-500";

    case "invalid":
      return "bg-red-500";

    case "unknown":
    default:
      return "bg-amber-500";
  }
}

function sourceStatusClasses(
  status: SourceHealthStatus,
): string {
  switch (status) {
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-700";

    case "offline":
      return "border-red-200 bg-red-50 text-red-700";

    case "unknown":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function sourceDotClasses(
  status: SourceHealthStatus,
): string {
  switch (status) {
    case "healthy":
      return "bg-emerald-500";

    case "degraded":
      return "bg-amber-500";

    case "offline":
      return "bg-red-500";

    case "unknown":
    default:
      return "bg-slate-400";
  }
}

function verificationClasses(
  status: VerificationStatus,
): string {
  switch (status) {
    case "verified":
      return "border-cyan-800 bg-cyan-950/40 text-cyan-200";

    case "candidate":
      return "border-violet-800 bg-violet-950/40 text-violet-200";

    case "unsupported":
      return "border-slate-700 bg-slate-800 text-slate-300";

    case "rejected":
    default:
      return "border-red-900 bg-red-950/40 text-red-300";
  }
}

function monitoringModeLabel(
  mode: MonitoringMode,
): string {
  switch (mode) {
    case "full":
      return "Full monitoring";

    case "observation":
      return "Observation";

    case "probe_only":
      return "Probe only";

    case "disabled":
    default:
      return "Disabled";
  }
}

function formatAsns(
  asns: number[] | null | undefined,
): string {
  if (!asns || asns.length === 0) {
    return "Not mapped";
  }

  return asns
    .map((asn) => `AS${asn}`)
    .join(", ");
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function formatResponseTime(
  value: number | null,
): string {
  if (value === null) {
    return "Unknown";
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)} s`;
  }

  return `${value} ms`;
}

function StatusBadge({
  status,
}: {
  status: HealthStatus | null | undefined;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        providerStatusClasses(status),
      ].join(" ")}
    >
      <span
        className={[
          "h-2 w-2 rounded-full",
          providerDotClasses(status),
        ].join(" ")}
      />

      {statusLabel(status)}
    </span>
  );
}

function SourceStatusBadge({
  status,
}: {
  status: SourceHealthStatus;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        sourceStatusClasses(status),
      ].join(" ")}
    >
      <span
        className={[
          "h-2 w-2 rounded-full",
          sourceDotClasses(status),
        ].join(" ")}
      />

      {statusLabel(status)}
    </span>
  );
}

export default function App() {
  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    try {
      setErrorMessage(null);

      const response = await fetch(
        "/api/dashboard/bgp",
      );

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}`,
        );
      }

      const payload =
        (await response.json()) as DashboardData;

      setData(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();

    const timer = window.setInterval(
      () => {
        void loadDashboard();
      },
      60_000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            FibrePulse ZA
          </p>

          <h1 className="mt-4 text-3xl font-bold">
            Loading FibrePulse...
          </h1>

          <p className="mt-3 text-slate-400">
            Fetching BGP and monitoring-source
            health.
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-900 bg-red-950/40 p-8">
          <h1 className="text-3xl font-bold">
            Dashboard unavailable
          </h1>

          <p className="mt-4 text-red-200">
            {errorMessage ??
              "No dashboard data returned."}
          </p>

          <p className="mt-3 text-sm text-slate-400">
            Check that the API service is running
            on port 3030.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            FibrePulse ZA
          </p>

          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                BGP Routing Health
              </h1>

              <p className="mt-4 max-w-3xl text-slate-400">
                Provider-level routing visibility
                for monitored South African FNO
                prefixes, with monitoring-source
                availability tracked separately.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <StatusBadge
                status={data.overall_status}
              />

              <SourceStatusBadge
                status={
                  data.source_health.overall_status
                }
              />
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              Providers
            </p>

            <p className="mt-2 text-3xl font-bold">
              {data.provider_totals.total}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-900/70 bg-emerald-950/30 p-5">
            <p className="text-sm text-emerald-300">
              Valid
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-100">
              {data.provider_totals.valid}
            </p>
          </div>

          <div className="rounded-2xl border border-red-900/70 bg-red-950/30 p-5">
            <p className="text-sm text-red-300">
              Invalid
            </p>

            <p className="mt-2 text-3xl font-bold text-red-100">
              {data.provider_totals.invalid}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-900/70 bg-amber-950/30 p-5">
            <p className="text-sm text-amber-300">
              Unknown
            </p>

            <p className="mt-2 text-3xl font-bold text-amber-100">
              {data.provider_totals.unknown}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Monitoring Sources
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Health of the external services used
                to validate BGP and RPKI data.
              </p>
            </div>

            <SourceStatusBadge
              status={
                data.source_health.overall_status
              }
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.source_health.items.map(
              (source) => (
                <article
                  key={source.source_name}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-100">
                        {humaniseName(
                          source.source_name,
                        )}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {source.source_name}
                      </p>
                    </div>

                    <span
                      className={[
                        "mt-1 h-3 w-3 shrink-0 rounded-full",
                        sourceDotClasses(
                          source.status,
                        ),
                      ].join(" ")}
                    />
                  </div>

                  <div className="mt-5">
                    <SourceStatusBadge
                      status={source.status}
                    />
                  </div>

                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">
                        Average response
                      </dt>

                      <dd className="font-medium text-slate-200">
                        {formatResponseTime(
                          source.response_time_ms,
                        )}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">
                        Failures
                      </dt>

                      <dd className="font-medium text-slate-200">
                        {
                          source.consecutive_failures
                        }
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">
                        Last success
                      </dt>

                      <dd className="text-right text-slate-300">
                        {formatDate(
                          source.last_success_at,
                        )}
                      </dd>
                    </div>
                  </dl>

                  {source.last_error && (
                    <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-300">
                        Latest error
                      </p>

                      <p className="mt-1 break-words text-sm text-red-100">
                        {source.last_error}
                      </p>
                    </div>
                  )}
                </article>
              ),
            )}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <h2 className="text-2xl font-bold">
              Provider Summary
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Current monitoring status for all visible South African FNOs.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="px-4 py-3 font-medium">
                    Provider
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Verification
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Monitoring
                  </th>

                  <th className="px-4 py-3 font-medium">
                    ASN
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Status
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Prefixes
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Valid
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Invalid
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Unknown
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Last checked
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {data.summary.map((provider) => (
                  <tr
                    key={provider.provider}
                    className="text-slate-200"
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-semibold">
                      {provider.provider}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <span
                        className={[
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          verificationClasses(
                            provider.verification_status,
                          ),
                        ].join(" ")}
                      >
                        {statusLabel(
                          provider.verification_status,
                        )}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-slate-300">
                      {monitoringModeLabel(
                        provider.monitoring_mode,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-400">
                      {formatAsns(provider.asns)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge
                        status={provider.overall_status}
                      />
                    </td>

                    <td className="px-4 py-4">
                      {provider.prefix_count}
                    </td>

                    <td className="px-4 py-4 text-emerald-400">
                      {provider.valid_count}
                    </td>

                    <td className="px-4 py-4 text-red-400">
                      {provider.invalid_count}
                    </td>

                    <td className="px-4 py-4 text-amber-400">
                      {provider.unknown_count}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                      {provider.last_checked_at
                        ? formatDate(
                            provider.last_checked_at,
                          )
                        : "Not monitored yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">
            Open Incidents
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Active incidents detected from routing
            status changes.
          </p>

          {data.open_incidents.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-5 text-emerald-200">
              No open incidents. The routing table
              is behaving, which is suspicious but
              welcome.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {data.open_incidents.map(
                (incident) => (
                  <article
                    key={incident.id}
                    className="rounded-2xl border border-red-900/60 bg-red-950/20 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">
                        {incident.provider}{" "}
                        {incident.prefix}
                      </h3>

                      <span className="rounded-full border border-red-800 bg-red-950 px-3 py-1 text-xs font-semibold uppercase text-red-200">
                        {incident.severity}
                      </span>
                    </div>

                    <p className="mt-3 text-slate-300">
                      {incident.summary}
                    </p>

                    <p className="mt-3 text-sm text-slate-500">
                      Started{" "}
                      {formatDate(
                        incident.started_at,
                      )}
                    </p>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">
            Latest Prefix Checks
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Most recent check for each monitored
            prefix.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="px-4 py-3 font-medium">
                    Provider
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Prefix
                  </th>

                  <th className="px-4 py-3 font-medium">
                    BGP
                  </th>

                  <th className="px-4 py-3 font-medium">
                    RPKI
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Overall
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Confidence
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Observed ASN
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Checked
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {data.recent_checks.map(
                  (check) => (
                    <tr
                      key={`${check.provider}-${check.prefix}`}
                      className="text-slate-200"
                    >
                      <td className="whitespace-nowrap px-4 py-4 font-semibold">
                        {check.provider}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-300">
                        {check.prefix}
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge
                          status={
                            check.bgp_status
                          }
                        />
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge
                          status={
                            check.rpki_status
                          }
                        />
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge
                          status={
                            check.overall_status
                          }
                        />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-300">
                        {check.source_confidence
                          ? statusLabel(
                              check.source_confidence,
                            )
                          : "Unknown"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                        {check.observed_origin_asns?.join(
                          ", ",
                        ) ?? "None"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                        {formatDate(
                          check.checked_at,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">
            Recent Changes
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Status transitions across monitored
            prefixes.
          </p>

          {data.recent_changes.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 text-slate-300">
              No recent status changes. Repeatedly
              valid is the least dramatic outcome
              in networking.
            </div>
          ) : (
            <pre className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-5 text-xs text-slate-300">
              {JSON.stringify(
                data.recent_changes,
                null,
                2,
              )}
            </pre>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-slate-500">
          Generated {formatDate(data.generated_at)}
          {" · "}
          Auto-refreshes every 60 seconds
        </footer>
      </div>
    </main>
  );
}
