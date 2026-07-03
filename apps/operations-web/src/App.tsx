import { useEffect, useMemo, useState } from "react";

type Fno = {
  fno_id: string;
  fno_name: string;
  fno_verification_status: string;
  related_isp_count: number;
  footprint_count: number;
  location_count: number;
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
  active_evidence_count: number;
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
  fresh_prefix_count: number;
  stale_prefix_count: number;
  never_checked_count: number;
  routing_status: string;
  latest_observed_at: string | null;
  average_source_score: string | number | null;
};

type PrefixObservation = {
  monitored_prefix_id: string;
  prefix: string;
  expected_origin_asn: number;
  observed_origin_asns: number[];
  bgp_status: string | null;
  rpki_status: string | null;
  overall_status: string | null;
  source_confidence: string | null;
  source_agreement: string | null;
  source_score: string | number | null;
  checked_at: string | null;
  freshness: string;
  message: string | null;
};

type Incident = {
  id: string;
  status: string;
  severity: string;
  previous_status: string | null;
  current_status: string;
  started_at: string;
  resolved_at: string | null;
  summary: string;
  prefix: string;
};

type HistoryPoint = {
  checked_at: string;
  bgp_status: string;
  rpki_status: string;
  overall_status: string;
  source_score: string | number;
  prefix: string;
};

type Detail = {
  provider: { id: string; name: string; verification_status: string; monitoring_mode: string };
  prefixes: PrefixObservation[];
  incidents: Incident[];
  history: HistoryPoint[];
  stale_after_minutes: number;
};

type Collector = {
  monitored_prefixes: number;
  checked_prefixes: number;
  fresh_prefixes: number;
  stale_prefixes: number;
  last_check_at: string | null;
  stale_after_minutes: number;
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
    monitoring_mode: string;
    asn_count: number;
  }>;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function numeric(value: string | number | null | undefined): number {
  return Number(value) || 0;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{value.replaceAll("_", " ")}</span>;
}

