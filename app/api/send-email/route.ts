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
    // ...existing code...
    // (après l'init de reportData, toArray et sanitizeEmoji)
    // ...
  // ...existing code...
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

  /** Sanitize emojis and non-Latin-1 chars that jsPDF/Helvetica cannot render */
  const sanitizeEmoji = (text: string): string =>
    text
      .replace(/⚠️/g, "[Attention]")
      .replace(/🚨/g, "[Critique]")
      .replace(/🟢/g, "")
      .replace(/🟠/g, "")
      .replace(/🔴/g, "")
      // Strip ALL characters outside printable Latin-1 range (keeps French accents: é è à ç ê etc.)
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  // 4 rubriques distinctes, aucun mélange
  const travaux   = toArray(reportData.travaux_realises).map(sanitizeEmoji);
  const problemes = toArray(reportData.problemes_rencontres).map(sanitizeEmoji);
  const materiel  = toArray(reportData.materiel_manquant).map(sanitizeEmoji);
  const aPrevoir  = toArray(reportData.a_prevoir).map(sanitizeEmoji);

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

  // ── Document setup — Professional White BTP Document
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "A4" });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const ML = 15;
  const MR = 15;
  const CW = PW - ML - MR; // 180

  const today   = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const docRef  = "VR-" + Date.now().toString(36).toUpperCase().slice(-6);

  // ── Color palette (print-friendly — white bg, anthracite text)
  type RGB = [number, number, number];
  const BLACK:    RGB = [30,  30,  30 ];
  const DGRAY:    RGB = [70,  70,  70 ];
  const MGRAY:    RGB = [130, 130, 130];
  const LGRAY:    RGB = [185, 185, 185];
  const XLGRAY:   RGB = [220, 220, 220];
  const XXLGRAY:  RGB = [240, 240, 240];
  const XXXGRAY:  RGB = [248, 248, 248];
  const WHITE:    RGB = [255, 255, 255];
  const BLUE_D:   RGB = [30,  64,  175]; // indigo-800 — header + brand
  const BLUE_M:   RGB = [59,  130, 246]; // blue-500  — blue sections
  const BLUE_L:   RGB = [219, 234, 254]; // blue-100
  const GREEN_D:  RGB = [21,  128, 61 ]; // green-700
  const GREEN_L:  RGB = [220, 252, 231]; // green-100
  const RED_D:    RGB = [185, 28,  28 ]; // red-700
  const RED_L:    RGB = [254, 226, 226]; // red-100
  const AMBER_D:  RGB = [180, 83,  9  ]; // amber-700
  const AMBER_L:  RGB = [255, 243, 213]; // amber-100
  const CYAN_D:   RGB = [8,   145, 178]; // cyan-600
  const CYAN_L:   RGB = [207, 250, 254]; // cyan-100

  // Mutable render state
  let pageNum = 1;
  let y       = 0;
  const PAGE_BOTTOM = PH - 22; // 275mm — leave room for footer

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  function drawFooter() {
    const fy = PH - 14;
    doc.setDrawColor(...XLGRAY);
    doc.setLineWidth(0.3);
    doc.line(ML, fy - 3, PW - MR, fy - 3);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text(
      "Rapport g\u00e9n\u00e9r\u00e9 et certifi\u00e9 par VoiceReport  \u00b7  " + today + " \u00e0 " + timeStr,
      ML, fy + 1.5
    );
    doc.text("R\u00e9f. " + docRef + "  \u00b7  Page " + pageNum, PW - MR, fy + 1.5, { align: "right" });
  }

  // ── NEW PAGE with continuation mini-header ──────────────────────────────────
  function newPage(sectionTitle?: string) {
    doc.addPage();
    pageNum++;
    // Thin blue accent bar
    doc.setFillColor(...BLUE_D);
    doc.rect(0, 0, PW, 3, "F");
    // Mini brand line
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE_D);
    doc.text("VoiceReport BTP", ML, 10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    const contTitle = sectionTitle ? "  \u00b7  " + sectionTitle + " (suite)" : "  \u00b7  Rapport de chantier (suite)";
    doc.text(contTitle, ML + doc.getTextWidth("VoiceReport BTP"), 10);
    // Separator
    doc.setDrawColor(...XLGRAY);
    doc.setLineWidth(0.3);
    doc.line(0, 13.5, PW, 13.5);
    drawFooter();
    y = 18;
  }

  // ── PAGE 1 HEADER ───────────────────────────────────────────────────────────
  // Top accent bar
  doc.setFillColor(...BLUE_D);
  doc.rect(0, 0, PW, 3.5, "F");

  // White header bg
  doc.setFillColor(...WHITE);
  doc.rect(0, 3.5, PW, 30, "F");

  // Logo (image si disponible, sinon fallback "VR" circle + texte)
  if (logoDataUrl) {
    // Fit logo in left header zone: max 55mm wide, 22mm tall, vertically centred (y=5.5 → 27.5)
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const maxW = 55, maxH = 22;
      let lw = maxW;
      let lh = lw * (props.height / props.width);
      if (lh > maxH) { lh = maxH; lw = lh * (props.width / props.height); }
      const ly = 3.5 + (30 - lh) / 2; // vertically centre inside the 30mm white band
      doc.addImage(logoDataUrl, "PNG", ML, ly, lw, lh);
    } catch {
      // If addImage fails for any reason, fall back to text mark
      doc.setFillColor(...BLUE_D);
      doc.circle(ML + 6, 18.5, 6, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      doc.text("VR", ML + 6, 20.8, { align: "center" });
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLUE_D);
      doc.text("VoiceReport", ML + 16, 17.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MGRAY);
      doc.text("Rapports de chantier BTP", ML + 16, 23.5);
    }
  } else {
    // Fallback: "VR" circle + texte
    doc.setFillColor(...BLUE_D);
    doc.circle(ML + 6, 18.5, 6, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("VR", ML + 6, 20.8, { align: "center" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE_D);
    doc.text("VoiceReport", ML + 16, 17.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text("Rapports de chantier BTP", ML + 16, 23.5);
  }

  // Right: document label + date
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLACK);
  doc.text("RAPPORT DE CHANTIER", PW - MR, 15, { align: "right" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MGRAY);
  doc.text(today, PW - MR, 21, { align: "right" });

  // Score / status pill (right, below date)
  if (score !== null || statutGlobal) {
    let pillColor: RGB = GREEN_D;
    let pillLabel = "En cours";
    if (score !== null) {
      if      (score >= 9) { pillColor = GREEN_D; pillLabel = "Excellent"; }
      else if (score >= 7) { pillColor = GREEN_D; pillLabel = "Bon d\u00e9roulement"; }
      else if (score >= 5) { pillColor = AMBER_D; pillLabel = "Quelques difficult\u00e9s"; }
      else if (score >= 3) { pillColor = RED_D;   pillLabel = "Situation difficile"; }
      else                 { pillColor = RED_D;   pillLabel = "Critique"; }
    } else {
      const s = statutGlobal.toLowerCase();
      if      (s.includes("bon") || s.includes("fluide"))     { pillColor = GREEN_D; pillLabel = "Bon d\u00e9roulement"; }
      else if (s.includes("difficult") || s.includes("quelques")) { pillColor = AMBER_D; pillLabel = "Difficult\u00e9s"; }
      else if (s.includes("critique") || s.includes("probl"))  { pillColor = RED_D;   pillLabel = "Critique"; }
    }
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    const pillW = doc.getTextWidth(pillLabel) + 14;
    const pillX = PW - MR - pillW;
    const pillY = 25;
    doc.setFillColor(...pillColor);
    doc.roundedRect(pillX, pillY, pillW, 6.5, 3.25, 3.25, "F");
    doc.setFillColor(...WHITE);
    doc.circle(pillX + 5, pillY + 3.25, 1.2, "F");
    doc.setTextColor(...WHITE);
    doc.text(pillLabel, pillX + 9.5, pillY + 4.5);
    if (score !== null) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...pillColor);
      doc.text(score + "/10", pillX - 14, pillY + 4.5);
    }
  }

  // Separator line under header
  doc.setDrawColor(...XLGRAY);
  doc.setLineWidth(0.5);
  doc.line(0, 33.5, PW, 33.5);

  // Draw page-1 footer once here (newPage() handles footer for p2+)
  drawFooter();

  y = 37;

  // ── INFORMATIONS GÉNÉRALES GRID ──────────────────────────────────────────────
  const metaCells: { label: string; value: string }[] = [];
  if (lieu)        metaCells.push({ label: "Chantier",        value: lieu });
  if (rapporteur)  metaCells.push({ label: "Chef d'\u00e9quipe", value: rapporteur });
  if (meteo)       metaCells.push({ label: "M\u00e9t\u00e9o", value: meteo });
  if (score !== null) metaCells.push({ label: "Note de journ\u00e9e", value: score + " / 10" });
  if (equipe && metaCells.length < 4)     metaCells.push({ label: "\u00c9quipe",     value: equipe });
  if (avancement && metaCells.length < 4) metaCells.push({ label: "Avancement", value: avancement });

  if (metaCells.length > 0) {
    // Section label
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MGRAY);
    doc.text("INFORMATIONS G\u00c9N\u00c9RALES", ML, y + 3.5);
    y += 6;

    const ncols = Math.min(metaCells.length, 4);
    const GAP   = 3;
    const CELL_H = 18;
    const CELL_W = (CW - GAP * (ncols - 1)) / ncols;

    for (let i = 0; i < metaCells.length && i < 4; i++) {
      const cx = ML + i * (CELL_W + GAP);
      // bg
      doc.setFillColor(...XXXGRAY);
      doc.roundedRect(cx, y, CELL_W, CELL_H, 1.5, 1.5, "F");
      doc.setDrawColor(...XLGRAY);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx, y, CELL_W, CELL_H, 1.5, 1.5, "S");
      // label
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MGRAY);
      doc.text(metaCells[i].label, cx + 4, y + 5.5);
      // value
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLACK);
      const vl = doc.splitTextToSize(metaCells[i].value, CELL_W - 8) as string[];
      doc.text(vl[0] || "", cx + 4, y + 13.5);
    }
    y += CELL_H + 6;
  }

  // ── SYNTHÈSE EXECUTIVE ──────────────────────────────────────────────────────
  if (synthese) {
    const synLines = doc.splitTextToSize(synthese, CW - 16) as string[];
    const synH = synLines.length * 5 + 13;
    doc.setFillColor(...BLUE_L);
    doc.roundedRect(ML, y, CW, synH, 2, 2, "F");
    // blue left bar
    doc.setFillColor(...BLUE_M);
    doc.rect(ML, y, 3, synH, "F");
    // label
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE_D);
    doc.text("SYNTH\u00c8SE", ML + 7, y + 5.5);
    // text
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...DGRAY);
    let sy = y + 10.5;
    for (const line of synLines) { doc.text(line, ML + 7, sy); sy += 5; }
    y += synH + 6;
  }

  // ── KPI ROW (3 counters) ────────────────────────────────────────────────────
  {
    const kpis: { label: string; value: number; color: RGB }[] = [
      { label: "Travaux r\u00e9alis\u00e9s",  value: travaux.length,   color: GREEN_D },
      { label: "Incidents signal\u00e9s",       value: problemes.length, color: RED_D   },
      { label: "Mat\u00e9riel manquant",        value: materiel.length,  color: AMBER_D },
    ];
    const K_H  = 18;
    const K_GAP = 3;
    const K_W  = (CW - K_GAP * 2) / 3;

    for (let i = 0; i < 3; i++) {
      const kx = ML + i * (K_W + K_GAP);
      doc.setFillColor(...WHITE);
      doc.roundedRect(kx, y, K_W, K_H, 1.5, 1.5, "F");
      doc.setDrawColor(...XLGRAY);
      doc.setLineWidth(0.3);
      doc.roundedRect(kx, y, K_W, K_H, 1.5, 1.5, "S");
      // colored left bar
      doc.setFillColor(...kpis[i].color);
      doc.roundedRect(kx, y, 3, K_H, 1.5, 0, "F");
      doc.rect(kx + 1.5, y, 1.5, K_H, "F");
      // number
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...kpis[i].color);
      doc.text(String(kpis[i].value), kx + K_W / 2 + 1.5, y + 10.5, { align: "center" });
      // label
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MGRAY);
      doc.text(kpis[i].label, kx + K_W / 2 + 1.5, y + 15.5, { align: "center" });
    }
    y += K_H + 7;
  }

  // ── SECTION LABEL helper ────────────────────────────────────────────────────
  function drawSectionLabel(label: string) {
    if (y + 12 > PAGE_BOTTOM) newPage();
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MGRAY);
    const tw = doc.getTextWidth(label);
    doc.text(label, ML, y + 4);
    doc.setDrawColor(...XLGRAY);
    doc.setLineWidth(0.3);
    doc.line(ML + tw + 3, y + 3, PW - MR, y + 3);
    y += 8;
  }

  drawSectionLabel("D\u00c9TAIL DU RAPPORT");

  // ── SECTION DRAWER ─────────────────────────────────────────────────────────
  function drawSection(
    title: string,
    items: string[],
    color: RGB,
    lightBg: RGB,
    emptyText: string,
    sType: string
  ) {
    const TITLE_H  = 10;
    const LINE_H   = 4.5;
    const GAP_AFTER = 6;

    // Page break before section title
    if (y + TITLE_H + 14 > PAGE_BOTTOM) newPage(title);

    // ── Title bar
    doc.setFillColor(...XXXGRAY);
    doc.rect(ML, y, CW, TITLE_H, "F");
    // colored left border
    doc.setFillColor(...color);
    doc.rect(ML, y, 3, TITLE_H, "F");
    // title text
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLACK);
    doc.text(title, ML + 7, y + 6.8);
    // count badge — font must be set before getTextWidth to avoid wrong measure
    const countStr = String(items.length);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const bw = doc.getTextWidth(countStr) + 8;
    const badgeX = PW - MR - bw;
    const badgeY = y + 2;
    const badgeH = 6;
    doc.setFillColor(...color);
    doc.roundedRect(badgeX, badgeY, bw, badgeH, 3, 3, "F");
    doc.setTextColor(...WHITE);
    // Center text inside badge using explicit coordinates, not align:"center" with page-width semantics
    doc.text(countStr, badgeX + bw / 2, badgeY + 4.2, { align: "center" });

    y += TITLE_H;

    // ── Empty state
    if (items.length === 0) {
      doc.setFillColor(...XXXGRAY);
      doc.rect(ML, y, CW, 10, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...LGRAY);
      doc.text(emptyText, ML + 7, y + 6.5);
      y += 10 + GAP_AFTER;
      return;
    }

    // ── Items
    for (let idx = 0; idx < items.length; idx++) {
      const raw = items[idx];
      const isCritique   = /\[Critique\]/i.test(raw);
      const isAttention  = /\[Attention\]/i.test(raw);
      const isAlert = isCritique || isAttention;
      const cleanText = raw.replace(/^\[(Critique|Attention)\]\s*/i, "").trim();
      const wrappedLines = doc.splitTextToSize(cleanText, CW - 14) as string[];
      const alertBadgeH  = isAlert ? 6 : 0;
      const itemH        = wrappedLines.length * LINE_H + 5 + alertBadgeH;

      if (y + itemH > PAGE_BOTTOM) newPage(title);

      // Alternate row bg for material
      if (sType === "materiel" && idx % 2 === 0) {
        doc.setFillColor(...XXXGRAY);
        doc.rect(ML, y, CW, itemH, "F");
      }

      if (isAlert) {
        // Alert badge
        const badgeColor: RGB = isCritique ? RED_D : AMBER_D;
        const badgeBg: RGB    = isCritique ? RED_L  : AMBER_L;
        const badgeLabel = isCritique ? "CRITIQUE" : "ATTENTION";
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        const badgeW = doc.getTextWidth(badgeLabel) + 8;
        doc.setFillColor(...badgeBg);
        doc.roundedRect(ML + 7, y + 1.5, badgeW, 5, 2.5, 2.5, "F");
        doc.setTextColor(...badgeColor);
        doc.text(badgeLabel, ML + 7 + badgeW / 2, y + 5, { align: "center" });
        // text (bold, colored)
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...badgeColor);
        let ty = y + 8.5;
        for (const line of wrappedLines) { doc.text(line, ML + 7, ty); ty += LINE_H; }
      } else {
        // Bullet dot
        doc.setFillColor(...color);
        doc.circle(ML + 5.5, y + 4.5, 1.2, "F");
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DGRAY);
        let ty = y + 5;
        for (const line of wrappedLines) { doc.text(line, ML + 11, ty); ty += LINE_H; }
      }

      // Separator between items
      if (idx < items.length - 1) {
        doc.setDrawColor(...XXLGRAY);
        doc.setLineWidth(0.2);
        doc.line(ML + 6, y + itemH, PW - MR, y + itemH);
      }
      y += itemH;
    }

    y += GAP_AFTER;
  }

  // ── Draw the 4 core sections
  drawSection("Travaux r\u00e9alis\u00e9s",      travaux,   GREEN_D, GREEN_L, "Aucune t\u00e2che enregistr\u00e9e",  "travaux");
  drawSection("Probl\u00e8mes rencontr\u00e9s",  problemes, RED_D,   RED_L,   "Aucun incident signal\u00e9",          "problemes");
  drawSection("Mat\u00e9riel manquant",            materiel,  AMBER_D, AMBER_L, "Aucun manque d\u00e9clar\u00e9",     "materiel");
  drawSection("\u00c0 pr\u00e9voir",              aPrevoir,  CYAN_D,  CYAN_L,  "Aucune action planifi\u00e9e",         "aprevoir");

  // ── IMPACTS / RISQUES ───────────────────────────────────────────────────────
  if (impacts.length > 0) {
    if (y + 20 > PAGE_BOTTOM) newPage();
    drawSectionLabel("ANALYSE DES RISQUES");

    for (const imp of impacts) {
      const cleanImp = imp.replace(/^[\u26A0\uFE0F\u{1F4C5}\u{1F534}\u{1F7E0}\u{1F7E2}\u{1F327}\uFE0F\u{1F477}]+\s*/u, "").trim();
      const lines = doc.splitTextToSize(cleanImp || imp, CW - 18) as string[];
      const impH  = lines.length * 4.5 + 13;
      if (y + impH > PAGE_BOTTOM) newPage();

      doc.setFillColor(...RED_L);
      doc.roundedRect(ML, y, CW, impH, 2, 2, "F");
      doc.setDrawColor(...XLGRAY);
      doc.setLineWidth(0.2);
      doc.roundedRect(ML, y, CW, impH, 2, 2, "S");
      doc.setFillColor(...RED_D);
      doc.rect(ML, y, 3, impH, "F");

      // RISQUE badge
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      const rBw = doc.getTextWidth("RISQUE") + 8;
      doc.setFillColor(...RED_D);
      doc.roundedRect(ML + 7, y + 2.5, rBw, 5, 2.5, 2.5, "F");
      doc.setTextColor(...WHITE);
      doc.text("RISQUE", ML + 7 + rBw / 2, y + 6, { align: "center" });

      // Impact text
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DGRAY);
      let ly = y + 11;
      for (const l of lines) { doc.text(l, ML + 7, ly); ly += 4.5; }
      y += impH + 4;
    }
    y += 4;
  }

  // ── PHOTOS DU CHANTIER ──────────────────────────────────────────────────────
  if (compressedPhotos.length > 0) {
    if (y + 20 > PAGE_BOTTOM) newPage();
    drawSectionLabel("PHOTOS DU CHANTIER");

    const GRID_GAP = 4;
    const COL_W = (CW - GRID_GAP) / 2;

    // MAX_PHOTO_H: hard cap so photos never overflow a page
    const MAX_PHOTO_H = 70; // mm
    const PHOTO_ROW_RESERVE = MAX_PHOTO_H + 16; // image + legend + padding

    for (let i = 0; i < compressedPhotos.length; i += 2) {
      // Conservative page-break: reserve full possible row height before drawing
      if (y + PHOTO_ROW_RESERVE > PAGE_BOTTOM) newPage("PHOTOS DU CHANTIER");

      let rowH = 0; // computed after rendering both columns

      for (let j = 0; j < 2 && (i + j) < compressedPhotos.length; j++) {
        const px = ML + j * (COL_W + GRID_GAP);
        try {
          const b64  = compressedPhotos[i + j].toString("base64");
          const durl = "data:image/jpeg;base64," + b64;
          const props = doc.getImageProperties(durl);
          // Compute dimensions with contain logic: fit within COL_W × MAX_PHOTO_H
          let iw = COL_W - 4;
          let ih = iw * (props.height / props.width);
          if (ih > MAX_PHOTO_H) { ih = MAX_PHOTO_H; iw = ih * (props.width / props.height); }
          const cardH = ih + 6;
          if (cardH > rowH) rowH = cardH;
          // Photo card bg
          doc.setFillColor(...XXXGRAY);
          doc.roundedRect(px, y, COL_W, cardH, 1.5, 1.5, "F");
          doc.setDrawColor(...XLGRAY);
          doc.setLineWidth(0.3);
          doc.roundedRect(px, y, COL_W, cardH, 1.5, 1.5, "S");
          // Center image horizontally inside card
          doc.addImage(durl, "JPEG", px + (COL_W - iw) / 2, y + 3, iw, ih);
          const legend = photoLegends[i + j] || "";
          if (legend) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...MGRAY);
            const ll = doc.splitTextToSize(legend, COL_W - 4) as string[];
            doc.text(ll[0] || "", px + 2, y + cardH + 5);
            if (cardH + 8 > rowH) rowH = cardH + 8;
          }
        } catch {
          const fallbackH = 55;
          doc.setFillColor(...XXXGRAY);
          doc.roundedRect(px, y, COL_W, fallbackH, 1.5, 1.5, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...LGRAY);
          doc.text("Photo indisponible", px + COL_W / 2, y + fallbackH / 2 + 2, { align: "center" });
          if (fallbackH > rowH) rowH = fallbackH;
        }
      }
      y += rowH + 6;
    }
    y += 4;
  }

  // ── CERTIFICATION BLOCK ─────────────────────────────────────────────────────
  if (y + 20 > PAGE_BOTTOM) newPage();
  doc.setFillColor(...XXXGRAY);
  doc.roundedRect(ML, y, CW, 16, 2, 2, "F");
  doc.setDrawColor(...XLGRAY);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 16, 2, 2, "S");
  // Blue top accent on cert block
  doc.setFillColor(...BLUE_D);
  doc.roundedRect(ML, y, CW, 3, 2, 2, "F");
  doc.rect(ML, y + 1.5, CW, 1.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DGRAY);
  doc.text("Rapport g\u00e9n\u00e9r\u00e9 et certifi\u00e9 par VoiceReport", PW / 2, y + 9, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MGRAY);
  doc.text(today + " \u00e0 " + timeStr + "  \u00b7  R\u00e9f. " + docRef, PW / 2, y + 13.5, { align: "center" });

  // ── Output
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
