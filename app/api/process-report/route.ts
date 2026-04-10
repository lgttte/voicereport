import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { Anthropic } from "@anthropic-ai/sdk";
import jsPDF from "jspdf";

// Route segment config — augmenter la taille max du body pour les fichiers audio
// et le timeout pour les appels Whisper + Claude
export const maxDuration = 60; // secondes (Vercel Pro = 300s max, Hobby = 60s)

type ReportSections = {
  statut_global: string;
  synthese?: string;
  score?: number;
  alertes?: string[];
  impacts?: string[];
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

const WHISPER_BTP_PROMPT = [
  "Rapport de chantier BTP.",
  "Vocabulaire : dalle, coffrage, décoffrage, ciment, béton, béton armé,",
  "ferraillage, tranchée, treillis soudé, parpaing, agglo, enduit, crépi,",
  "chape, ragréage, étanchéité, fondation, semelle, longrine, poutrelle,",
  "hourdis, plancher, vide sanitaire, hérisson, remblai, terrassement,",
  "enrobé, goudronnage, VRD, caniveau, regard, fourreau, gaine ICTA,",
  "PER, multicouche, cuivre, soudure, placo, BA13, rail, montant,",
  "isolation, laine de verre, laine de roche, polyuréthane, ITE,",
  "menuiserie, huisserie, linteau, appui de fenêtre, seuil,",
  "échafaudage, étai, bastaing, chevron, madrier, toupie, bétonnière,",
  "mini-pelle, nacelle, compacteur, disqueuse, perforateur, banche,",
  "livraison, retard, intempéries, fissure, malfaçon, réserve,",
  "sous-traitant, maître d'œuvre, conducteur de travaux, chef de chantier.",
  "Villes et lieux : Paris, Marseille, Lyon, Toulouse, Nice, Nantes,",
  "Montpellier, Strasbourg, Bordeaux, Lille, Rennes, Reims, Toulon,",
  "Saint-Étienne, Le Havre, Grenoble, Dijon, Angers, Nîmes, Villeurbanne,",
  "Clermont-Ferrand, Le Mans, Aix-en-Provence, Brest, Tours, Amiens,",
  "Limoges, Perpignan, Metz, Besançon, Orléans, Rouen, Mulhouse,",
  "Caen, Nancy, Argenteuil, Montreuil, Saint-Denis, Créteil, Nanterre,",
  "Versailles, Cergy, Évry, Meaux, Pontoise, Colombes, Courbevoie,",
  "Vitry-sur-Seine, Aubervilliers, Pantin, Bobigny, Drancy, Bondy,",
  "Boulogne-Billancourt, Saint-Ouen, Ivry-sur-Seine, Maisons-Alfort,",
  "Châtillon, Clamart, Meudon, Sèvres, Rueil-Malmaison, Poissy,",
  "Clichy, Levallois-Perret, Neuilly-sur-Seine, Sarcelles, Garges,",
  "Villepinte, Tremblay, Aulnay-sous-Bois, Sevran, Noisy-le-Grand,",
  "Champs-sur-Marne, Torcy, Lagny, Melun, Fontainebleau, Corbeil,",
  "Saint-Germain-en-Laye, Sartrouville, Houilles, Bezons, Gennevilliers,",
  // Île-de-France élargie
  "Mantes-la-Jolie, Les Mureaux, Conflans-Sainte-Honorine, Élancourt,",
  "Trappes, Guyancourt, Montigny-le-Bretonneux, Saint-Quentin-en-Yvelines,",
  "Rambouillet, Étampes, Dourdan, Savigny-sur-Orge, Athis-Mons,",
  "Juvisy-sur-Orge, Viry-Châtillon, Grigny, Ris-Orangis, Longjumeau,",
  "Palaiseau, Massy, Orsay, Les Ulis, Bures-sur-Yvette, Saclay,",
  "Villejuif, Cachan, Arcueil, Gentilly, Le Kremlin-Bicêtre,",
  "Thiais, Orly, Choisy-le-Roi, Villeneuve-le-Roi, Villeneuve-Saint-Georges,",
  "Sucy-en-Brie, Boissy-Saint-Léger, Champigny-sur-Marne, Vincennes,",
  "Saint-Mandé, Charenton-le-Pont, Alfortville, Le Perreux-sur-Marne,",
  "Nogent-sur-Marne, Joinville-le-Pont, Fontenay-sous-Bois,",
  "Rosny-sous-Bois, Villemomble, Gagny, Montfermeil, Livry-Gargan,",
  "Vaujours, Clichy-sous-Bois, Le Raincy, Noisy-le-Sec,",
  "Romainville, Les Lilas, Le Pré-Saint-Gervais, Bagnolet,",
  "Épinay-sur-Seine, Villetaneuse, Pierrefitte, Stains, La Courneuve,",
  "Le Blanc-Mesnil, Dugny, Le Bourget, Gonesse, Arnouville,",
  "Goussainville, Roissy-en-France, Mitry-Mory, Claye-Souilly,",
  "Chelles, Vaires-sur-Marne, Bussy-Saint-Georges, Val-d'Europe,",
  "Serris, Bailly-Romainvilliers, Chessy, Lognes, Noisiel,",
  "Pontault-Combault, Ozoir-la-Ferrière, Roissy-en-Brie,",
  "Combs-la-Ville, Savigny-le-Temple, Sénart, Lieusaint, Moissy-Cramayel,",
  "Dammarie-les-Lys, Le Mée-sur-Seine, Nemours, Provins, Meaux,",
  "Coulommiers, Montereau-Fault-Yonne, Avon, Moret-sur-Loing,",
  // Nord, Hauts-de-France
  "Dunkerque, Calais, Boulogne-sur-Mer, Arras, Lens, Béthune,",
  "Douai, Valenciennes, Cambrai, Maubeuge, Tourcoing, Roubaix,",
  "Villeneuve-d'Ascq, Wattrelos, Hénin-Beaumont, Liévin, Bruay,",
  "Saint-Quentin, Laon, Soissons, Compiègne, Senlis, Creil,",
  "Beauvais, Abbeville, Noyon, Château-Thierry, Chantilly,",
  // Grand Est
  "Colmar, Haguenau, Sélestat, Thionville, Forbach, Sarreguemines,",
  "Épinal, Saint-Dié-des-Vosges, Troyes, Châlons-en-Champagne,",
  "Charleville-Mézières, Sedan, Vitry-le-François, Bar-le-Duc,",
  "Verdun, Lunéville, Pont-à-Mousson, Toul, Saverne, Obernai,",
  // Normandie
  "Cherbourg, Lisieux, Alençon, Évreux, Vernon, Louviers,",
  "Elbeuf, Fécamp, Dieppe, Bayeux, Coutances, Avranches,",
  "Granville, Vire, Flers, Argentan, L'Aigle, Bernay,",
  // Bretagne
  "Saint-Brieuc, Vannes, Quimper, Lorient, Saint-Malo,",
  "Lannion, Morlaix, Concarneau, Fougères, Vitré, Pontivy,",
  "Auray, Ploemeur, Dinan, Lamballe, Loudéac, Ploërmel,",
  // Pays de la Loire
  "Saint-Nazaire, La Roche-sur-Yon, Laval, Cholet, Saumur,",
  "La Flèche, Fontenay-le-Comte, Les Sables-d'Olonne, Challans,",
  "Mayenne, Château-Gontier, Segré, Ancenis, Clisson, Rezé,",
  "Saint-Herblain, Orvault, Bouguenais, Vertou, Carquefou,",
  // Centre-Val de Loire
  "Chartres, Blois, Bourges, Châteauroux, Vierzon, Dreux,",
  "Montargis, Gien, Vendôme, Amboise, Chinon, Loches,",
  "Romorantin-Lanthenay, Issoudun, La Châtre, Pithiviers,",
  // Bourgogne-Franche-Comté
  "Auxerre, Chalon-sur-Saône, Mâcon, Nevers, Sens, Beaune,",
  "Le Creusot, Montceau-les-Mines, Autun, Dole, Lons-le-Saunier,",
  "Pontarlier, Belfort, Montbéliard, Vesoul, Gray, Avallon,",
  // Auvergne-Rhône-Alpes
  "Saint-Étienne, Chambéry, Annecy, Valence, Bourg-en-Bresse,",
  "Roanne, Montluçon, Vichy, Moulins, Aurillac, Le Puy-en-Velay,",
  "Privas, Annonay, Romans-sur-Isère, Montélimar, Oyonnax, Thonon,",
  "Évian, Albertville, Moûtiers, Saint-Jean-de-Maurienne,",
  "Vienne, Bourgoin-Jallieu, Voiron, La Tour-du-Pin, Tarare,",
  "Villefranche-sur-Saône, Givors, Vénissieux, Saint-Priest,",
  "Bron, Décines-Charpieu, Meyzieu, Rillieux-la-Pape, Caluire,",
  // Nouvelle-Aquitaine
  "Poitiers, La Rochelle, Angoulême, Pau, Bayonne, Biarritz,",
  "Périgueux, Agen, Mont-de-Marsan, Dax, Niort, Cognac,",
  "Rochefort, Saintes, Royan, Bergerac, Sarlat, Brive-la-Gaillarde,",
  "Tulle, Guéret, Châtellerault, Bressuire, Thouars, Oloron,",
  "Mérignac, Pessac, Talence, Gradignan, Villenave-d'Ornon,",
  "Cenon, Lormont, Floirac, Libourne, Arcachon, La Teste-de-Buch,",
  // Occitanie
  "Albi, Castres, Tarbes, Rodez, Cahors, Auch, Montauban,",
  "Carcassonne, Narbonne, Béziers, Sète, Lunel, Alès,",
  "Millau, Figeac, Foix, Pamiers, Saint-Gaudens, Lourdes,",
  "Agde, Frontignan, Villeneuve-lès-Avignon, Pont-du-Gard,",
  // Provence-Alpes-Côte d'Azur
  "Avignon, Arles, Salon-de-Provence, Martigues, Istres,",
  "Fréjus, Draguignan, Hyères, La Seyne-sur-Mer, Six-Fours,",
  "Cannes, Antibes, Grasse, Menton, Mandelieu-la-Napoule,",
  "Gap, Briançon, Digne-les-Bains, Manosque, Apt, Carpentras,",
  "Orange, Cavaillon, L'Isle-sur-la-Sorgue, Pertuis, Aubagne,",
  "La Ciotat, Vitrolles, Marignane, Les Pennes-Mirabeau,",
  // Corse
  "Ajaccio, Bastia, Porto-Vecchio, Calvi, Corte, Propriano,",
  // DOM-TOM
  "Fort-de-France, Pointe-à-Pitre, Les Abymes, Saint-Denis-de-la-Réunion,",
  "Saint-Pierre-de-la-Réunion, Le Tampon, Cayenne, Mamoudzou, Nouméa.",
].join(" ");

/** Post-correction dictionary: fix frequent Whisper misrecognitions for BTP terms */
const BTP_CORRECTIONS: [RegExp, string][] = [
  [/\bsimon\b/gi, "ciment"],
  [/\bsiment\b/gi, "ciment"],
  [/\btrancher\b/gi, "tranchée"],
  [/\btranchais?\b/gi, "tranchée"],
  [/\bcofrage\b/gi, "coffrage"],
  [/\bferraillage\b/gi, "ferraillage"],
  [/\bféraillage\b/gi, "ferraillage"],
  [/\bferaille\b/gi, "ferraille"],
  [/\bba treize\b/gi, "BA13"],
  [/\bba 13\b/gi, "BA13"],
  [/\bplaco\b/gi, "placo"],
  [/\bharisson\b/gi, "hérisson"],
  [/\bherisson\b/gi, "hérisson"],
  [/\bvrd\b/gi, "VRD"],
  [/\bv\.r\.d\.?\b/gi, "VRD"],
  [/\bITE\b/g, "ITE"],
  [/\bi\.t\.e\.?\b/gi, "ITE"],
  [/\bper\b/gi, "PER"],
  [/\benduis?\b/gi, "enduit"],
  [/\bchap\b/gi, "chape"],
  [/\bragréage\b/gi, "ragréage"],
  [/\bragreage\b/gi, "ragréage"],
  [/\bparpin\b/gi, "parpaing"],
  [/\bparpain\b/gi, "parpaing"],
  [/\bagglos?\b/gi, "agglo"],
  [/\bbanch(?:es)?\b/gi, "banche"],
  [/\bétaille?\b/gi, "étai"],
  [/\bétaille?\b/gi, "étai"],
  [/\bbastain\b/gi, "bastaing"],
  [/\bbâtain\b/gi, "bastaing"],
  [/\btoupille?\b/gi, "toupie"],
  [/\bdisqueuse\b/gi, "disqueuse"],
  [/\bperfo\b/gi, "perforateur"],
];

function postCorrectBTP(text: string): string {
  let corrected = text;
  for (const [pattern, replacement] of BTP_CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}

// Clients instanciés à la demande (pas au niveau global)
// pour éviter les erreurs de build si les env vars manquent
const CLAUDE_MODEL = "claude-sonnet-4-6";

function safeArray(value: unknown): string[] {
  const PLACEHOLDER_PATTERNS = [
    /^aucun(e)?\s/i,
    /^rien\s/i,
    /^pas\sde\s/i,
    /^non\s(precise|renseigne|mentionne)/i,
    /^néant$/i,
    /^—$/,
    /^-$/,
  ];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .map(s => s.trim())
      .filter(s => !PLACEHOLDER_PATTERNS.some(p => p.test(s)));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim().split(/\n/).map(s => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean)
      .filter(s => !PLACEHOLDER_PATTERNS.some(p => p.test(s)));
  }
  return [];
}

function buildReportText(report: ReportSections) {
  const parts = [];
  if (report.statut_global) parts.push(`Statut global : ${report.statut_global}`);
  if (report.lieu_chantier) parts.push(`Lieu du chantier : ${report.lieu_chantier}`);
  if (report.rapporteur) parts.push(`Rapporteur : ${report.rapporteur}`);
  if (report.meteo) parts.push(`Meteo : ${report.meteo}`);
  if (report.equipe) parts.push(`Equipe : ${report.equipe}`);
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

function extractJsonPayload(text: string): ReportSections | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Helper: return trimmed string or undefined if empty/placeholder
    const optStr = (val: unknown): string | undefined => {
      if (typeof val !== "string") return undefined;
      const trimmed = val.trim();
      if (!trimmed || trimmed === "Non precise" || trimmed === "Non précisé" || trimmed === "Inconnu" || trimmed === "—") return undefined;
      return trimmed;
    };

    return {
      statut_global: optStr(parsed.statut_global ?? parsed.statutGlobal) || "Bon deroulement",
      synthese: optStr(parsed.synthese) || "",
      score: typeof parsed.score === "number" ? Math.max(1, Math.min(10, parsed.score)) : undefined,
      alertes: safeArray(parsed.alertes),
      impacts: safeArray(parsed.impacts),
      lieu_chantier: optStr(parsed.lieu_chantier ?? parsed.lieuChantier),
      rapporteur: optStr(parsed.rapporteur),
      meteo: optStr(parsed.meteo),
      equipe: optStr(parsed.equipe),
      avancement: optStr(parsed.avancement),
      travaux_realises: safeArray(parsed.travaux_realises ?? parsed.travauxRealises),
      problemes_rencontres: safeArray(parsed.problemes_rencontres ?? parsed.problemesRencontres),
      materiel_manquant: safeArray(parsed.materiel_manquant ?? parsed.materielManquant),
      a_prevoir: safeArray(parsed.a_prevoir ?? parsed.aPrevoir),
      suggestion_legende_photo: optStr(parsed.suggestion_legende_photo ?? parsed.suggestionLegendePhoto) || "",
    };
  } catch {
    return null;
  }
}

