import https from "node:https";

import axios, {
  AxiosError,
} from "axios";

import type {
  SourceName,
  SourceResult,
} from "./types.js";

import {
  normaliseRpkiState,
} from "./sourceUtils.js";

const routeViewsHttpsAgent = new https.Agent({
  keepAlive: true,
  family: 4,
});

function describeAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

    const status = axiosError.response?.status;
    const statusText = axiosError.response?.statusText;
    const code = axiosError.code;
    const message = axiosError.message;

    const parts = [
      status ? `HTTP ${status}` : null,
      statusText || null,
      code || null,
      message || null,
    ].filter(Boolean);

    return parts.join(" - ") || "Unknown Axios error";
  }

  if (error instanceof Error) {
    return error.message || error.name;
  }

  return String(error || "Unknown source error");
}

export async function checkRouteViewsRpki(
  prefix: string,
  expectedOriginAsn: number,
): Promise<SourceResult> {
  const sourceName: SourceName = "routeviews_rpki";
  const startedAt = Date.now();

  try {
    const response = await axios.get(
      "https://api.routeviews.org/guest/rpki",
      {
        timeout: 15_000,

        params: {
          prefix,
        },

        headers: {
          Accept: "application/json",
          "User-Agent": "FibrePulse/1.0",
        },

        httpsAgent: routeViewsHttpsAgent,

        validateStatus: (status) =>
          status >= 200 && status < 300,
      },
    );

    const prefixData = response.data?.[prefix];

    let status: SourceResult["status"] = "unknown";

    if (
      prefixData?.asn &&
      Array.isArray(prefixData.asn)
    ) {
      for (const asnObject of prefixData.asn) {
        const matchingState =
          asnObject?.[String(expectedOriginAsn)] ??
          asnObject?.[expectedOriginAsn];

        if (matchingState !== undefined) {
          status = normaliseRpkiState(
            matchingState,
          );

          break;
        }
      }
    }

    return {
      source: sourceName,
      ok: true,
      status,
      confidence:
        status === "unknown" ? 0.45 : 0.8,
      observedOriginAsns: [expectedOriginAsn],
      message:
        status === "valid"
          ? "RouteViews RPKI validated the expected ASN."
          : status === "invalid"
            ? "RouteViews RPKI marked the expected ASN as invalid."
            : "RouteViews RPKI returned unknown or not found.",
      raw: response.data,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = describeAxiosError(error);

    return {
      source: sourceName,
      ok: false,
      status: "unknown",
      confidence: 0,
      observedOriginAsns: [],
      message: "RouteViews RPKI check failed.",
      error: message,
      responseTimeMs: Date.now() - startedAt,
    };
  }
}
