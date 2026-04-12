import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import jsPDF from "jspdf";
import sharp from "sharp";
import fs from "fs";
import path from "path";

// Route segment config — génération PDF + compression photos + envoi email prend du temps
export const maxDuration = 60;

type SendEmailRequest = {
  report: string;
  pdfBuffer?: string;
  recipientEmail?: string;
};

/**
 * Compresse drastiquement une image pour réduire la taille du PDF
 * Cible : max 150KB par image, dimensions réduites, qualité dégradée mais acceptable
 */
async function compressImage(file: File): Promise<Buffer> {
  try {
    console.log(`[IMAGE COMPRESSION] Début - Fichier: ${file.name}, Taille initiale: ${(file.size / 1024).toFixed(2)}KB`);
    
    // Conversion du File en Buffer pour sharp
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    console.log(`[IMAGE COMPRESSION] Buffer créé: ${(inputBuffer.length / 1024).toFixed(2)}KB`);

    // Compression drastique avec sharp
    const compressedBuffer = await sharp(inputBuffer)
      .rotate() // Auto-rotate based on EXIF orientation (critical for phone photos)
      .resize(800, 600, { // Redimensionnement à 800x600 max (suffisant pour un PDF)
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 50, progressive: true }) // Qualité très réduite (50%)
      .toBuffer();

    const sizeReduction = ((1 - compressedBuffer.length / inputBuffer.length) * 100).toFixed(1);
    console.log(`[IMAGE COMPRESSION] Succès - Taille finale: ${(compressedBuffer.length / 1024).toFixed(2)}KB (réduction: ${sizeReduction}%)`);
    
    return compressedBuffer;
  } catch (error) {
    console.error(
      `[IMAGE COMPRESSION ERREUR] Impossible de compresser ${file.name}:`,
      error instanceof Error ? error.message : error
    );
    throw new Error(`Erreur de compression image: ${file.name}`);
  }
}

/**
 * Fonction principale de génération du PDF — design professionnel BTP
 */
