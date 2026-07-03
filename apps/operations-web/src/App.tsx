import { useEffect, useMemo, useState } from "react";

type Fno = {
  fno_id: string;
  fno_name: string;
  fno_verification_status: string;
  related_isp_count: number;
  footprint_count: number;
  location_count: number;
  last_footprint_verified_at: string | null;
};

type EvidenceSource = {
  id: string;
  source_key: string;
  source_type: string;
  name: string;
  enabled: boolean;
  trust_weight: string | number;
};

type EvidenceSummary = {
  fno_id: string;
  fno_name: string;
  active_evidence_count: number;
  adverse_evidence_count: number;
  positive_evidence_count: number;
  degraded_evidence_count: number;
  latest_observed_at: string | null;
  average_weighted_confidence: string | number;
};

type RoutingSummary = {
  fno_id: string;
  fno_name: string;
  prefix_count: number;
  bgp_valid_count: number;
  bgp_invalid_count: number;
  bgp_unknown_count: number;
  rpki_valid_count: number;
  rpki_invalid_count: number;
  rpki_unknown_count: number;
  overall_valid_count: number;
  overall_invalid_count: number;
  overall_unknown_count: number;
  routing_status: "valid" | "invalid" | "unknown";
  latest_observed_at: string | null;
  average_source_score: string | number | null;
};

