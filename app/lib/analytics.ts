// ── VoiceReport — Analytics Engine ──

import type { SavedReport, ChantierStats, Alert, MaterialItem } from "./types";

function parseSeverity(item: string): { level: "critique" | "attention" | "normal"; text: string } {
  if (item.startsWith("[Critique]")) return { level: "critique", text: item.replace(/^\[Critique\]\s*/, "") };
  if (item.startsWith("[Attention]")) return { level: "attention", text: item.replace(/^\[Attention\]\s*/, "") };
  return { level: "normal", text: item };
}

export { parseSeverity };

export function getStatusLevel(statut: string): "green" | "orange" | "red" | "none" {
  if (/bon\s*d[eé]roulement|fluide|🟢/i.test(statut)) return "green";
  if (/quelques?\s*difficult[eé]s?|🟠/i.test(statut)) return "orange";
  if (/critique|🔴|urgent|grave|probl[eè]me/i.test(statut)) return "red";
  return "none";
}

function getChantierName(r: SavedReport): string {
  return r.enrichment?.chantierName || r.report.lieu_chantier || "Sans lieu";
}

function daysBetween(d1: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(d1).getTime()) / (1000 * 60 * 60 * 24));
}

export function buildChantierStats(reports: SavedReport[]): ChantierStats[] {
  const grouped = new Map<string, SavedReport[]>();
  for (const r of reports) {
    const key = getChantierName(r).trim();
    const list = grouped.get(key) || [];
    list.push(r);
    grouped.set(key, list);
  }

  const now = new Date();
  const chantiers: ChantierStats[] = [];

  for (const [name, reps] of grouped) {
    const sorted = [...reps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const r = latest.report;
    const status = getStatusLevel(r.statut_global);

    // Score trend
    let scoreTrend: "up" | "down" | "stable" = "stable";
    if (sorted.length >= 2) {
      const currentScore = r.score ?? 5;
      const prevScore = sorted[1].report.score ?? 5;
      if (currentScore > prevScore + 0.5) scoreTrend = "up";
      else if (currentScore < prevScore - 0.5) scoreTrend = "down";
    }

    // Alerts from recent reports
    const allAlertes: string[] = [];
    for (const rep of sorted.slice(0, 3)) {
      if (rep.report.alertes) allAlertes.push(...rep.report.alertes);
    }

    // Top problems
    const topProblems = (r.problemes_rencontres || []).slice(0, 3).map(p => parseSeverity(p).text);

    // Recurring materials
    const materialCounts = new Map<string, number>();
    for (const rep of sorted) {
      for (const mat of rep.report.materiel_manquant || []) {
        const normalized = mat.toLowerCase().trim();
        materialCounts.set(normalized, (materialCounts.get(normalized) || 0) + 1);
      }
    }
    const recurringMaterials = [...materialCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const daysAgo = daysBetween(latest.date, now);

    chantiers.push({
      name,
      id: latest.enrichment?.chantierId,
      latestReport: latest,
      allReports: sorted,
      status,
      score: r.score ?? null,
      scoreTrend,
      alertes: [...new Set(allAlertes)].slice(0, 5),
      topProblems,
      reportCount: sorted.length,
      lastReportDate: latest.date,
      daysSinceLastReport: daysAgo,
      recurringMaterials,
    });
  }

  const order: Record<string, number> = { red: 0, orange: 1, none: 2, green: 3 };
  chantiers.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
  return chantiers;
}

export function generateAlerts(chantiers: ChantierStats[]): Alert[] {
  const alerts: Alert[] = [];

  for (const c of chantiers) {
    // Critical status
    if (c.status === "red") {
      alerts.push({
        id: `crit-${c.name}`,
        type: "critical",
        severity: "red",
        chantier: c.name,
        message: `Situation critique : ${c.topProblems[0] || c.latestReport.report.statut_global}`,
        date: c.lastReportDate,
      });
    }

    // Urgent enrichment flag
    if (c.latestReport.enrichment?.urgent) {
      alerts.push({
        id: `urg-${c.name}`,
        type: "critical",
        severity: "red",
        chantier: c.name,
        message: `Urgence signalée par ${c.latestReport.userName || "l'ouvrier"}`,
        date: c.lastReportDate,
      });
    }

    // Missing report (no report today for active chantiers with 2+ reports)
    if (c.daysSinceLastReport >= 1 && c.allReports.length >= 2) {
      alerts.push({
        id: `miss-${c.name}`,
        type: "missing",
        severity: c.daysSinceLastReport >= 3 ? "red" : "orange",
        chantier: c.name,
        message: `Aucun rapport depuis ${c.daysSinceLastReport} jour${c.daysSinceLastReport > 1 ? "s" : ""}`,
        date: c.lastReportDate,
      });
    }

    // Recurring material issues
    for (const mat of c.recurringMaterials) {
      if (mat.count >= 3) {
        alerts.push({
          id: `mat-${c.name}-${mat.name}`,
          type: "material",
          severity: "orange",
          chantier: c.name,
          message: `${mat.name} manquant ${mat.count} fois (récurrent)`,
          date: c.lastReportDate,
        });
      }
    }

    // Score declining trend
    if (c.scoreTrend === "down" && c.score !== null && c.score < 5) {
      alerts.push({
        id: `trend-${c.name}`,
        type: "trend",
        severity: "orange",
        chantier: c.name,
        message: `Score en baisse (${c.score}/10) — tendance négative`,
        date: c.lastReportDate,
      });
    }
  }

  const severityOrder: Record<string, number> = { red: 0, orange: 1, yellow: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));
  return alerts;
}

export function trackMaterials(reports: SavedReport[]): MaterialItem[] {
  const materials = new Map<string, { count: number; chantiers: Set<string>; lastDate: string }>();

  for (const r of reports) {
    const chantier = getChantierName(r);
    for (const mat of r.report.materiel_manquant || []) {
      const normalized = mat.toLowerCase().trim();
      const existing = materials.get(normalized) || { count: 0, chantiers: new Set<string>(), lastDate: r.date };
      existing.count++;
      existing.chantiers.add(chantier);
      if (r.date > existing.lastDate) existing.lastDate = r.date;
      materials.set(normalized, existing);
    }
  }

  return [...materials.entries()]
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count: data.count,
      chantiers: [...data.chantiers],
      lastMentioned: data.lastDate,
    }))
    .sort((a, b) => b.count - a.count);
}

