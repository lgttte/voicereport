"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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

type ParsedReport = DBReport & {
  parsedData: {
    statut_global?: string;
    synthese?: string;
    travaux_realises?: string[];
    problemes_rencontres?: string[];
  };
};

function parseReports(reports: DBReport[]): ParsedReport[] {
  return reports.map((r) => {
    let parsedData = {};
    try { parsedData = JSON.parse(r.data); } catch { /* ignore */ }
    return { ...r, parsedData };
  });
}

function StatusPill({ status, score }: { status: string | null; score: number | null }) {
  const label =
    score !== null
      ? score >= 9 ? "Excellent"
      : score >= 7 ? "Bon déroulement"
      : score >= 5 ? "Quelques difficultés"
      : score >= 3 ? "Situation difficile"
      : "Critique"
      : status === "green" ? "OK"
      : status === "orange" ? "Difficultés"
      : status === "red" ? "Critique"
      : "—";

  const color =
    status === "green" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : status === "orange" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : status === "red" ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-slate-700/50 text-slate-400 border-slate-600/30";

  const dot =
    status === "green" ? "bg-emerald-400"
    : status === "orange" ? "bg-amber-400"
    : status === "red" ? "bg-red-400"
    : "bg-slate-500";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className={`rounded-2xl border bg-slate-900/60 p-6 ${accent}`}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <p className="text-4xl font-black text-white">{value}</p>
      {sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ParsedReport | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const fetchReports = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?company_id=${cid}`);
      if (res.ok) {
        const data = await res.json() as DBReport[];
        setReports(parseReports(data));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cid = localStorage.getItem("admin_company_id");
    const cname = localStorage.getItem("admin_company_name") || "";
    const code = localStorage.getItem("admin_invite_code") || "";

    if (!cid) {
      router.replace("/login");
      return;
    }
    setCompanyId(cid);
    setCompanyName(cname);
    setInviteCode(code);
    fetchReports(cid);
  }, [router, fetchReports]);

  const handleLogout = () => {
    localStorage.removeItem("admin_company_id");
    localStorage.removeItem("admin_company_name");
    localStorage.removeItem("admin_invite_code");
    router.replace("/login");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // KPI computations
  const today = new Date().toISOString().slice(0, 10);
  const reportsToday = reports.filter((r) => r.date.startsWith(today)).length;
  const activeChantiers = new Set(reports.map((r) => r.chantier || "Sans chantier")).size;
  const criticalAlerts = reports.filter((r) => r.status === "red").length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Ambient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[300px] rounded-full bg-violet-600/5 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[300px] rounded-full bg-sky-600/5 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-xl">🏗️</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Dashboard</p>
              <h1 className="text-2xl font-black text-white">{companyName || "Mon Entreprise"}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Invite code badge */}
            <button
              type="button"
              onClick={copyCode}
              title="Cliquer pour copier"
              className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 hover:border-sky-500/50 hover:bg-slate-800 transition-all group"
            >
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Code Chantier</span>
              <span className="text-xl font-black text-white tracking-widest">{inviteCode}</span>
              <span className={`text-xs font-semibold transition-colors ${codeCopied ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-400"}`}>
                {codeCopied ? "Copié ✓" : "📋"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => fetchReports(companyId!)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              ↻ Actualiser
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-all"
            >
              Déconnexion
            </button>
          </div>
        </header>

        {/* ── KPIs ── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <KpiCard
            label="Chantiers actifs"
            value={activeChantiers}
            sub={`${reports.length} rapport${reports.length > 1 ? "s" : ""} au total`}
            accent="border-sky-500/20 hover:border-sky-500/40 transition-colors"
          />
          <KpiCard
            label="Rapports aujourd'hui"
            value={reportsToday}
            sub={reportsToday === 0 ? "Aucun rapport ce jour" : `${reportsToday} envoi${reportsToday > 1 ? "s" : ""}`}
            accent="border-violet-500/20 hover:border-violet-500/40 transition-colors"
          />
          <KpiCard
            label="Alertes critiques"
            value={criticalAlerts}
            sub={criticalAlerts > 0 ? "Intervention requise" : "Aucune alerte"}
            accent={criticalAlerts > 0 ? "border-red-500/30 hover:border-red-500/50 transition-colors" : "border-slate-700/40 hover:border-slate-600/60 transition-colors"}
          />
        </section>

        {/* ── Reports Feed ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-white">Derniers rapports</h2>
            <span className="text-xs text-slate-500">{reports.length} rapport{reports.length !== 1 ? "s" : ""}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-16 text-center">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-slate-400 font-medium mb-2">Aucun rapport pour le moment</p>
              <p className="text-sm text-slate-600">
                Partagez le code <span className="font-bold text-slate-400">{inviteCode}</span> à vos équipes terrain pour commencer.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_140px_120px_100px_80px] gap-4 px-6 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Chantier</span>
                <span>Ouvrier</span>
                <span>Statut</span>
                <span>Note</span>
                <span>Date</span>
              </div>

              <div className="divide-y divide-slate-800">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px_100px_80px] gap-2 sm:gap-4 px-6 py-4 hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedReport(r)}
                  >
                    {/* Chantier */}
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${r.status === "green" ? "bg-emerald-400" : r.status === "orange" ? "bg-amber-400" : r.status === "red" ? "bg-red-400 animate-pulse" : "bg-slate-500"}`} />
                      <span className="font-semibold text-white text-sm">{r.chantier || "Sans chantier"}</span>
                    </div>

                    {/* Worker */}
                    <div className="flex items-center gap-2 sm:justify-start">
                      <span className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                        {r.worker.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm text-slate-300">{r.worker.name}</span>
                    </div>

                    {/* Status */}
                    <div className="sm:flex sm:items-center">
                      <StatusPill status={r.status} score={r.score} />
                    </div>

                    {/* Score */}
                    <div className="flex items-center">
                      {r.score !== null ? (
                        <span className={`text-sm font-bold ${r.score >= 7 ? "text-emerald-400" : r.score >= 4 ? "text-amber-400" : "text-red-400"}`}>
                          {r.score}/10
                        </span>
                      ) : (
                        <span className="text-slate-600 text-sm">—</span>
                      )}
                    </div>

                    {/* Date */}
                    <div className="flex items-center">
                      <span className="text-xs text-slate-500">{formatDate(r.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Report Detail Drawer ── */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{formatDate(selectedReport.date)}</p>
                <h3 className="text-xl font-bold text-white">{selectedReport.chantier || "Sans chantier"}</h3>
                <p className="text-sm text-slate-400 mt-1">par {selectedReport.worker.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="text-slate-500 hover:text-white transition-colors text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <StatusPill status={selectedReport.status} score={selectedReport.score} />
              {selectedReport.score !== null && (
                <span className="text-sm font-bold text-white">
                  Note : <span className={selectedReport.score >= 7 ? "text-emerald-400" : selectedReport.score >= 4 ? "text-amber-400" : "text-red-400"}>{selectedReport.score}/10</span>
                </span>
              )}
            </div>

            {selectedReport.parsedData.synthese && (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Synthèse</p>
                <p className="text-sm text-slate-200 leading-relaxed">{selectedReport.parsedData.synthese}</p>
              </div>
            )}

            {(selectedReport.parsedData.travaux_realises ?? []).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Travaux réalisés</p>
                <ul className="space-y-1">
                  {(selectedReport.parsedData.travaux_realises ?? []).map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-emerald-400 shrink-0">✓</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(selectedReport.parsedData.problemes_rencontres ?? []).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Problèmes rencontrés</p>
                <ul className="space-y-1">
                  {(selectedReport.parsedData.problemes_rencontres ?? []).map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-amber-400 shrink-0">⚠</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
