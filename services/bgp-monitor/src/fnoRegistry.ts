export type VerificationStatus =
  | "verified"
  | "candidate"
  | "rejected"
  | "unsupported";

export type MonitoringMode =
  | "full"
  | "observation"
  | "probe_only"
  | "disabled";

export type FnoAsn = {
  asn: number;
  label: string;
  enabled: boolean;
  verified: boolean;
};

export type FnoRegistryEntry = {
  name: string;
  aliases: string[];
  providerType: "FNO";
  country: "ZA";
  verificationStatus: VerificationStatus;
  monitoringMode: MonitoringMode;
  displayEnabled: boolean;
  incidentEnabled: boolean;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  notes: string | null;
  asns: FnoAsn[];
};

export const southAfricanFnoRegistry: FnoRegistryEntry[] = [
  {
    name: "Frogfoot",
    aliases: [
      "Frogfoot Networks",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "verified",
    monitoringMode: "full",
    displayEnabled: true,
    incidentEnabled: true,
    websiteUrl: "https://www.frogfoot.co.za",
    statusPageUrl: null,
    notes: "Existing verified BGP-monitored provider.",
    asns: [
      {
        asn: 22355,
        label: "Frogfoot Networks",
        enabled: true,
        verified: true,
      },
    ],
  },

  {
    name: "MetroFibre",
    aliases: [
      "MetroFibre Networx",
      "MFN",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "verified",
    monitoringMode: "full",
    displayEnabled: true,
    incidentEnabled: true,
    websiteUrl: "https://metrofibre.co.za",
    statusPageUrl: null,
    notes: "Existing verified BGP-monitored provider.",
    asns: [
      {
        asn: 327782,
        label: "MetroFibre Networx",
        enabled: true,
        verified: true,
      },
    ],
  },

  {
    name: "Vumatel",
    aliases: [
      "Vuma",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "verified",
    monitoringMode: "full",
    displayEnabled: true,
    incidentEnabled: true,
    websiteUrl: "https://vumatel.co.za",
    statusPageUrl: null,
    notes: "Existing verified BGP-monitored provider.",
    asns: [
      {
        asn: 328829,
        label: "Vumatel",
        enabled: true,
        verified: true,
      },
    ],
  },

  {
    name: "Openserve / Telkom SA",
    aliases: [
      "Openserve",
      "Telkom Fibre",
      "Telkom SA",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "observation",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://openserve.co.za",
    statusPageUrl: null,
    notes:
      "Candidate ASN mapping. Keep visible but do not raise incidents until reviewed.",
    asns: [
      {
        asn: 5713,
        label: "Telkom SA / Openserve candidate",
        enabled: true,
        verified: false,
      },
    ],
  },

  {
    name: "Herotel",
    aliases: [
      "Hero Telecoms",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "verified",
    monitoringMode: "full",
    displayEnabled: true,
    incidentEnabled: true,
    websiteUrl: "https://www.herotel.com",
    statusPageUrl: null,
    notes:
      "Public network identity confirmed as AS328471.",
    asns: [
      {
        asn: 328471,
        label: "Hero Telecoms / Herotel",
        enabled: true,
        verified: true,
      },
    ],
  },

  {
    name: "Octotel",
    aliases: [],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://www.octotel.co.za",
    statusPageUrl: null,
    notes:
      "Visible provider. ASN mapping still requires verification.",
    asns: [],
  },

  {
    name: "Zoom Fibre",
    aliases: [
      "ZoomFibre",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://zoomfibre.co.za",
    statusPageUrl: null,
    notes:
      "Visible provider. Routing identity still requires verification.",
    asns: [],
  },

  {
    name: "Net Nine Nine",
    aliases: [
      "Net99",
      "Net 99",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://netninenine.co.za",
    statusPageUrl: null,
    notes:
      "Visible provider. Routing identity still requires verification.",
    asns: [],
  },

  {
    name: "Fibertime",
    aliases: [
      "Fibre Time",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://fibertime.com",
    statusPageUrl: null,
    notes:
      "Visible provider. Routing identity still requires verification.",
    asns: [],
  },

  {
    name: "Evotel",
    aliases: [],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://www.evotel.co.za",
    statusPageUrl: null,
    notes:
      "Visible provider. Routing identity still requires verification.",
    asns: [],
  },

  {
    name: "Lightstruck",
    aliases: [
      "Lightstrike",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://lightstruck.co.za",
    statusPageUrl: null,
    notes:
      "Visible provider. Routing identity still requires verification.",
    asns: [],
  },

  {
    name: "Vodacom Fibre",
    aliases: [
      "Vodacom FTTH",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://www.vodacom.co.za",
    statusPageUrl: null,
    notes:
      "May use shared or multiple Vodacom routing identities.",
    asns: [],
  },

  {
    name: "MTN Fibre",
    aliases: [
      "MTN FTTH",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "probe_only",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://www.mtn.co.za",
    statusPageUrl: null,
    notes:
      "May use shared or multiple MTN routing identities.",
    asns: [],
  },

  {
    name: "Lasernet",
    aliases: [
      "KnysnaON",
    ],
    providerType: "FNO",
    country: "ZA",
    verificationStatus: "candidate",
    monitoringMode: "observation",
    displayEnabled: true,
    incidentEnabled: false,
    websiteUrl: "https://www.lasernet.co.za",
    statusPageUrl: null,
    notes:
      "Publicly identifies as an ISP and fibre network operator under AS37484.",
    asns: [
      {
        asn: 37484,
        label: "Lasernet / KnysnaON",
        enabled: true,
        verified: false,
      },
    ],
  },
];
