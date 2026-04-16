"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Copy, Check, RefreshCw, LogOut, HardHat, FileText,
  TriangleAlert, Eye, Download, Share2, Search, Activity,
  ChevronRight, X, CheckCircle, AlertCircle, SlidersHorizontal,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkerInfo = { name: string; device_id: string };

type DBReport = {
  id: string;
  date: string;
  score: number | null;
  status: string | null;
  chantier: string | null;
  worker_id: string;
  worker: WorkerInfo;
  data: string;
};

type ParsedData = {
  statut_global?: string;
  synthese?: string;
  travaux_realises?: string[];
  problemes_rencontres?: string[];
  materiel_manquant?: string[];
  a_prevoir?: string[];
};

type ParsedReport = DBReport & { parsedData: ParsedData };

// ─── Mock activity ────────────────────────────────────────────────────────────

const MOCK_ACTIVITY = [
  { id: 1, type: "report", label: "Jean a soumis un rapport",   sub: "Pasteur · 8 min",  dot: "bg-sky-400"     },
  { id: 2, type: "alert",  label: "Alerte critique détectée",   sub: "Chantier B · 22 min", dot: "bg-red-400 animate-pulse" },
  { id: 3, type: "report", label: "Marc a soumis un rapport",   sub: "Lumière · 1h",     dot: "bg-emerald-400" },
  { id: 4, type: "report", label: "Sophie — rapport soumis",    sub: "Rivière · 2h",     dot: "bg-violet-400"  },
  { id: 5, type: "alert",  label: "Matériel manquant signalé",  sub: "Pasteur · 3h",     dot: "bg-amber-400"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseReports(reports: DBReport[]): ParsedReport[] {
  return reports.map((r) => {
    let parsedData: ParsedData = {};
    try { parsedData = JSON.parse(r.data); } catch { /* ignore */ }
    return { ...r, parsedData };
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

function getInitials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string) {
  const colors = [
    "from-sky-500 to-blue-600",
    "from-violet-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
  ];
  return colors[name.charCodeAt(0) % colors.length];
}

// ─── Mini Sparkline SVG ───────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const W = 56, H = 22;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} className="opacity-50 shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, score }: { status: string | null; score: number | null }) {
  const info = (() => {
    if (score !== null) {
      if (score >= 9) return { label: "Excellent",   cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" };
      if (score >= 7) return { label: "Bon",         cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" };
      if (score >= 5) return { label: "Difficultés", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",   dot: "bg-amber-400" };
      if (score >= 3) return { label: "Difficile",   cls: "bg-red-500/15 text-red-300 border-red-500/30",         dot: "bg-red-400 animate-pulse" };
      return           { label: "Critique",          cls: "bg-red-500/20 text-red-300 border-red-500/40",         dot: "bg-red-400 animate-pulse" };
    }
    if (status === "green")  return { label: "Validé",  cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" };
    if (status === "orange") return { label: "Attente", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",   dot: "bg-amber-400" };
    if (status === "red")    return { label: "Urgent",  cls: "bg-red-500/15 text-red-300 border-red-500/30",         dot: "bg-red-400 animate-pulse" };
    return                   { label: "—",            cls: "bg-slate-700/40 text-slate-400 border-slate-600/30",   dot: "bg-slate-500" };
  })();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${info.cls}`}>
      <span className={`w-1 h-1 rounded-full shrink-0 ${info.dot}`} />
      {info.label}
    </span>
  );
}

// ─── Report Drawer ────────────────────────────────────────────────────────────

function ReportDrawer({ report, onClose }: { report: ParsedReport; onClose: () => void }) {
  const sections = [
    { key: "travaux_realises",     label: "Travaux réalisés",     icon: CheckCircle,   color: "text-emerald-400" },
    { key: "problemes_rencontres", label: "Problèmes rencontrés", icon: AlertCircle,   color: "text-amber-400"   },
    { key: "materiel_manquant",    label: "Matériel manquant",    icon: TriangleAlert, color: "text-red-400"     },
    { key: "a_prevoir",            label: "À prévoir",             icon: ChevronRight,  color: "text-sky-400"     },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarColor(report.worker.name)} flex items-center justify-center text-white font-black text-xs shrink-0`}>
              {getInitials(report.worker.name)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">{report.chantier || "Sans chantier"}</h3>
              <p className="text-xs text-slate-400">par {report.worker.name} · {formatDate(report.date)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3.5">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={report.status} score={report.score} />
            {report.score !== null && (
              <span className="text-xs text-slate-400">
                Note IA : <span className={`font-black text-base ${report.score >= 7 ? "text-emerald-400" : report.score >= 4 ? "text-amber-400" : "text-red-400"}`}>{report.score}</span>
                <span className="text-slate-500">/10</span>
              </span>
            )}
          </div>

          {report.parsedData.synthese && (
            <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
              <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Synthèse</p>
              <p className="text-sm text-slate-200 leading-relaxed">{report.parsedData.synthese}</p>
            </div>
          )}

          {sections.map(({ key, label, icon: Icon, color }) => {
            const items = (report.parsedData[key] ?? []) as string[];
            if (!items.length) return null;
            return (
              <div key={key}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
                </div>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300 rounded-lg bg-white/3 px-3 py-1.5">
                      <span className={`${color} shrink-0 mt-0.5`}>•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [inviteCode,  setInviteCode]  = useState("");
  const [reports,     setReports]     = useState<ParsedReport[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedReport, setSelectedReport] = useState<ParsedReport | null>(null);
  const [codeCopied,  setCodeCopied]  = useState(false);
  const [search,      setSearch]      = useState("");
  const [refreshing,  setRefreshing]  = useState(false);

  // ── Filters
  const [filterDate,    setFilterDate]    = useState<"all" | "today" | "week">("all");
  const [filterChantier, setFilterChantier] = useState("all");
  const [filterWorker,  setFilterWorker]  = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("all");

  const fetchReports = useCallback(async (cid: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/reports?company_id=${cid}`);
      if (res.ok) {
        const data = await res.json() as DBReport[];
        setReports(parseReports(data));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cid = localStorage.getItem("admin_company_id");
    if (!cid) { router.replace("/login"); return; }
    setCompanyId(cid);
    setCompanyName(localStorage.getItem("admin_company_name") || "");
    setInviteCode(localStorage.getItem("admin_invite_code") || "");
    fetchReports(cid);
  }, [router, fetchReports]);

  const handleLogout = () => {
    ["admin_company_id", "admin_company_name", "admin_invite_code"].forEach(k => localStorage.removeItem(k));
    router.replace("/login");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // ── KPIs
  const todayStr        = new Date().toISOString().slice(0, 10);
  const reportsToday    = reports.filter(r => r.date.startsWith(todayStr)).length;
  const activeChantiers = new Set(reports.map(r => r.chantier || "Sans chantier")).size;
  const criticalAlerts  = reports.filter(r => r.status === "red").length;

  // ── Filter options
  const chantierOptions = useMemo(() => [...new Set(reports.map(r => r.chantier || "Sans chantier"))], [reports]);
  const workerOptions   = useMemo(() => [...new Set(reports.map(r => r.worker.name))], [reports]);

  // ── Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!(r.chantier || "").toLowerCase().includes(q) && !r.worker.name.toLowerCase().includes(q)) return false;
      }
      if (filterDate === "today") {
        if (!r.date.startsWith(todayStr)) return false;
      } else if (filterDate === "week") {
        if (new Date(r.date).getTime() < Date.now() - 7 * 86400000) return false;
      }
      if (filterChantier !== "all" && (r.chantier || "Sans chantier") !== filterChantier) return false;
      if (filterWorker   !== "all" && r.worker.name !== filterWorker) return false;
      if (filterStatus   !== "all" && r.status      !== filterStatus) return false;
      return true;
    });
  }, [reports, search, filterDate, filterChantier, filterWorker, filterStatus, todayStr]);

  // ── Sparkline — reports per day last 7 days
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
      return reports.filter(r => r.date.startsWith(d)).length;
    });
  }, [reports]);

  const filtersActive = filterDate !== "all" || filterChantier !== "all" || filterWorker !== "all" || filterStatus !== "all";

  return (
    <main className="min-h-screen bg-slate-950 text-white overflow-x-hidden">

      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-[200px] left-[10%] w-[550px] h-[550px] rounded-full bg-violet-600/6 blur-[140px]" />
        <div className="absolute top-[30%] right-[-80px] w-[380px] h-[380px] rounded-full bg-sky-600/5 blur-[120px]" />
        <div className="absolute bottom-0 left-[40%] w-[450px] h-[280px] rounded-full bg-indigo-600/4 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4">

        {/* ═══════════════════════ HEADER ═══════════════════════ */}
        <header className="flex items-center justify-between gap-3 mb-4 rounded-xl border border-white/8 bg-white/5 backdrop-blur-md px-4 py-2.5">

          {/* Logo + brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-[0.18em] leading-none mb-0.5">Dashboard Admin</p>
              <h1 className="text-sm font-black text-white leading-none truncate">{companyName || "Mon Entreprise"}</h1>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => companyId && fetchReports(companyId, true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all"
            >
              <LogOut className="w-3 h-3" />
              Déconnexion
            </button>
          </div>
        </header>

        {/* ═══════════════════════ KPI GRID ═══════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">

          {/* KPI 1 — Chantiers actifs */}
          <div className="relative overflow-hidden rounded-xl border border-sky-500/15 bg-white/5 backdrop-blur-md px-3.5 py-3 hover:bg-white/8 transition-all group">
            <div className="pointer-events-none absolute -top-5 -right-5 w-14 h-14 rounded-full bg-sky-500/15 blur-xl opacity-60 group-hover:opacity-90 transition-opacity" />
            <div className="flex items-center justify-between mb-2.5">
              <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                <HardHat className="w-3 h-3 text-sky-400" />
              </div>
              {/* Mini bar sparkline */}
              <div className="flex items-end gap-0.5 h-5">
                {last7.map((v, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-t-[2px] bg-sky-500/40"
                    style={{ height: `${Math.max(3, (v / Math.max(...last7, 1)) * 20)}px` }}
                  />
                ))}
              </div>
            </div>
            <p className="text-2xl font-black text-white leading-none mb-0.5">{activeChantiers}</p>
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Chantiers actifs</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{reports.length} rapport{reports.length !== 1 ? "s" : ""} au total</p>
          </div>

          {/* KPI 2 — Rapports aujourd'hui */}
          <div className="relative overflow-hidden rounded-xl border border-violet-500/15 bg-white/5 backdrop-blur-md px-3.5 py-3 hover:bg-white/8 transition-all group">
            <div className="pointer-events-none absolute -top-5 -right-5 w-14 h-14 rounded-full bg-violet-500/15 blur-xl opacity-60 group-hover:opacity-90 transition-opacity" />
            <div className="flex items-center justify-between mb-2.5">
              <div className="w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <FileText className="w-3 h-3 text-violet-400" />
              </div>
              <Sparkline data={last7} color="#a78bfa" />
            </div>
            <p className="text-2xl font-black text-white leading-none mb-0.5">{reportsToday}</p>
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Rapports aujourd&apos;hui</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{reportsToday === 0 ? "Aucun ce jour" : "Dernier < 1h"}</p>
          </div>

          {/* KPI 3 — Code chantier */}
          <button
            type="button"
            onClick={copyCode}
            className="relative overflow-hidden rounded-xl bg-white/5 backdrop-blur-md px-3.5 py-3 hover:bg-white/8 transition-all group text-left border"
            style={{ borderColor: codeCopied ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.2)" }}
          >
            <div className="pointer-events-none absolute -top-5 -right-5 w-14 h-14 rounded-full bg-amber-500/12 blur-xl opacity-60 group-hover:opacity-90 transition-opacity" />
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-black text-amber-500/70 uppercase tracking-[0.2em]">Code chantier</p>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${codeCopied ? "bg-emerald-500/20" : "bg-amber-500/10 group-hover:bg-amber-500/20"}`}>
                {codeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-amber-400" />}
              </div>
            </div>
            <p className="text-xl font-black tracking-[0.22em] text-amber-300 leading-none mb-1.5">{inviteCode || "——"}</p>
            <p className="text-[10px] text-slate-600">{codeCopied ? "✓ Copié dans le presse-papier" : "Partager aux équipes terrain"}</p>
          </button>

          {/* KPI 4 — Alertes critiques */}
          <div className={`relative overflow-hidden rounded-xl border bg-white/5 backdrop-blur-md px-3.5 py-3 hover:bg-white/8 transition-all group ${criticalAlerts > 0 ? "border-red-500/25" : "border-white/8"}`}>
            {criticalAlerts > 0 && (
              <div className="pointer-events-none absolute -top-5 -right-5 w-14 h-14 rounded-full bg-red-500/20 blur-xl opacity-70 group-hover:opacity-90 transition-opacity" />
            )}
            <div className="flex items-center justify-between mb-2.5">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${criticalAlerts > 0 ? "bg-red-500/15 border border-red-500/25" : "bg-slate-700/30 border border-white/8"}`}>
                <TriangleAlert className={`w-3 h-3 ${criticalAlerts > 0 ? "text-red-400" : "text-slate-500"}`} />
              </div>
              {criticalAlerts > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                  ACTIF
                </span>
              )}
            </div>
            <p className={`text-2xl font-black leading-none mb-0.5 ${criticalAlerts > 0 ? "text-red-400" : "text-white"}`}>{criticalAlerts}</p>
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Alertes critiques</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{criticalAlerts > 0 ? "Intervention requise" : "Aucune alerte active"}</p>
          </div>
        </div>

        {/* ═══════════════════════ 2-COL LAYOUT ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row gap-3">

          {/* ──────── LEFT: Activity + Filters ──────── */}
          <aside className="lg:w-[27%] shrink-0 flex flex-col gap-3">

            {/* Live Feed */}
            <div className="rounded-xl border border-white/8 bg-white/5 backdrop-blur-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
                <Activity className="w-3.5 h-3.5 text-violet-400" />
                <h2 className="text-xs font-bold text-white">Activité récente</h2>
                <span className="ml-auto flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-semibold">Live</span>
                </span>
              </div>

              {/* Feed items */}
              <div className="px-2 py-1.5 space-y-px">
                {reports.slice(0, 4).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReport(r)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/6 transition-all text-left group"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      r.status === "red" ? "bg-red-400 animate-pulse"
                      : r.status === "orange" ? "bg-amber-400"
                      : "bg-emerald-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white leading-tight truncate">
                        <span className="font-semibold">{r.worker.name}</span>
                        <span className="text-slate-500"> · {r.chantier || "Sans chantier"}</span>
                      </p>
                      <p className="text-[10px] text-slate-600 leading-tight">{formatRelative(r.date)}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-700 group-hover:text-slate-400 shrink-0 transition-colors" />
                  </button>
                ))}

                {reports.length < 4 && MOCK_ACTIVITY.slice(reports.length).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg opacity-35">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 leading-tight truncate">{a.label}</p>
                      <p className="text-[10px] text-slate-600 leading-tight">{a.sub}</p>
                    </div>
                  </div>
                ))}

                {reports.length === 0 && (
                  <p className="text-center text-[10px] text-slate-700 py-4">En attente d&apos;activité…</p>
                )}
              </div>

              {/* Mini stats */}
              <div className="border-t border-white/8 px-3 py-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/4 border border-white/6 px-2.5 py-1.5 text-center">
                  <p className="text-sm font-black text-white leading-none">{activeChantiers}</p>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Chantiers</p>
                </div>
                <div className="rounded-lg bg-white/4 border border-white/6 px-2.5 py-1.5 text-center">
                  <p className="text-sm font-black text-white leading-none">{reports.filter(r => r.status === "green").length}</p>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Validés</p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="rounded-xl border border-white/8 bg-white/5 backdrop-blur-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <h2 className="text-xs font-bold text-white">Filtres</h2>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => { setFilterDate("all"); setFilterChantier("all"); setFilterWorker("all"); setFilterStatus("all"); }}
                    className="ml-auto text-[10px] text-slate-500 hover:text-violet-400 transition-colors"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              <div className="p-3 space-y-2.5">
                {/* Période */}
                <div>
                  <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Période</label>
                  <div className="flex gap-1">
                    {(["all", "today", "week"] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilterDate(v)}
                        className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all ${
                          filterDate === v
                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                            : "bg-white/4 text-slate-500 border border-white/8 hover:bg-white/8 hover:text-slate-300"
                        }`}
                      >
                        {v === "all" ? "Tout" : v === "today" ? "Auj." : "7j"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chantier */}
                <div>
                  <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Chantier</label>
                  <select
                    value={filterChantier}
                    onChange={e => setFilterChantier(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 transition-all appearance-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900">Tous les chantiers</option>
                    {chantierOptions.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>

                {/* Ouvrier */}
                <div>
                  <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Ouvrier</label>
                  <select
                    value={filterWorker}
                    onChange={e => setFilterWorker(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 transition-all appearance-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900">Tous les ouvriers</option>
                    {workerOptions.map(w => <option key={w} value={w} className="bg-slate-900">{w}</option>)}
                  </select>
                </div>

                {/* Statut */}
                <div>
                  <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Statut</label>
                  <div className="flex gap-1">
                    {(["all", "green", "orange", "red"] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilterStatus(v)}
                        className={`flex-1 text-[9px] font-semibold py-1 rounded-md transition-all ${
                          filterStatus === v
                            ? v === "all"    ? "bg-white/15 text-white border border-white/20"
                              : v === "green"  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : v === "orange" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                               : "bg-red-500/20 text-red-300 border border-red-500/30"
                            : "bg-white/4 text-slate-600 border border-white/8 hover:bg-white/8 hover:text-slate-400"
                        }`}
                      >
                        {v === "all" ? "Tous" : v === "green" ? "✓ OK" : v === "orange" ? "Att." : "Urg."}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ──────── RIGHT: Reports table ──────── */}
          <section className="flex-1 min-w-0">
            <div className="rounded-xl border border-white/8 bg-white/5 backdrop-blur-md overflow-hidden">

              {/* Toolbar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/8">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <h2 className="text-xs font-bold text-white">Derniers rapports</h2>
                  <span className="rounded-full bg-white/8 border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                    {filteredReports.length}
                  </span>
                </div>
                <div className="ml-auto relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Chantier, ouvrier…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-48 bg-white/6 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/40 focus:bg-white/8 transition-all"
                  />
                </div>
              </div>

              {/* Column headers */}
              <div className="hidden lg:grid grid-cols-[2fr_1.2fr_1fr_52px_80px_80px] gap-3 px-4 py-1.5 border-b border-white/6 text-[9px] font-black text-slate-600 uppercase tracking-[0.12em]">
                <span>Chantier</span>
                <span>Ouvrier</span>
                <span>Statut</span>
                <span>Note</span>
                <span>Date</span>
                <span className="text-right">Actions</span>
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex items-center justify-center py-14">
                  <div className="w-7 h-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center mb-3">
                    <FileText className="w-5 h-5 text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-400 font-semibold mb-1">
                    {search || filtersActive ? "Aucun résultat" : "Aucun rapport"}
                  </p>
                  <p className="text-xs text-slate-600 max-w-xs">
                    {search
                      ? `Aucun rapport ne correspond à "${search}"`
                      : filtersActive ? "Essayez de modifier les filtres."
                      : <>Partagez le code <span className="font-black text-amber-400">{inviteCode}</span> à vos équipes.</>
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/4">
                  {filteredReports.map((r) => (
                    <div
                      key={r.id}
                      className="group grid grid-cols-1 lg:grid-cols-[2fr_1.2fr_1fr_52px_80px_80px] gap-2 lg:gap-3 px-4 py-2.5 hover:bg-white/5 transition-all cursor-pointer"
                      onClick={() => setSelectedReport(r)}
                    >
                      {/* Chantier */}
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          r.status === "green"  ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]"
                          : r.status === "orange" ? "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                          : r.status === "red"    ? "bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.7)] animate-pulse"
                          : "bg-slate-600"
                        }`} />
                        <div>
                          <p className="font-bold text-white text-xs leading-tight">{r.chantier || "Sans chantier"}</p>
                          <p className="text-[10px] text-slate-500 lg:hidden">{r.worker.name} · {formatRelative(r.date)}</p>
                        </div>
                      </div>

                      {/* Worker */}
                      <div className="hidden lg:flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${getAvatarColor(r.worker.name)} flex items-center justify-center text-white text-[9px] font-black shrink-0`}>
                          {getInitials(r.worker.name)}
                        </div>
                        <span className="text-xs text-slate-300 font-medium truncate">{r.worker.name}</span>
                      </div>

                      {/* Status */}
                      <div className="hidden lg:flex items-center">
                        <StatusBadge status={r.status} score={r.score} />
                      </div>

                      {/* Score */}
                      <div className="hidden lg:flex items-center">
                        {r.score !== null ? (
                          <div className="flex items-baseline gap-0.5">
                            <span className={`text-sm font-black ${r.score >= 7 ? "text-emerald-400" : r.score >= 4 ? "text-amber-400" : "text-red-400"}`}>
                              {r.score}
                            </span>
                            <span className="text-[9px] text-slate-600">/10</span>
                          </div>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </div>

                      {/* Date */}
                      <div className="hidden lg:flex items-center">
                        <span className="text-[10px] text-slate-500">{formatRelative(r.date)}</span>
                      </div>

                      {/* Actions */}
                      <div className="hidden lg:flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Voir le détail"
                          onClick={() => setSelectedReport(r)}
                          className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-600 hover:text-sky-400 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Télécharger"
                          className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-600 hover:text-violet-400 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Partager"
                          className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-600 hover:text-emerald-400 transition-all"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Report detail drawer */}
      {selectedReport && (
        <ReportDrawer report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </main>
  );
}
