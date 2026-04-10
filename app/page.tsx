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
  Square,
  MapPin,
  Hammer,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import Chat from "./components/Chat";

type Stage = "idle" | "recording" | "preview" | "processing" | "review" | "success";

type ReportSections = {
  statut_global: string;
  synthese?: string;
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
    return () => stopTimer();
  }, [stopTimer]);

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
  const processAudio = async () => {
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

      setReport(result.report);
      setReportText(buildReportText(result.report));
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
            <h1 className="text-3xl font-bold text-white mb-3 animate-fadeInUp stagger-2">Rapport envoyé&nbsp;!</h1>
            <p className="text-base text-slate-400 mb-10 leading-relaxed animate-fadeInUp stagger-3">
              Transmis par email à <span className="font-medium text-slate-200">{recipientEmail}</span>
            </p>
            <button
              type="button"
              onClick={resetFlow}
              className="flex items-center gap-2.5 rounded-xl bg-sky-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:bg-sky-400 hover:scale-[1.02] active:scale-[0.98] animate-fadeInUp stagger-4"
            >
              <Mic className="h-4 w-4" />
              Nouveau rapport
            </button>
          </div>
        </main>
      );
    }

    // ── Audio preview screen ──
    if (stage === "preview" && audioUrl) {
      const progress = audioDuration > 0 ? (playbackTime / audioDuration) * 100 : 0;
      return (
        <main className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 flex flex-col items-center justify-center overflow-hidden px-6 py-10">
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

          <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
            <p className="mb-3 text-center text-lg font-light text-white/80 animate-fadeIn">
              Vérifiez votre enregistrement
            </p>
            <p className="mb-10 text-center text-sm font-light text-slate-400 animate-fadeIn stagger-1">
              Réécoutez avant de lancer l&apos;analyse IA
            </p>

            {/* Pill audio player */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-full backdrop-blur-md p-2 flex items-center gap-4 w-full max-w-sm mx-auto animate-scaleIn stagger-2">
              {/* Play / Pause button */}
              <button
                type="button"
                onClick={togglePlayback}
                className="flex h-11 w-11 shrink-0 items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>

              {/* Progress bar */}
              <div className="h-1 bg-slate-700 rounded-full flex-1 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Time display */}
              <span className="text-xs text-slate-400 font-mono shrink-0 pr-1">
                {formatTime(Math.floor(playbackTime))}/{formatTime(audioDuration > 0 ? Math.floor(audioDuration) : elapsed)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="mt-10 flex flex-col items-center gap-4 w-full animate-fadeInUp stagger-3">
              <button
                type="button"
                onClick={processAudio}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4" />
                Générer le rapport
              </button>
              <button
                type="button"
                onClick={resetFlow}
                className="flex items-center gap-2 text-sm font-light text-slate-400 transition hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Recommencer
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
          <div className="flex flex-col items-center gap-5 animate-fadeIn">
            <div className="flex h-36 w-36 items-center justify-center rounded-full animate-scaleIn">
              <Loader2 className="h-14 w-14 text-sky-400 animate-spin" />
            </div>
            <p className="text-base font-light text-sky-400 animate-pulse animate-fadeInUp stagger-2">
              Analyse de votre rapport en cours...
            </p>
            <p className="text-sm font-light text-slate-500 animate-fadeInUp stagger-3">
              Notre IA structure votre rapport...
            </p>
          </div>
        </main>
      );
    }

    // ── Recording screen ──
    if (isRecording) {
      return (
        <main className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 flex flex-col items-center justify-center overflow-hidden px-6 py-10">
          <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
            {/* Recording indicator */}
            <div className="flex items-center gap-2 mb-6 animate-fadeIn">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 blink" />
              <span className="text-sm font-medium text-red-400">En écoute...</span>
            </div>

            {/* Timer */}
            <p className="text-5xl font-light font-mono text-white tracking-widest mb-8 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
              {formatTime(elapsed)}
            </p>

            {/* Sound wave visualization */}
            <div className="flex items-center justify-center gap-[5px] h-10 mb-10">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-red-400/70 sound-bar"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>

            {/* Stop button */}
            <button
              type="button"
              onClick={handleButtonClick}
              className="relative z-10 flex h-36 w-36 items-center justify-center rounded-full bg-red-700 hover:bg-red-600 text-white transition-all duration-300 focus:outline-none active:scale-95 shadow-none pulse-ring"
            >
              <Square className="h-12 w-12 fill-white" />
            </button>

            {/* Instruction */}
            <p className="text-sm font-light text-slate-400 mt-6">
              Appuyez pour terminer
            </p>
          </div>
        </main>
      );
    }

    // ── Idle screen (default) ──
    return (
      <main className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 flex flex-col items-center justify-center overflow-hidden px-6 py-10">
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/60 border border-slate-700/50 px-3.5 py-1.5 mb-6 animate-fadeIn">
            <span className="text-xs text-slate-400">⏱️ 30 secondes suffisent</span>
          </div>

          {/* Title */}
          <h1 className="text-xl font-semibold text-white mb-1.5 animate-fadeIn stagger-1">
            Nouveau rapport
          </h1>
          <p className="text-sm font-light text-slate-400 mb-10 animate-fadeIn stagger-2">
            Appuyez et décrivez votre journée
          </p>

          {/* Mic button */}
          <button
            type="button"
            onClick={handleButtonClick}
            className="relative z-10 flex h-36 w-36 items-center justify-center rounded-full bg-red-600 hover:bg-red-500 hover:scale-105 text-white transition-all duration-300 focus:outline-none active:scale-95 shadow-none animate-scaleIn stagger-2"
          >
            <Mic className="h-12 w-12" />
          </button>

          {/* Reassurance */}
          <p className="text-sm font-light text-slate-400 mt-6 animate-fadeIn stagger-3">
            Parlez naturellement, comme à votre patron
          </p>

          {/* Hint chips — compact 2×2 grid */}
          <div className="mt-10 grid grid-cols-2 gap-2 w-full">
            {([
              { icon: MapPin,        label: "Lieu",       hint: "Chantier, ville" },
              { icon: Hammer,        label: "Travaux",    hint: "Ce qui a été fait" },
              { icon: AlertTriangle, label: "Problèmes",  hint: "Retards, pannes" },
              { icon: Package,       label: "Matériel",   hint: "Ce qui manque" },
            ] as { icon: React.ElementType; label: string; hint: string }[]).map(
              ({ icon: Icon, label, hint }, idx) => (
                <div
                  key={label}
                  className={`flex items-center gap-2.5 rounded-xl bg-slate-800/40 p-3 animate-fadeInUp stagger-${idx + 4}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">{label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{hint}</p>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    );
  }

  // Vue 2 : Validation — Mobile-first, single column
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-8">
      <div className="mx-auto w-full max-w-md space-y-4">

        {/* ── Status badge — hero ── */}
        {statutRaw && (
          <div
            className={`rounded-2xl border-2 px-5 py-4 text-center animate-scaleIn ${statutStyles[statutLevel]}`}
          >
            <p className="text-lg font-bold leading-tight">{statutEmoji[statutLevel]} {statutLabel[statutLevel]}</p>
          </div>
        )}

        {/* ── AI Synthesis — one-liner ── */}
        {report?.synthese && (
          <p className="text-sm italic text-slate-300 text-center leading-relaxed px-2 animate-fadeIn stagger-1">
            &laquo;&nbsp;{report.synthese}&nbsp;&raquo;
          </p>
        )}

        {/* Message feedback */}
        {message && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-200">
            {message}
          </div>
        )}

        {/* Lieu + Titre */}
        <div className="space-y-1 animate-fadeIn stagger-1">
          {report?.lieu_chantier && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              {report.lieu_chantier}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-white">Votre rapport</h1>
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
                    <ul className="space-y-1.5">
                      {section.items.map((item, i) => {
                        if (isProblemes) {
                          const { level, text } = parseSeverity(item);
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-200">
                              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                level === "critique" ? "bg-red-500" : level === "attention" ? "bg-amber-500" : "bg-slate-500"
                              }`} />
                              {text}
                            </li>
                          );
                        }
                        return (
                          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-200">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                            {item}
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
          {isSending ? "Envoi en cours..." : recipientEmail ? `Envoyer à ${recipientEmail.split("@")[0]}@…` : "Valider & Envoyer"}
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
