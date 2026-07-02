import { useEffect, useState } from "react";
import "./index.css";

type HealthStatus = "valid" | "invalid" | "unknown";

type ProviderSummary = {
  provider: string;
  provider_type: string;
  asn: number;
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
  checked_at: string | null;
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
  summary: ProviderSummary[];
  open_incidents: Incident[];
  recent_changes: unknown[];
  recent_checks: RecentCheck[];
};

function statusLabel(status: HealthStatus | null | undefined) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status: HealthStatus | null | undefined) {
  switch (status) {
    case "valid":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "invalid":
      return "bg-red-50 text-red-700 border-red-200";
    case "unknown":
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function dotClasses(status: HealthStatus | null | undefined) {
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

function formatDate(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: HealthStatus | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${statusClasses(
        status,
      )}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotClasses(status)}`} />
      {statusLabel(status)}
    </span>
  );
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadDashboard() {
    try {
      setErrorMessage(null);

      const response = await fetch("/api/dashboard/bgp");

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const payload = (await response.json()) as DashboardData;
      setData(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    const timer = window.setInterval(loadDashboard, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <p className="text-lg font-semibold text-slate-950">
            Loading FibrePulse...
          </p>
          <p className="mt-2 text-slate-500">Fetching BGP status data.</p>
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-red-50 p-8 text-red-800 shadow-sm">
          <h1 className="text-2xl font-bold">Dashboard unavailable</h1>
          <p className="mt-3">{errorMessage}</p>
          <p className="mt-3 text-sm">
            Check that the API service is running on port 3030. The dashboard is
            not psychic, despite what every user secretly expects.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              FibrePulse ZA
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950">
              BGP Routing Health
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Provider-level routing visibility for monitored South African FNO
              prefixes. This is core routing health, not suburb-level fibre
              outage detection. Tiny distinction, massive difference.
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Overall status</p>
            <div className="mt-2">
              <StatusBadge status={data.overall_status} />
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Providers</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {data.provider_totals.total}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Valid</p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {data.provider_totals.valid}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Invalid</p>
            <p className="mt-2 text-3xl font-bold text-red-700">
              {data.provider_totals.invalid}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Unknown</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {data.provider_totals.unknown}
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold text-slate-950">
              Provider Summary
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest provider-level status across monitored prefixes.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Provider</th>
                  <th className="px-5 py-3 font-semibold">ASN</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Prefixes</th>
                  <th className="px-5 py-3 font-semibold">Valid</th>
                  <th className="px-5 py-3 font-semibold">Invalid</th>
                  <th className="px-5 py-3 font-semibold">Unknown</th>
                  <th className="px-5 py-3 font-semibold">Last checked</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.summary.map((provider) => (
                  <tr key={`${provider.provider}-${provider.asn}`}>
                    <td className="px-5 py-4 font-medium text-slate-950">
                      {provider.provider}
                    </td>
                    <td className="px-5 py-4">AS{provider.asn}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={provider.overall_status} />
                    </td>
                    <td className="px-5 py-4">{provider.prefix_count}</td>
                    <td className="px-5 py-4 text-emerald-700">
                      {provider.valid_count}
                    </td>
                    <td className="px-5 py-4 text-red-700">
                      {provider.invalid_count}
                    </td>
                    <td className="px-5 py-4 text-amber-700">
                      {provider.unknown_count}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(provider.last_checked_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-5">
              <h2 className="text-xl font-bold text-slate-950">
                Open Incidents
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Active BGP incidents detected by status changes.
              </p>
            </div>

            <div className="p-5">
              {data.open_incidents.length === 0 ? (
                <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  No open incidents. The routing table is behaving, which is
                  suspicious but welcome.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.open_incidents.map((incident) => (
                    <div
                      key={incident.id}
                      className="rounded-xl border border-red-200 bg-red-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold text-red-900">
                          {incident.provider} {incident.prefix}
                        </p>
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase text-red-700">
                          {incident.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-red-800">
                        {incident.summary}
                      </p>
                      <p className="mt-2 text-xs text-red-700">
                        Started {formatDate(incident.started_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-5">
              <h2 className="text-xl font-bold text-slate-950">
                Recent Changes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Status transitions across monitored prefixes.
              </p>
            </div>

            <div className="p-5">
              {data.recent_changes.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  No recent status changes. It is just repeatedly valid, the
                  least dramatic outcome in networking.
                </p>
              ) : (
                <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(data.recent_changes, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold text-slate-950">
              Latest Prefix Checks
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Last check per monitored prefix.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Provider</th>
                  <th className="px-5 py-3 font-semibold">Prefix</th>
                  <th className="px-5 py-3 font-semibold">BGP</th>
                  <th className="px-5 py-3 font-semibold">RPKI</th>
                  <th className="px-5 py-3 font-semibold">Overall</th>
                  <th className="px-5 py-3 font-semibold">Observed ASN</th>
                  <th className="px-5 py-3 font-semibold">Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recent_checks.map((check) => (
                  <tr key={`${check.provider}-${check.prefix}`}>
                    <td className="px-5 py-4 font-medium">
                      {check.provider}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs">
                      {check.prefix}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={check.bgp_status} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={check.rpki_status} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={check.overall_status} />
                    </td>
                    <td className="px-5 py-4">
                      {check.observed_origin_asns?.join(", ") ?? "None"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(check.checked_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-8 text-sm text-slate-500">
          Generated {formatDate(data.generated_at)} · Auto-refreshes every 60
          seconds.
        </footer>
      </div>
    </main>
  );
}
