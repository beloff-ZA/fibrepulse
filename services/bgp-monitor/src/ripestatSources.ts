import axios from "axios";
import { config } from "@fibrepulse/config";
import type { SourceResult } from "./types.js";
import {
  normaliseRpkiState,
  numberOrNull,
  uniqueSortedNumbers,
} from "./sourceUtils.js";

export async function checkRipeBgpState(
  prefix: string,
  expectedOriginAsn: number,
): Promise<SourceResult> {
  try {
    const response = await axios.get(
      "https://stat.ripe.net/data/bgp-state/data.json",
      {
        timeout: 15_000,
        params: {
          resource: prefix,
          sourceapp: config.SOURCE_APP,
        },
      },
    );

    const bgpState = response.data?.data?.bgp_state;
    const observed: number[] = [];

    if (Array.isArray(bgpState)) {
      for (const item of bgpState) {
        const path = item?.path;

        if (Array.isArray(path) && path.length > 0) {
          const origin = numberOrNull(path[path.length - 1]);

          if (origin !== null) {
            observed.push(origin);
          }
        }

        const directOrigin = numberOrNull(item?.origin);

        if (directOrigin !== null) {
          observed.push(directOrigin);
        }
      }
    }

    const observedOriginAsns = uniqueSortedNumbers(observed);

    if (observedOriginAsns.length === 0) {
      return {
        source: "ripestat_bgp_state",
        ok: true,
        status: "invalid",
        confidence: 0.75,
        observedOriginAsns,
        message: "RIPEstat BGP State did not observe the prefix.",
      };
    }

    const status = observedOriginAsns.includes(expectedOriginAsn)
      ? "valid"
      : "invalid";

    return {
      source: "ripestat_bgp_state",
      ok: true,
      status,
      confidence: 0.9,
      observedOriginAsns,
      message:
        status === "valid"
          ? "RIPEstat BGP State observed the expected origin ASN."
          : "RIPEstat BGP State observed an unexpected origin ASN.",
      raw: response.data,
    };
  } catch (error) {
    return {
      source: "ripestat_bgp_state",
      ok: false,
      status: "unknown",
      confidence: 0,
      observedOriginAsns: [],
      message: "RIPEstat BGP State check failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkRipePrefixOverview(
  prefix: string,
  expectedOriginAsn: number,
): Promise<SourceResult> {
  try {
    const response = await axios.get(
      "https://stat.ripe.net/data/prefix-overview/data.json",
      {
        timeout: 15_000,
        params: {
          resource: prefix,
          sourceapp: config.SOURCE_APP,
        },
      },
    );

    const asns = response.data?.data?.asns;
    const observed: number[] = [];

    if (Array.isArray(asns)) {
      for (const item of asns) {
        const asn = numberOrNull(item?.asn ?? item);

        if (asn !== null) {
          observed.push(asn);
        }
      }
    }

    const observedOriginAsns = uniqueSortedNumbers(observed);

    if (observedOriginAsns.length === 0) {
      return {
        source: "ripestat_prefix_overview",
        ok: true,
        status: "invalid",
        confidence: 0.7,
        observedOriginAsns,
        message: "RIPEstat Prefix Overview found no announcing ASNs.",
      };
    }

    const status = observedOriginAsns.includes(expectedOriginAsn)
      ? "valid"
      : "invalid";

    return {
      source: "ripestat_prefix_overview",
      ok: true,
      status,
      confidence: 0.85,
      observedOriginAsns,
      message:
        status === "valid"
          ? "RIPEstat Prefix Overview found the expected ASN."
          : "RIPEstat Prefix Overview found an unexpected ASN.",
      raw: response.data,
    };
  } catch (error) {
    return {
      source: "ripestat_prefix_overview",
      ok: false,
      status: "unknown",
      confidence: 0,
      observedOriginAsns: [],
      message: "RIPEstat Prefix Overview check failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkRipeRpkiValidation(
  prefix: string,
  expectedOriginAsn: number,
): Promise<SourceResult> {
  try {
    const response = await axios.get(
      "https://stat.ripe.net/data/rpki-validation/data.json",
      {
        timeout: 15_000,
        params: {
          resource: `AS${expectedOriginAsn}`,
          prefix,
          sourceapp: config.SOURCE_APP,
        },
      },
    );

    const statusRaw =
      response.data?.data?.status ??
      response.data?.data?.validity?.state ??
      response.data?.data?.validation_status;

    const status = normaliseRpkiState(statusRaw);

    return {
      source: "ripestat_rpki_validation",
      ok: true,
      status,
      confidence: status === "unknown" ? 0.55 : 0.95,
      observedOriginAsns: [expectedOriginAsn],
      message:
        status === "valid"
          ? "RIPEstat RPKI validated the expected prefix and ASN."
          : status === "invalid"
            ? "RIPEstat RPKI marked the expected prefix and ASN as invalid."
            : "RIPEstat RPKI returned unknown or not found.",
      raw: response.data,
    };
  } catch (error) {
    return {
      source: "ripestat_rpki_validation",
      ok: false,
      status: "unknown",
      confidence: 0,
      observedOriginAsns: [],
      message: "RIPEstat RPKI validation check failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