type Unmapped = {
  totals: {
    fnos_without_relationships: number;
    fnos_without_footprints: number;
    candidate_relationships: number;
    candidate_footprints: number;
  };
  fnos_without_relationships: Array<{
    id: string;
    name: string;
    verification_status: string;
    monitoring_mode: string;
    asn_count: number;
  }>;
  fnos_without_footprints: Array<{
    id: string;
    name: string;
    verification_status: string;
    monitoring_mode: string;
  }>;
  candidate_relationships: Array<Record<string, unknown>>;
  candidate_footprints: Array<Record<string, unknown>>;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function number(value: string | number | null): number {
  return Number(value) || 0;
}

function formatDate(value: string | null): string {
  if (!value) return "Not monitored";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function StatusCount({
  valid,
  invalid,
  unknown,
}: {
  valid: number;
  invalid: number;
  unknown: number;
}) {
  return (
    <span className="status-counts" title="Valid / Invalid / Unknown">
      <span className="count-valid">{valid}</span>
      <span className="count-invalid">{invalid}</span>
      <span className="count-unknown">{unknown}</span>
    </span>
  );
}

export default function App() {
  const [fnos, setFnos] = useState<Fno[]>([]);
  const [unmapped, setUnmapped] = useState<Unmapped | null>(null);
  const [sources, setSources] = useState<EvidenceSource[]>([]);
  const [evidence, setEvidence] = useState<EvidenceSummary[]>([]);
  const [routing, setRouting] = useState<RoutingSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setError(null);
      const [
        fnoData,
        unmappedData,
        sourceData,
        evidenceData,
        routingData,
      ] = await Promise.all([
        getJson<{ items: Fno[] }>("/api/topology/fnos"),
        getJson<Unmapped>("/api/topology/unmapped"),
        getJson<{ items: EvidenceSource[] }>("/api/evidence/sources"),
        getJson<{ items: EvidenceSummary[] }>("/api/evidence/summary/fnos"),
        getJson<{ items: RoutingSummary[] }>("/api/evidence/routing/fnos"),
      ]);

      setFnos(fnoData.items);
      setUnmapped(unmappedData);
      setSources(sourceData.items);
      setEvidence(evidenceData.items);
      setRouting(routingData.items);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load operations data",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const evidenceByFno = useMemo(
    () => new Map(evidence.map((item) => [item.fno_id, item])),
    [evidence],
  );

  const routingByFno = useMemo(
    () => new Map(routing.map((item) => [item.fno_id, item])),
    [routing],
  );

  const visibleFnos = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term
      ? fnos.filter((item) => item.fno_name.toLowerCase().includes(term))
      : fnos;
  }, [filter, fnos]);

  const mappedFnos = fnos.filter(
    (item) => item.related_isp_count > 0 || item.footprint_count > 0,
  ).length;
  const observedPrefixes = routing.reduce(
    (total, item) => total + item.prefix_count,
    0,
  );
  const routingIssues = routing.filter(
    (item) => item.routing_status === "invalid",
  ).length;

  if (loading) {
    return (
      <main className="center">
        <h1>Loading FibrePulse operations…</h1>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">FibrePulse ZA</p>
          <h1>Topology & Routing Operations</h1>
          <p className="subtitle">
            Live BGP and RPKI observations alongside documented network
            topology. Routing health is evidence, not proof of customer
            connectivity.
          </p>
        </div>
        <button onClick={() => void load()}>Refresh data</button>
      </header>

      {error && <section className="error">{error}</section>}

      <section className="metrics">
        <article>
          <strong>{fnos.length}</strong>
          <span>Registered FNOs</span>
        </article>
        <article>
          <strong>{routing.length}</strong>
          <span>FNOs with routing observations</span>
        </article>
        <article>
          <strong>{observedPrefixes}</strong>
          <span>Observed prefixes</span>
        </article>
        <article>
          <strong>{routingIssues}</strong>
          <span>FNOs with invalid routing evidence</span>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Current FNO observations</h2>
            <p>
              BGP and RPKI counts are shown as valid / invalid / unknown.
              Topology fields remain separate because coverage is not routing.
            </p>
          </div>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter FNOs"
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>FNO</th>
                <th>Registry</th>
                <th>Routing</th>
                <th>Prefixes</th>
                <th>BGP V/I/U</th>
                <th>RPKI V/I/U</th>
                <th>Source score</th>
                <th>Last observation</th>
                <th>Other evidence</th>
                <th>Topology</th>
              </tr>
            </thead>
            <tbody>
              {visibleFnos.map((fno) => {
                const signal = evidenceByFno.get(fno.fno_id);
                const route = routingByFno.get(fno.fno_id);

                return (
                  <tr key={fno.fno_id}>
                    <td>
                      <strong>{fno.fno_name}</strong>
                    </td>
                    <td>
                      <Badge value={fno.fno_verification_status} />
                    </td>
                    <td>
                      <Badge value={route?.routing_status ?? "not_monitored"} />
                    </td>
                    <td>{route?.prefix_count ?? 0}</td>
                    <td>
                      <StatusCount
                        valid={route?.bgp_valid_count ?? 0}
                        invalid={route?.bgp_invalid_count ?? 0}
                        unknown={route?.bgp_unknown_count ?? 0}
                      />
                    </td>
                    <td>
                      <StatusCount
                        valid={route?.rpki_valid_count ?? 0}
                        invalid={route?.rpki_invalid_count ?? 0}
                        unknown={route?.rpki_unknown_count ?? 0}
                      />
                    </td>
                    <td>
                      {route?.average_source_score == null
                        ? "—"
                        : number(route.average_source_score).toFixed(2)}
                    </td>
                    <td>{formatDate(route?.latest_observed_at ?? null)}</td>
                    <td>{signal?.active_evidence_count ?? 0}</td>
                    <td>
                      {fno.related_isp_count} ISP · {fno.footprint_count} footprint
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="split">
        <article className="panel">
          <h2>Topology mapping queue</h2>
          <div className="queue-grid">
            <div>
              <strong>{mappedFnos}</strong>
              <span>Partially mapped FNOs</span>
            </div>
            <div>
              <strong>{unmapped?.totals.fnos_without_footprints ?? 0}</strong>
              <span>FNOs without footprints</span>
            </div>
          </div>
          <ul className="compact-list">
            {(unmapped?.fnos_without_relationships ?? [])
              .slice(0, 10)
              .map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <small>
                    {item.monitoring_mode} · {item.asn_count} ASN
                  </small>
                </li>
              ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Evidence sources</h2>
          <ul className="source-list">
            {sources.map((source) => (
              <li key={source.id}>
                <div>
                  <strong>{source.name}</strong>
                  <small>
                    {source.source_type} · {source.source_key}
                  </small>
                </div>
                <div className="source-state">
                  <Badge value={source.enabled ? "enabled" : "disabled"} />
                  <span>{number(source.trust_weight).toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
