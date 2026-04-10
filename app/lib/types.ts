// ── VoiceReport — Shared Types ──

export type UserProfile = {
  id: string;
  name: string;
  role: string;
  createdAt: number;
};

export type GeoLocation = {
  lat: number;
  lng: number;
  accuracy: number;
};

export type ReportSections = {
  statut_global: string;
  synthese?: string;
  score?: number;
  alertes?: string[];
  impacts?: string[];
  lieu_chantier?: string;
  rapporteur?: string;
  meteo?: string;
  equipe?: string;
  avancement?: string;
  travaux_realises: string[];
  problemes_rencontres: string[];
  materiel_manquant: string[];
  a_prevoir: string[];
  suggestion_legende_photo: string;
};

export type EnrichmentData = {
  chantierId: string;
  chantierName: string;
  etatGlobal?: "fluide" | "difficile" | "critique";
  urgent?: boolean;
  typeJournee?: "normal" | "retard" | "blocage" | "incident";
};

export type ChantierEntry = {
  id: string;
  name: string;
  lastUsed: number;
};

export type SavedReport = {
  id: string;
  date: string;
  report: ReportSections;
  recipientEmail: string;
  // Enhanced fields (optional for backward compat)
  userName?: string;
  userRole?: string;
  geo?: GeoLocation | null;
  enrichment?: EnrichmentData | null;
};

export type ChantierStats = {
  name: string;
  id?: string;
  latestReport: SavedReport;
  allReports: SavedReport[];
  status: "green" | "orange" | "red" | "none";
  score: number | null;
  scoreTrend: "up" | "down" | "stable";
  alertes: string[];
  topProblems: string[];
  reportCount: number;
  lastReportDate: string;
  daysSinceLastReport: number;
  recurringMaterials: { name: string; count: number }[];
};

export type Alert = {
  id: string;
  type: "critical" | "missing" | "material" | "trend";
  severity: "red" | "orange" | "yellow";
  chantier: string;
  message: string;
  date: string;
};

export type MaterialItem = {
  name: string;
  count: number;
  chantiers: string[];
  lastMentioned: string;
};

export type OfflineQueueItem = {
  id: string;
  timestamp: number;
  report: ReportSections;
  recipientEmail: string;
  photoLegends: string[];
  photosBase64: { name: string; type: string; data: string }[];
};