async function generateReportPDFWithPhotos(reportRaw: string, photos: File[], photoLegends: string[]): Promise<Buffer> {
  // ...existing code...
  // ── Parse the JSON report safely
  type ReportData = {
    statut_global?: string;
    lieu_chantier?: string;
    rapporteur?: string;
    meteo?: string;
    equipe?: string;
    avancement?: string;
    score?: number;
    synthese?: string;
    alertes?: string[];
    travaux_realises?: string[] | string;
    problemes_rencontres?: string[] | string;
    materiel_manquant?: string[] | string;
    a_prevoir?: string[] | string;
    suggestion_legende_photo?: string;
  };
  let reportData: ReportData = {};
  try {
    reportData = JSON.parse(reportRaw) as ReportData;
  } catch {
    reportData = { travaux_realises: reportRaw };
  }

  const PLACEHOLDER_RE = /^(aucun(e)?\s|rien\s|pas\sde\s|non\s(precise|renseigne|mentionne)|néant$|^—$|^-$)/i;
  const toArray = (val: unknown): string[] => {
    let arr: string[] = [];
    if (Array.isArray(val)) arr = val.filter((s): s is string => typeof s === "string" && s.trim() !== "").map(s => s.trim());
    else if (typeof val === "string" && val.trim() !== "") arr = val.trim().split(/\n/).map(s => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
    return arr.filter(s => !PLACEHOLDER_RE.test(s));
  };

  /** Sanitize emojis that jsPDF cannot render */
  const sanitizeEmoji = (text: string): string =>
    text
      .replace(/⚠️/g, "[Attention]")
      .replace(/🚨/g, "[Critique]")
      .replace(/🟢/g, "")
      .replace(/🟠/g, "")
      .replace(/🔴/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  // Fusionne Problèmes et Matériel pour "Points Critiques"
  const travaux   = toArray(reportData.travaux_realises).map(sanitizeEmoji);
  const problemes = [
    ...toArray(reportData.problemes_rencontres),
    ...toArray(reportData.materiel_manquant)
  ].map(sanitizeEmoji);
  // Fusionne À prévoir, Alertes et Recommandations pour "Plan d'action & Suite"
  const planAction = [
    ...toArray(reportData.a_prevoir),
    ...toArray((reportData as Record<string, unknown>).alertes),
    ...(Array.isArray((reportData as Record<string, unknown>).recommandations) ? toArray((reportData as Record<string, unknown>).recommandations) : [])
  ].map(sanitizeEmoji);

  // Optional fields — undefined if not provided (never show placeholders)
  const optStr = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if (!t || t === "Non precise" || t === "Non précisé" || t === "Inconnu" || t === "—") return undefined;
    return t;
  };
  const lieu         = optStr(reportData.lieu_chantier);
  const rapporteur   = optStr(reportData.rapporteur);
  const meteo        = optStr(reportData.meteo);
  const equipe       = optStr(reportData.equipe);
  const avancement   = optStr(reportData.avancement);
  const statutGlobal = sanitizeEmoji(reportData.statut_global || "");
  const impacts   = toArray((reportData as Record<string, unknown>).impacts).map(sanitizeEmoji);
  const score     = typeof reportData.score === "number" ? reportData.score : null;
  const synthese  = reportData.synthese ? sanitizeEmoji(reportData.synthese) : null;

  console.log(`[PDF GENERATION] ========== DEBUT DE LA GENERATION ==========`);
  console.log(`[PDF GENERATION] Nombre d'images: ${photos.length}`);

  // ── Load company logo (optional — PDF still generates if missing)
  let logoDataUrl: string | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logoBuffer = fs.readFileSync(logoPath);
    logoDataUrl = "data:image/png;base64," + logoBuffer.toString("base64");
    console.log("[PDF LOGO] Logo chargé avec succès");
  } catch {
    console.warn("[PDF LOGO] logo.png introuvable — PDF généré sans logo.");
  }

  // ── Compress photos
  const compressedPhotos: Buffer[] = [];
  for (let i = 0; i < photos.length; i++) {
    try {
      compressedPhotos.push(await compressImage(photos[i]));
      console.log(`[PDF GENERATION] Image ${i + 1}/${photos.length} compressee`);
    } catch (err) {
      console.error(`[PDF GENERATION] Erreur compression image ${i + 1}:`, err);
    }
  }

  // ── Document setup
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "A4" });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const ML = 18;
  const MR = 18;
  const CW = PW - ML - MR; // 174

  const today   = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  // ── Color palette (premium BTP design)
  type RGB = [number, number, number];
  const NAVY_900: RGB = [15, 30, 61];
  const NAVY_700: RGB = [26, 47, 92];
  const AMBER:    RGB = [232, 163, 48];
  const AMBER_DK: RGB = [212, 137, 28];
  const GREEN:    RGB = [26, 153, 96];
  const RED:      RGB = [200, 52, 44];
  const WHITE:    RGB = [255, 255, 255];
  const DGRAY:    RGB = [44, 62, 80];
  const MGRAY:    RGB = [127, 140, 141];
  const LGRAY:    RGB = [248, 249, 250];
  const BGRAY:    RGB = [218, 223, 228];
  const GREEN_SOFT: RGB = [230, 247, 238];
  const AMBER_SOFT: RGB = [253, 243, 226];
  const RED_SOFT:   RGB = [253, 237, 236];

  let pageNum = 0;
  const HERO_H = 58;
  const HERO_H_P2 = 38;
  const ACCENT_H = 4;
  const PAGE_BOTTOM = PH - 16;

  // ── Draw footer on current page ────────────────────────────────────
  // Footer minimal (réf + date, en bas à droite)
  function drawFooter(page: number) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text("Ref. VR-" + Date.now().toString(36).toUpperCase().slice(-6) + "  |  " + today, PW - MR, PH - 8, { align: "right" });
  }
  // Résumé visuel (pastilles de couleur, score)
  function drawSummaryRow(y: number): number {
    // Pastilles : vert si travaux, rouge si points critiques, gris sinon
    const CIRCLE_R = 5;
    let cx = ML + 8;
    // Travaux réalisés
    doc.setFillColor(...(travaux.length > 0 ? GREEN : BGRAY));
    doc.circle(cx, y + CIRCLE_R, CIRCLE_R, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text("Travaux réalisés", cx + 10, y + CIRCLE_R + 2);
    // Points critiques
    cx += 70;
    doc.setFillColor(...(problemes.length > 0 ? RED : BGRAY));
    doc.circle(cx, y + CIRCLE_R, CIRCLE_R, "F");
    doc.setTextColor(...DGRAY);
    doc.text("Incidents & Matériel", cx + 10, y + CIRCLE_R + 2);
    // Score
    if (score !== null) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY_900);
      doc.text("Note : " + score + "/10", PW - MR - 40, y + CIRCLE_R + 2);
    }
    return y + 16;
  }

  // ── Draw diamond shape ─────────────────────────────────────────────
  function drawDiamond(cx: number, cy: number, hw: number, hh: number, color: RGB) {
    doc.setFillColor(...color);
    doc.triangle(cx, cy - hh, cx - hw, cy, cx + hw, cy, "F");
    doc.triangle(cx - hw, cy, cx + hw, cy, cx, cy + hh, "F");
  }

  // ── Page 1 Hero (large, with meta row) ─────────────────────────────
  function drawPage1Hero(): number {
    // Navy background
    doc.setFillColor(...NAVY_900);
    doc.rect(0, 0, PW, HERO_H, "F");

    // Decorative navy-700 circles
    doc.setFillColor(...NAVY_700);
    doc.circle(PW - 15, 12, 25, "F");
    doc.circle(PW - 45, -8, 15, "F");

    // Amber accent bar below hero
    doc.setFillColor(...AMBER);
    doc.rect(0, HERO_H, PW, ACCENT_H, "F");

    // Status pill (top right)
    if (statutGlobal) {
      const s = statutGlobal.toLowerCase();
      let pillColor: RGB = GREEN;
      let pillText = "En cours";
      if (s.includes("bon") || s.includes("fluide")) { pillColor = GREEN; pillText = "Bon d\u00e9roulement"; }
      else if (s.includes("difficulte") || s.includes("quelques")) { pillColor = AMBER; pillText = "Difficult\u00e9s"; }
      else if (s.includes("critique") || s.includes("probleme")) { pillColor = RED; pillText = "Critique"; }
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      const pillTextW = doc.getTextWidth(pillText);
      const dotSpace = 8; // dot (3) + gap (5)
      const pillPadH = 5;
      const pillW = pillTextW + dotSpace + pillPadH * 2;
      const pillH = 8;
      const pillX = PW - MR - pillW;
      const pillY = 8;
      doc.setFillColor(...pillColor);
      doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "F");
      // White dot centered vertically
      doc.setFillColor(...WHITE);
      doc.circle(pillX + pillPadH + 1.5, pillY + pillH / 2, 1.2, "F");
      // Text centered vertically
      doc.setTextColor(...WHITE);
      doc.text(pillText, pillX + pillPadH + dotSpace, pillY + pillH / 2 + 1.8);
    }

    // Score badge (under status pill)
    if (score !== null) {
      const scoreStr = score + "/10";
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      const scoreBadgeW = doc.getTextWidth(scoreStr) + 10;
      const scoreBadgeX = PW - MR - scoreBadgeW;
      const scoreBadgeY = statutGlobal ? 19 : 8;
      let scoreBgColor: RGB = GREEN;
      if (score < 5) scoreBgColor = RED;
      else if (score < 7) scoreBgColor = AMBER;
      doc.setFillColor(...scoreBgColor);
      doc.roundedRect(scoreBadgeX, scoreBadgeY, scoreBadgeW, 7, 3.5, 3.5, "F");
      doc.setTextColor(...WHITE);
      doc.text(scoreStr, scoreBadgeX + scoreBadgeW / 2, scoreBadgeY + 5.2, { align: "center" });
    }

    // Brand line
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AMBER);
    doc.text("\u2014  VOICEREPORT \u00b7 BTP", ML + 4, 20);

    // Main title
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("Rapport de chantier", ML + 4, 34);

    // Hero meta row
    const metaY = 43;
    const metaItems: { label: string; value: string }[] = [];
    metaItems.push({ label: "Date", value: today });
    if (lieu) metaItems.push({ label: "Chantier", value: lieu });
    if (rapporteur) metaItems.push({ label: "Chef d'\u00e9quipe", value: rapporteur });
    if (equipe) metaItems.push({ label: "\u00c9quipe", value: equipe });
    if (meteo && metaItems.length < 4) metaItems.push({ label: "M\u00e9t\u00e9o", value: meteo });
    if (avancement && metaItems.length < 4) metaItems.push({ label: "Avancement", value: avancement });
    const mColW = (CW - 8) / Math.max(metaItems.length, 1);
    for (let i = 0; i < metaItems.length; i++) {
      const mx = ML + 4 + i * mColW;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...AMBER);
      doc.text(metaItems[i].label, mx, metaY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      const vl = doc.splitTextToSize(metaItems[i].value, mColW - 4);
      doc.text(vl[0] || "", mx, metaY + 6);
    }

    return HERO_H + ACCENT_H;
  }

  // ── Continuation hero (page 2+) ───────────────────────────────────
  function drawContinuationHero(brand?: string, title?: string): number {
    doc.setFillColor(...NAVY_900);
    doc.rect(0, 0, PW, HERO_H_P2, "F");
    doc.setFillColor(...NAVY_700);
    doc.circle(PW - 15, 8, 18, "F");
    doc.setFillColor(...AMBER);
    doc.rect(0, HERO_H_P2, PW, ACCENT_H, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AMBER);
    doc.text(brand || "\u2014  VOICEREPORT \u00b7 BTP", ML + 4, 16);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(title || "Rapport de chantier (suite)", ML + 4, 28);
    return HERO_H_P2 + ACCENT_H;
  }

  // ── Add new page with continuation hero ────────────────────────────
  function newPage(): number {
    doc.addPage();
    pageNum++;
    const sy = drawContinuationHero() + 8;
    drawFooter(pageNum);
    return sy;
  }

  // ── KPI Grid (3 columns with colored left border) ──────────────────
  function drawKPIGrid(y: number): number {
    const KPI_H = 22;
    const GAP = 4;
    const COL_W = (CW - GAP * 2) / 3;

    const kpis: { label: string; value: string; border: RGB }[] = [];
    kpis.push({ label: "Travaux", value: String(travaux.length), border: GREEN });
    kpis.push({ label: "Probl\u00e8mes", value: String(problemes.length), border: problemes.length > 0 ? RED : GREEN });
    kpis.push({ label: "Mat\u00e9riel manquant", value: String(materiel.length), border: materiel.length > 0 ? AMBER : GREEN });

    for (let i = 0; i < 3; i++) {
      const kx = ML + i * (COL_W + GAP);
      // White card
      doc.setFillColor(...WHITE);
      doc.roundedRect(kx, y, COL_W, KPI_H, 2, 2, "F");
      doc.setDrawColor(...BGRAY);
      doc.setLineWidth(0.3);
      doc.roundedRect(kx, y, COL_W, KPI_H, 2, 2, "S");
      // Colored left accent
      doc.setFillColor(...kpis[i].border);
      doc.roundedRect(kx, y, 3, KPI_H, 2, 0, "F");
      doc.rect(kx + 1.5, y, 1.5, KPI_H, "F");
      // Value
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DGRAY);
      const valText = doc.splitTextToSize(kpis[i].value, COL_W - 12);
      doc.text(valText[0] || kpis[i].value, kx + COL_W / 2 + 2, y + 10, { align: "center" });
      // Label
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MGRAY);
      doc.text(kpis[i].label, kx + COL_W / 2 + 2, y + 17, { align: "center" });
    }

    return y + KPI_H + 6;
  }

  // ── Section block with items list ──────────────────────────────────
  function drawSection(title: string, items: string[], y: number, sType: "travaux" | "problemes" | "materiel" | "aprevoir"): number {
    const TITLE_H = 10;
    const LINE_H = 5;
    const ITEM_PAD = 3;
    const PAD = 5;
    const GAP = 6;
    const FS = 9;

    // Empty section: show "Rien \u00e0 signaler" card
    if (items.length === 0) {
      return drawEmptyCard(title, y, sType);
    }

    // Pre-compute item text wrapping
    doc.setFontSize(FS);
    const itemLines: string[][] = items.map(item =>
      doc.splitTextToSize(item, CW - PAD * 2 - 14) as string[]
    );

    // Page break check for title + first item
    const firstItemH = itemLines[0].length * LINE_H + ITEM_PAD;
    if (y + TITLE_H + firstItemH + PAD * 2 > PAGE_BOTTOM) {
      y = newPage();
    }

    // Section title with amber diamond icon
    drawDiamond(ML + 2.5, y + 5, 2, 2.5, AMBER);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text(title, ML + 8, y + 7);

    // Count badge
    const countStr = String(items.length);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const badgeW = doc.getTextWidth(countStr) + 6;
    const badgeX = PW - MR - badgeW;
    doc.setFillColor(...AMBER);
    doc.roundedRect(badgeX, y + 2, badgeW, 6, 3, 3, "F");
    doc.setTextColor(...WHITE);
    doc.text(countStr, badgeX + badgeW / 2, y + 6.5, { align: "center" });
    y += TITLE_H;

    // Draw items
    for (let idx = 0; idx < items.length; idx++) {
      const lines = itemLines[idx];
      const itemH = lines.length * LINE_H + ITEM_PAD;

      // Page break within section
      if (y + itemH > PAGE_BOTTOM) {
        y = newPage();
        drawDiamond(ML + 2.5, y + 5, 2, 2.5, AMBER);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...DGRAY);
        doc.text(title + " (suite)", ML + 8, y + 7);
        y += TITLE_H;
      }

      // Material items: amber soft background + badge
      if (sType === "materiel") {
        doc.setFillColor(...AMBER_SOFT);
        doc.roundedRect(ML, y - 1, CW, itemH + 1, 1, 1, "F");
        const bText = "\u00c0 commander";
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        const bw = doc.getTextWidth(bText) + 6;
        doc.setFillColor(...AMBER);
        doc.roundedRect(PW - MR - bw - 2, y + 1, bw, 5, 2.5, 2.5, "F");
        doc.setTextColor(...WHITE);
        doc.text(bText, PW - MR - bw / 2 - 2, y + 4.5, { align: "center" });
      }

      // Colored bullet
      let bulletColor: RGB;
      if (sType === "travaux") bulletColor = GREEN;
      else if (sType === "problemes") bulletColor = RED;
      else bulletColor = AMBER_DK;
      doc.setFillColor(...bulletColor);
      doc.circle(ML + 3, y + 3.5, 1.5, "F");

      // Item text
      doc.setFontSize(FS);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DGRAY);
      let ty = y + 4.5;
      for (const line of lines) {
        doc.text(line, ML + 10, ty);
        ty += LINE_H;
      }

      // Dashed separator between items
      if (idx < items.length - 1) {
        doc.setDrawColor(...BGRAY);
        doc.setLineWidth(0.2);
        const dashLen = 2;
        const gapLen = 2;
        const lineY = y + itemH;
        let dx = ML + 8;
        while (dx < PW - MR) {
          const dEnd = Math.min(dx + dashLen, PW - MR);
          doc.line(dx, lineY, dEnd, lineY);
          dx += dashLen + gapLen;
        }
      }

      y += itemH;
    }

    return y + GAP;
  }

  // ── "Rien \u00e0 signaler" card for empty sections ─────────────────────
  function drawEmptyCard(title: string, y: number, sType: string): number {
    const CARD_H = 16;
    if (y + CARD_H + 6 > PAGE_BOTTOM) { y = newPage(); }

    // Section title
    let bulletColor: RGB;
    if (sType === "travaux") bulletColor = GREEN;
    else if (sType === "problemes") bulletColor = RED;
    else if (sType === "materiel") bulletColor = AMBER_DK;
    else bulletColor = NAVY_700;

    drawDiamond(ML + 2.5, y + 5, 2, 2.5, bulletColor);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text(title, ML + 8, y + 7);
    y += 12;

    // Green soft card
    doc.setFillColor(...GREEN_SOFT);
    doc.roundedRect(ML, y, CW, CARD_H, 2, 2, "F");
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, CARD_H, 2, 2, "S");

    // Checkmark
    const cx = ML + 7;
    const cy = y + CARD_H / 2;
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.8);
    doc.line(cx - 2, cy, cx, cy + 2);
    doc.line(cx, cy + 2, cx + 3, cy - 2);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN);
    doc.text("Rien \u00e0 signaler", ML + 14, y + CARD_H / 2 + 1.5);

    return y + CARD_H + 6;
  }

  // ── Action card (navy bg with amber numbered list) ─────────────────
  function drawActionCard(items: string[], y: number): number {
    if (items.length === 0) return y;

    // Pre-compute lines
    doc.setFontSize(9);
    const itemLines: string[][] = items.map(item =>
      doc.splitTextToSize(item, CW - 26) as string[]
    );
    let totalLines = 0;
    for (const lines of itemLines) totalLines += lines.length;
    const cardH = totalLines * 5 + items.length * 3 + 22;

    if (y + cardH > PAGE_BOTTOM) { y = newPage(); }

    // Navy background card
    doc.setFillColor(...NAVY_900);
    doc.roundedRect(ML, y, CW, cardH, 3, 3, "F");

    // Title
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("Actions prioritaires pour la reprise", ML + 10, y + 13);

    // Numbered items
    let iy = y + 22;
    for (let i = 0; i < items.length; i++) {
      // Amber number
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...AMBER);
      doc.text(String(i + 1) + ".", ML + 10, iy + 4);

      // White text
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...WHITE);
      for (const line of itemLines[i]) {
        doc.text(line, ML + 18, iy + 4);
        iy += 5;
      }
      iy += 3;
    }

    return y + cardH + 6;
  }

  // ── Impact section (red left-border cards with RISQUE badge) ───────
  function drawImpactSection(y: number): number {
    if (impacts.length === 0) return y;

    // Warning triangle icon
    const tx = ML + 3;
    const tiy = y + 5;
    doc.setFillColor(...RED);
    doc.triangle(tx, tiy - 3, tx - 2.5, tiy + 2, tx + 2.5, tiy + 2, "F");
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("!", tx, tiy + 1.2, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...RED);
    doc.text("Impacts d\u00e9tect\u00e9s", ML + 9, y + 7);
    y += 12;

    for (const imp of impacts) {
      const cleanImp = imp.replace(/^[\u26A0\uFE0F\u{1F4C5}\u{1F534}\u{1F7E0}\u{1F7E2}\u{1F327}\uFE0F\u{1F477}]+\s*/u, "").trim();
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(cleanImp || imp, CW - 22) as string[];
      const cardH = lines.length * 5 + 10;

      if (y + cardH > PAGE_BOTTOM) { y = newPage(); }

      // Red-bordered card
      doc.setFillColor(...RED_SOFT);
      doc.roundedRect(ML, y, CW, cardH, 2, 2, "F");
      doc.setFillColor(...RED);
      doc.roundedRect(ML, y, 3, cardH, 2, 0, "F");
      doc.rect(ML + 1.5, y, 1.5, cardH, "F");

      // "RISQUE" badge
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(...RED);
      doc.roundedRect(ML + 8, y + 2, 16, 5, 2.5, 2.5, "F");
      doc.setTextColor(...WHITE);
      doc.text("RISQUE", ML + 16, y + 5.5, { align: "center" });

      // Impact text
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DGRAY);
      let ly = y + 12;
      for (const line of lines) {
        doc.text(line, ML + 8, ly);
        ly += 5;
      }
      y += cardH + 4;
    }
    return y + 4;
  }

  // ── Certification block (gray bg) ─────────────────────────────────
  function drawCertBlock(y: number): number {
    const BLOCK_H = 18;
    if (y + BLOCK_H + 6 > PAGE_BOTTOM) { y = newPage(); }

    doc.setFillColor(...LGRAY);
    doc.roundedRect(ML, y, CW, BLOCK_H, 2, 2, "F");
    doc.setDrawColor(...BGRAY);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, BLOCK_H, 2, 2, "S");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text("Rapport g\u00e9n\u00e9r\u00e9 et certifi\u00e9 par VoiceReport", PW / 2, y + 7, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text(
      today + " \u00e0 " + timeStr + "  |  R\u00e9f. VR-" + Date.now().toString(36).toUpperCase().slice(-6),
      PW / 2, y + 13, { align: "center" }
    );
    return y + BLOCK_H + 6;
  }

  // ── Photo grid (2-column layout with dashed borders) ───────────────
  function drawPhotoGrid(y: number): number {
    if (compressedPhotos.length === 0) return y;
    const GRID_GAP = 4;
    const COL_W = (CW - GRID_GAP) / 2;

    // Helper: draw dashed rectangle
    function dashedRect(rx: number, ry: number, rw: number, rh: number) {
      doc.setDrawColor(...BGRAY);
      doc.setLineWidth(0.4);
      const d = 3, g = 2;
      for (let px = rx; px < rx + rw; px += d + g) {
        doc.line(px, ry, Math.min(px + d, rx + rw), ry);
        doc.line(px, ry + rh, Math.min(px + d, rx + rw), ry + rh);
      }
      for (let py = ry; py < ry + rh; py += d + g) {
        doc.line(rx, py, rx, Math.min(py + d, ry + rh));
        doc.line(rx + rw, py, rx + rw, Math.min(py + d, ry + rh));
      }
    }

    for (let i = 0; i < compressedPhotos.length; i += 2) {
      let rowH = 70;
      if (y + rowH + 10 > PAGE_BOTTOM) { y = newPage(); }

      for (let j = 0; j < 2 && (i + j) < compressedPhotos.length; j++) {
        const px = ML + j * (COL_W + GRID_GAP);
        try {
          const b64 = compressedPhotos[i + j].toString("base64");
          const durl = "data:image/jpeg;base64," + b64;
          const props = doc.getImageProperties(durl);
          let iw = COL_W - 4;
          let ih = iw * (props.height / props.width);
          if (ih > 80) { ih = 80; iw = ih * (props.width / props.height); }
          if (ih + 6 > rowH) rowH = ih + 6;

          dashedRect(px, y, COL_W, ih + 4);
          doc.addImage(durl, "JPEG", px + (COL_W - iw) / 2, y + 2, iw, ih);

          const legend = photoLegends[i + j] || "";
          if (legend) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...MGRAY);
            const legLines = doc.splitTextToSize(legend, COL_W - 4);
            doc.text(legLines[0] || "", px + 2, y + ih + 10);
          }
        } catch {
          dashedRect(px, y, COL_W, 60);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...MGRAY);
          doc.text("Photo indisponible", px + COL_W / 2, y + 30, { align: "center" });
          if (64 > rowH) rowH = 64;
        }
      }
      y += rowH + 4;
    }
    return y + 4;
  }

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 1 — Vue d'ensemble & Terrain
  pageNum = 1;
  let y = drawPage1Hero() + 8;
  drawFooter(pageNum);
  // Résumé visuel (pastilles, score)
  y = drawSummaryRow(y);
  // Travaux réalisés
  y = drawSection("Travaux réalisés", travaux, y, "travaux");
  // Points critiques (fusion Problèmes + Matériel)
  y = drawSection("Incidents & Matériel", problemes, y, "problemes");

  // PAGE 2 : Suivi & Visuels
  doc.addPage();
  pageNum++;
  y = drawContinuationHero(
    "—  SUIVI & VISUELS · BTP",
    "Plan d'action & Suite"
  ) + 8;
  drawFooter(pageNum);
  // Plan d'action (fusionné)
  if (planAction.length > 0) {
    y = drawActionCard(planAction, y);
  } else {
    if (y + 22 > PAGE_BOTTOM) { y = newPage(); }
    doc.setFillColor(...GREEN_SOFT);
    doc.roundedRect(ML, y, CW, 16, 2, 2, "F");
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, 16, 2, 2, "S");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN);
    doc.text("Aucune action prioritaire requise", ML + 14, y + 10);
    y += 22;
  }
  // Impacts (inchangé)
  y = drawImpactSection(y);
  // Galerie photos
  if (compressedPhotos.length > 0) {
    if (y + 20 > PAGE_BOTTOM) { y = newPage(); }
    drawDiamond(ML + 2.5, y + 5, 2, 2.5, AMBER);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text("Photos du chantier", ML + 8, y + 7);
    y += 14;
    y = drawPhotoGrid(y);
  }
  // Certification (inchangé)
  y = drawCertBlock(y);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 2+ \u2014 Plan d'action, Impacts, Photos, Certification
  // ══════════════════════════════════════════════════════════════════════
  const hasActions = planAction.length > 0;
  const hasImpacts = impacts.length > 0;
  const hasPhotos = compressedPhotos.length > 0;
  const hasAlertesForP2 = alertes.length > 0;

  // Always generate page 2 for plan d'action
  doc.addPage();
  pageNum++;
  y = drawContinuationHero(
    "\u2014  PLAN D'ACTION \u00b7 BTP",
    "Plan d'action & recommandations"
  ) + 8;
  drawFooter(pageNum);

  // Score recap on page 2
  if (score !== null) {
    if (y + 18 > PAGE_BOTTOM) { y = newPage(); }
    doc.setFillColor(...LGRAY);
    doc.roundedRect(ML, y, CW, 16, 2, 2, "F");
    doc.setDrawColor(...BGRAY);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, 16, 2, 2, "S");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text("Note du chantier :", ML + 8, y + 10);
    let scoreColor: RGB = GREEN;
    if (score < 5) scoreColor = RED;
    else if (score < 7) scoreColor = AMBER;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...scoreColor);
    doc.text(score + " / 10", ML + 52, y + 11);
    // Status label
    let noteLabel = "Excellent";
    if (score < 5) noteLabel = "Critique - Actions urgentes requises";
    else if (score < 7) noteLabel = "Correct - Am\u00e9liorations n\u00e9cessaires";
    else if (score < 9) noteLabel = "Bon d\u00e9roulement";
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text(noteLabel, ML + 80, y + 11);
    y += 22;
  }

  // Actions imm\u00e9diates
  if (hasActions) {
    y = drawActionCard(planAction, y);
  } else {
    // Even without actions, show a clean card
    if (y + 22 > PAGE_BOTTOM) { y = newPage(); }
    doc.setFillColor(...GREEN_SOFT);
    doc.roundedRect(ML, y, CW, 16, 2, 2, "F");
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, 16, 2, 2, "S");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN);
    doc.text("Aucune action prioritaire requise", ML + 14, y + 10);
    y += 22;
  }

  // Conseils de gestion pour le patron
  if (y + 40 > PAGE_BOTTOM) { y = newPage(); }
  drawDiamond(ML + 2.5, y + 5, 2, 2.5, NAVY_700);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DGRAY);
  doc.text("Recommandations de gestion", ML + 8, y + 7);
  y += 12;

  // Build dynamic recommendations
  const recommendations: string[] = [];
  if (problemes.length > 0) recommendations.push("Planifier une r\u00e9union d'\u00e9quipe pour traiter les " + problemes.length + " probl\u00e8me(s) identifi\u00e9(s)");
  if (materiel.length > 0) recommendations.push("Passer commande du mat\u00e9riel manquant (" + materiel.length + " \u00e9l\u00e9ment(s)) pour \u00e9viter les retards");
  if (hasAlertesForP2) recommendations.push("V\u00e9rifier les alertes signal\u00e9es et prendre les mesures correctives");
  if (score !== null && score < 7) recommendations.push("Note en dessous de 7/10 : identifier les causes principales et am\u00e9liorer les conditions de travail");
  if (travaux.length > 0) recommendations.push("Valider les " + travaux.length + " t\u00e2che(s) r\u00e9alis\u00e9e(s) et mettre \u00e0 jour le planning");
  if (recommendations.length === 0) recommendations.push("Chantier en bon \u00e9tat - poursuivre dans les conditions actuelles");

  for (let i = 0; i < recommendations.length; i++) {
    doc.setFontSize(9);
    const recLines = doc.splitTextToSize(recommendations[i], CW - 18) as string[];
    const recH = recLines.length * 5 + 6;
    if (y + recH > PAGE_BOTTOM) { y = newPage(); }
    doc.setFillColor(...LGRAY);
    doc.roundedRect(ML, y, CW, recH, 1.5, 1.5, "F");
    // Numbered circle
    doc.setFillColor(...NAVY_700);
    doc.circle(ML + 7, y + recH / 2, 3, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(String(i + 1), ML + 7, y + recH / 2 + 1.5, { align: "center" });
    // Text
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DGRAY);
    let ry = y + 5;
    for (const line of recLines) {
      doc.text(line, ML + 14, ry + 2);
      ry += 5;
    }
    y += recH + 3;
  }
  y += 4;

  // Impacts
  y = drawImpactSection(y);

  // Photos
  if (hasPhotos) {
    if (y + 20 > PAGE_BOTTOM) { y = newPage(); }
    drawDiamond(ML + 2.5, y + 5, 2, 2.5, AMBER);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DGRAY);
    doc.text("Visuels du chantier", ML + 8, y + 7);
    y += 14;
    y = drawPhotoGrid(y);
  }

  // Certification
  y = drawCertBlock(y);

  // ── Convert to buffer
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  console.log(`[PDF GENERATION] PDF OK - ${(pdfBuffer.length / 1024).toFixed(0)}KB`);
  console.log(`[PDF GENERATION] ========== GENERATION COMPLETE ==========`);
  return pdfBuffer;
}


