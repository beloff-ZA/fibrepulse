export type HealthStatus = "valid" | "invalid" | "unknown";

export type SourceAgreement =
  | "full"
  | "partial"
  | "conflict"
  | "unknown";

export type SourceConfidence =
  | "high"
  | "medium"
  | "low"
  | "unknown";

export type SourceName =
  | "ripestat_bgp_state"
  | "ripestat_prefix_overview"
  | "ripestat_rpki_validation"
  | "routeviews_rpki";

export type MonitoredPrefix = {
  monitored_prefix_id: number;
  prefix: string;
  expected_origin_asn: number;
  provider_name: string;
  asn: number;
};

export type SourceResult = {
  source: SourceName;
  ok: boolean;
  status: HealthStatus;
  confidence: number;
  observedOriginAsns: number[];
  message: string;
  error?: string;
  raw?: unknown;
};

export type ValidationDecision = {
  bgpStatus: HealthStatus;
  rpkiStatus: HealthStatus;
  overallStatus: HealthStatus;
  observedOriginAsns: number[];
  sourceConfidence: SourceConfidence;
  sourceAgreement: SourceAgreement;
  sourceScore: number;
  message: string;
  sources: Record<string, unknown>;
};
