"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  HardHat,
  FileText,
  TriangleAlert,
  TrendingUp,
  Eye,
  Download,
  Share2,
  Search,
  Activity,
  ChevronRight,
  X,
  CheckCircle,
  AlertCircle,
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

// ─── Mock activity feed ───────────────────────────────────────────────────────

const MOCK_ACTIVITY = [
  { id: 1, icon: "report", label: "Jean a soumis un rapport", sub: "Chantier Pasteur — il y a 8 min", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
  { id: 2, icon: "alert", label: "Alerte critique détectée", sub: "Chantier B — il y a 22 min", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  { id: 3, icon: "report", label: "Marc a soumis un rapport", sub: "Chantier Lumière — il y a 1h", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { id: 4, icon: "report", label: "Sophie a soumis un rapport", sub: "Chantier Rivière — il y a 2h", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { id: 5, icon: "alert", label: "Matériel manquant signalé", sub: "Chantier Pasteur — il y a 3h", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
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
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return `il y a ${Math.floor(hrs / 24)}j`;
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
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, trend, icon: Icon, iconColor, iconBg, borderColor,
}: {
  label: string;
  value: string | number;
  sub: string;
  trend?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  borderColor: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-white/5 backdrop-blur-md p-6 group hover:bg-white/8 transition-all duration-300`}>
      {/* Glow */}
      <div className={`pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full ${iconBg} blur-2xl opacity-60 group-hover:opacity-90 transition-opacity`} />
      <div className="relative flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl ${iconBg} border ${borderColor} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <p className="text-3xl font-black text-white mb-1">{value}</p>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function StatusBadge({ status, score }: { status: string | null; score: number | null }) {
  const getInfo = () => {
    if (score !== null) {
      if (score >= 9) return { label: "Excellent", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" };
      if (score >= 7) return { label: "Bon déroulement", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" };
      if (score >= 5) return { label: "Difficultés", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400" };
      if (score >= 3) return { label: "Situation difficile", cls: "bg-red-500/15 text-red-300 border-red-500/30", dot: "bg-red-400 animate-pulse" };
      return { label: "Critique", cls: "bg-red-500/20 text-red-300 border-red-500/40", dot: "bg-red-400 animate-pulse" };
    }
    if (status === "green") return { label: "Validé", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" };
    if (status === "orange") return { label: "En attente", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400" };
    if (status === "red") return { label: "Urgent", cls: "bg-red-500/15 text-red-300 border-red-500/30", dot: "bg-red-400 animate-pulse" };
    return { label: "—", cls: "bg-slate-700/40 text-slate-400 border-slate-600/30", dot: "bg-slate-500" };
  };
  const { label, cls, dot } = getInfo();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function ReportDrawer({ report, onClose }: { report: ParsedReport; onClose: () => void }) {
  const sections = [
    { key: "travaux_realises", label: "Travaux réalisés", icon: CheckCircle, color: "text-emerald-400" },
    { key: "problemes_rencontres", label: "Problèmes rencontrés", icon: AlertCircle, color: "text-amber-400" },
    { key: "materiel_manquant", label: "Matériel manquant", icon: TriangleAlert, color: "text-red-400" },
    { key: "a_prevoir", label: "À prévoir", icon: ChevronRight, color: "text-sky-400" },
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
        <div className="flex items-start justify-between p-6 border-b border-white/8">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarColor(report.worker.name)} flex items-center justify-center text-white font-black text-base`}>
              {getInitials(report.worker.name)}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{report.chantier || "Sans chantier"}</h3>
              <p className="text-sm text-slate-400">par {report.worker.name} · {formatDate(report.date)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {/* Score + status */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={report.status} score={report.score} />
            {report.score !== null && (
              <span className="text-sm text-slate-400">
                Note IA : <span className={`font-black text-lg ${report.score >= 7 ? "text-emerald-400" : report.score >= 4 ? "text-amber-400" : "text-red-400"}`}>{report.score}</span><span className="text-slate-500">/10</span>
              </span>
            )}
          </div>

          {/* Synthèse */}
          {report.parsedData.synthese && (
            <div className="rounded-xl bg-white/5 border border-white/8 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Synthèse</p>
              <p className="text-sm text-slate-200 leading-relaxed">{report.parsedData.synthese}</p>
            </div>
          )}

          {/* Sections */}
          {sections.map(({ key, label, icon: Icon, color }) => {
            const items = (report.parsedData[key] ?? []) as string[];
            if (!items.length) return null;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
                </div>
                <ul className="space-y-2">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300 rounded-lg bg-white/3 px-3 py-2">
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
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ParsedReport | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
  const today = new Date().toISOString().slice(0, 10);
  const reportsToday = reports.filter(r => r.date.startsWith(today)).length;
  const activeChantiers = new Set(reports.map(r => r.chantier || "Sans chantier")).size;
  const criticalAlerts = reports.filter(r => r.status === "red").length;

  // ── Filtered reports
  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter(r =>
      (r.chantier || "").toLowerCase().includes(q) ||
      r.worker.name.toLowerCase().includes(q)
    );
  }, [reports, search]);

  return (
    <main className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* ── Ambient background ── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-[200px] left-[10%] w-[700px] h-[700px] rounded-full bg-violet-600/8 blur-[140px]" />
        <div className="absolute top-[30%] right-[-100px] w-[500px] h-[500px] rounded-full bg-sky-600/6 blur-[120px]" />
        <div className="absolute bottom-0 left-[40%] w-[600px] h-[400px] rounded-full bg-indigo-600/5 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ════════════════════════════════ HEADER ════════════════════════════════ */}
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-10">
          {/* Logo + company */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950" />
            </div>
            <div>
              <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Dashboard Admin</p>
              <h1 className="text-2xl font-black text-white leading-tight">{companyName || "Mon Entreprise"}</h1>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Premium invite code badge */}
            <button
              type="button"
              onClick={copyCode}
              className="group relative flex items-center gap-3 rounded-2xl px-5 py-3 border transition-all duration-300"
              style={{
                background: "linear-gradient(135deg, rgba(255,200,50,0.06) 0%, rgba(255,160,20,0.03) 100%)",
                borderColor: codeCopied ? "rgba(52,211,153,0.5)" : "rgba(251,191,36,0.25)",
                boxShadow: "0 0 20px rgba(251,191,36,0.08)",
              }}
            >
              {/* Shimmer */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.05), transparent)" }} />
              </div>
              <div className="relative flex flex-col items-start">
                <span className="text-[9px] font-black text-amber-500/70 uppercase tracking-[0.2em]">Code Chantier</span>
                <span className="text-xl font-black tracking-[0.3em] text-amber-300">{inviteCode || "——"}</span>
              </div>
              <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${codeCopied ? "bg-emerald-500/20" : "bg-amber-500/10 group-hover:bg-amber-500/20"}`}>
                {codeCopied
                  ? <Check className="w-4 h-4 text-emerald-400" />
                  : <Copy className="w-4 h-4 text-amber-400" />
                }
              </div>
            </button>

            <button
              type="button"
              onClick={() => companyId && fetchReports(companyId, true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </header>

        {/* ════════════════════════════════ KPI CARDS ════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard
            label="Chantiers actifs"
            value={activeChantiers}
            sub={`${reports.length} rapport${reports.length !== 1 ? "s" : ""} au total`}
            trend="+2 ce mois"
            icon={HardHat}
            iconColor="text-sky-400"
            iconBg="bg-sky-500/10"
            borderColor="border-sky-500/15 hover:border-sky-500/30"
          />
          <StatCard
            label="Rapports aujourd'hui"
            value={reportsToday}
            sub={reportsToday === 0 ? "Aucun rapport ce jour" : `Dernier il y a moins d'1h`}
            trend={reportsToday > 0 ? `${reportsToday} aujourd'hui` : undefined}
            icon={FileText}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/10"
            borderColor="border-violet-500/15 hover:border-violet-500/30"
          />
          <StatCard
            label="Alertes critiques"
            value={criticalAlerts}
            sub={criticalAlerts > 0 ? "Intervention requise" : "Aucune alerte active"}
            icon={TriangleAlert}
            iconColor={criticalAlerts > 0 ? "text-red-400" : "text-slate-400"}
            iconBg={criticalAlerts > 0 ? "bg-red-500/10" : "bg-slate-700/30"}
            borderColor={criticalAlerts > 0 ? "border-red-500/25 hover:border-red-500/40" : "border-white/8 hover:border-white/15"}
          />
        </div>

        {/* ════════════════════════════════ MAIN 2-COL LAYOUT ════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── LEFT: Activity feed (30%) ── */}
          <aside className="lg:w-[30%] shrink-0">
            <div className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-md overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-white/8">
                <Activity className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-bold text-white">Activité récente</h2>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400 font-semibold">Live</span>
                </span>
              </div>

              <div className="p-4 space-y-1">
                {/* Real reports as activity */}
                {reports.slice(0, 3).map((r, i) => (
                  <div key={r.id} className="relative">
                    {i < 2 && (
                      <div className="absolute left-[22px] top-[42px] w-px h-4 bg-white/8" />
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedReport(r)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-white/6 transition-all duration-200 text-left group"
                    >
                      <div className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${getAvatarColor(r.worker.name)} flex items-center justify-center text-white text-xs font-black`}>
                        {getInitials(r.worker.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">
                          <span className="text-slate-300">{r.worker.name}</span> a soumis un rapport
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{r.chantier || "Sans chantier"} · {formatRelative(r.date)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 mt-1 transition-colors" />
                    </button>
                  </div>
                ))}

                {/* Mock fill if few reports */}
                {reports.length < 3 && MOCK_ACTIVITY.slice(reports.length).map((a, i) => (
                  <div key={a.id} className="relative">
                    {i < MOCK_ACTIVITY.length - 1 && (
                      <div className="absolute left-[22px] top-[42px] w-px h-4 bg-white/8" />
                    )}
                    <div className={`flex items-start gap-3 p-3 rounded-xl border ${a.bg} opacity-50`}>
                      <div className={`w-9 h-9 shrink-0 rounded-xl ${a.bg} border ${a.bg} flex items-center justify-center`}>
                        {a.icon === "alert"
                          ? <TriangleAlert className={`w-4 h-4 ${a.color}`} />
                          : <FileText className={`w-4 h-4 ${a.color}`} />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white leading-snug">{a.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{a.sub}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {reports.length === 0 && (
                  <p className="text-center text-xs text-slate-600 py-6">En attente d&apos;activité…</p>
                )}
              </div>

              {/* Quick stats */}
              <div className="border-t border-white/8 p-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/4 border border-white/6 p-3 text-center">
                  <p className="text-lg font-black text-white">{activeChantiers}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Chantiers</p>
                </div>
                <div className="rounded-xl bg-white/4 border border-white/6 p-3 text-center">
                  <p className="text-lg font-black text-white">{reports.filter(r => r.status === "green").length}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Validés</p>
                </div>
              </div>
            </div>
          </aside>

          {/* ── RIGHT: Reports table (70%) ── */}
          <section className="flex-1 min-w-0">
            <div className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-md overflow-hidden">
              {/* Table header */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-bold text-white">Derniers rapports</h2>
                  <span className="ml-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-xs font-bold text-slate-400">
                    {filteredReports.length}
                  </span>
                </div>
                {/* Search */}
                <div className="sm:ml-auto relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Rechercher chantier, ouvrier…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full sm:w-64 bg-white/6 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/40 focus:bg-white/8 transition-all"
                  />
                </div>
              </div>

              {/* Column headers */}
              <div className="hidden lg:grid grid-cols-[2fr_1.2fr_1fr_80px_100px_100px] gap-4 px-6 py-3 border-b border-white/6 text-[10px] font-black text-slate-600 uppercase tracking-[0.12em]">
                <span>Chantier</span>
                <span>Ouvrier</span>
                <span>Statut</span>
                <span>Note</span>
                <span>Date</span>
                <span className="text-right">Actions</span>
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-400 font-semibold mb-1">
                    {search ? "Aucun résultat" : "Aucun rapport pour le moment"}
                  </p>
                  <p className="text-sm text-slate-600 max-w-xs">
                    {search
                      ? `Aucun rapport ne correspond à "${search}"`
                      : <>Partagez le code <span className="font-black text-amber-400">{inviteCode}</span> à vos équipes terrain.</>
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/4">
                  {filteredReports.map((r) => (
                    <div
                      key={r.id}
                      className="group grid grid-cols-1 lg:grid-cols-[2fr_1.2fr_1fr_80px_100px_100px] gap-3 lg:gap-4 px-6 py-4 hover:bg-white/5 transition-all duration-200 cursor-pointer"
                      onClick={() => setSelectedReport(r)}
                    >
                      {/* Chantier */}
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          r.status === "green" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                          : r.status === "orange" ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                          : r.status === "red" ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)] animate-pulse"
                          : "bg-slate-600"
                        }`} />
                        <div>
                          <p className="font-bold text-white text-sm leading-tight">{r.chantier || "Sans chantier"}</p>
                          <p className="text-xs text-slate-500 lg:hidden">{r.worker.name} · {formatRelative(r.date)}</p>
                        </div>
                      </div>

                      {/* Worker */}
                      <div className="hidden lg:flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getAvatarColor(r.worker.name)} flex items-center justify-center text-white text-xs font-black shrink-0`}>
                          {getInitials(r.worker.name)}
                        </div>
                        <span className="text-sm text-slate-300 font-medium truncate">{r.worker.name}</span>
                      </div>

                      {/* Status */}
                      <div className="hidden lg:flex items-center">
                        <StatusBadge status={r.status} score={r.score} />
                      </div>

                      {/* Score */}
                      <div className="hidden lg:flex items-center">
                        {r.score !== null ? (
                          <div className="flex items-baseline gap-0.5">
                            <span className={`text-lg font-black ${r.score >= 7 ? "text-emerald-400" : r.score >= 4 ? "text-amber-400" : "text-red-400"}`}>
                              {r.score}
                            </span>
                            <span className="text-xs text-slate-600">/10</span>
                          </div>
                        ) : (
                          <span className="text-slate-700 text-sm">—</span>
                        )}
                      </div>

                      {/* Date */}
                      <div className="hidden lg:flex items-center">
                        <span className="text-xs text-slate-500">{formatRelative(r.date)}</span>
                      </div>

                      {/* Actions */}
                      <div className="hidden lg:flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Voir le détail"
                          onClick={() => setSelectedReport(r)}
                          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-sky-400 transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Télécharger"
                          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-violet-400 transition-all"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Partager"
                          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-emerald-400 transition-all"
                        >
                          <Share2 className="w-4 h-4" />
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

      {/* ── Report Detail Drawer ── */}
      {selectedReport && (
        <ReportDrawer report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </main>
  );
}
