import axios from "axios";
import type { SourceResult } from "./types.js";
import { normaliseRpkiState } from "./sourceUtils.js";

export async function checkRouteViewsRpki(
  prefix: string,
  expectedOriginAsn: number,
): Promise<SourceResult> {
  try {
    const response = await axios.get("https://api.routeviews.org/rpki", {
      timeout: 15_000,
      params: {
        prefix,
      },
    });

    const data = response.data;
    const prefixData = data?.[prefix];

    let status: SourceResult["status"] = "unknown";

    if (prefixData?.asn && Array.isArray(prefixData.asn)) {
      for (const asnObject of prefixData.asn) {
        const matchingState =
          asnObject?.[String(expectedOriginAsn)] ??
          asnObject?.[expectedOriginAsn];

        if (matchingState !== undefined) {
          status = normaliseRpkiState(matchingState);
          break;
        }
      }
    }

    return {
      source: "routeviews_rpki",
      ok: true,
      status,
      confidence: status === "unknown" ? 0.45 : 0.8,
      observedOriginAsns: [expectedOriginAsn],
      message:
        status === "valid"
          ? "RouteViews RPKI validated the expected ASN."
          : status === "invalid"
            ? "RouteViews RPKI marked the expected ASN as invalid."
            : "RouteViews RPKI returned unknown or not found.",
      raw: response.data,
    };
  } catch (error) {
    return {
      source: "routeviews_rpki",
      ok: false,
      status: "unknown",
      confidence: 0,
      observedOriginAsns: [],
      message: "RouteViews RPKI check failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
