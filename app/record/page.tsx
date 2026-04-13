"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  ShieldAlert,
  Package,
  CalendarDays,
  Loader2,
  X,
  FileText,
  Mic,
  MapPin,
  CheckCircle,
  BarChart3,
  WifiOff,
  LayoutDashboard,
  Lock,
  Settings,
  User,
  Bell,
  Wrench,
  TriangleAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Chat from "../components/Chat";
import EliteDashboard from "../components/EliteDashboard";
import type { GeoLocation } from "../lib/types";
import { clearHistory } from "../lib/storage";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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


export default function RecordPage() {
  const router = useRouter();
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
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [dashboardChantier, setDashboardChantier] = useState<Chantier | null>(null);
  const [dashboardReportDetail, setDashboardReportDetail] = useState<SavedReport | null>(null);

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
  // ── Worker identity (from localStorage after /worker-onboarding) ──
  const [workerName, setWorkerName] = useState<string>("");
  const [workerDeviceId, setWorkerDeviceId] = useState<string | null>(null);
  const [workerCompanyId, setWorkerCompanyId] = useState<string | null>(null);
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
    // ── Guard: worker must be registered ──
    const deviceId = localStorage.getItem("worker_device_id");
    if (!deviceId) {
      router.replace("/");
      return;
    }
    setWorkerDeviceId(deviceId);
    setWorkerName(localStorage.getItem("worker_name") || "");
    setWorkerCompanyId(localStorage.getItem("worker_company_id"));

    const storedEmail = localStorage.getItem("lastRecipientEmail");
    if (storedEmail) setRecipientEmail(storedEmail);
    setSavedReports(loadHistory());
    setOfflineQueue(loadOfflineQueue());
    const list = loadChantiers();
    setChantierList(list);
    const lastId = localStorage.getItem(LAST_CHANTIER_KEY);
    if (lastId) setEnrichSelectedChantier(lastId);
    return () => stopTimer();
  }, [stopTimer, router]);

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
        saveToHistory(report, recipientEmail, { userName: workerName, userRole: "Terrain", geo: currentGeo, enrichment });
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
        saveToHistory(report, recipientEmail, { userName: workerName, userRole: "Terrain", geo: currentGeo, enrichment });
        setSavedReports(loadHistory());
        // Save to DB for admin dashboard
        if (workerDeviceId) {
          fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              worker_device_id: workerDeviceId,
              data: JSON.stringify(report),
              score: report.score ?? null,
              chantier: enrichment?.chantierName ?? report.lieu_chantier ?? null,
            }),
          }).catch(() => { /* non-blocking */ });
        }
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

  // If device_id not yet loaded (redirect pending), show nothing
  if (!workerDeviceId) return null;

  if (stage !== "review") {
    const isRecording = stage === "recording";

    // ── Success screen ──
    if (stage === "success") {
      return (
        <main className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
          </div>
          <motion.div
            className="relative z-10 flex flex-col items-center w-full max-w-sm text-center"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
          >
            <motion.div
              variants={{ hidden: { scale: 0.5, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 20 } } }}
              className="mb-8"
            >
              <div className="relative w-28 h-28 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"
                style={{ boxShadow: "0 0 60px rgba(52,211,153,0.25)" }}>
                <CheckCircle className="w-14 h-14 text-emerald-400" />
              </div>
            </motion.div>

            <motion.h1
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
              className="text-3xl font-black text-white mb-3"
            >
              {offlineBanner ? "Rapport sauvegardé !" : "Rapport envoyé !"}
            </motion.h1>

            <motion.p
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
              className="text-base text-slate-400 mb-6 leading-relaxed"
            >
              {offlineBanner
                ? "Il sera envoyé automatiquement au retour du réseau."
                : <>Transmis par email à <span className="font-semibold text-slate-200">{recipientEmail}</span></>
              }
            </motion.p>

            {offlineBanner && (
              <motion.div
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 mb-6"
              >
                <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">{offlineQueue.length} rapport{offlineQueue.length > 1 ? "s" : ""} en attente d&apos;envoi</p>
              </motion.div>
            )}

            <motion.button
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
              type="button"
              onClick={() => { setOfflineBanner(false); resetFlow(); }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2.5 rounded-2xl px-8 py-4 text-sm font-bold text-white shadow-xl transition-colors"
              style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)", boxShadow: "0 8px 30px rgba(14,165,233,0.3)" }}
            >
              <Mic className="h-4 w-4" />
              Nouveau rapport
            </motion.button>
          </motion.div>
        </main>
      );
    }

    // ── Dashboard screen ──
    if (stage === "dashboard") {
      return (
        <EliteDashboard
          reports={savedReports}
          userName={workerName}
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
        <main className="en-body">
          <div className="en-orb en-orb-1" />
          <div className="en-orb en-orb-2" />
          <div className="en-orb en-orb-3" />

          <div className="en-wrap en-wrap-center">

            <h1 className="en-title">Quel chantier ?</h1>

            {/* ── Chantier (required) ── */}
            <div className="en-section en-section-center">

              {!selectedChantierObj ? (
                <>
                  <div className="en-search-wrap en-search-big">
                    <svg className="en-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input
                      type="text"
                      autoFocus
                      value={enrichChantierSearch}
                      onChange={(e) => {
                        setEnrichChantierSearch(e.target.value);
                        setEnrichSelectedChantier(null);
                      }}
                      placeholder="Nom du chantier..."
                      className="en-search"
                    />
                  </div>

                  {/* Chantier list */}
                  <div className="en-chantier-list">
                    {filteredChantiers.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => { setEnrichSelectedChantier(c.id); setEnrichChantierSearch(""); }}
                        className="en-chantier-item"
                      >
                        <MapPin className="en-chantier-pin" />
                        <span className="en-chantier-name">{c.name}</span>
                      </button>
                    ))}

                    {isNewChantier && (
                      <button
                        type="button"
                        onClick={() => {
                          const entry = addOrUpdateChantier(enrichChantierSearch.trim());
                          setEnrichSelectedChantier(entry.id);
                          setChantierList(loadChantiers());
                          setEnrichChantierSearch("");
                        }}
                        className="en-chantier-create"
                      >
                        <Plus className="en-chantier-pin" />
                        <span className="en-chantier-new-name">Créer &laquo;&nbsp;{enrichChantierSearch.trim()}&nbsp;&raquo;</span>
                      </button>
                    )}

                    {filteredChantiers.length === 0 && !isNewChantier && !enrichChantierSearch && (
                      <p className="en-hint">Tapez le nom du chantier</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="en-selected-badge en-selected-big">
                  <MapPin className="en-chantier-pin" />
                  <span className="en-selected-name">{selectedChantierObj.name}</span>
                  <button type="button" onClick={() => { setEnrichSelectedChantier(null); setEnrichChantierSearch(""); }} className="en-selected-clear">
                    <X className="en-selected-x" />
                  </button>
                </div>
              )}
            </div>

            {/* ── CTA ── */}
            <button
              type="button"
              onClick={handleEnrichSubmit}
              className={`en-cta${!canProceed ? " disabled" : ""}`}
              disabled={!canProceed}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#050811" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
              Générer le rapport
              <span className="en-cta-arrow">→</span>
            </button>

            {/* Back */}
            <button
              type="button"
              onClick={() => setStage("preview")}
              className="en-back"
            >
              <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
              Retour
            </button>

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
        <main className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-600/12 blur-[130px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-red-500/8 blur-[60px]" />
          </div>

          <motion.div
            className="relative z-10 flex flex-col items-center text-center gap-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, ease: EASE } }}
          >
            {/* Live badge */}
            <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-xs font-bold text-red-300 uppercase tracking-widest">En écoute…</span>
            </div>

            {/* Timer */}
            <p className="text-6xl font-black text-white tabular-nums tracking-tight">{formatTime(elapsed)}</p>

            {/* Sound bars */}
            <div className="flex items-end gap-1.5 h-10">
              {[0,1,2,3,4,5,6].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 rounded-full bg-red-400"
                  animate={{ height: ["30%", "100%", "50%", "80%", "30%"] }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatType: "mirror", delay: i * 0.1, ease: "easeInOut" }}
                  style={{ minHeight: 6 }}
                />
              ))}
            </div>

            {/* Pulsing stop button */}
            <div className="relative flex items-center justify-center">
              {/* Pulse rings */}
              <motion.div
                className="absolute w-40 h-40 rounded-full border border-red-500/20"
                animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute w-40 h-40 rounded-full border border-red-500/15"
                animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
              />
              <motion.button
                type="button"
                onClick={handleButtonClick}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Arrêter l'enregistrement"
                className="relative w-28 h-28 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", boxShadow: "0 0 40px rgba(239,68,68,0.5), 0 20px 40px rgba(0,0,0,0.4)" }}
              >
                {/* Stop icon */}
                <div className="w-10 h-10 rounded-lg bg-white/90" />
              </motion.button>
            </div>

            <p className="text-sm text-slate-500 font-medium">Appuyez pour terminer</p>
          </motion.div>
        </main>
      );
    }

    // ── Idle screen (default) ──
    const GUIDE_ITEMS = [
      { icon: MapPin,        color: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/20",       glow: "group-hover:border-sky-500/45",     label: "Lieu du chantier",     hint: "Nommez le chantier ou la ville" },
      { icon: Wrench,        color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20", glow: "group-hover:border-violet-500/45",   label: "Travaux réalisés",      hint: "Décrivez les tâches effectuées" },
      { icon: TriangleAlert, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   glow: "group-hover:border-amber-500/45",    label: "Problèmes rencontrés", hint: "Retards, pannes, incidents" },
      { icon: Package,       color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20",glow: "group-hover:border-emerald-500/45", label: "Matériel manquant",     hint: "Ce qui manque pour avancer" },
    ] as const;

    return (
      <main className="relative min-h-screen bg-slate-950 flex flex-col pb-24 overflow-hidden">
        {/* Ambient */}
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sky-600/10 blur-[140px]" />
          <div className="absolute top-[20%] right-[-80px] w-[350px] h-[350px] rounded-full bg-violet-600/8 blur-[100px]" />
          <div className="absolute bottom-0 left-[20%] w-[400px] h-[300px] rounded-full bg-indigo-600/6 blur-[100px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center px-5 pt-14 pb-6 w-full max-w-lg mx-auto">
          {/* Header */}
          <motion.div
            className="text-center mb-10 w-full"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }}
          >
            {workerName && (
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Bonjour, <span className="text-slate-400">{workerName}</span>
              </p>
            )}
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">Nouveau rapport</h1>
            <p className="text-base text-slate-400">Appuyez et décrivez votre journée</p>
          </motion.div>

          {/* Mic button */}
          <motion.div
            className="flex flex-col items-center mb-10"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.55, ease: EASE, delay: 0.1 } }}
          >
            <div className="relative flex items-center justify-center mb-5">
              <div className="absolute w-48 h-48 rounded-full border border-white/5" />
              <div className="absolute w-36 h-36 rounded-full border border-white/8" />
              <motion.button
                type="button"
                onClick={handleButtonClick}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                aria-label="Démarrer l'enregistrement"
                className="relative w-28 h-28 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                  boxShadow: "0 0 50px rgba(99,102,241,0.4), 0 0 100px rgba(37,99,235,0.15), 0 20px 40px rgba(0,0,0,0.5)",
                }}
              >
                <Mic className="w-11 h-11 text-white" />
              </motion.button>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-md px-5 py-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <AnimatePresence mode="wait">
                <motion.span
                  key={encourageIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-slate-300 font-medium"
                >
                  {ENCOURAGEMENT_PHRASES[encourageIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Guide cards */}
          <motion.div
            className="w-full"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } } }}
          >
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 text-center">Vous pouvez mentionner</p>
            <div className="grid grid-cols-2 gap-3">
              {GUIDE_ITEMS.map(({ icon: Icon, color, bg, glow, label, hint }) => (
                <motion.div
                  key={label}
                  variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                  whileHover={{ y: -3, transition: { duration: 0.2 } }}
                  className={`group flex flex-col gap-3 p-4 rounded-2xl border bg-white/[0.03] backdrop-blur-sm border-white/8 ${glow} transition-colors duration-300`}
                >
                  <div className={`w-9 h-9 rounded-xl border ${bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{label}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-snug">{hint}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Offline banner */}
          {offlineQueue.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 w-full flex items-center gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
              <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300 flex-1">{offlineQueue.length} rapport{offlineQueue.length > 1 ? "s" : ""} en attente d&apos;envoi</p>
              {typeof navigator !== "undefined" && navigator.onLine && (
                <button type="button" onClick={() => window.dispatchEvent(new Event("online"))} className="text-[10px] text-amber-400 font-semibold hover:text-amber-300">Réessayer</button>
              )}
            </motion.div>
          )}
        </div>

        {/* Bottom nav */}
        <div className="fixed bottom-0 inset-x-0 z-20">
          <div className="mx-auto max-w-lg px-4">
            <div className="rounded-t-2xl border border-white/8 bg-slate-950/90 backdrop-blur-xl px-2 py-3">
              <div className="flex items-center justify-around">
                <button type="button" onClick={() => setStage("dashboard")} className="relative flex flex-col items-center gap-1 px-4 py-1 group">
                  <div className="relative">
                    <LayoutDashboard className="w-5 h-5 text-slate-400 group-hover:text-sky-400 transition-colors" />
                    {savedReports.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-black text-slate-950 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 0 8px rgba(251,191,36,0.6)" }}>
                        {savedReports.length > 9 ? "9+" : savedReports.length}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors">Rapports</span>
                </button>
                <div className="flex flex-col items-center gap-1 px-4 py-1">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                    <Mic className="w-4 h-4 text-sky-400" />
                  </div>
                  <span className="text-[10px] font-bold text-sky-400">Enregistrer</span>
                </div>
                <button type="button" onClick={() => router.push("/")} className="flex flex-col items-center gap-1 px-4 py-1 group">
                  <Settings className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors">Accueil</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-center gap-1.5 py-3 mt-2">
          <Lock className="w-3 h-3 text-slate-700" />
          <p className="text-xs text-slate-700">Vos données sont sécurisées et cryptées</p>
        </div>
      </main>
    );

  }

  // Vue 2 : Validation — Mobile-first, single column
  const scoreValue = report?.score;
  const circumference = 2 * Math.PI * 30; // ≈ 188.5
  const scoreOffset = circumference * (1 - (scoreValue || 0) / 10);
  const scoreGradient: [string, string] =
    scoreValue && scoreValue >= 7 ? ["#86efac", "#22c55e"]
    : scoreValue && scoreValue >= 5 ? ["#fde047", "#f59e0b"]
    : ["#fda4af", "#e11d48"];
  const scoreTextColor =
    scoreValue && scoreValue >= 7 ? "#4ade80"
    : scoreValue && scoreValue >= 5 ? "#fbbf24"
    : "#f87171";
  const scoreGlowColor =
    scoreValue && scoreValue >= 7 ? "rgba(74,222,128,0.5)"
    : scoreValue && scoreValue >= 5 ? "rgba(251,191,36,0.5)"
    : "rgba(248,113,113,0.5)";

  // Hero color scheme based on status
  const heroColors =
    statutLevel === "green"  ? { bg: "rgba(74,222,128,0.10)", bgEnd: "rgba(20,184,100,0.04)", border: "rgba(74,222,128,0.22)", glow: "rgba(74,222,128,0.15)", pillBg: "rgba(74,222,128,0.15)", pillBorder: "rgba(74,222,128,0.3)", pillText: "#86efac", dot: "#4ade80", quoteBorder: "rgba(74,222,128,0.4)", lineGrad: "rgba(74,222,128,0.5)", blobGrad: "rgba(74,222,128,0.18)" }
    : statutLevel === "orange" ? { bg: "rgba(251,191,36,0.10)", bgEnd: "rgba(184,140,20,0.04)", border: "rgba(251,191,36,0.22)", glow: "rgba(251,191,36,0.15)", pillBg: "rgba(251,191,36,0.15)", pillBorder: "rgba(251,191,36,0.3)", pillText: "#fde68a", dot: "#fbbf24", quoteBorder: "rgba(251,191,36,0.4)", lineGrad: "rgba(251,191,36,0.5)", blobGrad: "rgba(251,191,36,0.18)" }
    : statutLevel === "red"    ? { bg: "rgba(248,113,113,0.10)", bgEnd: "rgba(184,50,50,0.04)", border: "rgba(248,113,113,0.22)", glow: "rgba(248,113,113,0.15)", pillBg: "rgba(248,113,113,0.15)", pillBorder: "rgba(248,113,113,0.3)", pillText: "#fca5a5", dot: "#f87171", quoteBorder: "rgba(248,113,113,0.4)", lineGrad: "rgba(248,113,113,0.5)", blobGrad: "rgba(248,113,113,0.18)" }
    : { bg: "rgba(74,222,128,0.10)", bgEnd: "rgba(20,184,100,0.04)", border: "rgba(74,222,128,0.22)", glow: "rgba(74,222,128,0.15)", pillBg: "rgba(74,222,128,0.15)", pillBorder: "rgba(74,222,128,0.3)", pillText: "#86efac", dot: "#4ade80", quoteBorder: "rgba(74,222,128,0.4)", lineGrad: "rgba(74,222,128,0.5)", blobGrad: "rgba(74,222,128,0.18)" };

  // Format date: "10 avril 2026"
  const reportDate = new Date();
  const frenchMonths = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const day = reportDate.getDate();
  const dayStr = day === 1 ? "1er" : String(day);
  const formattedDate = `${dayStr} ${frenchMonths[reportDate.getMonth()]} ${reportDate.getFullYear()}`;
  const formattedTime = reportDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  // Rubrique data
  const travauxItems = report?.travaux_realises || [];
  const problemesItems = report?.problemes_rencontres || [];
  const materielItems = report?.materiel_manquant || [];
  const aPrevoirItems = report?.a_prevoir || [];
  const alertes = report?.alertes || [];
  const chantierName = report?.lieu_chantier || "";

  return (
    <main className="rv-body">
      <div className="rv-orb rv-orb-1" />
      <div className="rv-orb rv-orb-2" />

      <div className="rv-wrap">

        {/* BREADCRUMB */}
        <div className="rv-crumb">
          <svg viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3"/></svg>
          Rapports
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          <span className="rv-crumb-now">Récapitulatif</span>
        </div>

        {/* HERO STATUS */}
        <div
          className="rv-hero"
          style={{
            background: `linear-gradient(135deg, ${heroColors.bg} 0%, ${heroColors.bgEnd} 60%, rgba(20,24,42,0.4) 100%)`,
            border: `1px solid ${heroColors.border}`,
            boxShadow: `0 20px 50px -20px ${heroColors.glow}`,
          }}
        >
          <div className="rv-hero-line" style={{ background: `linear-gradient(90deg, transparent, ${heroColors.lineGrad}, transparent)` }} />
          <div className="rv-hero-blob" style={{ background: `radial-gradient(circle, ${heroColors.blobGrad}, transparent 70%)` }} />

          <div className="rv-hero-top">
            <div className="rv-hero-left" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="rv-hero-pill" style={{ background: heroColors.pillBg, borderColor: heroColors.pillBorder, color: heroColors.pillText, fontSize: 15, padding: '8px 18px', minWidth: 0 }}>
                Quelques difficultés
              </div>
              {scoreValue != null && (
                <div className="rv-score-ring" style={{ marginLeft: 12 }}>
                  <svg viewBox="0 0 70 70">
                    <defs>
                      <linearGradient id="rvScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={scoreGradient[0]} />
                        <stop offset="100%" stopColor={scoreGradient[1]} />
                      </linearGradient>
                    </defs>
                    <circle className="rv-score-track" cx="35" cy="35" r="30" />
                    <circle
                      className="rv-score-progress"
                      cx="35" cy="35" r="30"
                      style={{ strokeDashoffset: scoreOffset, filter: `drop-shadow(0 0 8px ${scoreGlowColor})` }}
                    />
                  </svg>
                  <div className="rv-score-num" style={{ fontSize: 18 }}>
                    <strong style={{ color: scoreTextColor }}>{scoreValue}</strong>
                    <span style={{ color: `${scoreTextColor}99` }}>/ 10</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* No synthese/quote */}
        </div>

        {/* Alerts banner */}
        {alertes.length > 0 && (
          <div className="rv-alerts">
            <div className="rv-alerts-header">
              <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              Alertes
            </div>
            {alertes.map((a, i) => (
              <p key={i} className="rv-alerts-text">{a}</p>
            ))}
          </div>
        )}

        {/* Message feedback */}
        {message && (
          <div className="rv-message">{message}</div>
        )}

        {/* RUBRIQUES */}
        <div className="rv-section-label">
          <span />
          Détail du rapport
        </div>

        {isEditing ? (
          <div className="rv-edit-box">
            <p className="rv-edit-label">Mode édition</p>
            <textarea
              value={reportText}
              onChange={(event) => setReportText(event.target.value)}
              className="rv-edit-textarea"
              rows={12}
              placeholder="Modifiez le contenu du rapport..."
            />
          </div>
        ) : (
          <div className="rv-rubriques">
            {/* Travaux réalisés */}
            <div className="rv-rubrique green">
              <div className="rv-rub-icon">
                <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </div>
              <div className="rv-rub-body">
                <div className="rv-rub-title">Travaux réalisés</div>
                <div className={`rv-rub-content${travauxItems.length === 0 ? " empty" : ""}`}>
                  {travauxItems.length > 0
                    ? <ul className="rv-rub-list">{travauxItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    : "Aucune tâche enregistrée"}
                </div>
              </div>
              <div className="rv-rub-badge">{travauxItems.length}</div>
            </div>

            {/* Problèmes rencontrés */}
            <div className="rv-rubrique red">
              <div className="rv-rub-icon">
                <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div className="rv-rub-body">
                <div className="rv-rub-title">Problèmes rencontrés</div>
                <div className={`rv-rub-content${problemesItems.length === 0 ? " empty" : ""}`}>
                  {problemesItems.length > 0
                    ? <ul className="rv-rub-list">{problemesItems.map((item, i) => <li key={i}>{parseSeverity(item).text}</li>)}</ul>
                    : "Aucun incident signalé"}
                </div>
              </div>
              <div className="rv-rub-badge">{problemesItems.length}</div>
            </div>

            {/* Matériel manquant */}
            <div className="rv-rubrique amber">
              <div className="rv-rub-icon">
                <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </div>
              <div className="rv-rub-body">
                <div className="rv-rub-title">Matériel manquant</div>
                <div className={`rv-rub-content${materielItems.length === 0 ? " empty" : ""}`}>
                  {materielItems.length > 0
                    ? <ul className="rv-rub-list">{materielItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    : "Aucun manque déclaré"}
                </div>
              </div>
              <div className="rv-rub-badge">{materielItems.length}</div>
            </div>

            {/* À prévoir */}
            <div className="rv-rubrique cyan">
              <div className="rv-rub-icon">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="15" x2="13" y2="15"/></svg>
              </div>
              <div className="rv-rub-body">
                <div className="rv-rub-title">À prévoir</div>
                <div className={`rv-rub-content${aPrevoirItems.length === 0 ? " empty" : ""}`}>
                  {aPrevoirItems.length > 0
                    ? <ul className="rv-rub-list">{aPrevoirItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    : "Aucune action planifiée"}
                </div>
              </div>
              <div className="rv-rub-badge">{aPrevoirItems.length}</div>
            </div>
          </div>
        )}

        {/* ANNEXES */}
        <div className="rv-section-label">
          <span />
          Annexes &amp; envoi
        </div>

        {/* Photos */}
        <div className="rv-photo-card">
          <div className="rv-photo-head">
            <div className="rv-photo-head-left">
              <div className="rv-photo-head-icon">
                <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
              <div className="rv-photo-head-text">
                <strong>Photos chantier</strong>
                <span>{photoPreviews.length > 0 ? `${photoPreviews.length} photo${photoPreviews.length > 1 ? "s" : ""} ajoutée${photoPreviews.length > 1 ? "s" : ""}` : "Aucune photo ajoutée"}</span>
              </div>
            </div>
            <button type="button" className="rv-add-btn" onClick={() => fileInputRef.current?.click()}>
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
            <div className="rv-photo-grid">
              {photoPreviews.map((photo, index) => (
                <div key={photo.previewUrl} className="rv-photo-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={`Photo ${index + 1}`} />
                  <button type="button" className="rv-photo-remove" onClick={() => handleRemovePhoto(index)}>
                    <X className="rv-photo-remove-x" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rv-photo-empty">
              <div className="rv-photo-empty-ico">
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
              </div>
              <span>Appuyez sur Ajouter pour joindre des photos</span>
            </div>
          )}
        </div>

        {/* Email */}
        <div className="rv-email-card">
          <div className="rv-email-ico">
            <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <div className="rv-email-input-wrap">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="rv-email-input"
              placeholder="Entrez l'adresse email du destinataire..."
            />
          </div>
        </div>

        {/* Secondary buttons */}
        <div className="rv-secondary">
          <button type="button" onClick={() => setIsEditing((current) => !current)} className="rv-secondary-btn">
            <svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            {isEditing ? "Aperçu" : "Modifier"}
          </button>
          <span className="rv-secondary-sep" />
          <button type="button" onClick={resetFlow} className="rv-secondary-btn">
            <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm5 9a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
            Recommencer
          </button>
        </div>

      </div>

      {/* CTA STICKY */}
      <div className="rv-cta-bar">
        <div className="rv-cta-inner">
          <button
            type="button"
            className={`rv-cta${isSending ? " rv-cta-disabled" : ""}`}
            onClick={handleSendReport}
            disabled={isSending}
          >
            {isSending ? (
              <span className="rv-cta-spinner" />
            ) : (
              <span className="rv-cta-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </span>
            )}
            {isSending ? "Envoi en cours…" : "Envoyer le rapport"}
          </button>
        </div>
      </div>

    </main>
  );
}