export async function POST(request: NextRequest) {
  console.log("\n" + "=".repeat(80));
  console.log("[ENVOI EMAIL] ========== DÉBUT DU PROCESSUS ==========");
  console.log("=".repeat(80));

  // Étape 1 : Vérification des variables d'environnement
  try {
    console.log(`[ENVIRONNEMENT] Vérification des clés d'API`);
    const hasResendKey = !!process.env.RESEND_API_KEY;
    const hasFromEmail = !!process.env.RESEND_FROM_EMAIL;
    
    console.log(`[ENVIRONNEMENT] Clé Resend: ${hasResendKey ? "✅ PRÉSENTE" : "❌ MANQUANTE"}`);
    console.log(`[ENVIRONNEMENT] Email d'envoi: ${hasFromEmail ? "✅ PRÉSENTE" : "❌ MANQUANTE"}`);

    if (!hasResendKey || !hasFromEmail) {
      console.warn(`[ENVIRONNEMENT AVERTISSEMENT] Des variables d'environnement manquent`);
    }
  } catch (envError) {
    console.error(`[ENVIRONNEMENT ERREUR]`, envError);
  }

  // Étape 2 : Extraction des données du formulaire
  let report = "";
  let recipientEmail = "";
  let photos: File[] = [];
  let photoLegends: string[] = [];

  try {
    console.log(`[DONNÉES] Extraction du contenu de la requête`);
    const contentType = request.headers.get("content-type") ?? "";
    
    if (contentType.includes("multipart/form-data")) {
      console.log(`[DONNÉES] Format: multipart/form-data`);
      const formData = await request.formData();
      const reportValue = formData.get("report");
      const recipientValue = formData.get("recipientEmail");
      
      report = typeof reportValue === "string" ? reportValue.trim() : "";
      recipientEmail = typeof recipientValue === "string" ? recipientValue.trim() : "";
      // Collect photos sent under 'photos' key (one entry per file)
      const photoEntries = formData.getAll("photos");
      photos = photoEntries.filter((item): item is File => item instanceof File);
      console.log(`[DONNEES] Photos detectees: ${photos.length} fichier(s) (cles 'photos')`);

      // Extract photo legends
      const legendsRaw = formData.get("photoLegends");
      if (typeof legendsRaw === "string") {
        try { photoLegends = JSON.parse(legendsRaw); } catch { photoLegends = []; }
      }
      
      console.log(`[DONNÉES] Rapport reçu: ${report.length} caractères`);
      console.log(`[DONNÉES] Email destinataire: ${recipientEmail ? "✅ PRÉSENT" : "❌ ABSENT"}`);
      console.log(`[DONNÉES] Photos reçues: ${photos.length} fichier(s)`);
      
      photos.forEach((photo, idx) => {
        console.log(`[DONNÉES]   Image ${idx + 1}: ${photo.name} (${(photo.size / 1024).toFixed(2)}KB)`);
      });
    } else {
      console.log(`[DONNÉES] Format: JSON`);
      const body = (await request.json()) as SendEmailRequest;
      report = typeof body?.report === "string" ? body.report.trim() : "";
      recipientEmail = typeof body?.recipientEmail === "string" ? body.recipientEmail.trim() : "";
      console.log(`[DONNÉES] Rapport reçu: ${report.length} caractères`);
      console.log(`[DONNÉES] Email destinataire: ${recipientEmail ? "✅ PRÉSENT" : "❌ ABSENT"}`);
    }
  } catch (dataError) {
    console.error(
      `[DONNÉES ERREUR] Impossible d'extraire les données`,
      dataError instanceof Error ? dataError.message : dataError
    );
    return NextResponse.json(
      { error: `Erreur lors de la lecture des données: ${dataError instanceof Error ? dataError.message : "Erreur inconnue"}` },
      { status: 400 }
    );
  }

  // Étape 3 : Validation des données
  try {
    console.log(`[VALIDATION] Vérification des données obligatoires`);
    if (!report) {
      throw new Error("Le rapport est requis pour l'envoi.");
    }
    if (!recipientEmail) {
      throw new Error("L'email du destinataire est requis pour l'envoi.");
    }
    console.log(`[VALIDATION] ✅ Données valides`);
  } catch (validationError) {
    console.error(
      `[VALIDATION ERREUR]`,
      validationError instanceof Error ? validationError.message : validationError
    );
    return NextResponse.json(
      { error: validationError instanceof Error ? validationError.message : "Erreur de validation" },
      { status: 400 }
    );
  }

  // Étape 4 : Génération du PDF (AVEC COMPRESSION DES IMAGES)
  let pdfBuffer: Buffer;
  try {
    console.log(`[PDF] Début de la génération du PDF avec ${photos.length} image(s)`);
    pdfBuffer = await generateReportPDFWithPhotos(report, photos, photoLegends);
    console.log(`[PDF] ✅ PDF généré avec succès - Taille: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB`);
  } catch (pdfError) {
    console.error(
      `[PDF ERREUR FATALE] Impossible de générer le PDF`,
      pdfError instanceof Error ? pdfError.message : pdfError
    );
    return NextResponse.json(
      { error: `Erreur lors de la génération du PDF: ${pdfError instanceof Error ? pdfError.message : "Erreur inconnue"}` },
      { status: 500 }
    );
  }

  // Étape 5 : Envoi de l'email avec Resend
  try {
    console.log(`[EMAIL] Préparation de l'envoi`);
    
    const resend = new Resend(process.env.RESEND_API_KEY || "");
    const today = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Parse report JSON for dynamic email content
    let emailLieu = "";
    let emailStatut = "";
    try {
      const parsed = JSON.parse(report);
      if (parsed.lieu_chantier) emailLieu = parsed.lieu_chantier;
      if (parsed.statut_global) emailStatut = parsed.statut_global;
    } catch { /* use defaults */ }
    
    const subject = emailLieu
      ? `Rapport de chantier - ${emailLieu} - ${today}`
      : `Rapport de chantier - ${today}`;

    // Build email body — only include lines with actual data
    const emailLines: string[] = [];
    emailLines.push("<p>Bonjour,</p>");
    if (emailLieu) {
      emailLines.push(`<p>Veuillez trouver ci-joint le rapport d'intervention pour le chantier <strong>${emailLieu}</strong>, réalisé ce jour.</p>`);
    } else {
      emailLines.push(`<p>Veuillez trouver ci-joint le rapport d'intervention réalisé ce jour.</p>`);
    }
    if (emailStatut) {
      emailLines.push(`<p><strong>Résumé :</strong> ${emailStatut}</p>`);
    }
    emailLines.push(`<p>Le détail complet est disponible dans le document PDF en pièce jointe.</p>`);
    emailLines.push(`<p>Cordialement,<br/><em>— Généré automatiquement par VoiceReport</em></p>`);
    const html = emailLines.join("\n");

    const attachments = [{
      filename: `rapport-chantier-${today.replace(/\//g, '-')}.pdf`,
      content: pdfBuffer,
    }];

    const fromEmail = process.env.RESEND_FROM_EMAIL || "default@example.com";

    console.log(`[EMAIL] Paramètres:`);
    console.log(`[EMAIL]   De: ${fromEmail}`);
    console.log(`[EMAIL]   À: ${recipientEmail}`);
    console.log(`[EMAIL]   Sujet: ${subject}`);
    console.log(`[EMAIL]   Pièce jointe: ${attachments[0].filename} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

    console.log(`[EMAIL] Envoi en cours...`);
    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject,
      html,
      attachments,
    });

    // Resend SDK v2 retourne { data, error }
    const resp = emailResponse as { data?: { id?: string } | null; error?: { message?: string; name?: string } | null; id?: string };
    if (resp.error) {
      console.error(`[EMAIL ERREUR] Resend a retourné une erreur:`, resp.error);
      throw new Error(resp.error.message || "Erreur Resend inconnue");
    }

    const emailResponseId = resp.data?.id || resp.id || "N/A";

    console.log(`[EMAIL] ✅ Email envoyé avec succès`);
    console.log(`[EMAIL]   ID de reponse: ${emailResponseId}`);

    console.log("\n" + "=".repeat(80));
    console.log("[ENVOI EMAIL] ========== PROCESSUS TERMINÉ AVEC SUCCÈS ==========");
    console.log("=".repeat(80) + "\n");

    return NextResponse.json({ success: true, message: "Rapport envoyé avec succès !" });
  } catch (emailError) {
    console.error(
      `[EMAIL ERREUR FATALE] Impossible d'envoyer l'email`,
      emailError instanceof Error ? emailError.message : emailError
    );
    
    if (emailError instanceof Error) {
      console.error(`[EMAIL ERREUR] Details complets:`, emailError.stack);
    }

    console.log("\n" + "=".repeat(80));
    console.log("[ENVOI EMAIL] ========== PROCESSUS ÉCHOUÉ ==========");
    console.log("=".repeat(80) + "\n");

    return NextResponse.json(
      { error: `Erreur lors de l'envoi du mail: ${emailError instanceof Error ? emailError.message : "Erreur inconnue"}` },
      { status: 500 }
    );
  }
}
