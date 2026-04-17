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
  CheckSquare,
  Send,
  Calendar,
  Camera,
  Home,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Chat from "../components/Chat";
import EliteDashboard from "../components/EliteDashboard";
import type { GeoLocation } from "../lib/types";
import { clearHistory } from "../lib/storage";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Stage = "idle" | "recording" | "enrich" | "processing" | "review" | "success" | "dashboard";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  // Init sync depuis localStorage — élimine le flash "null → rendu"
  const [recipientEmail, setRecipientEmail] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("lastRecipientEmail") || "" : ""
  );
  const [photoPreviews, setPhotoPreviews] = useState<{ file: File; previewUrl: string }[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [photoLegends, setPhotoLegends] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => loadHistory());
  const [dashboardChantier, setDashboardChantier] = useState<Chantier | null>(null);
  const [dashboardReportDetail, setDashboardReportDetail] = useState<SavedReport | null>(null);

  const [encourageIdx, setEncourageIdx] = useState(0);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(() => loadOfflineQueue());
  const [offlineBanner, setOfflineBanner] = useState(false);
  // ── Enrichment step state ──
  const [chantierList, setChantierList] = useState<ChantierEntry[]>(() => loadChantiers());
  const [enrichChantierSearch, setEnrichChantierSearch] = useState("");
  const [enrichSelectedChantier, setEnrichSelectedChantier] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(LAST_CHANTIER_KEY) : null
  );
  const [enrichEtat, setEnrichEtat] = useState<"fluide" | "difficile" | "critique" | null>(null);
  const [enrichUrgent, setEnrichUrgent] = useState<boolean | null>(null);
  const [enrichTypeJournee, setEnrichTypeJournee] = useState<"normal" | "retard" | "blocage" | "incident" | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  // ── Worker identity — init sync pour éviter le rendu "null" initial ──
  const [workerName, setWorkerName] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("worker_name") || "" : ""
  );
  const [workerDeviceId, setWorkerDeviceId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("worker_device_id") : null
  );
  const [workerCompanyId, setWorkerCompanyId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("worker_company_id") : null
  );
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
          setStage("enrich");
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
              onClick={resetFlow}
              className="en-back"
            >
              <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
              Recommencer
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
      { icon: MapPin,        color: "text-sky-400",     iconBg: "bg-slate-950 border-sky-500/50",     label: "Lieu du chantier",     hint: "Nommez le chantier ou la ville" },
      { icon: Wrench,        color: "text-violet-400",  iconBg: "bg-slate-950 border-violet-500/50",  label: "Travaux réalisés",      hint: "Décrivez les tâches effectuées" },
      { icon: TriangleAlert, color: "text-amber-400",   iconBg: "bg-slate-950 border-amber-500/50",   label: "Problèmes rencontrés",  hint: "Retards, pannes, incidents" },
      { icon: Package,       color: "text-emerald-400", iconBg: "bg-slate-950 border-emerald-500/50", label: "Matériel manquant",     hint: "Ce qui manque pour avancer" },
    ] as const;

    return (
      <main
        className="relative bg-slate-950 overflow-hidden flex flex-col"
        style={{ height: "100dvh" }}
      >
        {/* Ambient — très subtil, pas de glassmorphism */}
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-5%,rgba(30,58,138,0.20),transparent)]" />
        </div>

        {/* Colonne principale — distribue tout l'espace vertical sans scroll */}
        <div
          className="relative z-10 flex flex-col flex-1 w-full max-w-lg mx-auto px-5 min-h-0"
          style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
        >

          {/* ── Header ── */}
          <motion.div
            className="text-center pt-5 pb-2 shrink-0"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }}
          >
            {workerName && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Bonjour, <span className="text-slate-400">{workerName}</span>
              </p>
            )}
            <h1 className="text-2xl font-black text-white tracking-tight">Nouveau rapport</h1>
          </motion.div>

          {/* ── Bouton micro — centré dans l'espace restant ── */}
          <motion.div
            className="flex-1 flex flex-col items-center justify-center min-h-0"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.55, ease: EASE, delay: 0.1 } }}
          >
            <div className="relative flex items-center justify-center">
              {/* Anneaux décoratifs solides */}
              <div className="absolute w-52 h-52 rounded-full border border-slate-800" />
              <div className="absolute w-44 h-44 rounded-full border border-slate-700/70" />

              <motion.button
                type="button"
                onClick={handleButtonClick}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.94 }}
                aria-label="Démarrer l'enregistrement"
                className="relative rounded-full flex items-center justify-center"
                style={{
                  width: 148,
                  height: 148,
                  background: "linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 55%, #2563eb 100%)",
                  boxShadow:
                    "0 0 0 4px rgba(37,99,235,0.18), 0 0 50px rgba(37,99,235,0.32), inset 0 1px 0 rgba(255,255,255,0.14), 0 18px 40px rgba(0,0,0,0.65)",
                }}
              >
                <div className="absolute inset-[12px] rounded-full border border-white/10 pointer-events-none" />
                <Mic className="w-14 h-14 text-white relative z-10" />
              </motion.button>
            </div>

            {/* ── Panneau de statut — bloc physique, mt-6 sous le bouton ── */}
            <div className="mt-6 w-full">
              <div
                className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5"
                style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)" }}
              >
                <span
                  className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"
                  style={{ boxShadow: "0 0 8px rgba(52,211,153,0.75)" }}
                />
                <AnimatePresence mode="wait">
                  <motion.span
                    key={encourageIdx}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm font-semibold text-slate-100"
                  >
                    {ENCOURAGEMENT_PHRASES[encourageIdx]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* ── Grille des 4 cartes — épinglée en bas ── */}
          <motion.div
            className="w-full shrink-0 pb-2"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.18 } } }}
          >
            {offlineQueue.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-2.5 w-full flex items-center gap-2.5 rounded-xl border border-amber-600/50 bg-amber-950/40 px-3 py-2"
                style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.45)" }}
              >
                <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-200 flex-1 font-semibold">
                  {offlineQueue.length} rapport{offlineQueue.length > 1 ? "s" : ""} en attente d&apos;envoi
                </p>
                {typeof navigator !== "undefined" && navigator.onLine && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("online"))}
                    className="text-[10px] text-amber-400 font-bold hover:text-amber-200"
                  >
                    Réessayer
                  </button>
                )}
              </motion.div>
            )}

            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5 text-center">
              Vous pouvez mentionner
            </p>

            <div className="grid grid-cols-2 gap-3">
              {GUIDE_ITEMS.map(({ icon: Icon, color, iconBg, label, hint }) => (
                <motion.div
                  key={label}
                  variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } } }}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-700 bg-slate-900"
                  style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.03)" }}
                >
                  <div className={`w-9 h-9 rounded-lg border ${iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white leading-tight">{label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{hint}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

        </div>

        {/* ── Bottom nav — fond solide, bordure franche ── */}
        <div
          className="fixed bottom-0 inset-x-0 z-50"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="mx-auto max-w-lg px-4">
            <div
              className="rounded-t-2xl border border-slate-800 bg-slate-950 px-2 py-3"
              style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center justify-around">
                <button type="button" onClick={() => setStage("dashboard")} className="relative flex flex-col items-center gap-1 px-4 py-1 group">
                  <div className="relative">
                    <LayoutDashboard className="w-5 h-5 text-slate-400 group-hover:text-sky-400 transition-colors" />
                    {savedReports.length > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-black text-slate-950 flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 0 8px rgba(251,191,36,0.6)" }}
                      >
                        {savedReports.length > 9 ? "9+" : savedReports.length}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors">Rapports</span>
                </button>
                <div className="flex flex-col items-center gap-1 px-4 py-1">
                  <div className="w-8 h-8 rounded-xl bg-blue-900/60 border border-blue-600/50 flex items-center justify-center">
                    <Mic className="w-4 h-4 text-sky-400" />
                  </div>
                  <span className="text-[10px] font-bold text-sky-400">Enregistrer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );

  }

  // ── Review screen (premium) ──
  const scoreValue = report?.score;
  const circumference = 2 * Math.PI * 30;
  const scoreOffset = circumference * (1 - (scoreValue ?? 0) / 10);

  const scoreColor =
    scoreValue && scoreValue >= 7 ? { grad: ["#86efac","#22c55e"], text: "#4ade80", glow: "rgba(74,222,128,0.45)" }
    : scoreValue && scoreValue >= 5 ? { grad: ["#fde047","#f59e0b"], text: "#fbbf24", glow: "rgba(251,191,36,0.45)" }
    : { grad: ["#fda4af","#e11d48"], text: "#f87171", glow: "rgba(248,113,113,0.45)" };

  const badgeStyle = {
    green:  { pill: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
    orange: { pill: "bg-amber-500/15   border-amber-500/30   text-amber-300"   },
    red:    { pill: "bg-red-500/15     border-red-500/30     text-red-300"     },
    none:   { pill: "bg-slate-700/50   border-slate-600       text-slate-300"   },
  };
  const bs = badgeStyle[statutLevel];

  const reportCards = [
    {
      label: "Travaux réalisés",
      items: report?.travaux_realises || [],
      icon: CheckSquare,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      border: "border-l-emerald-500",
      dot: "bg-emerald-400",
      empty: "Aucune tâche enregistrée",
    },
    {
      label: "Problèmes rencontrés",
      items: (report?.problemes_rencontres || []).map((i) => parseSeverity(i).text),
      icon: ShieldAlert,
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/20",
      border: "border-l-red-500",
      dot: "bg-red-400",
      empty: "Aucun incident signalé",
    },
    {
      label: "Matériel manquant",
      items: report?.materiel_manquant || [],
      icon: Package,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      border: "border-l-amber-500",
      dot: "bg-amber-400",
      empty: "Aucun manque déclaré",
    },
    {
      label: "À prévoir",
      items: report?.a_prevoir || [],
      icon: Calendar,
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      border: "border-l-blue-500",
      dot: "bg-blue-400",
      empty: "Aucune action planifiée",
    },
  ] as const;

  const alertes = report?.alertes || [];
  const chantierName = report?.lieu_chantier || "";

  const CARD_VARIANTS = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: EASE, delay: i * 0.09 },
    }),
  };

  return (
    <main className="relative min-h-screen bg-slate-950 pb-32 overflow-hidden">

      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute bottom-0 right-[-60px] w-[400px] h-[400px] rounded-full bg-sky-600/6 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto px-4 pt-8 pb-4">

        {/* Breadcrumb */}
        <motion.div
          className="flex items-center gap-1.5 text-xs text-slate-600 mb-4"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE } }}
        >
          <Home className="w-3.5 h-3.5" />
          <span>Rapports</span>
          <span className="text-slate-700">›</span>
          <span className="text-slate-400 font-medium">Récapitulatif</span>
          {chantierName && (
            <>
              <span className="text-slate-700">›</span>
              <span className="text-slate-500 truncate max-w-[120px]">{chantierName}</span>
            </>
          )}
        </motion.div>

        {/* Score hero card */}
        <motion.div
          className="relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md overflow-hidden mb-3 p-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }}
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-3 min-w-0">
              <span className={`inline-flex self-start items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${bs.pill}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {statutLabel[statutLevel]}
              </span>
              <div className="space-y-0.5">
                <p className="text-base font-black text-white leading-tight">
                  {chantierName || "Rapport du jour"}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  {" · "}
                  {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {scoreValue != null && (
              <div className="relative shrink-0 w-[72px] h-[72px]">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 70 70">
                  <defs>
                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={scoreColor.grad[0]} />
                      <stop offset="100%" stopColor={scoreColor.grad[1]} />
                    </linearGradient>
                  </defs>
                  <circle cx="35" cy="35" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                  <circle
                    cx="35" cy="35" r="30"
                    fill="none"
                    stroke="url(#scoreGrad)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={scoreOffset}
                    style={{ filter: `drop-shadow(0 0 6px ${scoreColor.glow})` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black leading-none" style={{ color: scoreColor.text }}>{scoreValue}</span>
                  <span className="text-[9px] font-semibold" style={{ color: scoreColor.text + "99" }}>/10</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Alertes critiques */}
        {alertes.length > 0 && (
          <motion.div
            className="rounded-2xl border border-red-500/25 bg-red-500/8 backdrop-blur-sm mb-3 overflow-hidden"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: 0.1 } }}
          >
            <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-red-500/15">
              <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                <Bell className="w-3.5 h-3.5 text-red-400" />
              </div>
              <span className="text-xs font-black text-red-400 uppercase tracking-widest">Alertes critiques</span>
              <span className="ml-auto rounded-full bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] font-bold px-2 py-0.5">{alertes.length}</span>
            </div>
            <ul className="px-4 py-3 space-y-2">
              {alertes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-200/80">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Section header: Détail du rapport */}
        <motion.p
          className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.18 } }}
        >
          <span className="h-px flex-1 bg-slate-800" />
          Détail du rapport
          <span className="h-px flex-1 bg-slate-800" />
        </motion.p>

        {/* 4 report cards */}
        <div className="space-y-2 mb-3">
          {reportCards.map(({ label, items, icon: Icon, color, bg, border, dot, empty }, idx) => (
            <motion.div
              key={label}
              custom={idx}
              variants={CARD_VARIANTS}
              initial="hidden"
              animate="show"
              className={`relative rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm border-l-4 ${border} overflow-hidden`}
            >
              <div className="flex items-start gap-3 p-3">
                <div className={`w-9 h-9 rounded-xl border ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white mb-1.5">{label}</p>
                  {items.length > 0 ? (
                    <ul className="space-y-1.5">
                      {(items as readonly string[]).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-snug">
                          <span className={`mt-1.5 w-1 h-1 rounded-full ${dot} shrink-0`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-600 italic">{empty}</p>
                  )}
                </div>

                <div className={`shrink-0 w-6 h-6 rounded-full border ${bg} flex items-center justify-center`}>
                  <span className={`text-[10px] font-black ${color}`}>{items.length}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Section header: Annexes & envoi */}
        <motion.p
          className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.5 } }}
        >
          <span className="h-px flex-1 bg-slate-800" />
          Annexes &amp; envoi
          <span className="h-px flex-1 bg-slate-800" />
        </motion.p>

        {/* Photos upload */}
        <motion.div
          className="rounded-xl border border-white/8 bg-white/[0.03] backdrop-blur-sm mb-2.5 overflow-hidden"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: 0.52 } }}
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/6">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Camera className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Photos chantier</p>
              <p className="text-xs text-slate-500">
                {photoPreviews.length > 0
                  ? `${photoPreviews.length} photo${photoPreviews.length > 1 ? "s" : ""} ajoutée${photoPreviews.length > 1 ? "s" : ""}`
                  : "Aucune photo ajoutée"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhotoSelection(e.target.files)}
          />
          {photoPreviews.length > 0 ? (
            <div className="p-3 grid grid-cols-4 gap-2">
              {photoPreviews.map((photo, index) => (
                <div key={photo.previewUrl} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 border border-white/20 flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 px-4 text-slate-700">
              <Camera className="w-7 h-7 opacity-40" />
              <p className="text-xs">Appuyez sur Ajouter pour joindre des photos</p>
            </div>
          )}
        </motion.div>

        {/* Email input */}
        <motion.div
          className="rounded-xl border border-white/8 bg-white/[0.03] backdrop-blur-sm mb-3 flex items-center gap-3 px-3.5 py-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: 0.58 } }}
        >
          <Send className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="Email du destinataire…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
          />
        </motion.div>

        {/* Secondary actions */}
        <div className="flex items-center justify-center gap-5 mb-2">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            {isEditing ? "Aperçu" : "Modifier le texte"}
          </button>
          <span className="w-px h-3 bg-slate-800" />
          <button
            type="button"
            onClick={resetFlow}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5"
          >
            <Mic className="w-3.5 h-3.5" />
            Recommencer
          </button>
        </div>

        {isEditing && (
          <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none p-4 resize-none"
              rows={10}
              placeholder="Modifiez le contenu du rapport…"
            />
          </div>
        )}

        {message && (
          <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {message}
          </div>
        )}

      </div>

      {/* Sticky send CTA */}
      <div className="fixed bottom-0 inset-x-0 z-30">
        <div className="mx-auto max-w-lg px-4 pb-5 pt-3" style={{ background: "linear-gradient(to top, rgba(2,6,23,0.95) 70%, transparent)" }}>
          <motion.button
            type="button"
            onClick={handleSendReport}
            disabled={isSending}
            whileHover={isSending ? {} : { scale: 1.02 }}
            whileTap={isSending ? {} : { scale: 0.97 }}
            className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-base font-black text-white disabled:opacity-60 transition-opacity"
            style={{
              background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)",
              boxShadow: isSending ? "none" : "0 0 40px rgba(59,130,246,0.45), 0 8px 32px rgba(29,78,216,0.5), 0 20px 40px rgba(0,0,0,0.4)",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: 0.65 } }}
          >
            {isSending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Envoi en cours…
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Envoyer le rapport
              </>
            )}
          </motion.button>
        </div>
      </div>

    </main>
  );
}