function extractSection(label: string, text: string) {
  const regex = new RegExp(`${label}[:\s]*([\s\S]*?)(?=(?:🧱|⚠️|📦|📅|$))`, "i");
  const match = text.match(regex);
  if (!match) return "";
  return match[1].trim();
}

function messageContentToText(content: unknown): string {
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (block && typeof block === "object") {
        const typed = block as { type?: string; text?: string };
        if (typed.type === "text" && typeof typed.text === "string") {
          return typed.text;
        }
      }
      return "";
    })
    .filter(Boolean)
    .join("");
}

function generateReportPDF(report: ReportSections): Buffer {
  try {
    console.log(`[PDF GENERATION] Création du document PDF (sans images)`);
    const doc = new jsPDF();

    // Configuration du document
    doc.setFont("helvetica");

    // Titre
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("RAPPORT DE CHANTIER", 105, 30, { align: "center" });

    // Date
    const today = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${today}`, 20, 50);

    let yPosition = 70;

    // Fonction helper pour ajouter une section
    const addSection = (title: string, items: string[], emoji: string) => {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${emoji} ${title}`, 20, yPosition);
      yPosition += 10;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");

      if (items.length === 0) {
        doc.text("Aucune information", 20, yPosition);
        yPosition += 8;
      } else {
        for (const item of items) {
          const lines = doc.splitTextToSize(`- ${item}`, 170);
          doc.text(lines, 20, yPosition);
          yPosition += lines.length * 5 + 3;
        }
      }
      yPosition += 7;

      // Ligne séparatrice
      doc.setDrawColor(200, 200, 200);
      doc.line(20, yPosition, 190, yPosition);
      yPosition += 15;
    };

    // Sections du rapport
    console.log(`[PDF GENERATION] Ajout de la section: Travaux Réalisés`);
    addSection("Travaux Réalisés", report.travaux_realises, "🧱");
    console.log(`[PDF GENERATION] Ajout de la section: Problèmes Rencontrés`);
    addSection("Problèmes Rencontrés", report.problemes_rencontres, "⚠️");
    console.log(`[PDF GENERATION] Ajout de la section: Matériel Manquant`);
    addSection("Matériel Manquant", report.materiel_manquant, "📦");
    console.log(`[PDF GENERATION] Ajout de la section: À Prévoir`);
    addSection("À Prévoir", report.a_prevoir, "📅");

    // Pied de page
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text("Généré automatiquement par VoiceReport", 105, pageHeight - 20, { align: "center" });

    console.log(`[PDF GENERATION] Conversion en Buffer`);
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    console.log(`[PDF GENERATION] ✅ PDF généré avec succès - Taille: ${(pdfBuffer.length / 1024).toFixed(2)}KB`);
    
    return pdfBuffer;
  } catch (error) {
    console.error(
      `[PDF GENERATION ERREUR]`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

export async function POST(request: NextRequest) {
  console.log("\n" + "=".repeat(80));
  console.log("[PROCESS REPORT] ========== DÉBUT DU TRAITEMENT ==========");
  console.log("=".repeat(80));

  // Étape 0 : Vérification des variables d'environnement
  try {
    console.log(`[ENVIRONNEMENT] Vérification des clés d'API`);
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    
    console.log(`[ENVIRONNEMENT] OpenAI API: ${hasOpenAI ? "✅ PRÉSENTE" : "❌ MANQUANTE"}`);
    console.log(`[ENVIRONNEMENT] Anthropic API: ${hasAnthropic ? "✅ PRÉSENTE" : "❌ MANQUANTE"}`);

    if (!hasOpenAI || !hasAnthropic) {
      const missingKeys = [];
      if (!hasOpenAI) missingKeys.push("OPENAI_API_KEY");
      if (!hasAnthropic) missingKeys.push("ANTHROPIC_API_KEY");
      throw new Error(`Variables d'environnement manquantes: ${missingKeys.join(", ")}`);
    }
  } catch (envError) {
    console.error(
      `[ENVIRONNEMENT ERREUR]`,
      envError instanceof Error ? envError.message : envError
    );
    return NextResponse.json(
      { error: envError instanceof Error ? envError.message : "Erreur de configuration" },
      { status: 500 }
    );
  }

  // Étape 1 : Réception du fichier audio
  let audioBlob: Blob;
  try {
    console.log(`[AUDIO] Extraction du fichier audio`);
    const formData = await request.formData();
    const audioData = formData.get('audio');
    
    if (!audioData || !(audioData instanceof Blob)) {
      throw new Error("Aucun fichier audio reçu ou format invalide");
    }
    
    audioBlob = audioData;
    console.log(`[AUDIO] ✅ Fichier reçu - Taille: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB, Type: ${audioBlob.type}`);
  } catch (audioError) {
    console.error(
      `[AUDIO ERREUR]`,
      audioError instanceof Error ? audioError.message : audioError
    );
    return NextResponse.json(
      { error: audioError instanceof Error ? audioError.message : "Aucun fichier audio reçu." },
      { status: 400 }
    );
  }

  try {
    // Instancier les clients à la demande (pas au niveau global)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

    // Étape 2 : Transcription audio (Whisper)
    console.log(`[TRANSCRIPTION] Envoi à OpenAI Whisper`);
    // Déterminer le type MIME et nom de fichier cohérent pour Whisper
    // Safari iOS envoie audio/mp4 ou audio/aac — Whisper accepte .m4a, .mp4, .webm, .ogg, .wav
    const blobType = audioBlob.type || "audio/webm";
    let fileName = "recording.webm";
    let fileType = "audio/webm";
    if (blobType.includes("mp4") || blobType.includes("m4a")) {
      fileName = "recording.m4a"; fileType = "audio/mp4";
    } else if (blobType.includes("aac")) {
      fileName = "recording.m4a"; fileType = "audio/mp4"; // aac -> m4a container pour Whisper
    } else if (blobType.includes("ogg"))  { fileName = "recording.ogg"; fileType = "audio/ogg"; }
    else if (blobType.includes("wav"))  { fileName = "recording.wav"; fileType = "audio/wav"; }
    console.log(`[TRANSCRIPTION] Blob type reçu: "${blobType}" → Format Whisper : ${fileType} (${fileName})`);
    
    const fileForOpenAI = new File([audioBlob], fileName, { type: fileType });
    
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: fileForOpenAI,
      model: "whisper-1",
      language: "fr",
      prompt: WHISPER_BTP_PROMPT,
    });

    const transcriptionText = transcriptionResponse.text;
    const transcription = postCorrectBTP(transcriptionText?.trim() ?? "");
    
    console.log(`[TRANSCRIPTION] ✅ Transcription réussie`);
    console.log(`[TRANSCRIPTION]   Longueur: ${transcription.length} caractères`);
    console.log(`[TRANSCRIPTION]   Aperçu: ${transcription.substring(0, 100)}...`);

    if (!transcription) {
      throw new Error("La transcription audio est vide");
    }

    // Étape 3 : Analyse avec Claude (Anthropic)
    console.log(`[ANALYSE] Envoi du texte à Claude pour analyse`);
    const systemInstructions = `Tu es un assistant de direction BTP expert et analyste de risques chantier. ` +
      `Analyse cette transcription de rapport de chantier oral et transforme-la en outil de pilotage pour le patron. ` +
      `REGLE FONDAMENTALE : Extraire UNIQUEMENT ce qui est explicitement mentionne. INTERDICTION d'inventer. ` +
      `Si une information n'est PAS dans le vocal, le champ doit etre OMIS ou vide []. ` +
      `\n\nREGLES DE REDACTION : ` +
      `1) Puces courtes et percutantes (ex: "Coulage de dalle terminé"). ` +
      `2) Problemes : prefixe "[Attention]" (mineur) ou "[Critique]" (grave/bloquant). ` +
      `3) Tableaux vides = [], JAMAIS de texte generique. ` +
      `\n\n━━━ INTELLIGENCE BUSINESS (TRES IMPORTANT) ━━━` +
      `\n\nTu dois INTERPRETER les informations terrain en IMPACTS BUSINESS pour le patron :` +
      `\n- "manque de ciment" → impact: "⚠️ Risque de blocage du chantier demain matin"` +
      `\n- "livraison en retard" → impact: "📅 Impact possible sur le planning de la semaine"` +
      `\n- "betonniere en panne" → impact: "🔴 Arrêt des travaux de bétonnage tant que non réparé"` +
      `\n- "intemperies" → impact: "🌧️ Retard probable, prévoir décalage planning"` +
      `\n- "effectif reduit" → impact: "👷 Productivité réduite, risque de retard"` +
      `\nSi aucun probleme, ne genere PAS d'impacts (tableau vide).` +
      `\n\nGENERE des ALERTES uniquement si situation urgente/critique :` +
      `\n- "⚠️ Commande de ciment urgente pour éviter arrêt demain"` +
      `\n- "🔴 Bétonnière HS — intervention technicien requise"` +
      `\n- "📞 Relancer fournisseur acier — livraison en retard"` +
      `\nSi tout va bien, alertes = [] (tableau vide).` +
      `\n\n━━━ DISTINCTION CRITIQUE : materiel_manquant vs a_prevoir ━━━` +
      `\n\nmateriel_manquant = OBJETS/MATERIAUX physiques manquants NOW :` +
      `\n- Matieres premieres, consommables, outillage, EPI` +
      `\nExemples : "5 sacs de ciment", "Vis 6x60", "Meuleuse (cassée)"` +
      `\n\na_prevoir = ACTIONS que le patron doit planifier :` +
      `\n- Commandes, interventions, controles, planification` +
      `\nExemples : "Commander ciment pour demain", "Appeler technicien"` +
      `\n\nDEDUCTION AUTO : "il manque du ciment" → materiel: ["Ciment"] + a_prevoir: ["Commander du ciment"] + impacts: ["⚠️ Risque de blocage demain"] + alertes: ["⚠️ Commande ciment urgente"]` +
      `\n\n━━━ VOCABULAIRE BTP ━━━` +
      `\nAccents obligatoires : réalisé, effectué, câbles, électrique, bétonnière, matériel, prévoir, problème.` +
      `\nCorrections : "vlocos"/"blocos"→"Parpaings", "bétoire"→"Bétonnière", "agglos"→"Agglomérés", "toupie"→"Camion toupie", "placo"→"Plaques de plâtre", "banche"→"Coffrage banche", "IPN"→"Poutre IPN".` +
      `\nMot inconnu contexte BTP → conserver + (?).` +
      `\n\n━━━ SCORE JOURNALIER (1-10) ━━━` +
      `\n- 9-10 : Excellente journée, avancement significatif sans problème` +
      `\n- 7-8 : Bonne journée, travaux réalisés avec problèmes mineurs` +
      `\n- 5-6 : Journée mitigée, difficultés notables` +
      `\n- 3-4 : Journée difficile, blocages importants` +
      `\n- 1-2 : Journée critique, arrêt chantier` +
      `\n\nSTATUT GLOBAL : ` +
      `- 0 probleme = "Bon déroulement" ` +
      `- 1-2 mineurs = "Quelques difficultés" ` +
      `- Urgent/bloquant = "Situation critique" ` +
      `\n\nReponds UNIQUEMENT avec un objet JSON :` +
      `\n- statut_global (OBLIGATOIRE) : "Bon déroulement", "Quelques difficultés", ou "Situation critique"` +
      `\n- synthese (OBLIGATOIRE) : 1 phrase max 15 mots, impact principal inclus` +
      `\n- score (OBLIGATOIRE) : nombre entier de 1 a 10` +
      `\n- alertes : TABLEAU de strings d'alertes urgentes avec emoji. [] si RAS.` +
      `\n- impacts : TABLEAU d'impacts business interpretes avec emoji. [] si RAS.` +
      `\n- lieu_chantier (si mentionne) : corrige l'orthographe des villes` +
      `\n- rapporteur (si mentionne)` +
      `\n- meteo (si mentionnee)` +
      `\n- equipe (si mentionne)` +
      `\n- avancement (si mentionne)` +
      `\n- travaux_realises : TABLEAU. [] si rien.` +
      `\n- problemes_rencontres : TABLEAU avec [Attention]/[Critique]. [] si rien.` +
      `\n- materiel_manquant : TABLEAU objets physiques. [] si rien.` +
      `\n- a_prevoir : TABLEAU actions. [] si rien.` +
      `\n- suggestion_legende_photo : courte phrase.` +
      `\n\nEXEMPLE 1 — "On a coulé la dalle ce matin, tout s'est bien passé" :` +
      `\n{"statut_global":"Bon déroulement","synthese":"Dalle coulée sans incident, journée productive","score":9,"alertes":[],"impacts":[],"travaux_realises":["Coulage de dalle réalisé"],"problemes_rencontres":[],"materiel_manquant":[],"a_prevoir":[],"suggestion_legende_photo":"Coulage de dalle en cours"}` +
      `\n\nEXEMPLE 2 — "Il manque du ciment et la bétonnière est en panne, faut appeler le réparateur" :` +
      `\n{"statut_global":"Situation critique","synthese":"Bétonnière en panne et manque ciment, risque blocage","score":3,"alertes":["🔴 Bétonnière HS — appeler technicien en urgence","⚠️ Commander du ciment avant demain matin"],"impacts":["🔴 Arrêt des travaux de bétonnage","⚠️ Risque de blocage chantier demain"],"travaux_realises":[],"problemes_rencontres":["[Critique] Bétonnière en panne"],"materiel_manquant":["Ciment"],"a_prevoir":["Commander du ciment","Appeler réparateur bétonnière"],"suggestion_legende_photo":"Bétonnière en panne sur chantier"}`;

    const anthropicResponse = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: systemInstructions,
      messages: [
        {
          role: "user",
          content: transcription,
        },
      ],
      max_tokens: 1500,
    });

    const rawOutput = messageContentToText(anthropicResponse.content);
    console.log(`[ANALYSE] ✅ Réponse de Claude reçue`);
    console.log(`[ANALYSE]   Longueur: ${rawOutput.length} caractères`);

    // Étape 4 : Extraction des sections du rapport
    console.log(`[EXTRACTION] Extraction des sections du rapport`);
    const report = extractJsonPayload(rawOutput) ?? {
      statut_global: "Bon deroulement",
      travaux_realises: [extractSection("Travaux réalisés", rawOutput)].filter(Boolean),
      problemes_rencontres: [extractSection("Problèmes rencontrés", rawOutput)].filter(Boolean),
      materiel_manquant: [extractSection("Matériel manquant", rawOutput)].filter(Boolean),
      a_prevoir: [extractSection("À prévoir", rawOutput)].filter(Boolean),
      suggestion_legende_photo: "",
    };

    console.log(`[EXTRACTION] ✅ Sections extraites`);
    console.log(`[EXTRACTION]   Travaux réalisés: ${report.travaux_realises.join(", ").substring(0, 50)}...`);
    console.log(`[EXTRACTION]   Problèmes: ${report.problemes_rencontres.join(", ").substring(0, 50)}...`);
    console.log(`[EXTRACTION]   Matériel: ${report.materiel_manquant.join(", ").substring(0, 50)}...`);
    console.log(`[EXTRACTION]   À prévoir: ${report.a_prevoir.join(", ").substring(0, 50)}...`);

    // Étape 5 : Génération du PDF (AWAIT complète!)
    console.log(`[PDF] Début de la génération du PDF`);
    const pdfBuffer = generateReportPDF(report);
    console.log(`[PDF] ✅ PDF généré et Buffer créé`);

    // Étape 6 : Préparation de la réponse
    console.log(`[RÉPONSE] Préparation de la réponse JSON`);
    const responseData = {
      success: true,
      report,
      reportText: buildReportText(report),
      transcription,
      rawOutput,
      pdfBuffer: pdfBuffer.toString('base64'),
    };

    console.log("\n" + "=".repeat(80));
    console.log("[PROCESS REPORT] ========== TRAITEMENT COMPLÉTÉ AVEC SUCCÈS ==========");
    console.log("=".repeat(80) + "\n");

    return NextResponse.json(responseData);
  } catch (error) {
    console.error(
      "[PROCESS REPORT ERREUR FATALE]",
      error instanceof Error ? error.message : error
    );
    
    if (error instanceof Error) {
      console.error(`[PROCESS REPORT] Stack trace:`, error.stack);
    }

    console.log("\n" + "=".repeat(80));
    console.log("[PROCESS REPORT] ========== TRAITEMENT ÉCHOUÉ ==========");
    console.log("=".repeat(80) + "\n");

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors du traitement du rapport." },
      { status: 500 }
    );
  }
}
