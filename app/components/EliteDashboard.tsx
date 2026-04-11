"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart3, Bell, Search, MapPin, TrendingUp, TrendingDown,
  Minus, Package, Clock, ChevronRight, ChevronLeft, AlertTriangle,
  Mic, Trash2, Calendar, Users, Zap, Shield, Eye, X,
  FileText, ShieldAlert,
} from "lucide-react";
import type { SavedReport, ChantierStats, Alert } from "../lib/types";
import {
  buildChantierStats, generateAlerts, trackMaterials,
  searchReports, getKPIs, getStatusLevel, parseSeverity,
} from "../lib/analytics";

const STATUS_EMOJI: Record<string, string> = { green: "🟢", orange: "🟠", red: "🔴", none: "📋" };
const STATUS_LABEL: Record<string, string> = { green: "OK", orange: "Attention", red: "Critique", none: "—" };

interface Props {
  reports: SavedReport[];
  userName?: string;
  onNewReport: () => void;
  onDeleteAll: () => void;
  onClose: () => void;
}

export default function EliteDashboard({ reports, userName, onNewReport, onDeleteAll, onClose }: Props) {
  const [selectedChantier, setSelectedChantier] = useState<ChantierStats | null>(null);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);

  // ── Analytics ──
  const chantiers = useMemo(() => buildChantierStats(reports), [reports]);
  const alerts = useMemo(() => generateAlerts(chantiers), [chantiers]);
  const materials = useMemo(() => trackMaterials(reports), [reports]);
  const kpis = useMemo(() => getKPIs(chantiers, reports), [chantiers, reports]);
  const searchResults = useMemo(
    () => searchQuery ? searchReports(reports, searchQuery) : [],
    [reports, searchQuery]
  );

  const critAlerts = alerts.filter(a => a.severity === "red");
  const warnAlerts = alerts.filter(a => a.severity === "orange");
  const missingReports = chantiers.filter(c => c.daysSinceLastReport >= 1 && c.allReports.length >= 2);

  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  // ── Report Detail View ──
  if (selectedReport) {
    const r = selectedReport.report;
    const sl = getStatusLevel(r.statut_global);
    const sections = [
      { title: "Travaux réalisés", items: r.travaux_realises || [], icon: FileText, color: "emerald" },
      { title: "Problèmes rencontrés", items: r.problemes_rencontres || [], icon: ShieldAlert, color: "red" },
      { title: "Matériel manquant", items: r.materiel_manquant || [], icon: Package, color: "amber" },
      { title: "À prévoir", items: r.a_prevoir || [], icon: Calendar, color: "sky" },
    ];
    return (
      <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-6">
        <div className="mx-auto w-full max-w-md space-y-4">
          <button type="button" onClick={() => setSelectedReport(null)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="h-4 w-4" /> Retour
          </button>

          {/* Header card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xl shrink-0">{STATUS_EMOJI[sl]}</span>
                <span className="text-lg font-bold text-white truncate min-w-0">{r.lieu_chantier || "Rapport"}</span>
              </div>
              {r.score != null && (
                <div className={`text-xl font-bold ${r.score >= 7 ? "text-emerald-400" : r.score >= 5 ? "text-amber-400" : "text-red-400"}`}>
                  {r.score}<span className="text-sm text-slate-500">/10</span>
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{new Date(selectedReport.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              {selectedReport.userName && <span>• 👤 {selectedReport.userName}</span>}
              {selectedReport.recipientEmail && <span>• ✉️ {selectedReport.recipientEmail}</span>}
            </div>

            {/* GPS */}
            {selectedReport.geo && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3 w-3" />
                <span>{selectedReport.geo.lat.toFixed(4)}, {selectedReport.geo.lng.toFixed(4)}</span>
              </div>
            )}

            {/* Enrichment badges */}
            {selectedReport.enrichment && (
              <div className="flex flex-wrap gap-1.5">
                {selectedReport.enrichment.etatGlobal && (
                  <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] text-slate-300 border border-slate-700">
                    {selectedReport.enrichment.etatGlobal === "fluide" ? "🟢" : selectedReport.enrichment.etatGlobal === "difficile" ? "🟠" : "🔴"} {selectedReport.enrichment.etatGlobal}
                  </span>
                )}
                {selectedReport.enrichment.urgent && (
                  <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] text-red-400 border border-red-500/20">
                    🚨 Urgent
                  </span>
                )}
                {selectedReport.enrichment.typeJournee && selectedReport.enrichment.typeJournee !== "normal" && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                    {selectedReport.enrichment.typeJournee}
                  </span>
                )}
              </div>
            )}

            {r.synthese && <p className="text-sm italic text-slate-300 leading-relaxed">&laquo;&nbsp;{r.synthese}&nbsp;&raquo;</p>}
            <p className="text-sm text-slate-400">{r.statut_global}</p>
            {r.equipe && <p className="text-xs text-slate-500">👷 Équipe : {r.equipe}</p>}
            {r.avancement && <p className="text-xs text-slate-500">📊 Avancement : {r.avancement}</p>}
          </div>

          {/* Alerts */}
          {r.alertes && r.alertes.length > 0 && (
            <div className="rounded-xl bg-red-500/8 border border-red-500/25 p-4 space-y-1.5 animate-fadeInUp stagger-1">
              <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Alertes</p>
              {r.alertes.map((a, i) => <p key={i} className="text-sm text-red-300">• {a}</p>)}
            </div>
          )}

          {/* Impacts */}
          {r.impacts && r.impacts.length > 0 && (
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/25 p-4 space-y-1.5 animate-fadeInUp stagger-2">
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Impacts</p>
              {r.impacts.map((imp, i) => <p key={i} className="text-sm text-amber-300">• {imp}</p>)}
            </div>
          )}

          {/* Report sections */}
          {sections.map((s, idx) => {
            const borderColor = `border-l-${s.color}-400`;
            const iconColor = `text-${s.color}-400`;
            return (
              <div key={s.title} className={`rounded-xl border border-slate-800 border-l-[3px] ${borderColor} bg-slate-900/50 p-4 animate-fadeInUp stagger-${idx + 3}`}>
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className={`h-4 w-4 ${iconColor}`} />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{s.title}</p>
                </div>
                {s.items.length > 0 ? s.items.map((item, i) => {
                  const { level, text } = parseSeverity(item);
                  return (
                    <p key={i} className={`text-sm mb-1 ${level === "critique" ? "text-red-400" : level === "attention" ? "text-amber-400" : "text-slate-300"}`}>
                      • {text}
                    </p>
                  );
                }) : <p className="text-xs text-slate-600 italic">Rien à signaler</p>}
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  // ── Chantier Detail View ──
  if (selectedChantier) {
    const c = selectedChantier;
    const chantierAlerts = alerts.filter(a => a.chantier === c.name);
    // Score history for mini chart (last 10 reports)
    const scoreHistory = c.allReports
      .slice(0, 10)
      .reverse()
      .map(r => r.report.score ?? null)
      .filter((s): s is number => s !== null);
    const maxScore = 10;

    return (
      <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-6">
        <div className="mx-auto w-full max-w-md space-y-4">
          <button type="button" onClick={() => setSelectedChantier(null)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="h-4 w-4" /> Dashboard
          </button>

          {/* Header */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 min-w-0 flex-1 truncate">
                {STATUS_EMOJI[c.status]} {c.name}
              </h2>
              {c.score !== null && (
                <div className={`text-2xl font-bold ${c.score >= 7 ? "text-emerald-400" : c.score >= 5 ? "text-amber-400" : "text-red-400"}`}>
                  {c.score}<span className="text-sm text-slate-500">/10</span>
                </div>
              )}
            </div>

            {/* Status + meta badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                c.status === "green" ? "bg-emerald-500/15 text-emerald-400" :
                c.status === "orange" ? "bg-amber-500/15 text-amber-400" :
                c.status === "red" ? "bg-red-500/15 text-red-400" :
                "bg-slate-700 text-slate-400"
              }`}>{STATUS_LABEL[c.status]}</span>
              <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
                {c.reportCount} rapport{c.reportCount > 1 ? "s" : ""}
              </span>
              {c.scoreTrend !== "stable" && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  c.scoreTrend === "up" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {c.scoreTrend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {c.scoreTrend === "up" ? "En hausse" : "En baisse"}
                </span>
              )}
            </div>

            {c.latestReport.report.synthese && (
              <p className="text-sm italic text-slate-300 mb-3">&laquo;&nbsp;{c.latestReport.report.synthese}&nbsp;&raquo;</p>
            )}

            {/* Score trend mini chart */}
            {scoreHistory.length >= 2 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Évolution du score</p>
                <div className="flex items-end gap-1 h-12">
                  {scoreHistory.map((score, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full rounded-t transition-all ${
                          score >= 7 ? "bg-emerald-500/60" : score >= 5 ? "bg-amber-500/60" : "bg-red-500/60"
                        }`}
                        style={{ height: `${(score / maxScore) * 100}%` }}
                      />
                      <span className="text-[8px] text-slate-600 mt-0.5">{score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chantier alerts */}
          {chantierAlerts.length > 0 && (
            <div className="rounded-xl bg-red-500/8 border border-red-500/25 p-4 space-y-2 animate-fadeInUp stagger-1">
              <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Alertes actives</p>
              {chantierAlerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">{a.severity === "red" ? "🔴" : "⚠️"}</span>
                  <p className="text-xs text-red-300/90">{a.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Top problems */}
          {c.topProblems.length > 0 && (
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/25 p-4 animate-fadeInUp stagger-2">
              <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Problèmes en cours</p>
              {c.topProblems.map((p, i) => <p key={i} className="text-xs text-amber-300">• {p}</p>)}
            </div>
          )}

          {/* Recurring materials for this chantier */}
          {c.recurringMaterials.length > 0 && (
            <div className="rounded-xl bg-orange-500/8 border border-orange-500/25 p-4 animate-fadeInUp stagger-3">
              <p className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Matériel récurrent</p>
              {c.recurringMaterials.map((m, i) => (
                <div key={i} className="flex items-center justify-between mb-1">
                  <p className="text-xs text-orange-300">• {m.name}</p>
                  <span className="text-[10px] text-orange-400/60">{m.count}x</span>
                </div>
              ))}
            </div>
          )}

          {/* Reports timeline */}
          <div className="animate-fadeInUp stagger-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-3">
              <Clock className="h-3.5 w-3.5" /> Historique ({c.allReports.length})
            </h3>
            <div className="space-y-2">
              {c.allReports.map((sr) => {
                const sl = getStatusLevel(sr.report.statut_global);
                return (
                  <button
                    type="button"
                    key={sr.id}
                    onClick={() => setSelectedReport(sr)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 text-left transition-all hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm shrink-0">{STATUS_EMOJI[sl]}</span>
                        <span className="text-xs font-medium text-white truncate">
                          {new Date(sr.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        {sr.userName && <span className="text-[10px] text-slate-500 truncate shrink-0">• {sr.userName}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {sr.report.score != null && <span className="text-xs font-bold text-amber-400">{sr.report.score}/10</span>}
                        <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                      </div>
                    </div>
                    {sr.report.synthese && <p className="text-[11px] text-slate-500 line-clamp-1 ml-6">{sr.report.synthese}</p>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Search results view ──
  if (searchActive && searchQuery) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-6">
        <div className="mx-auto w-full max-w-md space-y-4">
          {/* Search header */}
          <div className="flex items-center gap-3 animate-fadeIn">
            <button type="button" onClick={() => { setSearchActive(false); setSearchQuery(""); }} className="text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-xl border border-slate-700/60 bg-slate-900/80 py-2.5 pl-10 pr-10 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                autoFocus
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">{searchResults.length} résultat{searchResults.length !== 1 ? "s" : ""}</p>

          <div className="space-y-2">
            {searchResults.map((sr) => {
              const sl = getStatusLevel(sr.report.statut_global);
              return (
                <button
                  type="button"
                  key={sr.id}
                  onClick={() => setSelectedReport(sr)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 text-left transition-all hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{STATUS_EMOJI[sl]}</span>
                      <span className="text-sm font-medium text-white truncate">{sr.report.lieu_chantier || sr.enrichment?.chantierName || "Rapport"}</span>
                    </div>
                    {sr.report.score != null && <span className="text-xs font-bold text-amber-400">{sr.report.score}/10</span>}
                  </div>
                  {sr.report.synthese && <p className="text-xs text-slate-400 line-clamp-2 ml-6">{sr.report.synthese}</p>}
                  <div className="flex items-center gap-2 ml-6 mt-1 text-[10px] text-slate-600">
                    <span>{new Date(sr.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {sr.userName && <span>• {sr.userName}</span>}
                  </div>
                </button>
              );
            })}
            {searchResults.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-10 w-10 text-slate-800 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Aucun résultat pour &laquo;&nbsp;{searchQuery}&nbsp;&raquo;</p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Main Dashboard View ──
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-6">
      <div className="mx-auto w-full max-w-md space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between animate-fadeIn">
          <div>
            <p className="text-xs text-slate-500 capitalize">{dateStr}</p>
            <h1 className="text-xl font-bold text-white">
              {userName ? `Bonjour ${userName}` : "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {reports.length > 0 && (
              <button type="button" onClick={onDeleteAll} className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-600 hover:text-white hover:bg-slate-800 transition-colors">
              <X className="h-4 w-4" />
            </button>
            <button type="button" onClick={onNewReport} className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors">
              <Mic className="h-3.5 w-3.5" /> Nouveau
            </button>
          </div>
        </div>

        {/* Empty state */}
        {reports.length === 0 ? (
          <div className="text-center py-20 animate-fadeIn">
            <BarChart3 className="h-16 w-16 text-slate-800 mx-auto mb-5" />
            <p className="text-base font-medium text-slate-400 mb-2">Aucun rapport</p>
            <p className="text-sm text-slate-600 mb-8">Dictez votre premier rapport vocal pour commencer</p>
            <button type="button" onClick={onNewReport} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500 transition-colors">
              <Mic className="h-4 w-4" /> Créer un rapport
            </button>
          </div>
        ) : (
          <>
            {/* KPI Row — 4 cards */}
            <div className="grid grid-cols-4 gap-2 animate-fadeInUp stagger-1">
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-2.5 text-center">
                <p className="text-xl font-bold text-white">{kpis.totalChantiers}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Chantiers</p>
              </div>
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-2.5 text-center">
                <p className={`text-xl font-bold ${kpis.avgScore && kpis.avgScore >= 7 ? "text-emerald-400" : kpis.avgScore && kpis.avgScore >= 5 ? "text-amber-400" : "text-red-400"}`}>
                  {kpis.avgScore ?? "—"}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">Score moy.</p>
              </div>
              <div className={`rounded-xl p-2.5 text-center ${kpis.redCount > 0 ? "bg-red-500/8 border border-red-500/20" : "bg-slate-900/60 border border-slate-800"}`}>
                <p className={`text-xl font-bold ${kpis.redCount > 0 ? "text-red-400" : "text-slate-400"}`}>{alerts.length}</p>
                <p className={`text-[9px] mt-0.5 ${kpis.redCount > 0 ? "text-red-500/70" : "text-slate-500"}`}>Alertes</p>
              </div>
              <div className="rounded-xl bg-sky-500/8 border border-sky-500/20 p-2.5 text-center">
                <p className="text-xl font-bold text-sky-400">{kpis.todayReportCount}</p>
                <p className="text-[9px] text-sky-500/70 mt-0.5">Aujourd&apos;hui</p>
              </div>
            </div>

            {/* Search bar */}
            <div className="animate-fadeInUp stagger-2">
              <button
                type="button"
                onClick={() => setSearchActive(true)}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left transition-all hover:border-slate-700 hover:bg-slate-800/40"
              >
                <Search className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-500">Rechercher un rapport, chantier...</span>
              </button>
            </div>

            {/* Critical alerts */}
            {critAlerts.length > 0 && (
              <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-4 space-y-2 animate-fadeInUp stagger-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Alertes critiques
                  </p>
                  <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">{critAlerts.length}</span>
                </div>
                {critAlerts.slice(0, showAllAlerts ? 20 : 3).map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 py-1">
                    <span className="text-xs mt-0.5">🔴</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-red-300/90">{a.message}</p>
                      <p className="text-[10px] text-red-400/50">{a.chantier}</p>
                    </div>
                  </div>
                ))}
                {critAlerts.length > 3 && (
                  <button type="button" onClick={() => setShowAllAlerts(!showAllAlerts)} className="text-[10px] text-red-400 hover:text-red-300">
                    {showAllAlerts ? "Voir moins" : `Voir les ${critAlerts.length} alertes`}
                  </button>
                )}
              </div>
            )}

            {/* Warning alerts */}
            {warnAlerts.length > 0 && critAlerts.length === 0 && (
              <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-4 space-y-2 animate-fadeInUp stagger-2">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Points d&apos;attention
                </p>
                {warnAlerts.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 py-1">
                    <span className="text-xs mt-0.5">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-300/90">{a.message}</p>
                      <p className="text-[10px] text-amber-400/50">{a.chantier}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Missing reports */}
            {missingReports.length > 0 && (
              <div className="rounded-xl bg-orange-500/8 border border-orange-500/20 p-3.5 animate-fadeInUp stagger-3">
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5" /> Sans rapport récent
                </p>
                {missingReports.slice(0, 3).map((c) => (
                  <button
                    type="button"
                    key={c.name}
                    onClick={() => setSelectedChantier(c)}
                    className="w-full flex items-center justify-between py-1.5 text-left hover:bg-orange-500/5 rounded-lg px-1 transition-colors"
                  >
                    <span className="text-xs text-orange-300">{c.name}</span>
                    <span className="text-[10px] text-orange-400/60">
                      {c.daysSinceLastReport}j sans rapport
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Chantier list */}
            <div className="space-y-1.5 animate-fadeInUp stagger-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Mes chantiers
              </h2>
              <div className="space-y-2">
                {chantiers.map((c) => (
                  <button
                    type="button"
                    key={c.name}
                    onClick={() => setSelectedChantier(c)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left transition-all hover:border-slate-700 hover:bg-slate-800/50 active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm">{STATUS_EMOJI[c.status]}</span>
                        <span className="text-sm font-semibold text-white truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        {c.scoreTrend !== "stable" && (
                          c.scoreTrend === "up"
                            ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                            : <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                        )}
                        {c.score !== null && (
                          <span className={`text-sm font-bold ${c.score >= 7 ? "text-emerald-400" : c.score >= 5 ? "text-amber-400" : "text-red-400"}`}>{c.score}/10</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-600" />
                      </div>
                    </div>
                    {c.latestReport.report.synthese && (
                      <p className="text-xs text-slate-400 line-clamp-2 mb-2">{c.latestReport.report.synthese}</p>
                    )}
                    {c.topProblems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {c.topProblems.slice(0, 2).map((p, i) => (
                          <span key={i} className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                            ⚠ {p.length > 35 ? p.slice(0, 35) + "…" : p}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-600">
                      <span>{c.reportCount} rapport{c.reportCount > 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{new Date(c.lastReportDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      {c.latestReport.userName && <>
                        <span>·</span>
                        <span className="truncate max-w-[120px]">👤 {c.latestReport.userName}</span>
                      </>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Material tracking */}
            {materials.length > 0 && (
              <div className="animate-fadeInUp stagger-5">
                <button
                  type="button"
                  onClick={() => setShowMaterials(!showMaterials)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
                >
                  <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Suivi matériel</span>
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showMaterials ? "rotate-90" : ""}`} />
                </button>
                {showMaterials && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 divide-y divide-slate-800/50">
                    {materials.slice(0, 8).map((m, i) => (
                      <div key={i} className="px-4 py-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white">{m.name}</p>
                          <p className="text-[10px] text-slate-500">{m.chantiers.slice(0, 2).join(", ")}{m.chantiers.length > 2 ? ` +${m.chantiers.length - 2}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-bold ${m.count >= 3 ? "text-red-400" : "text-amber-400"}`}>{m.count}x</span>
                          {m.count >= 3 && <span className="text-[10px] bg-red-500/10 text-red-400 rounded-full px-1.5 py-0.5">récurrent</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent activity */}
            <div className="space-y-1.5 animate-fadeInUp stagger-6">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Activité récente
              </h2>
              <div className="space-y-1.5">
                {reports.slice(0, 8).map((sr) => {
                  const sl = getStatusLevel(sr.report.statut_global);
                  return (
                    <button
                      type="button"
                      key={sr.id}
                      onClick={() => setSelectedReport(sr)}
                      className="w-full rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2.5 text-left transition-all hover:bg-slate-800/40 active:scale-[0.98] flex items-center gap-3"
                    >
                      <span className="text-sm">{STATUS_EMOJI[sl]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{sr.report.lieu_chantier || sr.enrichment?.chantierName || "Rapport"}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                          <span>{new Date(sr.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          {sr.userName && <span className="truncate max-w-[100px]">• {sr.userName}</span>}
                        </div>
                      </div>
                      {sr.report.score != null && <span className="text-xs font-bold text-amber-400">{sr.report.score}/10</span>}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-700" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Total stats footer */}
            <div className="rounded-xl bg-slate-900/40 border border-slate-800/50 p-3 flex items-center justify-around text-center animate-fadeInUp stagger-7">
              <div>
                <p className="text-lg font-bold text-white">{kpis.totalReports}</p>
                <p className="text-[9px] text-slate-500">Rapports total</p>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div>
                <p className="text-lg font-bold text-emerald-400">{kpis.greenCount}</p>
                <p className="text-[9px] text-slate-500">OK</p>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div>
                <p className="text-lg font-bold text-amber-400">{kpis.orangeCount}</p>
                <p className="text-[9px] text-slate-500">Attention</p>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div>
                <p className="text-lg font-bold text-red-400">{kpis.redCount}</p>
                <p className="text-[9px] text-slate-500">Critique</p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