function StatusCount({ valid, invalid, unknown }: { valid: number; invalid: number; unknown: number }) {
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
  const [collector, setCollector] = useState<Collector | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setError(null);
      const [f, u, s, e, r, c] = await Promise.all([
        getJson<{ items: Fno[] }>("/api/topology/fnos"),
        getJson<Unmapped>("/api/topology/unmapped"),
        getJson<{ items: EvidenceSource[] }>("/api/evidence/sources"),
        getJson<{ items: EvidenceSummary[] }>("/api/evidence/summary/fnos"),
        getJson<{ items: RoutingSummary[] }>("/api/evidence/routing/fnos"),
        getJson<Collector>("/api/evidence/routing/collector"),
      ]);
      setFnos(f.items);
      setUnmapped(u);
      setSources(s.items);
      setEvidence(e.items);
      setRouting(r.items);
      setCollector(c);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load operations data");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(fnoId: string): Promise<void> {
    setSelected(fnoId);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getJson<Detail>(`/api/evidence/routing/fnos/${fnoId}`));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Failed to load FNO detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const evidenceByFno = useMemo(() => new Map(evidence.map((item) => [item.fno_id, item])), [evidence]);
  const routingByFno = useMemo(() => new Map(routing.map((item) => [item.fno_id, item])), [routing]);
  const visibleFnos = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term ? fnos.filter((item) => item.fno_name.toLowerCase().includes(term)) : fnos;
  }, [filter, fnos]);

  const observedPrefixes = routing.reduce((total, item) => total + item.prefix_count, 0);
  const routingIssues = routing.filter((item) => item.routing_status === "invalid").length;

  if (loading) return <main className="center"><h1>Loading FibrePulse operations…</h1></main>;

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">FibrePulse ZA</p>
          <h1>Topology & Routing Operations</h1>
          <p className="subtitle">Automated BGP and RPKI observations, official evidence and documented topology. Routing evidence does not prove last-mile availability.</p>
        </div>
        <button onClick={() => void load()}>Refresh data</button>
      </header>

      {error && <section className="error">{error}</section>}

      <section className="collector-bar">
        <div><span>Collector</span><Badge value={collector?.stale_prefixes ? "stale" : "fresh"} /></div>
        <div><strong>{collector?.fresh_prefixes ?? 0}</strong><span>fresh prefixes</span></div>
        <div><strong>{collector?.stale_prefixes ?? 0}</strong><span>stale prefixes</span></div>
        <div><strong>{collector?.checked_prefixes ?? 0}/{collector?.monitored_prefixes ?? 0}</strong><span>checked</span></div>
        <div><strong>{formatDate(collector?.last_check_at ?? null)}</strong><span>last collection</span></div>
      </section>

      <section className="metrics">
        <article><strong>{fnos.length}</strong><span>Registered FNOs</span></article>
        <article><strong>{routing.length}</strong><span>FNOs with observations</span></article>
        <article><strong>{observedPrefixes}</strong><span>Observed prefixes</span></article>
        <article><strong>{routingIssues}</strong><span>FNOs with invalid routing</span></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Current FNO observations</h2><p>Select an FNO for prefix history, ASN comparison and incidents.</p></div>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter FNOs" />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>FNO</th><th>Registry</th><th>Routing</th><th>Prefixes</th><th>BGP V/I/U</th><th>RPKI V/I/U</th><th>Fresh/Stale</th><th>Score</th><th>Last observation</th><th>Other evidence</th></tr></thead>
            <tbody>
              {visibleFnos.map((fno) => {
                const signal = evidenceByFno.get(fno.fno_id);
                const route = routingByFno.get(fno.fno_id);
                return (
                  <tr key={fno.fno_id} className="clickable" onClick={() => void openDetail(fno.fno_id)}>
                    <td><strong>{fno.fno_name}</strong></td>
                    <td><Badge value={fno.fno_verification_status} /></td>
                    <td><Badge value={route?.routing_status ?? "not_monitored"} /></td>
                    <td>{route?.prefix_count ?? 0}</td>
                    <td><StatusCount valid={route?.bgp_valid_count ?? 0} invalid={route?.bgp_invalid_count ?? 0} unknown={route?.bgp_unknown_count ?? 0} /></td>
                    <td><StatusCount valid={route?.rpki_valid_count ?? 0} invalid={route?.rpki_invalid_count ?? 0} unknown={route?.rpki_unknown_count ?? 0} /></td>
                    <td>{route?.fresh_prefix_count ?? 0}/{route?.stale_prefix_count ?? 0}</td>
                    <td>{route?.average_source_score == null ? "—" : numeric(route.average_source_score).toFixed(2)}</td>
                    <td>{formatDate(route?.latest_observed_at ?? null)}</td>
                    <td>{signal?.active_evidence_count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="panel detail-panel">
          <div className="panel-heading">
            <div><h2>{detail?.provider.name ?? "Loading FNO detail…"}</h2><p>Prefix observations, expected versus observed origins, recent checks and incidents.</p></div>
            <button onClick={() => { setSelected(null); setDetail(null); }}>Close</button>
          </div>
          {detailLoading && <p>Loading detail…</p>}
          {detail && (
            <>
              <div className="detail-summary">
                <Badge value={detail.provider.verification_status} />
                <span>{detail.prefixes.length} monitored prefixes</span>
                <span>{detail.incidents.filter((item) => item.status === "open").length} open incidents</span>
                <span>{detail.history.length} checks in seven days</span>
              </div>
              <div className="table-wrap">
                <table className="detail-table">
                  <thead><tr><th>Prefix</th><th>Expected ASN</th><th>Observed ASN</th><th>BGP</th><th>RPKI</th><th>Freshness</th><th>Confidence</th><th>Checked</th></tr></thead>
                  <tbody>{detail.prefixes.map((prefix) => (
                    <tr key={prefix.monitored_prefix_id}>
                      <td><code>{prefix.prefix}</code></td>
                      <td>AS{prefix.expected_origin_asn}</td>
                      <td>{prefix.observed_origin_asns?.length ? prefix.observed_origin_asns.map((asn) => `AS${asn}`).join(", ") : "None"}</td>
                      <td><Badge value={prefix.bgp_status ?? "unknown"} /></td>
                      <td><Badge value={prefix.rpki_status ?? "unknown"} /></td>
                      <td><Badge value={prefix.freshness} /></td>
                      <td>{prefix.source_confidence ?? "—"} · {prefix.source_score == null ? "—" : numeric(prefix.source_score).toFixed(2)}</td>
                      <td>{formatDate(prefix.checked_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <h3>Recent incidents</h3>
              {detail.incidents.length === 0 ? <p>No recorded incidents.</p> : (
                <ul className="incident-list">{detail.incidents.map((incident) => (
                  <li key={incident.id}><Badge value={incident.status} /><strong>{incident.prefix}</strong><span>{incident.summary}</span><small>{formatDate(incident.started_at)}</small></li>
                ))}</ul>
              )}
            </>
          )}
        </section>
      )}

      <section className="split">
        <article className="panel">
          <h2>Topology mapping queue</h2>
          <div className="queue-grid">
            <div><strong>{unmapped?.totals.fnos_without_relationships ?? 0}</strong><span>without ISP relationships</span></div>
            <div><strong>{unmapped?.totals.fnos_without_footprints ?? 0}</strong><span>without footprints</span></div>
          </div>
          <ul className="compact-list">{(unmapped?.fnos_without_relationships ?? []).slice(0, 10).map((item) => <li key={item.id}><span>{item.name}</span><small>{item.monitoring_mode} · {item.asn_count} ASN</small></li>)}</ul>
        </article>
        <article className="panel">
          <h2>Evidence sources</h2>
          <ul className="source-list">{sources.map((source) => <li key={source.id}><div><strong>{source.name}</strong><small>{source.source_type} · {source.source_key}</small></div><div className="source-state"><Badge value={source.enabled ? "enabled" : "disabled"} /><span>{numeric(source.trust_weight).toFixed(2)}</span></div></li>)}</ul>
        </article>
      </section>
    </main>
  );
}
