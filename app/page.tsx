"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mail,
  Plus,
  Edit3,
  Send,
  ShieldAlert,
  Package,
  CalendarDays,
  Loader2,
  X,
  FileText,
  Mic,
  MapPin,
  CheckCircle,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Zap,
  Bell,
  Clock,
  ChevronRight,
  Trash2,
  BarChart3,
  WifiOff,
  Search,
  HardHat,
  CircleDot,
} from "lucide-react";
import Chat from "./components/Chat";
import UserSetup from "./components/UserSetup";
import EliteDashboard from "./components/EliteDashboard";
import type { UserProfile, GeoLocation } from "./lib/types";
import { loadUser, saveUser, clearHistory } from "./lib/storage";

type Stage = "idle" | "recording" | "preview" | "enrich" | "processing" | "review" | "success" | "dashboard";

// ── Chantier registry (persisted in localStorage) ──
type ChantierEntry = {
  id: string;
  name: string;
  lastUsed: number; // timestamp
};

const CHANTIERS_KEY = "voicereport_chantiers";
const LAST_CHANTIER_KEY = "voicereport_last_chantier";

function loadChantiers(): ChantierEntry[] {
  try {
    const raw = localStorage.getItem(CHANTIERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChantiers(list: ChantierEntry[]) {
  localStorage.setItem(CHANTIERS_KEY, JSON.stringify(list));
}

function addOrUpdateChantier(name: string): ChantierEntry {
  const list = loadChantiers();
  const normalized = name.trim();
  const existing = list.find(c => c.name.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    existing.lastUsed = Date.now();
    saveChantiers(list);
    localStorage.setItem(LAST_CHANTIER_KEY, existing.id);
    return existing;
  }
  const entry: ChantierEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: normalized,
    lastUsed: Date.now(),
  };
  list.unshift(entry);
  saveChantiers(list);
  localStorage.setItem(LAST_CHANTIER_KEY, entry.id);
  return entry;
}

type EnrichmentData = {
  chantierId: string;
  chantierName: string;
  etatGlobal?: "fluide" | "difficile" | "critique";
  urgent?: boolean;
  typeJournee?: "normal" | "retard" | "blocage" | "incident";
};

type ReportSections = {
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function parseSeverity(item: string): { level: "critique" | "attention" | "normal"; text: string } {
  if (item.startsWith("[Critique]")) return { level: "critique", text: item.replace(/^\[Critique\]\s*/, "") };
  if (item.startsWith("[Attention]")) return { level: "attention", text: item.replace(/^\[Attention\]\s*/, "") };
  return { level: "normal", text: item };
}

type SavedReport = {
  id: string;
  date: string;
  report: ReportSections;
  recipientEmail: string;
  userName?: string;
  userRole?: string;
  geo?: { lat: number; lng: number; accuracy: number } | null;
  enrichment?: EnrichmentData | null;
};

const HISTORY_KEY = "voicereport_history";
const MAX_HISTORY = 100;
const OFFLINE_QUEUE_KEY = "voicereport_offline_queue";

const ENCOURAGEMENT_PHRASES = [
  "Parlez naturellement, comme \u00e0 votre patron",
  "Votre patron recevra le rapport en 10 secondes",
  "Plus de 500 rapports envoy\u00e9s cette semaine",
  "Utilis\u00e9 sur 47 chantiers en France",
  "30 secondes pour un rapport complet",
];

type OfflineQueueItem = {
  id: string;
  timestamp: number;
  report: ReportSections;
  recipientEmail: string;
  photoLegends: string[];
  // photos stored as base64 since File can't be serialized
  photosBase64: { name: string; type: string; data: string }[];
};

function loadOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOfflineQueue(queue: OfflineQueueItem[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function loadHistory(): SavedReport[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToHistory(
  report: ReportSections,
  recipientEmail: string,
  extra?: { userName?: string; userRole?: string; geo?: { lat: number; lng: number; accuracy: number } | null; enrichment?: EnrichmentData | null }
) {
  const history = loadHistory();
  const entry: SavedReport = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    report,
    recipientEmail,
    ...extra,
  };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function deleteFromHistory(id: string) {
  const history = loadHistory().filter(h => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getStatusLevel(statut: string): "green" | "orange" | "red" | "none" {
  if (/bon\s*d[eé]roulement|fluide|🟢/i.test(statut)) return "green";
  if (/quelques?\s*difficult[eé]s?|🟠/i.test(statut)) return "orange";
  if (/critique|🔴|urgent|grave|probl[eè]me/i.test(statut)) return "red";
  return "none";
}

// ── Dashboard data structures ──
type Chantier = {
  name: string;
  latestReport: SavedReport;
  allReports: SavedReport[];
  status: "green" | "orange" | "red" | "none";
  score: number | null;
  alertes: string[];
  topProblems: string[];
};

function buildChantiers(reports: SavedReport[]): Chantier[] {
  const grouped = new Map<string, SavedReport[]>();
  for (const r of reports) {
    const key = (r.report.lieu_chantier || "Sans lieu").trim();
    const list = grouped.get(key) || [];
    list.push(r);
    grouped.set(key, list);
  }

  const chantiers: Chantier[] = [];
  for (const [name, reps] of grouped) {
    const sorted = [...reps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const r = latest.report;
    const status = getStatusLevel(r.statut_global);
    const allAlertes: string[] = [];
    for (const rep of sorted.slice(0, 3)) {
      if (rep.report.alertes) allAlertes.push(...rep.report.alertes);
    }
    const topProblems = (r.problemes_rencontres || []).slice(0, 3).map(p => parseSeverity(p).text);
    chantiers.push({
      name,
      latestReport: latest,
      allReports: sorted,
      status,
      score: r.score ?? null,
      alertes: [...new Set(allAlertes)].slice(0, 5),
      topProblems,
    });
  }

  // Sort: red first, then orange, then none, then green
  const order: Record<string, number> = { red: 0, orange: 1, none: 2, green: 3 };
  chantiers.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
  return chantiers;
}

function buildReportText(report: ReportSections) {
  const parts = [];
  if (report.statut_global) parts.push(`Statut global : ${report.statut_global}`);
  if (report.lieu_chantier) parts.push(`Lieu du chantier : ${report.lieu_chantier}`);
  if (report.rapporteur) parts.push(`Rapporteur : ${report.rapporteur}`);
  if (report.meteo) parts.push(`Météo : ${report.meteo}`);
  if (report.equipe) parts.push(`Équipe : ${report.equipe}`);
  if (report.avancement) parts.push(`Avancement : ${report.avancement}`);
  const fmt = (label: string, items: string[]) => {
    if (items.length === 0) return null;
    return `${label}\n${items.map(i => `• ${i}`).join("\n")}`;
  };
  const t = fmt("Travaux réalisés", report.travaux_realises);
  const p = fmt("Problèmes rencontrés", report.problemes_rencontres);
  const m = fmt("Matériel manquant", report.materiel_manquant);
  const a = fmt("À prévoir", report.a_prevoir);
  if (t) parts.push(t);
  if (p) parts.push(p);
  if (m) parts.push(m);
  if (a) parts.push(a);
  return parts.join("\n\n");
}


export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ReportSections | null>(null);
  const [reportText, setReportText] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [photoPreviews, setPhotoPreviews] = useState<{ file: File; previewUrl: string }[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [photoLegends, setPhotoLegends] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [dashboardChantier, setDashboardChantier] = useState<Chantier | null>(null);
  const [dashboardReportDetail, setDashboardReportDetail] = useState<SavedReport | null>(null);
  const [activeHintField, setActiveHintField] = useState<string | null>(null);
  const [hintTexts, setHintTexts] = useState<Record<string, string>>({});
  const [encourageIdx, setEncourageIdx] = useState(0);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([]);
  const [offlineBanner, setOfflineBanner] = useState(false);
  // ── Enrichment step state ──
  const [chantierList, setChantierList] = useState<ChantierEntry[]>([]);
  const [enrichChantierSearch, setEnrichChantierSearch] = useState("");
  const [enrichSelectedChantier, setEnrichSelectedChantier] = useState<string | null>(null);
  const [enrichEtat, setEnrichEtat] = useState<"fluide" | "difficile" | "critique" | null>(null);
  const [enrichUrgent, setEnrichUrgent] = useState<boolean | null>(null);
  const [enrichTypeJournee, setEnrichTypeJournee] = useState<"normal" | "retard" | "blocage" | "incident" | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  // ── User profile + GPS ──
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [currentGeo, setCurrentGeo] = useState<GeoLocation | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const storedEmail = localStorage.getItem("lastRecipientEmail");
    if (storedEmail) {
      setRecipientEmail(storedEmail);
    }
    setSavedReports(loadHistory());
    setOfflineQueue(loadOfflineQueue());
    // Load chantier registry
    const list = loadChantiers();
    setChantierList(list);
    const lastId = localStorage.getItem(LAST_CHANTIER_KEY);
    if (lastId) setEnrichSelectedChantier(lastId);
    // Load user profile
    const user = loadUser();
    setCurrentUser(user);
    setUserLoaded(true);
    return () => stopTimer();
  }, [stopTimer]);

  // ── Encouragement phrase rotation ──
  useEffect(() => {
    if (stage !== "idle") return;
    const interval = setInterval(() => {
      setEncourageIdx((prev) => (prev + 1) % ENCOURAGEMENT_PHRASES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [stage]);

  // ── Offline queue: send pending reports when back online ──
  useEffect(() => {
    const processQueue = async () => {
      const queue = loadOfflineQueue();
      if (queue.length === 0) return;
      const remaining: OfflineQueueItem[] = [];
      for (const item of queue) {
        try {
          const formData = new FormData();
          formData.append("report", JSON.stringify(item.report));
          formData.append("recipientEmail", item.recipientEmail);
          formData.append("photoLegends", JSON.stringify(item.photoLegends));
          for (const photo of item.photosBase64) {
            const blob = base64ToBlob(photo.data, photo.type);
            formData.append("photos", new File([blob], photo.name, { type: photo.type }));
          }
          const res = await fetch("/api/send-email", { method: "POST", body: formData });
          if (res.ok) {
            saveToHistory(item.report, item.recipientEmail);
          } else {
            remaining.push(item);
          }
        } catch {
          remaining.push(item);
        }
      }
      saveOfflineQueue(remaining);
      setOfflineQueue(remaining);
      if (remaining.length < queue.length) {
        setSavedReports(loadHistory());
      }
    };

    const handleOnline = () => {
      setOfflineBanner(false);
      processQueue();
    };
    window.addEventListener("online", handleOnline);
    // Try processing on mount if online
    if (navigator.onLine) processQueue();
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  useEffect(() => {
    return () => {
      photoPreviews.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, [photoPreviews]);

  const handlePhotoSelection = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotoPreviews((current) => [...current, ...selected]);
    const defaultLegend = report?.suggestion_legende_photo || "";
    setPhotoLegends((current) => [...current, ...selected.map(() => defaultLegend)]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoPreviews((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
    setPhotoLegends((current) => {
      const next = [...current];
      next.splice(index, 1);
      return next;
    });
  };

  const resetFlow = () => {
    stopTimer();
    setStage("idle");
    setElapsed(0);
    setReport(null);
    setReportText("");
    setPhotoPreviews((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
    setIsEditing(false);
    setMessage(null);
    setPhotoLegends([]);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    audioBlobRef.current = null;
    setIsPlaying(false);
    setPlaybackTime(0);
    setAudioDuration(0);
    setActiveHintField(null);
    setHintTexts({});
    // Reset enrichment (but keep selected chantier for next time)
    setEnrichEtat(null);
    setEnrichUrgent(null);
    setEnrichTypeJournee(null);
    setEnrichment(null);
    setEnrichChantierSearch("");
  };

  const handleButtonClick = async () => {
    if (stage === "idle") {
      // Vérifier que le contexte est sécurisé (HTTPS ou localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMessage("Votre navigateur ne supporte pas la capture audio. Utilisez HTTPS ou un navigateur récent.");
        console.error("[AUDIO] navigator.mediaDevices indisponible — contexte non-sécurisé ou navigateur ancien");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 16000 },
            channelCount: { ideal: 1 },
          },
        });

        // Déterminer le format audio compatible avec le navigateur
        // Safari iOS ne supporte pas audio/webm — utiliser mp4/aac
        let mimeType = "audio/webm;codecs=opus";
        if (typeof MediaRecorder.isTypeSupported === "function") {
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/webm")) {
            mimeType = "audio/webm";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else if (MediaRecorder.isTypeSupported("audio/aac")) {
            mimeType = "audio/aac";
          } else {
            // Fallback : laisser le navigateur choisir
            mimeType = "";
          }
        }
        console.log("[AUDIO] Format sélectionné :", mimeType || "défaut navigateur");

        const recorderOptions: MediaRecorderOptions = {};
        if (mimeType) recorderOptions.mimeType = mimeType;
        mediaRecorderRef.current = new MediaRecorder(stream, recorderOptions);
        chunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = () => {
          const actualMime = mediaRecorderRef.current?.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: actualMime });
          console.log("[AUDIO] Enregistrement terminé :", (blob.size / 1024).toFixed(1), "KB, type:", actualMime);
          audioBlobRef.current = blob;
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          setStage("preview");
        };

        mediaRecorderRef.current.onerror = (event) => {
          console.error("[AUDIO] Erreur MediaRecorder :", event);
          setMessage("Erreur lors de l'enregistrement audio.");
          setStage("idle");
        };

        mediaRecorderRef.current.start(1000); // timeslice 1s pour Safari
        setStage("recording");
        setCurrentGeo(null);

        // Capture GPS position silently
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setCurrentGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
              console.log("[GPS] Position capturée:", pos.coords.latitude.toFixed(4), pos.coords.longitude.toFixed(4));
            },
            (err) => console.log("[GPS] Non disponible:", err.message),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
          );
        }

        timerRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1);
        }, 1000);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[AUDIO] Erreur d'accès au microphone :", err.name, err.message);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setMessage("Accès au microphone refusé. Autorisez le micro dans les paramètres de votre navigateur.");
        } else if (err.name === "NotFoundError") {
          setMessage("Aucun microphone détecté sur cet appareil.");
        } else if (err.name === "NotReadableError") {
          setMessage("Microphone déjà utilisé par une autre application.");
        } else {
          setMessage("Impossible d'accéder au microphone : " + err.message);
        }
      }
    } else if (stage === "recording") {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      stopTimer();
    }
  };

  // ── Audio preview: process the recorded blob ──
  const processAudio = async (enrichData?: EnrichmentData) => {
    if (!audioBlobRef.current) return;
    setStage("processing");
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.pause();

    const formData = new FormData();
    const blobType = audioBlobRef.current.type || "";
    let fileName = "enregistrement.webm";
    if (blobType.includes("mp4") || blobType.includes("m4a") || blobType.includes("aac")) {
      fileName = "enregistrement.m4a";
    } else if (blobType.includes("ogg")) fileName = "enregistrement.ogg";
    formData.append("audio", audioBlobRef.current, fileName);

    // Append manual text context from hint fields if filled
    const manualContext: Record<string, string> = {};
    if (hintTexts.lieu?.trim()) manualContext.lieu = hintTexts.lieu.trim();
    if (hintTexts.travaux?.trim()) manualContext.travaux = hintTexts.travaux.trim();
    if (hintTexts.problemes?.trim()) manualContext.problemes = hintTexts.problemes.trim();
    if (hintTexts.materiel?.trim()) manualContext.materiel = hintTexts.materiel.trim();
    if (Object.keys(manualContext).length > 0) {
      formData.append("manualContext", JSON.stringify(manualContext));
    }

    // Append enrichment data from post-recording step
    if (enrichData) {
      formData.append("enrichment", JSON.stringify(enrichData));
    }

    try {
      const response = await fetch("/api/process-report", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Erreur HTTP: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error);
      if (!result.report) throw new Error("Aucune donnée de rapport reçue.");

      // Inject enrichment data into report if not already set by AI
      const enrichedReport = { ...result.report } as ReportSections;
      if (enrichData?.chantierName && !enrichedReport.lieu_chantier) {
        enrichedReport.lieu_chantier = enrichData.chantierName;
      }

      setReport(enrichedReport);
      setReportText(buildReportText(enrichedReport));
      setStage("review");
    } catch (error) {
      console.error("Erreur traitement :", error);
      setMessage(error instanceof Error ? error.message : "Erreur serveur.");
      setStage("idle");
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSendReport = async () => {
    if (!report) {
      setMessage("Le rapport est vide. Impossible d'envoyer.");
      return;
    }

    if (!recipientEmail.trim()) {
      setMessage("Veuillez saisir l'email du destinataire avant d'envoyer.");
      return;
    }

    setIsSending(true);
    setMessage(null);

    // ── Offline: queue locally if no network ──
    if (!navigator.onLine) {
      try {
        const photosBase64: { name: string; type: string; data: string }[] = [];
        for (const photo of photoPreviews) {
          photosBase64.push({
            name: photo.file.name,
            type: photo.file.type,
            data: await fileToBase64(photo.file),
          });
        }
        const item: OfflineQueueItem = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          timestamp: Date.now(),
          report,
          recipientEmail,
          photoLegends,
          photosBase64,
        };
        const queue = loadOfflineQueue();
        queue.push(item);
        saveOfflineQueue(queue);
        setOfflineQueue(queue);
        setOfflineBanner(true);
        saveToHistory(report, recipientEmail, { userName: currentUser?.name, userRole: currentUser?.role, geo: currentGeo, enrichment });
        setSavedReports(loadHistory());
        localStorage.setItem("lastRecipientEmail", recipientEmail);
        setMessage("Rapport sauvegardé ! Il sera envoyé automatiquement dès le retour du réseau.");
        setStage("success");
      } catch (err) {
        console.error("[OFFLINE] Erreur sauvegarde :", err);
        setMessage("Impossible de sauvegarder le rapport hors-ligne.");
      } finally {
        setIsSending(false);
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append("report", JSON.stringify(report));
      formData.append("recipientEmail", recipientEmail);
      formData.append("duration", elapsed.toString());
      formData.append("photoLegends", JSON.stringify(photoLegends));
      photoPreviews.forEach((photo) => {
        formData.append("photos", photo.file);
      });

      const response = await fetch("/api/send-email", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errMsg = `Erreur serveur ${response.status}`;
        try {
          const result = await response.json();
          errMsg = result.error || errMsg;
        } catch { /* pas de JSON */ }
        alert(`Erreur d'envoi : ${errMsg}`);
        throw new Error(errMsg);
      }

      const result = await response.json();
      localStorage.setItem("lastRecipientEmail", recipientEmail);
      if (report) {
        saveToHistory(report, recipientEmail, { userName: currentUser?.name, userRole: currentUser?.role, geo: currentGeo, enrichment });
        setSavedReports(loadHistory());
      }
      setMessage(result.message ?? "Rapport envoyé avec succès !");
      setStage("success");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[ENVOI] Erreur :", errMsg);
      setMessage(errMsg || "Erreur lors de l'envoi du rapport.");
      if (!errMsg.includes("Erreur d'envoi")) {
        alert(`Erreur envoi : ${errMsg}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  // ── Statut global badge logic ──
  const statutRaw = report?.statut_global || "";
  const statutLevel: "green" | "orange" | "red" | "none" =
    /bon\s*d[eé]roulement|fluide|🟢/i.test(statutRaw) ? "green"
    : /quelques?\s*difficult[eé]s?|🟠/i.test(statutRaw) ? "orange"
    : /critique|🔴|urgent|grave|probl[eè]me/i.test(statutRaw) ? "red"
    : "none";

  const statutStyles: Record<string, string> = {
    green:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    orange: "border-amber-500/30   bg-amber-500/10   text-amber-300",
    red:    "border-red-500/30     bg-red-500/10     text-red-300",
    none:   "border-slate-700      bg-slate-800/50    text-slate-300",
  };

  const statutEmoji: Record<string, string> = { green: "🟢", orange: "🟠", red: "🔴", none: "📋" };
  const statutLabel: Record<string, string> = { green: "Bon déroulement", orange: "Quelques difficultés", red: "Situation critique", none: statutRaw };

  const sectionCardStyles: Record<string, { border: string; icon: string }> = {
    "Travaux réalisés":     { border: "border-l-emerald-400", icon: "text-emerald-400" },
    "Problèmes rencontrés": { border: "border-l-red-400",     icon: "text-red-400" },
    "Matériel manquant":    { border: "border-l-amber-400",   icon: "text-amber-400" },
    "À prévoir":            { border: "border-l-sky-400",     icon: "text-sky-400" },
  };

  const reportSections = [
    { title: "Travaux réalisés",     items: report?.travaux_realises || [],     icon: FileText },
    { title: "Problèmes rencontrés", items: report?.problemes_rencontres || [], icon: ShieldAlert },
    { title: "Matériel manquant",    items: report?.materiel_manquant || [],    icon: Package },
    { title: "À prévoir",            items: report?.a_prevoir || [],            icon: CalendarDays },
  ];

  // ── User setup gate: show on first launch ──
  if (userLoaded && !currentUser) {
    return (
      <UserSetup onComplete={(user) => {
        saveUser(user);
        setCurrentUser(user);
      }} />
    );
  }

  if (stage !== "review") {
    const isRecording = stage === "recording";

    // ── Success screen ──
    if (stage === "success") {
      return (
        <main className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 py-10">
          {/* Subtle radial glow behind icon */}
          <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-emerald-500/10 blur-[80px]" />

          <div className="relative z-10 flex flex-col items-center w-full max-w-sm text-center">
            <CheckCircle className="h-24 w-24 text-emerald-400 animate-scaleIn mb-8" />
            <h1 className="text-3xl font-bold text-white mb-3 animate-fadeInUp stagger-2">
              {offlineBanner ? "Rapport sauvegardé !" : "Rapport envoyé\u00a0!"}
            </h1>
            <p className="text-base text-slate-400 mb-6 leading-relaxed animate-fadeInUp stagger-3">
              {offlineBanner
                ? "Il sera envoyé automatiquement au retour du réseau."
                : <>Transmis par email à <span className="font-medium text-slate-200">{recipientEmail}</span></>
              }
            </p>
            {offlineBanner && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 mb-6 animate-fadeInUp stagger-3">
                <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">{offlineQueue.length} rapport{offlineQueue.length > 1 ? "s" : ""} en attente d&apos;envoi</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => { setOfflineBanner(false); resetFlow(); }}
              className="flex items-center gap-2.5 rounded-xl bg-sky-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:bg-sky-400 hover:scale-[1.02] active:scale-[0.98] animate-fadeInUp stagger-4"
            >
              <Mic className="h-4 w-4" />
              Nouveau rapport
            </button>
          </div>
        </main>
      );
    }

    // ── Dashboard screen ──
    if (stage === "dashboard") {
      return (
        <EliteDashboard
          reports={savedReports}
          userName={currentUser?.name}
          onNewReport={() => { setStage("idle"); }}
          onDeleteAll={() => { clearHistory(); setSavedReports([]); }}
          onClose={() => setStage("idle")}
        />
      );
    }

    // ── Audio preview screen ──
    if (stage === "preview" && audioUrl) {
      const progress = audioDuration > 0 ? (playbackTime / audioDuration) * 100 : 0;
      const totalDur = audioDuration > 0 ? audioDuration : elapsed;
      const totalDurSec = Math.round(totalDur);
      const BARS = 60;

      const handleWaveSeek = (barIndex: number) => {
        if (!audioRef.current || totalDur <= 0) return;
        const seekTime = (barIndex / BARS) * totalDur;
        audioRef.current.currentTime = seekTime;
        setPlaybackTime(seekTime);
      };

      return (
        <main className="vf-body">
          <div className="vf-orb vf-orb-1" />
          <div className="vf-orb vf-orb-2" />
          <div className="vf-orb vf-orb-3" />

          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={audioUrl}
            className="hidden"
            onLoadedMetadata={() => {
              if (audioRef.current) {
                const d = audioRef.current.duration;
                setAudioDuration(Number.isFinite(d) ? d : elapsed);
              }
            }}
            onTimeUpdate={() => {
              if (audioRef.current) setPlaybackTime(audioRef.current.currentTime);
            }}
            onEnded={() => {
              setIsPlaying(false);
              setPlaybackTime(0);
            }}
          />

          <div className="vf-wrap">

            {/* Badge */}
            <div className="vf-badge">
              <span className="vf-badge-check">✓</span>
              Enregistrement réussi
            </div>

            {/* Title */}
            <h1 className="vf-title">Vérifiez votre enregistrement</h1>
            <p className="vf-subtitle">Réécoutez avant de générer le rapport</p>

            {/* Player */}
            <div className="vf-player">
              <button
                type="button"
                className="vf-play-btn"
                aria-label={isPlaying ? "Pause" : "Lecture"}
                onClick={togglePlayback}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              {/* Waveform */}
              <div className="vf-waveform">
                {Array.from({ length: BARS }).map((_, i) => {
                  const t = i / BARS;
                  const h = 25 + Math.sin(t * 12) * 30 + Math.sin(t * 27) * 20 + ((Math.sin(i * 137.5) + 1) * 15);
                  const height = Math.max(15, Math.min(100, h));
                  const played = totalDur > 0 && (i / BARS) < (playbackTime / totalDur);
                  return (
                    <div
                      key={i}
                      className={`vf-bar${played ? " played" : ""}`}
                      style={{ height: `${height}%` }}
                      onClick={() => handleWaveSeek(i)}
                    />
                  );
                })}
              </div>

              {/* Timer */}
              <div className="vf-timer">
                <span className="vf-timer-current">{formatTime(Math.floor(playbackTime))}</span>
                <span className="vf-timer-sep">/</span>
                <span>{formatTime(Math.floor(totalDur))}</span>
              </div>
            </div>

            {/* Info row */}
            <div className="vf-info-row">
              <div className="vf-info-left">
                <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
                Audio capturé · {totalDurSec} seconde{totalDurSec !== 1 ? "s" : ""}
              </div>
              <div className="vf-quality">Qualité HD</div>
            </div>

            {/* CTA */}
            <button
              type="button"
              className="vf-cta"
              onClick={() => {
                setIsPlaying(false);
                if (audioRef.current) audioRef.current.pause();
                setStage("enrich");
              }}
            >
              <span className="vf-cta-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#050811" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="15" y2="17" />
                </svg>
              </span>
              Générer mon rapport
              <span className="vf-cta-arrow">→</span>
            </button>

            {/* Restart */}
            <button
              type="button"
              className="vf-restart"
              onClick={resetFlow}
            >
              <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
              Recommencer l&apos;enregistrement
            </button>
          </div>
        </main>
      );
    }

    // ── Enrichment screen — chantier selection + quick options ──
    if (stage === "enrich") {
      const searchLower = enrichChantierSearch.toLowerCase();
      const filteredChantiers = enrichChantierSearch
        ? chantierList.filter(c => c.name.toLowerCase().includes(searchLower))
        : chantierList.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8);
      const selectedChantierObj = chantierList.find(c => c.id === enrichSelectedChantier);
      const isNewChantier = enrichChantierSearch.trim() && !filteredChantiers.some(c => c.name.toLowerCase() === searchLower);
      const canProceed = !!enrichSelectedChantier || (!!enrichChantierSearch.trim());

      const handleEnrichSubmit = () => {
        let chantierId: string;
        let chantierName: string;
        if (enrichSelectedChantier && selectedChantierObj) {
          chantierId = selectedChantierObj.id;
          chantierName = selectedChantierObj.name;
          addOrUpdateChantier(chantierName);
        } else if (enrichChantierSearch.trim()) {
          const entry = addOrUpdateChantier(enrichChantierSearch.trim());
          chantierId = entry.id;
          chantierName = entry.name;
          setEnrichSelectedChantier(entry.id);
        } else {
          return;
        }
        setChantierList(loadChantiers());
        const data: EnrichmentData = {
          chantierId,
          chantierName,
          etatGlobal: enrichEtat ?? undefined,
          urgent: enrichUrgent ?? undefined,
          typeJournee: enrichTypeJournee ?? undefined,
        };
        setEnrichment(data);
        processAudio(data);
      };

      return (
        <main className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 flex flex-col items-center overflow-hidden px-5 py-8">
          <div className="relative z-10 w-full max-w-md space-y-5 overflow-hidden break-words">

            {/* Header */}
            <div className="text-center animate-fadeIn">
              <HardHat className="h-10 w-10 text-amber-400 mx-auto mb-3" />
              <h1 className="text-lg font-bold text-white mb-1">Compléter le rapport</h1>
              <p className="text-sm text-slate-400">Sélectionnez le chantier en 1 clic</p>
            </div>

            {/* ── Chantier selection (required) ── */}
            <div className="animate-fadeInUp stagger-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
                À quel chantier correspond ce rapport ? *
              </label>
              {/* Search input */}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  autoFocus
                  value={selectedChantierObj ? selectedChantierObj.name : enrichChantierSearch}
                  onChange={(e) => {
                    setEnrichChantierSearch(e.target.value);
                    setEnrichSelectedChantier(null);
                  }}
                  onFocus={() => {
                    if (selectedChantierObj) {
                      setEnrichChantierSearch(selectedChantierObj.name);
                      setEnrichSelectedChantier(null);
                    }
                  }}
                  placeholder="Rechercher ou créer un chantier..."
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all"
                />
              </div>

              {/* Chantier list — quick tap */}
              {!selectedChantierObj && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {filteredChantiers.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => { setEnrichSelectedChantier(c.id); setEnrichChantierSearch(""); }}
                      className="w-full flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-left transition-all hover:border-slate-600 hover:bg-slate-800/60 active:scale-[0.98] min-w-0"
                    >
                      <MapPin className="h-4 w-4 text-sky-400 shrink-0" />
                      <span className="text-sm text-white truncate min-w-0">{c.name}</span>
                    </button>
                  ))}

                  {/* Create new chantier */}
                  {isNewChantier && (
                    <button
                      type="button"
                      onClick={() => {
                        const entry = addOrUpdateChantier(enrichChantierSearch.trim());
                        setEnrichSelectedChantier(entry.id);
                        setChantierList(loadChantiers());
                        setEnrichChantierSearch("");
                      }}
                      className="w-full flex items-center gap-3 rounded-xl border border-dashed border-sky-500/40 bg-sky-500/5 px-4 py-3 text-left transition-all hover:border-sky-400 hover:bg-sky-500/10 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4 text-sky-400 shrink-0" />
                      <span className="text-sm text-sky-300 truncate min-w-0">Créer &laquo;&nbsp;{enrichChantierSearch.trim()}&nbsp;&raquo;</span>
                    </button>
                  )}

                  {filteredChantiers.length === 0 && !isNewChantier && !enrichChantierSearch && (
                    <p className="text-sm text-slate-600 text-center py-4">
                      Tapez le nom du chantier
                    </p>
                  )}
                </div>
              )}

              {/* Selected chantier badge */}
              {selectedChantierObj && (
                <div className="flex items-center gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 min-w-0 overflow-hidden">
                  <MapPin className="h-4 w-4 text-sky-400 shrink-0" />
                  <span className="text-sm font-medium text-sky-300 flex-1 truncate min-w-0">{selectedChantierObj.name}</span>
                  <button type="button" onClick={() => { setEnrichSelectedChantier(null); setEnrichChantierSearch(""); }} className="text-slate-400 hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* ── État global (optional) ── */}
            <div className="animate-fadeInUp stagger-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Comment s&apos;est passée la journée ?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "fluide" as const,    emoji: "🟢", label: "Fluide" },
                  { key: "difficile" as const, emoji: "🟠", label: "Difficultés" },
                  { key: "critique" as const,  emoji: "🔴", label: "Critique" },
                ]).map(({ key, emoji, label }) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setEnrichEtat(enrichEtat === key ? null : key)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all active:scale-[0.95] ${
                      enrichEtat === key
                        ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
                        : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-xl">{emoji}</span>
                    <span className={`text-xs font-medium ${enrichEtat === key ? "text-white" : "text-slate-400"}`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Urgence (optional) ── */}
            <div className="animate-fadeInUp stagger-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Quelque chose d&apos;urgent ?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { val: true,  emoji: "🚨", label: "Oui, urgent" },
                  { val: false, emoji: "👌", label: "Non" },
                ]).map(({ val, emoji, label }) => (
                  <button
                    type="button"
                    key={String(val)}
                    onClick={() => setEnrichUrgent(enrichUrgent === val ? null : val)}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 transition-all active:scale-[0.95] ${
                      enrichUrgent === val
                        ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
                        : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-lg">{emoji}</span>
                    <span className={`text-sm font-medium ${enrichUrgent === val ? "text-white" : "text-slate-400"}`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Type de journée (optional) ── */}
            <div className="animate-fadeInUp stagger-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Type de journée
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "normal" as const,   emoji: "✅", label: "Normal" },
                  { key: "retard" as const,   emoji: "⏳", label: "Retard" },
                  { key: "blocage" as const,  emoji: "🛑", label: "Blocage" },
                  { key: "incident" as const, emoji: "⚠️",  label: "Incident" },
                ]).map(({ key, emoji, label }) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setEnrichTypeJournee(enrichTypeJournee === key ? null : key)}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 transition-all active:scale-[0.95] ${
                      enrichTypeJournee === key
                        ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
                        : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-lg">{emoji}</span>
                    <span className={`text-sm font-medium ${enrichTypeJournee === key ? "text-white" : "text-slate-400"}`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Generate button ── */}
            <div className="pt-2 space-y-3 animate-fadeInUp stagger-5">
              <button
                type="button"
                onClick={handleEnrichSubmit}
                disabled={!canProceed}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-4 text-base font-semibold text-black transition-all duration-200 hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-4.5 w-4.5" />
                Générer le rapport
              </button>
              <button
                type="button"
                onClick={() => setStage("preview")}
                className="flex w-full items-center justify-center gap-2 text-sm font-light text-slate-400 transition hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Retour
              </button>
            </div>

          </div>
        </main>
      );
    }

    // ── Processing screen ──
    if (stage === "processing") {
      return (
        <main className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 flex flex-col items-center justify-center overflow-hidden px-6 py-10">
          <div className="flex flex-col items-center gap-6 animate-fadeIn">
            <div className="flex h-28 w-28 items-center justify-center rounded-full animate-scaleIn">
              <Loader2 className="h-12 w-12 text-sky-400 animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-base font-medium text-white animate-fadeInUp stagger-2">
                Analyse en cours...
              </p>
              <div className="space-y-1.5 animate-fadeInUp stagger-3">
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
                  Transcription vocale
                </p>
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-slate-600" />
                  Structuration du rapport
                </p>
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-slate-600" />
                  Analyse des risques
                </p>
              </div>
            </div>
          </div>
        </main>
      );
    }

    // ── Recording screen ──
    if (isRecording) {
      return (
        <div className="rc-body">
          <div className="rc-orb rc-orb-1" />
          <div className="rc-orb rc-orb-2" />
          <div className="rc-orb rc-orb-3" />
          <div className="rc-wrap">
            {/* Recording badge */}
            <div className="rc-badge">
              <span className="rc-badge-dot rc-badge-dot-rec" />
              En écoute...
            </div>

            {/* Timer */}
            <p className="rc-timer">{formatTime(elapsed)}</p>

            {/* Sound wave */}
            <div className="rc-wave">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rc-wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>

            {/* Stop mic button */}
            <div className="rc-mic-area rc-mic-area-rec">
              <div className="rc-mic-glow rc-mic-glow-rec" />
              <button type="button" className="rc-mic" onClick={handleButtonClick} aria-label="Arrêter l'enregistrement">
                <svg viewBox="0 0 24 24" fill="#fff" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            </div>

            <p className="rc-instruction">Appuyez pour terminer</p>
          </div>
        </div>
      );
    }

    // ── Idle screen (default) ──
    return (
      <div className="rc-body">
        <div className="rc-orb rc-orb-1" />
        <div className="rc-orb rc-orb-2" />
        <div className="rc-orb rc-orb-3" />
        <div className="rc-wrap">
          {/* Badge */}
          <div className="rc-badge">
            <span className="rc-badge-dot" />
            30 secondes suffisent
          </div>

          {/* Title */}
          <h1 className="rc-title">Nouveau rapport</h1>
          <p className="rc-subtitle">Appuyez et décrivez votre journée</p>

          {/* Mic button */}
          <div className="rc-mic-area">
            <div className="rc-mic-glow" />
            <button type="button" className="rc-mic" onClick={handleButtonClick} aria-label="Démarrer l'enregistrement">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="17" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </button>
          </div>

          {/* Stat — rotating encouragement */}
          <div className="rc-stat">
            <span className="rc-live">Live</span>
            <span key={encourageIdx} className="rc-stat-text">{ENCOURAGEMENT_PHRASES[encourageIdx]}</span>
          </div>

          {/* Category hint cards */}
          <div className="rc-categories">
            {([
              { label: "Lieu",       hint: "Chantier, ville",   fieldKey: "lieu",
                icon: <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
              { label: "Travaux",    hint: "Ce qui a été fait",  fieldKey: "travaux",
                icon: <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg> },
              { label: "Problèmes", hint: "Retards, pannes",   fieldKey: "problemes",
                icon: <svg viewBox="0 0 24 24"><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              { label: "Matériel",  hint: "Ce qui manque",     fieldKey: "materiel",
                icon: <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
            ] as { icon: React.ReactNode; label: string; hint: string; fieldKey: string }[]).map(
              ({ icon, label, hint, fieldKey }) => (
                <div key={label}>
                  <button
                    type="button"
                    onClick={() => setActiveHintField(activeHintField === fieldKey ? null : fieldKey)}
                    className={`rc-cat${activeHintField === fieldKey ? " rc-cat-active" : ""}`}
                  >
                    <span className="rc-cat-icon">{icon}</span>
                    <span className="rc-cat-text">
                      <strong>{label}</strong>
                      <span>{hint}</span>
                    </span>
                    <span className="rc-cat-mini-mic">
                      <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm5 9a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
                    </span>
                  </button>
                  {activeHintField === fieldKey && (
                    <input
                      type="text"
                      autoFocus
                      value={hintTexts[fieldKey] || ""}
                      onChange={(e) => setHintTexts((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                      placeholder={`Saisir ${label.toLowerCase()}...`}
                      className="rc-cat-input"
                    />
                  )}
                </div>
              )
            )}
          </div>

          {/* Offline queue banner */}
          {offlineQueue.length > 0 && (
            <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 w-full animate-fadeIn">
              <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300 flex-1">{offlineQueue.length} rapport{offlineQueue.length > 1 ? "s" : ""} en attente d&apos;envoi</p>
              {navigator.onLine && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("online"))}
                  className="text-[10px] text-amber-400 font-semibold hover:text-amber-300"
                >
                  Réessayer
                </button>
              )}
            </div>
          )}

          {/* Dashboard button */}
          {savedReports.length > 0 && (
            <button
              type="button"
              onClick={() => setStage("dashboard")}
              className="mt-6 flex items-center justify-center gap-2 w-full rounded-xl bg-slate-800/40 border border-slate-700/50 px-4 py-3 text-sm text-slate-400 hover:text-white hover:border-slate-600 transition-all animate-fadeIn stagger-8"
            >
              <BarChart3 className="h-4 w-4" />
              Dashboard
              <span className="ml-auto rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-300">{savedReports.length}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Vue 2 : Validation — Mobile-first, single column
  const scoreValue = report?.score;
  const scoreColor = scoreValue && scoreValue >= 7 ? "text-emerald-400" : scoreValue && scoreValue >= 5 ? "text-amber-400" : "text-red-400";
  const scoreBg = scoreValue && scoreValue >= 7 ? "bg-emerald-500/10 border-emerald-500/30" : scoreValue && scoreValue >= 5 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30";
  const alertes = report?.alertes || [];
  const impacts = report?.impacts || [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-6 overflow-x-hidden">
      <div className="mx-auto w-full max-w-md space-y-4 break-words">

        {/* ── TOP BAR: Status + Score ── */}
        <div className="flex items-stretch gap-3 animate-scaleIn overflow-hidden">
          {/* Status badge */}
          <div className={`flex-1 min-w-0 rounded-2xl border-2 px-4 py-3.5 text-center ${statutStyles[statutLevel]}`}>
            <p className="text-base font-bold leading-tight truncate">{statutEmoji[statutLevel]} {statutLabel[statutLevel]}</p>
          </div>
          {/* Score */}
          {scoreValue && (
            <div className={`flex flex-col items-center justify-center rounded-2xl border-2 px-5 py-3.5 ${scoreBg}`}>
              <p className={`text-2xl font-bold leading-none ${scoreColor}`}>{scoreValue}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">/10</p>
            </div>
          )}
        </div>

        {/* ── AI Synthesis ── */}
        {report?.synthese && (
          <p className="text-sm italic text-slate-300 text-center leading-relaxed px-2 animate-fadeIn stagger-1">
            &laquo;&nbsp;{report.synthese}&nbsp;&raquo;
          </p>
        )}

        {/* ── Alerts banner ── */}
        {alertes.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 space-y-2 animate-fadeInUp stagger-1">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-3.5 w-3.5 text-red-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400">Alertes</p>
            </div>
            {alertes.map((a, i) => (
              <p key={i} className="text-sm text-red-200 leading-relaxed break-words">{a}</p>
            ))}
          </div>
        )}

        {/* Message feedback */}
        {message && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-200">
            {message}
          </div>
        )}

        {/* Lieu + meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 animate-fadeIn stagger-1 overflow-hidden">
          {report?.lieu_chantier && (
            <div className="flex items-center gap-1.5 text-sm text-slate-400 min-w-0 max-w-full">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{report.lieu_chantier}</span>
            </div>
          )}
          {report?.equipe && (
            <span className="text-xs text-slate-500 truncate">• {report.equipe}</span>
          )}
          {report?.avancement && (
            <span className="text-xs text-slate-500 truncate">• {report.avancement}</span>
          )}
        </div>

        {/* Cartes du rapport / Édition */}
        {isEditing ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Mode édition
            </p>
            <textarea
              value={reportText}
              onChange={(event) => setReportText(event.target.value)}
              className="w-full resize-none rounded-lg border border-slate-700/60 bg-slate-950 p-3 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
              rows={12}
              placeholder="Modifiez le contenu du rapport..."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {reportSections.map((section, idx) => {
              const hasItems = section.items.length > 0;
              const cardStyle = sectionCardStyles[section.title] || { border: "border-l-slate-600", icon: "text-slate-500" };
              const isProblemes = section.title === "Problèmes rencontrés";
              return (
                <div
                  key={section.title}
                  className={`rounded-xl border border-slate-800 border-l-[3px] ${cardStyle.border} bg-slate-900/50 p-4 animate-fadeInUp stagger-${idx + 2}`}
                >
                  <div className="mb-2 flex items-center gap-2.5">
                    <section.icon className={`h-4 w-4 shrink-0 ${cardStyle.icon}`} />
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {section.title}
                    </p>
                  </div>
                  {hasItems ? (
                    <ul className="space-y-1.5 overflow-hidden">
                      {section.items.map((item, i) => {
                        if (isProblemes) {
                          const { level, text } = parseSeverity(item);
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-200 break-words overflow-hidden">
                              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                level === "critique" ? "bg-red-500" : level === "attention" ? "bg-amber-500" : "bg-slate-500"
                              }`} />
                              <span className="min-w-0">{text}</span>
                            </li>
                          );
                        }
                        return (
                          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-200 break-words overflow-hidden">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                            <span className="min-w-0">{item}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Rien à signaler</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Photos */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 animate-fadeInUp stagger-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Photos chantier
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => handlePhotoSelection(event.target.files)}
          />

          {photoPreviews.length > 0 ? (
            <div className="space-y-3">
              {photoPreviews.map((photo, index) => (
                <div key={photo.previewUrl} className="space-y-2">
                  <div className="relative overflow-hidden rounded-lg border border-slate-700/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="h-40 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-slate-300 transition hover:bg-red-500 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={photoLegends[index] || ""}
                    onChange={(e) => {
                      setPhotoLegends((current) => {
                        const next = [...current];
                        next[index] = e.target.value;
                        return next;
                      });
                    }}
                    placeholder="Légende de la photo..."
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950 px-3 py-2 text-xs text-slate-300 outline-none placeholder:text-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Aucune photo.</p>
          )}
        </div>

        {/* Email — simplified */}
        <div className="animate-fadeInUp stagger-7">
          {recipientEmail && !showEmailEdit ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="text-sm text-slate-200 truncate">{recipientEmail}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailEdit(true)}
                className="text-xs text-slate-500 hover:text-white transition shrink-0 ml-3"
              >
                Modifier
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="email-input"
                className="text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Destinataire
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                <input
                  id="email-input"
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  onBlur={() => { if (recipientEmail) setShowEmailEdit(false); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                  placeholder="patron@entreprise.fr"
                  autoFocus={showEmailEdit}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bouton principal */}
        <button
          type="button"
          onClick={handleSendReport}
          disabled={isSending}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-sky-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:bg-sky-400 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 animate-fadeInUp stagger-8"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="truncate">{isSending ? "Envoi en cours..." : recipientEmail ? `Envoyer à ${recipientEmail.split("@")[0]}@…` : "Valider & Envoyer"}</span>
        </button>

        {/* Boutons secondaires */}
        <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            className="inline-flex items-center gap-1.5 transition hover:text-white"
          >
            <Edit3 className="h-3.5 w-3.5" />
            {isEditing ? "Aperçu" : "Modifier"}
          </button>
          <span className="h-3 w-px bg-slate-800" />
          <button
            type="button"
            onClick={resetFlow}
            className="inline-flex items-center gap-1.5 transition hover:text-white"
          >
            <Mic className="h-3.5 w-3.5" />
            Recommencer
          </button>
        </div>

      </div>

      {/* Chat flottant */}
      <Chat />
    </main>
  );
}
