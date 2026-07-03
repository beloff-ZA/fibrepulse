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

function number(value: string | number): number {
  return Number(value) || 0;
}

function formatDate(value: string | null): string {
  if (!value) return "No observations";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{value.replaceAll("_", " ")}</span>;
}

export default function App() {
  const [fnos, setFnos] = useState<Fno[]>([]);
  const [unmapped, setUnmapped] = useState<Unmapped | null>(null);
  const [sources, setSources] = useState<EvidenceSource[]>([]);
  const [evidence, setEvidence] = useState<EvidenceSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setError(null);
      const [fnoData, unmappedData, sourceData, evidenceData] = await Promise.all([
        getJson<{ items: Fno[] }>("/api/topology/fnos"),
        getJson<Unmapped>("/api/topology/unmapped"),
        getJson<{ items: EvidenceSource[] }>("/api/evidence/sources"),
        getJson<{ items: EvidenceSummary[] }>("/api/evidence/summary/fnos"),
      ]);
      setFnos(fnoData.items);
      setUnmapped(unmappedData);
      setSources(sourceData.items);
      setEvidence(evidenceData.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load operations data");
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

  const visibleFnos = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term ? fnos.filter((item) => item.fno_name.toLowerCase().includes(term)) : fnos;
  }, [filter, fnos]);

  const mappedFnos = fnos.filter(
    (item) => item.related_isp_count > 0 || item.footprint_count > 0,
  ).length;

  if (loading) {
    return <main className="center"><h1>Loading FibrePulse operations…</h1></main>;
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">FibrePulse ZA</p>
          <h1>Topology & Evidence Operations</h1>
          <p className="subtitle">
            Documented network structure and source observations. No live availability verdicts are inferred here.
          </p>
        </div>
        <button onClick={() => void load()}>Refresh data</button>
      </header>

      {error && <section className="error">{error}</section>}

      <section className="metrics">
        <article><strong>{fnos.length}</strong><span>Registered FNOs</span></article>
        <article><strong>{mappedFnos}</strong><span>Partially mapped FNOs</span></article>
        <article><strong>{unmapped?.totals.candidate_relationships ?? 0}</strong><span>Relationship candidates</span></article>
        <article><strong>{unmapped?.totals.candidate_footprints ?? 0}</strong><span>Footprint candidates</span></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>FNO topology readiness</h2>
            <p>Relationships and footprints indicate documented mapping progress, not service health.</p>
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
                <th>FNO</th><th>Verification</th><th>ISPs</th><th>Footprints</th><th>Locations</th><th>Active evidence</th><th>Last observation</th>
              </tr>
            </thead>
            <tbody>
              {visibleFnos.map((fno) => {
                const signal = evidenceByFno.get(fno.fno_id);
                return (
                  <tr key={fno.fno_id}>
                    <td><strong>{fno.fno_name}</strong></td>
                    <td><Badge value={fno.fno_verification_status} /></td>
                    <td>{fno.related_isp_count}</td>
                    <td>{fno.footprint_count}</td>
                    <td>{fno.location_count}</td>
                    <td>{signal?.active_evidence_count ?? 0}</td>
                    <td>{formatDate(signal?.latest_observed_at ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="split">
        <article className="panel">
          <h2>Mapping queue</h2>
          <div className="queue-grid">
            <div>
              <strong>{unmapped?.totals.fnos_without_relationships ?? 0}</strong>
              <span>FNOs without ISP relationships</span>
            </div>
            <div>
              <strong>{unmapped?.totals.fnos_without_footprints ?? 0}</strong>
              <span>FNOs without footprints</span>
            </div>
          </div>
          <ul className="compact-list">
            {(unmapped?.fnos_without_relationships ?? []).slice(0, 10).map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <small>{item.monitoring_mode} · {item.asn_count} ASN</small>
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
                  <small>{source.source_type} · {source.source_key}</small>
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