export function searchReports(reports: SavedReport[], query: string): SavedReport[] {
  if (!query.trim()) return reports;
  const terms = query.toLowerCase().split(/\s+/);
  return reports.filter(r => {
    const text = [
      r.report.lieu_chantier,
      r.report.statut_global,
      r.report.synthese,
      r.report.rapporteur,
      r.userName,
      r.enrichment?.chantierName,
      ...r.report.travaux_realises,
      ...r.report.problemes_rencontres,
      ...r.report.materiel_manquant,
      ...r.report.a_prevoir,
      ...(r.report.alertes || []),
    ].filter(Boolean).join(" ").toLowerCase();
    return terms.every(t => text.includes(t));
  });
}

export function getKPIs(chantiers: ChantierStats[], reports: SavedReport[]) {
  const today = new Date().toISOString().slice(0, 10);
  const todayReports = reports.filter(r => r.date.slice(0, 10) === today);
  const scores = chantiers.map(c => c.score).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  return {
    totalChantiers: chantiers.length,
    activeChantiers: chantiers.filter(c => c.daysSinceLastReport <= 7).length,
    greenCount: chantiers.filter(c => c.status === "green").length,
    orangeCount: chantiers.filter(c => c.status === "orange").length,
    redCount: chantiers.filter(c => c.status === "red").length,
    avgScore,
    todayReportCount: todayReports.length,
    totalReports: reports.length,
  };
}
