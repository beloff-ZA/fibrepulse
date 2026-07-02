export type ProviderType = "FNO" | "ISP" | "Aggregator";

export type HealthStatus = "valid" | "invalid" | "unknown";

export interface Provider {
  id: number;
  name: string;
  provider_type: ProviderType;
  country: string;
  created_at: string;
}

export interface LatestBgpStatus {
  provider: string;
  provider_type: ProviderType;
  asn: number;
  prefix: string;
  bgp_status: HealthStatus | null;
  rpki_status: HealthStatus | null;
  overall_status: HealthStatus | null;
  observed_origin_asns: number[] | null;
  message: string | null;
  checked_at: string | null;
}

export interface BgpDashboardResponse {
  generated_at: string;
  summary: unknown[];
  open_incidents: unknown[];
  recent_changes: unknown[];
  recent_checks: unknown[];
}
