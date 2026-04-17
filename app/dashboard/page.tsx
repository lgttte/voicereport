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
  { id: 1, type: "report", label: "Jean a soumis un rapport",   sub: "Pasteur · 8 min",     dot: "bg-sky-400"     },
  { id: 2, type: "alert",  label: "Alerte critique détectée",   sub: "Chantier B · 22 min", dot: "bg-red-400 animate-pulse" },
  { id: 3, type: "report", label: "Marc a soumis un rapport",   sub: "Lumière · 1h",        dot: "bg-emerald-400" },
  { id: 4, type: "report", label: "Sophie — rapport soumis",    sub: "Rivière · 2h",        dot: "bg-violet-400"  },
  { id: 5, type: "alert",  label: "Matériel manquant signalé",  sub: "Pasteur · 3h",        dot: "bg-amber-400"   },
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
    <svg width={W} height={H} className="opacity-60 shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Status Badge — style industriel, sans transparence ──────────────────────

function StatusBadge({ status, score }: { status: string | null; score: number | null }) {
  const info = (() => {
    if (score !== null) {
      if (score >= 9) return { label: "Excellent",   cls: "bg-emerald-900/60 text-emerald-300 border-emerald-700" };
      if (score >= 7) return { label: "Bon",         cls: "bg-emerald-900/60 text-emerald-300 border-emerald-700" };
      if (score >= 5) return { label: "Difficultés", cls: "bg-amber-900/60   text-amber-300   border-amber-700"   };
      if (score >= 3) return { label: "Difficile",   cls: "bg-red-900/60     text-red-300     border-red-700"     };
      return           { label: "Critique",          cls: "bg-red-900/80     text-red-200     border-red-600"     };
    }
    if (status === "green")  return { label: "Validé",  cls: "bg-emerald-900/60 text-emerald-300 border-emerald-700" };
    if (status === "orange") return { label: "Attente", cls: "bg-amber-900/60   text-amber-300   border-amber-700"   };
    if (status === "red")    return { label: "Urgent",  cls: "bg-red-900/80     text-red-200     border-red-600"     };
    return                   { label: "—",            cls: "bg-slate-800      text-slate-500   border-slate-700"   };
  })();
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${info.cls}`}>
      {info.label}
    </span>
  );
}

// ─── Report Drawer — style Tour de Contrôle ──────────────────────────────────

function ReportDrawer({ report, onClose }: { report: ParsedReport; onClose: () => void }) {
  const sections = [
    { key: "travaux_realises",     label: "Travaux réalisés",     icon: CheckCircle,   color: "text-emerald-400", border: "border-emerald-800", bg: "bg-emerald-950/40" },
    { key: "problemes_rencontres", label: "Problèmes rencontrés", icon: AlertCircle,   color: "text-amber-400",   border: "border-amber-800",   bg: "bg-amber-950/40"   },
    { key: "materiel_manquant",    label: "Matériel manquant",    icon: TriangleAlert, color: "text-red-400",     border: "border-red-800",     bg: "bg-red-950/40"     },
    { key: "a_prevoir",            label: "À prévoir",             icon: ChevronRight,  color: "text-sky-400",     border: "border-sky-800",     bg: "bg-sky-950/40"     },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl max-h-[88vh] overflow-hidden flex flex-col"
        style={{ boxShadow: "0 30px 90px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(report.worker.name)} flex items-center justify-center text-white font-black text-sm shrink-0`}>
              {getInitials(report.worker.name)}
            </div>
            <div>
              <h3 className="text-base font-black text-white leading-tight">{report.chantier || "Sans chantier"}</h3>
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">{report.worker.name}</span>
                <span className="mx-1.5 text-slate-600">·</span>
                {formatDate(report.date)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Status + score row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={report.status} score={report.score} />
            {report.score !== null && (
              <div className="flex items-baseline gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Note IA</span>
                <span className={`text-xl font-black ${report.score >= 7 ? "text-emerald-400" : report.score >= 4 ? "text-amber-400" : "text-red-400"}`}>
                  {report.score}
                </span>
                <span className="text-slate-500 text-xs">/10</span>
              </div>
            )}
          </div>

          {/* Synthèse */}
          {report.parsedData.synthese && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Synthèse</p>
              <p className="text-sm text-slate-200 leading-relaxed">{report.parsedData.synthese}</p>
            </div>
          )}

          {/* Sections */}
          {sections.map(({ key, label, icon: Icon, color, border, bg }) => {
            const items = (report.parsedData[key] ?? []) as string[];
            if (!items.length) return null;
            return (
              <div key={key} className={`rounded-xl border ${border} ${bg} overflow-hidden`}>
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${border}`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <p className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</p>
                  <span className={`ml-auto text-xs font-black ${color}`}>{items.length}</span>
                </div>
                <ul>
                  {items.map((item, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-2.5 px-4 py-2.5 text-xs text-slate-300 ${i !== 0 ? `border-t ${border} border-opacity-40` : ""}`}
                    >
                      <span className={`${color} shrink-0 mt-0.5 font-bold`}>·</span>
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
  const [filterDate,     setFilterDate]     = useState<"all" | "today" | "week">("all");
  const [filterChantier, setFilterChantier] = useState("all");
  const [filterWorker,   setFilterWorker]   = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("all");

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

  const criticalReports = reports.filter(r => r.status === "red");

  return (
    <main className="min-h-screen bg-slate-950 text-white overflow-x-hidden">

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">

        {/* ═══════════════════════ HEADER ═══════════════════════ */}
        <header className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl px-5 py-3"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>

          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest leading-none mb-0.5">Dashboard Admin</p>
              <h1 className="text-sm font-black text-white leading-none">{companyName || "Mon Entreprise"}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => companyId && fetchReports(companyId, true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 border border-slate-700 bg-slate-800 hover:bg-red-950/60 hover:border-red-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Déconnexion
            </button>
          </div>
        </header>

        {/* ═══════════════════════ CRITICAL ALERTS BANNER ═══════════════════════ */}
        {criticalAlerts > 0 && (
          <div className="border border-red-700 bg-red-950/50 rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-2.5 mb-3">
              <TriangleAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm font-black text-red-300 uppercase tracking-wide">
                {criticalAlerts} Alerte{criticalAlerts > 1 ? "s" : ""} critique{criticalAlerts > 1 ? "s" : ""} — Intervention requise
              </span>
              <span className="ml-auto w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            </div>
            <div className="flex flex-wrap gap-2">
              {criticalReports.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReport(r)}
                  className="flex items-center gap-2 border border-red-700 bg-red-900/40 hover:bg-red-900/70 px-3 py-2 rounded-lg text-xs transition-colors"
                >
                  <span className="font-bold text-red-200">{r.chantier || "Sans chantier"}</span>
                  <span className="text-red-700">·</span>
                  <span className="text-red-400 font-medium">{r.worker.name}</span>
                  <span className="text-red-700">·</span>
                  <span className="text-red-500">{formatRelative(r.date)}</span>
                  <Eye className="w-3 h-3 text-red-400 ml-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════ KPI GRID ═══════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* KPI 1 — Chantiers actifs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="w-8 h-8 rounded-lg bg-sky-900/60 border border-sky-700 flex items-center justify-center">
                <HardHat className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-end gap-0.5 h-5">
                {last7.map((v, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-t-sm bg-sky-600/60"
                    style={{ height: `${Math.max(3, (v / Math.max(...last7, 1)) * 20)}px` }}
                  />
                ))}
              </div>
            </div>
            <p className="text-3xl font-black text-white leading-none mb-1">{activeChantiers}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chantiers actifs</p>
            <p className="text-xs text-slate-600 mt-1">{reports.length} rapport{reports.length !== 1 ? "s" : ""} total</p>
          </div>

          {/* KPI 2 — Rapports aujourd'hui */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-900/60 border border-violet-700 flex items-center justify-center">
                <FileText className="w-4 h-4 text-violet-400" />
              </div>
              <Sparkline data={last7} color="#a78bfa" />
            </div>
            <p className="text-3xl font-black text-white leading-none mb-1">{reportsToday}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rapports aujourd&apos;hui</p>
            <p className="text-xs text-slate-600 mt-1">{reportsToday === 0 ? "Aucun ce jour" : "Dernier · < 1h"}</p>
          </div>

          {/* KPI 3 — Code chantier */}
          <button
            type="button"
            onClick={copyCode}
            className="bg-slate-900 border rounded-xl px-4 py-4 text-left hover:bg-slate-800 transition-colors"
            style={{ borderColor: codeCopied ? "rgb(21 128 61)" : "rgb(120 83 19 / 0.6)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Code chantier</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${codeCopied ? "bg-emerald-900/60 border-emerald-700" : "bg-amber-900/40 border-amber-700"}`}>
                {codeCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-amber-400" />}
              </div>
            </div>
            <p className="text-2xl font-black tracking-[0.22em] text-amber-300 leading-none mb-1">{inviteCode || "——"}</p>
            <p className="text-xs text-slate-500">{codeCopied ? "✓ Copié dans le presse-papier" : "Cliquer pour copier"}</p>
          </button>

          {/* KPI 4 — Alertes critiques */}
          <div className={`bg-slate-900 rounded-xl px-4 py-4 border ${criticalAlerts > 0 ? "border-red-700" : "border-slate-800"}`}>
            <div className="flex items-center justify-between mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${criticalAlerts > 0 ? "bg-red-900/60 border-red-700" : "bg-slate-800 border-slate-700"}`}>
                <TriangleAlert className={`w-4 h-4 ${criticalAlerts > 0 ? "text-red-400" : "text-slate-500"}`} />
              </div>
              {criticalAlerts > 0 && (
                <span className="flex items-center gap-1.5 text-[9px] font-black text-red-300 bg-red-900/60 border border-red-700 px-2 py-1 rounded-md uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Actif
                </span>
              )}
            </div>
            <p className={`text-3xl font-black leading-none mb-1 ${criticalAlerts > 0 ? "text-red-400" : "text-white"}`}>
              {criticalAlerts}
            </p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alertes critiques</p>
            <p className="text-xs text-slate-600 mt-1">{criticalAlerts > 0 ? "Intervention requise" : "Aucune alerte active"}</p>
          </div>
        </div>

        {/* ═══════════════════════ 2-COL LAYOUT ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row gap-3">

          {/* ──────── LEFT SIDEBAR ──────── */}
          <aside className="lg:w-[260px] shrink-0 space-y-3">

            {/* Activity Feed */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
                <Activity className="w-3.5 h-3.5 text-violet-400" />
                <h2 className="text-xs font-bold text-white">Activité récente</h2>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-bold">Live</span>
                </span>
              </div>

              <div>
                {reports.slice(0, 5).map((r, idx) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReport(r)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800 transition-colors ${idx !== 0 ? "border-t border-slate-800" : ""}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      r.status === "red"    ? "bg-red-400 animate-pulse"
                      : r.status === "orange" ? "bg-amber-400"
                      : "bg-emerald-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white leading-tight truncate">{r.worker.name}</p>
                      <p className="text-[10px] text-slate-500 leading-tight truncate">{r.chantier || "Sans chantier"}</p>
                    </div>
                    <span className="text-[10px] text-slate-600 shrink-0">{formatRelative(r.date)}</span>
                  </button>
                ))}

                {reports.length < 5 && MOCK_ACTIVITY.slice(reports.length).map((a, idx) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 px-4 py-2.5 opacity-25 ${(idx !== 0 || reports.length > 0) ? "border-t border-slate-800" : ""}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 truncate">{a.label}</p>
                      <p className="text-[10px] text-slate-600">{a.sub}</p>
                    </div>
                  </div>
                ))}

                {reports.length === 0 && (
                  <p className="text-center text-[10px] text-slate-700 py-5">En attente d&apos;activité…</p>
                )}
              </div>

              <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-lg font-black text-white leading-none">{activeChantiers}</p>
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mt-0.5">Chantiers</p>
                </div>
                <div>
                  <p className="text-lg font-black text-emerald-400 leading-none">{reports.filter(r => r.status === "green").length}</p>
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mt-0.5">Validés</p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <h2 className="text-xs font-bold text-white">Filtres</h2>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => { setFilterDate("all"); setFilterChantier("all"); setFilterWorker("all"); setFilterStatus("all"); }}
                    className="ml-auto text-[10px] font-bold text-slate-500 hover:text-violet-400 transition-colors"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Période */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Période</label>
                  <div className="flex gap-1.5">
                    {(["all", "today", "week"] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilterDate(v)}
                        className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-colors ${
                          filterDate === v
                            ? "bg-violet-600 text-white border-violet-600"
                            : "bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700 hover:text-slate-300"
                        }`}
                      >
                        {v === "all" ? "Tout" : v === "today" ? "Auj." : "7j"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chantier */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Chantier</label>
                  <select
                    value={filterChantier}
                    onChange={e => setFilterChantier(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900">Tous les chantiers</option>
                    {chantierOptions.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>

                {/* Ouvrier */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Ouvrier</label>
                  <select
                    value={filterWorker}
                    onChange={e => setFilterWorker(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900">Tous les ouvriers</option>
                    {workerOptions.map(w => <option key={w} value={w} className="bg-slate-900">{w}</option>)}
                  </select>
                </div>

                {/* Statut */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Statut</label>
                  <div className="flex gap-1">
                    {(["all", "green", "orange", "red"] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilterStatus(v)}
                        className={`flex-1 text-[9px] font-bold py-1.5 rounded-lg border transition-colors ${
                          filterStatus === v
                            ? v === "all"    ? "bg-slate-600 text-white border-slate-500"
                              : v === "green"  ? "bg-emerald-700 text-white border-emerald-600"
                              : v === "orange" ? "bg-amber-700 text-white border-amber-600"
                                               : "bg-red-700 text-white border-red-600"
                            : "bg-slate-800 text-slate-600 border-slate-700 hover:bg-slate-700 hover:text-slate-400"
                        }`}
                      >
                        {v === "all" ? "Tous" : v === "green" ? "✓" : v === "orange" ? "~" : "!"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ──────── RIGHT: Reports table ──────── */}
          <section className="flex-1 min-w-0">
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

              {/* Toolbar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <h2 className="text-sm font-black text-white">Rapports</h2>
                  <span className="bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {filteredReports.length}
                  </span>
                </div>
                <div className="ml-auto relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Chantier, ouvrier…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-52 bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-600 transition-colors"
                  />
                </div>
              </div>

              {/* Column headers */}
              <div className="hidden lg:grid grid-cols-[2fr_1.4fr_110px_52px_90px_120px] gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-950/60">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chantier</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ouvrier</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Statut</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Note</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</span>
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-7 h-7 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                    <FileText className="w-5 h-5 text-slate-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-300 mb-1.5">
                    {search || filtersActive ? "Aucun résultat" : "Aucun rapport"}
                  </p>
                  <p className="text-xs text-slate-600 max-w-xs">
                    {search
                      ? `Aucun rapport ne correspond à "${search}"`
                      : filtersActive
                        ? "Modifiez les filtres pour voir d'autres données."
                        : <>Partagez le code <span className="font-black text-amber-400">{inviteCode}</span> à vos équipes.</>
                    }
                  </p>
                </div>
              ) : (
                <div>
                  {filteredReports.map((r, idx) => (
                    <div
                      key={r.id}
                      className={`group grid grid-cols-1 lg:grid-cols-[2fr_1.4fr_110px_52px_90px_120px] gap-2 lg:gap-3 px-4 py-3 hover:bg-slate-800/70 transition-colors cursor-pointer ${idx !== 0 ? "border-t border-slate-800" : ""}`}
                      onClick={() => setSelectedReport(r)}
                    >
                      {/* Chantier */}
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          r.status === "green"  ? "bg-emerald-400"
                          : r.status === "orange" ? "bg-amber-400"
                          : r.status === "red"    ? "bg-red-400 animate-pulse"
                          : "bg-slate-600"
                        }`} />
                        <div>
                          <p className="text-sm font-bold text-white leading-tight">{r.chantier || "Sans chantier"}</p>
                          <p className="text-[10px] text-slate-500 lg:hidden">{r.worker.name} · {formatRelative(r.date)}</p>
                        </div>
                      </div>

                      {/* Worker */}
                      <div className="hidden lg:flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getAvatarColor(r.worker.name)} flex items-center justify-center text-white text-[9px] font-black shrink-0`}>
                          {getInitials(r.worker.name)}
                        </div>
                        <span className="text-sm font-semibold text-slate-200 truncate">{r.worker.name}</span>
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
                        <span className="text-xs font-medium text-slate-400">{formatRelative(r.date)}</span>
                      </div>

                      {/* Actions — boutons "Money" avec bordures */}
                      <div className="hidden lg:flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Voir le détail"
                          onClick={() => setSelectedReport(r)}
                          className="flex items-center gap-1 border border-slate-700 bg-slate-800 hover:bg-sky-950/60 hover:border-sky-700 hover:text-sky-300 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Voir
                        </button>
                        <button
                          type="button"
                          title="Télécharger PDF"
                          className="flex items-center gap-1 border border-slate-700 bg-slate-800 hover:bg-violet-950/60 hover:border-violet-700 hover:text-violet-300 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          PDF
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
