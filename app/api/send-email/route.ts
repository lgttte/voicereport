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
  // ── Parse the JSON report safely
  type ReportData = {
    statut_global?: string;
    lieu_chantier?: string;
    rapporteur?: string;
    meteo?: string;
    equipe?: string;
    avancement?: string;
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

  const travaux   = toArray(reportData.travaux_realises).map(sanitizeEmoji);
  const problemes = toArray(reportData.problemes_rencontres).map(sanitizeEmoji);
  const materiel  = toArray(reportData.materiel_manquant).map(sanitizeEmoji);
  const aprevoir  = toArray(reportData.a_prevoir).map(sanitizeEmoji);

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
  const ML = 15;
  const MR = 15;
  const CW = PW - ML - MR; // 180

  const today   = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  // ── Color palette (R, G, B)
  const NAVY:   [number, number, number] = [13,  43,  78 ]; // dark blue
  const NAVY2:  [number, number, number] = [26,  82, 118]; // medium blue
  const ORANGE: [number, number, number] = [230, 126, 34 ]; // accent orange
  const GREEN:  [number, number, number] = [30, 132, 73 ]; // success green
  const RED:    [number, number, number] = [192, 57,  43 ]; // danger red
  const YELLOW: [number, number, number] = [243, 156, 18 ]; // warning yellow
  const LGRAY:  [number, number, number] = [248, 249, 250]; // very light gray (body bg)
  const BGRAY:  [number, number, number] = [218, 223, 228]; // border gray
  const DGRAY:  [number, number, number] = [44,  62,  80 ]; // dark text
  const MGRAY:  [number, number, number] = [127, 140, 141]; // muted text
  const WHITE:  [number, number, number] = [255, 255, 255];
  // Light tints for badges / item backgrounds
  const GREEN_BG:  [number, number, number] = [234, 250, 241];
  const RED_BG:    [number, number, number] = [253, 237, 236];
  const YELLOW_BG: [number, number, number] = [253, 235, 208];
  const BLUE_BG:   [number, number, number] = [235, 245, 251];

  let pageNum = 0;

  // ── Page chrome — header band + footer line ──────────────────────────
  function drawPageChrome() {
    pageNum++;

    const HEADER_H = logoDataUrl ? 36 : 28;

    // Header band
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PW, HEADER_H, "F");
    // Orange bottom stripe of header
    doc.setFillColor(...ORANGE);
    doc.rect(0, HEADER_H, PW, 1.5, "F");
    // Orange left accent
    doc.setFillColor(...ORANGE);
    doc.rect(0, 0, 4, HEADER_H, "F");

    // Logo (top-left, aspect ratio preserved, inside header band)
    let textOffsetX = ML + 6;
    if (logoDataUrl) {
      try {
        const props = doc.getImageProperties(logoDataUrl);
        const maxH  = HEADER_H - 8; // 28mm with 4mm top/bottom padding
        let lh = maxH;
        let lw = lh * (props.width / props.height);
        if (lw > 40) { lw = 40; lh = lw * (props.height / props.width); }
        const logoY = (HEADER_H - lh) / 2;
        doc.addImage(logoDataUrl, "PNG", ML + 6, logoY, lw, lh);
        textOffsetX = ML + 6 + lw + 5;
      } catch {
        console.warn("[PDF LOGO] Erreur d'insertion du logo dans le PDF.");
      }
    }

    const titleY    = logoDataUrl ? HEADER_H / 2 - 2 : 12;
    const subtitleY = logoDataUrl ? HEADER_H / 2 + 7  : 20;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("RAPPORT DE CHANTIER", textOffsetX, titleY);

    // Subtitle
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ORANGE);
    doc.text("VoiceReport  -  Rapport vocal automatique BTP", textOffsetX, subtitleY);

    // Date + page (top right)
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(175, 190, 205);
    doc.text(today + "  |  " + timeStr, PW - MR, titleY, { align: "right" });
    doc.text("Page " + pageNum, PW - MR, subtitleY, { align: "right" });

    // Footer separator
    doc.setDrawColor(...BGRAY);
    doc.setLineWidth(0.3);
    doc.line(ML, PH - 12, PW - MR, PH - 12);

    // Footer text
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text(
      "VoiceReport \u2014 Le rapport chantier en 30 secondes",
      PW / 2,
      PH - 6.5,
      { align: "center" }
    );
  }

  // ── Metadata info bar (dynamic columns based on available data) ─────
  function drawMetaBar(y: number): number {
    // Build columns from available data only
    const columns: { label: string; value: string }[] = [];
    columns.push({ label: "DATE DU RAPPORT", value: today });
    if (rapporteur) columns.push({ label: "RAPPORT\u00c9 PAR", value: rapporteur });
    if (lieu)       columns.push({ label: "CHANTIER", value: lieu });

    if (columns.length === 0) return y;

    const BAR_H = 20;
    const COL   = CW / columns.length;

    doc.setFillColor(...LGRAY);
    doc.roundedRect(ML, y, CW, BAR_H, 2, 2, "F");
    doc.setDrawColor(...BGRAY);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, BAR_H, 2, 2, "S");

    // Column dividers
    for (let i = 1; i < columns.length; i++) {
      doc.setDrawColor(...BGRAY);
      doc.line(ML + i * COL, y + 4, ML + i * COL, y + BAR_H - 4);
    }

    for (let i = 0; i < columns.length; i++) {
      const cx = ML + i * COL + COL / 2;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MGRAY);
      doc.text(columns[i].label, cx, y + 8, { align: "center" });

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DGRAY);
      const valLines = doc.splitTextToSize(columns[i].value, COL - 6);
      doc.text(valLines.slice(0, 1), cx, y + 15.5, { align: "center" });
    }

    return y + BAR_H + 6;
  }

  // ── Statut global colored bar ─────────────────────────────────────────
  function drawStatutBar(statut: string, y: number): number {
    if (!statut) return y;
    const BAR_H = 14;

    const s = statut.toLowerCase();
    let barColor: [number, number, number];
    if (s.includes("bon") || s.includes("fluide")) {
      barColor = GREEN;
    } else if (s.includes("difficulte") || s.includes("quelques")) {
      barColor = YELLOW;
    } else if (s.includes("critique") || s.includes("probleme") || s.includes("situation")) {
      barColor = RED;
    } else {
      barColor = MGRAY;
    }

    doc.setFillColor(...barColor);
    doc.roundedRect(ML, y, CW, BAR_H, 2, 2, "F");

    // Strip emojis using the shared sanitizer
    const cleanText = sanitizeEmoji(statut);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(cleanText || "Statut non d\u00e9fini", PW / 2, y + BAR_H / 2 + 1, { align: "center" });

    return y + BAR_H + 6;
  }

  // ── KPI badges row (only show badges with data, centered) ──────────
  function drawKpiBadges(travauxN: number, problemesN: number, materielN: number, photosN: number, y: number): number {
    const BADGE_H = 18;
    const GAP  = 4;

    // Only include badges that have meaningful data
    const allBadges: { label: string; value: string; color: [number, number, number]; bg: [number, number, number] }[] = [];
    if (travauxN > 0)  allBadges.push({ label: "TRAVAUX",   value: String(travauxN),   color: GREEN,                         bg: GREEN_BG });
    if (problemesN > 0) allBadges.push({ label: "PROBLEMES", value: String(problemesN), color: RED,                           bg: RED_BG });
    if (materielN > 0)  allBadges.push({ label: "MATERIEL",  value: String(materielN),  color: YELLOW,                        bg: YELLOW_BG });
    if (equipe)         allBadges.push({ label: "EQUIPE",    value: equipe,             color: NAVY2,                         bg: BLUE_BG });
    if (avancement)     allBadges.push({ label: "AVANCEMENT",value: avancement,         color: GREEN,                         bg: GREEN_BG });
    if (photosN > 0)    allBadges.push({ label: "PHOTOS",    value: String(photosN),    color: NAVY2,                         bg: BLUE_BG });

    if (allBadges.length === 0) return y;

    const COLS = allBadges.length;
    const BW   = (CW - GAP * Math.max(0, COLS - 1)) / COLS;

    for (let i = 0; i < allBadges.length; i++) {
      const bx = ML + i * (BW + GAP);
      const b  = allBadges[i];

      // Badge background
      doc.setFillColor(...b.bg);
      doc.roundedRect(bx, y, BW, BADGE_H, 2, 2, "F");

      // Left color accent bar
      doc.setFillColor(...b.color);
      doc.roundedRect(bx, y, 3, BADGE_H, 2, 0, "F");
      doc.rect(bx + 1.5, y, 1.5, BADGE_H, "F");

      // Value (large)
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...b.color);
      doc.text(b.value, bx + BW / 2 + 2, y + 9, { align: "center" });

      // Label (small)
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MGRAY);
      doc.text(b.label, bx + BW / 2 + 2, y + 15, { align: "center" });
    }

    return y + BADGE_H + 6;
  }

  // ── Section block: title bar + color-coded bullet list ───────────────
  function drawSection(title: string, items: string[], y: number, sectionType?: "travaux" | "problemes" | "materiel" | "aprevoir"): number {
    const TITLE_H = 9;
    const PAD     = 5;
    const LINE_H  = 5;
    const BULLET_INDENT = 6;
    const ITEM_PAD = 3;

    // Pre-calculate item lines + detect severity
    doc.setFontSize(9);
    type ItemInfo = { lines: string[]; severity: "ok" | "warning" | "danger" | "neutral" };
    const itemInfos: ItemInfo[] = [];
    let totalBodyLines = 0;

    for (const item of items) {
      const lines = doc.splitTextToSize(item, CW - PAD * 2 - BULLET_INDENT) as string[];
      let severity: ItemInfo["severity"] = "neutral";

      if (item.includes("[Critique]")) severity = "danger";
      else if (item.includes("[Attention]")) severity = "warning";
      else if (sectionType === "travaux") severity = "ok";
      else if (sectionType === "problemes") severity = "warning";
      else if (sectionType === "materiel") severity = "warning";

      itemInfos.push({ lines, severity });
      totalBodyLines += lines.length;
    }
    if (items.length === 0) totalBodyLines = 1;

    const bodyH  = Math.max(12, totalBodyLines * LINE_H + PAD * 2 + items.length * ITEM_PAD);
    const totalH = TITLE_H + bodyH + 7;

    // Overflow to next page
    if (y + totalH > PH - 18) {
      doc.addPage();
      drawPageChrome();
      y = logoDataUrl ? 42 : 34;
    }

    // Title bar — navy + orange left accent
    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, y, CW, TITLE_H, 1.5, 1.5, "F");
    doc.setFillColor(...ORANGE);
    doc.rect(ML, y, 4, TITLE_H, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(title, ML + 9, y + 6.2);

    // Item count badge on title bar
    if (items.length > 0) {
      const countStr = String(items.length);
      doc.setFontSize(7);
      const cBw = doc.getTextWidth(countStr) + 5;
      const cBx = PW - MR - cBw - 3;
      doc.setFillColor(...ORANGE);
      doc.roundedRect(cBx, y + 2, cBw, 5.5, 1.5, 1.5, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      doc.text(countStr, cBx + cBw / 2, y + 6, { align: "center" });
    }

    y += TITLE_H;

    // Body — light gray fill + subtle border (sharp top, rounded bottom)
    doc.setFillColor(...LGRAY);
    doc.rect(ML, y, CW, bodyH, "F");
    doc.setDrawColor(...BGRAY);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, bodyH, 1, 1, "S");

    doc.setFontSize(9);
    let ty = y + PAD + LINE_H - 1;

    if (items.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...MGRAY);
      doc.text("Rien \u00e0 signaler", ML + PAD, ty);
    } else {
      for (let i = 0; i < itemInfos.length; i++) {
        const info = itemInfos[i];
        const rowH = info.lines.length * LINE_H + ITEM_PAD;

        // Color-coded row background for warning/danger items
        if (info.severity === "danger") {
          doc.setFillColor(...RED_BG);
          doc.rect(ML + 1, ty - LINE_H + 1, CW - 2, rowH, "F");
        } else if (info.severity === "warning") {
          doc.setFillColor(...YELLOW_BG);
          doc.rect(ML + 1, ty - LINE_H + 1, CW - 2, rowH, "F");
        }

        // Colored indicator circle
        let bulletColor: [number, number, number];
        let bulletIcon = "";
        switch (info.severity) {
          case "danger":  bulletColor = RED;    bulletIcon = "!"; break;
          case "warning": bulletColor = YELLOW; bulletIcon = "!"; break;
          case "ok":      bulletColor = GREEN;  bulletIcon = ""; break;
          default:        bulletColor = ORANGE; bulletIcon = "";
        }
        doc.setFillColor(...bulletColor);
        doc.circle(ML + PAD + 1.5, ty - 1.2, 1.2, "F");

        // Icon inside indicator for warning/danger
        if (bulletIcon) {
          doc.setFontSize(5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...WHITE);
          doc.text(bulletIcon, ML + PAD + 1.5, ty - 0.5, { align: "center" });
        }

        // Item text
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DGRAY);
        for (const line of info.lines) {
          doc.text(line, ML + PAD + BULLET_INDENT, ty);
          ty += LINE_H;
        }
        ty += ITEM_PAD;
      }
    }

    return y + bodyH + 7;
  }

  // ── Signature / certification block ──────────────────────────────────
  function drawSignatureBlock(y: number): number {
    const BLOCK_H = 16;

    if (y + BLOCK_H + 10 > PH - 18) {
      doc.addPage();
      drawPageChrome();
      y = logoDataUrl ? 42 : 34;
    }

    // Navy background with rounded corners
    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, y, CW, BLOCK_H, 2, 2, "F");

    // Centered certification text
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(
      "Rapport g\u00e9n\u00e9r\u00e9 et certifi\u00e9 par VoiceReport",
      PW / 2,
      y + BLOCK_H / 2 - 1,
      { align: "center" }
    );

    // Date/time sub-line
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ORANGE);
    doc.text(
      today + " \u00e0 " + timeStr + "  |  R\u00e9f. VR-" + Date.now().toString(36).toUpperCase().slice(-6),
      PW / 2,
      y + BLOCK_H / 2 + 5,
      { align: "center" }
    );

    return y + BLOCK_H + 6;
  }

  // ── Section title bar only (no body — used for photos heading) ───────
  function drawTitleBar(title: string, y: number): number {
    const TITLE_H = 9;
    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, y, CW, TITLE_H, 1.5, 1.5, "F");
    doc.setFillColor(...ORANGE);
    doc.rect(ML, y, 4, TITLE_H, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(title, ML + 9, y + 6.2);
    return y + TITLE_H + 5;
  }

  // ── PAGE 1 — Report content ───────────────────────────────────────────
  drawPageChrome();
  let y = logoDataUrl ? 42 : 34;

  y = drawMetaBar(y);

  // KPI badges row (only badges with data)
  y = drawKpiBadges(travaux.length, problemes.length, materiel.length, compressedPhotos.length, y);

  // Statut global — colored banner
  y = drawStatutBar(statutGlobal, y);

  // Thin rule separator
  doc.setDrawColor(...BGRAY);
  doc.setLineWidth(0.3);
  doc.line(ML, y, PW - MR, y);
  y += 6;

  // Always draw all 4 sections — show "Rien a signaler" when empty
  y = drawSection("TRAVAUX R\u00c9ALIS\u00c9S",       travaux,   y, "travaux");
  y = drawSection("PROBL\u00c8MES RENCONTR\u00c9S", problemes, y, "problemes");
  y = drawSection("MAT\u00c9RIEL MANQUANT",      materiel,  y, "materiel");
  y = drawSection("\u00c0 PR\u00c9VOIR / SUITE",      aprevoir,  y, "aprevoir");

  // Certification signature block
  y = drawSignatureBlock(y);

  // ── PAGE 2 — Photos (large, one per row) ──────────────────────────
  // Only create photo page if there are photos
  if (compressedPhotos.length > 0) {
    doc.addPage();
    drawPageChrome();
    y = logoDataUrl ? 42 : 34;

    y = drawTitleBar("ANNEXES VISUELLES - PHOTOS DU CHANTIER", y);

    const PHOTO_MAX_H = 190; // max height per photo in mm
    const LEGEND_H = 14;
    const PHOTO_MIN_H = 50; // minimum photo height

    for (let i = 0; i < compressedPhotos.length; i++) {
      // Check if we need a new page (at least PHOTO_MIN_H available)
      if (y + PHOTO_MIN_H > PH - 18) {
        doc.addPage();
        drawPageChrome();
        y = logoDataUrl ? 42 : 34;
      }

      // Photo label
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MGRAY);
      doc.text("Photo " + (i + 1) + " / " + compressedPhotos.length, ML + 3, y + 5);
      y += 8;

      try {
        const b64   = compressedPhotos[i].toString("base64");
        const durl  = "data:image/jpeg;base64," + b64;
        console.log(`[PDF PHOTOS] Insertion image ${i + 1} - taille buffer: ${compressedPhotos[i].length} bytes`);
        const props = doc.getImageProperties(durl);
        console.log(`[PDF PHOTOS] Dimensions originales: ${props.width}x${props.height}`);
        
        // Scale to full content width, respecting aspect ratio and max height
        const availH = PH - 18 - y - LEGEND_H - 5;
        const maxH = Math.max(PHOTO_MIN_H, Math.min(PHOTO_MAX_H, availH));
        let iw = CW;
        let ih = iw * (props.height / props.width);
        if (ih > maxH) { ih = maxH; iw = ih * (props.width / props.height); }
        console.log(`[PDF PHOTOS] Dimensions rendues: ${iw.toFixed(1)}x${ih.toFixed(1)}mm`);

        // Photo frame
        doc.setFillColor(...LGRAY);
        doc.roundedRect(ML, y, CW, ih + 4, 2, 2, "F");
        doc.setDrawColor(...BGRAY);
        doc.setLineWidth(0.4);
        doc.roundedRect(ML, y, CW, ih + 4, 2, 2, "S");

        // Center image
        doc.addImage(durl, "JPEG", ML + (CW - iw) / 2, y + 2, iw, ih);
        console.log(`[PDF PHOTOS] Image ${i + 1} ins\u00e9r\u00e9e avec succ\u00e8s`);
        y += ih + 6;
      } catch (photoErr) {
        console.error(`[PDF PHOTOS] Erreur lors de l'insertion de l'image ${i + 1}:`, photoErr);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...MGRAY);
        doc.text("Erreur d'affichage", PW / 2, y + 15, { align: "center" });
        y += 30;
      }

      // Photo legend / caption
      const legend = photoLegends[i] || "";
      if (legend) {
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...DGRAY);
        const legendLines = doc.splitTextToSize(legend, CW - 8);
        doc.text(legendLines.slice(0, 2), ML + 3, y + 2);
        y += LEGEND_H;
      } else {
        y += 4;
      }
    }
  }

  // ── Convert to Buffer
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
