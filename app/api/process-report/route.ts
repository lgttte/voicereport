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
  "Villes : Paris, Marseille, Lyon, Toulouse, Nice, Nantes, Montpellier, Strasbourg, Bordeaux, Lille,",
  "Rennes, Reims, Toulon, Saint-Étienne, Le Havre, Grenoble, Dijon, Angers, Nîmes, Villeurbanne,",
  "Clermont-Ferrand, Le Mans, Aix-en-Provence, Brest, Tours, Amiens, Limoges, Perpignan, Metz, Besançon,",
  "Orléans, Rouen, Mulhouse, Caen, Nancy, Argenteuil, Montreuil, Saint-Denis, Créteil, Nanterre,",
  "Versailles, Cergy, Évry-Courcouronnes, Meaux, Pontoise, Colombes, Courbevoie, Asnières-sur-Seine,",
  // 75 Paris arrondissements et quartiers
  "Belleville, Ménilmontant, Montmartre, Pigalle, Barbès, La Chapelle, Jaurès, Stalingrad,",
  "Bastille, Nation, République, Châtelet, Les Halles, Opéra, Madeleine, Trocadéro,",
  "La Défense, Bercy, Tolbiac, Italie, Alésia, Denfert, Montparnasse, Vaugirard,",
  "Convention, Grenelle, Auteuil, Passy, Boulogne, Neuilly, Levallois,",
  // 92 – Hauts-de-Seine
  "Boulogne-Billancourt, Nanterre, Colombes, Courbevoie, Asnières-sur-Seine, Rueil-Malmaison,",
  "Levallois-Perret, Issy-les-Moulineaux, Neuilly-sur-Seine, Antony, Clamart, Meudon,",
  "Sèvres, Puteaux, Gennevilliers, Bois-Colombes, La Garenne-Colombes, Villeneuve-la-Garenne,",
  "Clichy, Saint-Cloud, Garches, Marnes-la-Coquette, Vaucresson, Chaville, Ville-d'Avray,",
  "Suresnes, Montrouge, Malakoff, Vanves, Châtillon, Bagneux, Fontenay-aux-Roses,",
  "Le Plessis-Robinson, Châtenay-Malabry, Sceaux, Bourg-la-Reine, Fresnes,",
  // 93 – Seine-Saint-Denis
  "Saint-Denis, Aubervilliers, Pantin, Bobigny, Drancy, Bondy, Montreuil,",
  "Saint-Ouen-sur-Seine, Aulnay-sous-Bois, Sevran, Livry-Gargan, Noisy-le-Sec,",
  "Rosny-sous-Bois, Villemomble, Gagny, Montfermeil, Clichy-sous-Bois, Le Raincy,",
  "Romainville, Les Lilas, Le Pré-Saint-Gervais, Bagnolet, Les Pavillons-sous-Bois,",
  "Épinay-sur-Seine, Villetaneuse, Pierrefitte-sur-Seine, Stains, La Courneuve,",
  "Le Blanc-Mesnil, Dugny, Le Bourget, Tremblay-en-France, Villepinte,",
  "Vaujours, Coubron, Neuilly-Plaisance, Neuilly-sur-Marne, Gournay-sur-Marne,",
  "Noisy-le-Grand, L'Île-Saint-Denis, Épinay-sous-Sénart,",
  // 94 – Val-de-Marne
  "Vitry-sur-Seine, Ivry-sur-Seine, Maisons-Alfort, Champigny-sur-Marne, Créteil,",
  "Saint-Maur-des-Fossés, Vincennes, Saint-Mandé, Charenton-le-Pont, Alfortville,",
  "Le Perreux-sur-Marne, Nogent-sur-Marne, Joinville-le-Pont, Fontenay-sous-Bois,",
  "Villejuif, Cachan, Arcueil, Gentilly, Le Kremlin-Bicêtre, L'Haÿ-les-Roses,",
  "Thiais, Orly, Choisy-le-Roi, Villeneuve-le-Roi, Villeneuve-Saint-Georges,",
  "Sucy-en-Brie, Boissy-Saint-Léger, Limeil-Brévannes, Valenton, Bonneuil-sur-Marne,",
  "Chennevières-sur-Marne, Ormesson-sur-Marne, Le Plessis-Trévise, La Queue-en-Brie,",
  "Ablon-sur-Seine, Rungis, Chevilly-Larue, Villiers-sur-Marne, Mandres-les-Roses,",
  // 95 – Val-d'Oise
  "Argenteuil, Sarcelles, Garges-lès-Gonesse, Cergy, Pontoise, Bezons,",
  "Franconville, Ermont, Eaubonne, Montmorency, Enghien-les-Bains, Deuil-la-Barre,",
  "Herblay-sur-Seine, Cormeilles-en-Parisis, Taverny, Saint-Gratien,",
  "Gonesse, Arnouville, Goussainville, Roissy-en-France, Louvres, Fosses,",
  "Sannois, Soisy-sous-Montmorency, Margency, Andilly, Saint-Leu-la-Forêt,",
  "Villiers-le-Bel, Saint-Brice-sous-Forêt, Montmagny, Groslay, Domont,",
  "Beaumont-sur-Oise, Persan, L'Isle-Adam, Auvers-sur-Oise, Valmondois,",
  "Osny, Jouy-le-Moutier, Vauréal, Courdimanche, Éragny, Saint-Ouen-l'Aumône,",
  // 91 – Essonne
  "Évry-Courcouronnes, Corbeil-Essonnes, Massy, Palaiseau, Savigny-sur-Orge,",
  "Athis-Mons, Juvisy-sur-Orge, Viry-Châtillon, Grigny, Ris-Orangis, Longjumeau,",
  "Orsay, Les Ulis, Bures-sur-Yvette, Gif-sur-Yvette, Saclay, Saint-Michel-sur-Orge,",
  "Brétigny-sur-Orge, Arpajon, Montlhéry, La Ville-du-Bois, Sainte-Geneviève-des-Bois,",
  "Fleury-Mérogis, Bondoufle, Lisses, Courcouronnes, Villabé, Mennecy,",
  "Brunoy, Yerres, Montgeron, Draveil, Vigneux-sur-Seine, Épinay-sous-Sénart,",
  "Étampes, Dourdan, Milly-la-Forêt, La Ferté-Alais, Cerny, Ballancourt,",
  // 78 – Yvelines
  "Versailles, Saint-Germain-en-Laye, Sartrouville, Houilles, Poissy, Mantes-la-Jolie,",
  "Les Mureaux, Conflans-Sainte-Honorine, Élancourt, Trappes, Rambouillet,",
  "Guyancourt, Montigny-le-Bretonneux, Saint-Quentin-en-Yvelines, Plaisir,",
  "Le Chesnay-Rocquencourt, Vélizy-Villacoublay, Viroflay, Chatou, Le Pecq,",
  "Le Vésinet, Croissy-sur-Seine, Bougival, Louveciennes, Marly-le-Roi,",
  "Maisons-Laffitte, Carrières-sous-Poissy, Triel-sur-Seine, Achères,",
  "Saint-Cyr-l'École, Bois-d'Arcy, Fontenay-le-Fleury, Magnanville,",
  "Aubergenville, Limay, Buchelay, Mantes-la-Ville, Bonnières-sur-Seine,",
  "Maurepas, Coignières, La Verrière, Jouars-Pontchartrain, Beynes,",
  // 77 – Seine-et-Marne
  "Melun, Meaux, Chelles, Pontault-Combault, Savigny-le-Temple, Combs-la-Ville,",
  "Dammarie-les-Lys, Le Mée-sur-Seine, Nemours, Provins, Fontainebleau,",
  "Coulommiers, Montereau-Fault-Yonne, Avon, Moret-sur-Loing, Torcy,",
  "Lagny-sur-Marne, Vaires-sur-Marne, Bussy-Saint-Georges, Serris, Chessy,",
  "Lognes, Noisiel, Champs-sur-Marne, Roissy-en-Brie, Ozoir-la-Ferrière,",
  "Sénart, Lieusaint, Moissy-Cramayel, Cesson, Vert-Saint-Denis,",
  "Mitry-Mory, Claye-Souilly, Villeparisis, Courtry, Brou-sur-Chantereine,",
  "Bailly-Romainvilliers, Magny-le-Hongre, Crécy-la-Chapelle, La Ferté-sous-Jouarre,",
  "Nangis, Brie-Comte-Robert, Tournan-en-Brie, Gretz-Armainvilliers,",
  // Nord – 59
  "Lille, Roubaix, Tourcoing, Dunkerque, Villeneuve-d'Ascq, Wattrelos,",
  "Douai, Valenciennes, Cambrai, Maubeuge, Marcq-en-Barœul, Lambersart,",
  "Armentières, Halluin, Wasquehal, Croix, Hem, Lys-lez-Lannoy,",
  "La Madeleine, Lomme, Hellemmes, Mons-en-Barœul, Faches-Thumesnil,",
  "Wattignies, Ronchin, Lesquin, Seclin, Templeuve, Orchies,",
  "Denain, Anzin, Saint-Amand-les-Eaux, Condé-sur-l'Escaut, Onnaing,",
  "Aulnoye-Aymeries, Jeumont, Fourmies, Avesnes-sur-Helpe, Le Quesnoy,",
  "Gravelines, Grande-Synthe, Coudekerque-Branche, Loon-Plage, Hazebrouck,",
  "Bailleul, Cassel, Bergues, Hondschoote, Wormhout, Steenvoorde,",
  "Caudry, Le Cateau-Cambrésis, Solesmes, Bavay, Berlaimont,",
  "Sin-le-Noble, Aniche, Somain, Lallaing, Marchiennes, Lewarde,",
  // Pas-de-Calais – 62
  "Arras, Calais, Boulogne-sur-Mer, Lens, Béthune, Liévin, Hénin-Beaumont,",
  "Bruay-la-Buissière, Carvin, Wingles, Harnes, Noyelles-sous-Lens,",
  "Avion, Méricourt, Sallaumines, Billy-Montigny, Oignies, Libercourt,",
  "Saint-Omer, Aire-sur-la-Lys, Isbergues, Lillers, Noeux-les-Mines,",
  "Berck, Le Touquet, Étaples, Montreuil-sur-Mer, Hesdin,",
  "Bully-les-Mines, Auchel, Barlin, Marles-les-Mines, Divion,",
  "Outreau, Le Portel, Wimereux, Marquise, Desvres, Guînes,",
  "Douvrin, Vendin-le-Vieil, Mazingarbe, Grenay, Loos-en-Gohelle,",
  // Somme – 80
  "Amiens, Abbeville, Péronne, Albert, Doullens, Montdidier,",
  "Ham, Roye, Corbie, Longueau, Rivery, Camon, Saleux, Boves,",
  // Oise – 60
  "Beauvais, Compiègne, Creil, Senlis, Chantilly, Noyon,",
  "Nogent-sur-Oise, Montataire, Méru, Chambly, Clermont, Liancourt,",
  "Pont-Sainte-Maxence, Crépy-en-Valois, Nanteuil-le-Haudouin,",
  "Gouvieux, Lamorlaye, Villers-Saint-Paul, Bresles, Mouy, Formerie,",
  // Aisne – 02
  "Saint-Quentin, Laon, Soissons, Château-Thierry, Tergnier, Hirson,",
  "Chauny, Guise, Villers-Cotterêts, La Fère, Vervins, Bohain,",
  // Bas-Rhin – 67
  "Strasbourg, Haguenau, Schiltigheim, Illkirch-Graffenstaden, Lingolsheim,",
  "Sélestat, Saverne, Obernai, Bischwiller, Brumath, Molsheim, Barr,",
  "Erstein, Benfeld, Wissembourg, Soufflenheim, Reichshoffen,",
  "Bischheim, Hœnheim, Ostwald, Geispolsheim, Mundolsheim, Vendenheim,",
  // Haut-Rhin – 68
  "Mulhouse, Colmar, Saint-Louis, Wittenheim, Illzach, Rixheim,",
  "Kingersheim, Riedisheim, Guebwiller, Thann, Cernay, Altkirch,",
  "Ensisheim, Soultz-Haut-Rhin, Wintzenheim, Munster, Rouffach,",
  // Moselle – 57
  "Metz, Thionville, Forbach, Sarreguemines, Montigny-lès-Metz,",
  "Woippy, Hagondange, Fameck, Florange, Hayange, Yutz, Uckange,",
  "Saint-Avold, Creutzwald, L'Hôpital, Freyming-Merlebach, Stiring-Wendel,",
  "Sarrebourg, Dieuze, Château-Salins, Morhange, Faulquemont, Boulay,",
  // Meurthe-et-Moselle – 54
  "Nancy, Vandœuvre-lès-Nancy, Lunéville, Toul, Pont-à-Mousson,",
  "Laxou, Villers-lès-Nancy, Jarville-la-Malgrange, Tomblaine,",
  "Maxéville, Malzéville, Saint-Max, Essey-lès-Nancy, Longwy, Briey,",
  // Vosges – 88
  "Épinal, Saint-Dié-des-Vosges, Remiremont, Gérardmer, Thaon-les-Vosges,",
  "Golbey, Raon-l'Étape, Mirecourt, Neufchâteau, Vittel, Contrexéville,",
  // Meuse – 55
  "Bar-le-Duc, Verdun, Commercy, Saint-Mihiel, Stenay, Ligny-en-Barrois,",
  // Aube – 10
  "Troyes, Romilly-sur-Seine, La Chapelle-Saint-Luc, Sainte-Savine,",
  "Bar-sur-Aube, Bar-sur-Seine, Nogent-sur-Seine, Brienne-le-Château,",
  // Marne – 51
  "Reims, Châlons-en-Champagne, Épernay, Vitry-le-François, Sézanne,",
  "Tinqueux, Cormontreuil, Bétheny, Saint-Memmie, Fagnières, Mourmelon,",
  // Haute-Marne – 52
  "Chaumont, Langres, Saint-Dizier, Joinville, Wassy, Nogent,",
  // Ardennes – 08
  "Charleville-Mézières, Sedan, Rethel, Vouziers, Fumay, Givet, Revin,",
  // Seine-Maritime – 76
  "Rouen, Le Havre, Dieppe, Sotteville-lès-Rouen, Saint-Étienne-du-Rouvray,",
  "Le Petit-Quevilly, Le Grand-Quevilly, Mont-Saint-Aignan, Bois-Guillaume,",
  "Canteleu, Maromme, Déville-lès-Rouen, Darnétal, Bihorel,",
  "Fécamp, Bolbec, Lillebonne, Barentin, Pavilly, Yvetot,",
  "Elbeuf, Caudebec-lès-Elbeuf, Saint-Pierre-lès-Elbeuf, Eu, Le Tréport,",
  "Montivilliers, Harfleur, Gonfreville-l'Orcher, Gainneville, Octeville-sur-Mer,",
  // Eure – 27
  "Évreux, Vernon, Louviers, Val-de-Reuil, Bernay, Gisors,",
  "Les Andelys, Pont-Audemer, Gaillon, Pacy-sur-Eure, Brionne,",
  // Calvados – 14
  "Caen, Hérouville-Saint-Clair, Lisieux, Bayeux, Vire, Falaise,",
  "Ouistreham, Mondeville, Ifs, Colombelles, Deauville, Trouville,",
  "Honfleur, Pont-l'Évêque, Dives-sur-Mer, Cabourg, Courseulles-sur-Mer,",
  // Manche – 50
  "Cherbourg-en-Cotentin, Saint-Lô, Granville, Coutances, Avranches,",
  "Valognes, Carentan, Villedieu-les-Poêles, Mortain, Pontorson,",
  // Orne – 61
  "Alençon, Flers, Argentan, L'Aigle, Mortagne-au-Perche, Sées, La Ferté-Macé,",
  // Finistère – 29
  "Brest, Quimper, Morlaix, Concarneau, Landerneau, Landivisiau,",
  "Douarnenez, Pont-l'Abbé, Quimperlé, Châteaulin, Crozon, Carhaix-Plouguer,",
  "Guipavas, Le Relecq-Kerhuon, Plougastel-Daoulas, Plouzané,",
  // Côtes-d'Armor – 22
  "Saint-Brieuc, Lannion, Dinan, Guingamp, Lamballe, Loudéac,",
  "Plérin, Trégueux, Langueux, Plédran, Paimpol, Perros-Guirec,",
  // Morbihan – 56
  "Vannes, Lorient, Pontivy, Auray, Ploërmel, Ploemeur,",
  "Lanester, Hennebont, Guidel, Larmor-Plage, Séné, Arradon,",
  "Sarzeau, Muzillac, La Gacilly, Josselin, Locminé, Guer,",
  // Ille-et-Vilaine – 35
  "Rennes, Saint-Malo, Fougères, Vitré, Bruz, Cesson-Sévigné,",
  "Betton, Pacé, Saint-Jacques-de-la-Lande, Chantepie, Thorigné-Fouillard,",
  "Dinard, Cancale, Combourg, Montfort-sur-Meu, Redon, Bain-de-Bretagne,",
  // Loire-Atlantique – 44
  "Nantes, Saint-Nazaire, Rezé, Saint-Herblain, Orvault, Vertou,",
  "Bouguenais, Carquefou, La Chapelle-sur-Erdre, Couëron, Sainte-Luce-sur-Loire,",
  "Ancenis, Clisson, Pornic, Guérande, La Baule-Escoublac, Le Croisic,",
  "Blain, Châteaubriant, Nort-sur-Erdre, Vallet, Machecoul, Pontchâteau,",
  // Maine-et-Loire – 49
  "Angers, Cholet, Saumur, Trélazé, Avrillé, Les Ponts-de-Cé,",
  "Saint-Barthélemy-d'Anjou, Beaupréau, Chemillé, Segré, Longué,",
  // Mayenne – 53
  "Laval, Mayenne, Château-Gontier, Évron, Craon, Ernée,",
  // Sarthe – 72
  "Le Mans, La Flèche, Allonnes, Coulaines, Sablé-sur-Sarthe,",
  "Mamers, Saint-Calais, La Ferté-Bernard, Le Lude, Écommoy,",
  // Vendée – 85
  "La Roche-sur-Yon, Les Sables-d'Olonne, Challans, Fontenay-le-Comte,",
  "Luçon, Les Herbiers, Montaigu-Vendée, Saint-Gilles-Croix-de-Vie,",
  "Aizenay, La Châtaigneraie, Pouzauges, Mortagne-sur-Sèvre,",
  // Indre-et-Loire – 37
  "Tours, Joué-lès-Tours, Saint-Cyr-sur-Loire, Saint-Pierre-des-Corps,",
  "Amboise, Chinon, Loches, Château-Renault, Bléré, Azay-le-Rideau,",
  // Loir-et-Cher – 41
  "Blois, Vendôme, Romorantin-Lanthenay, Mer, Montoire, Salbris,",
  // Loiret – 45
  "Orléans, Olivet, Saint-Jean-de-Braye, Fleury-les-Aubrais, Saran,",
  "Montargis, Gien, Pithiviers, Châlette-sur-Loing, Amilly, Beaugency,",
  // Eure-et-Loir – 28
  "Chartres, Dreux, Lucé, Mainvilliers, Luisant, Châteaudun, Nogent-le-Rotrou,",
  // Cher – 18
  "Bourges, Vierzon, Saint-Amand-Montrond, Mehun-sur-Yèvre, Saint-Doulchard,",
  // Indre – 36
  "Châteauroux, Issoudun, Le Blanc, La Châtre, Buzançais, Déols, Argenton-sur-Creuse,",
  // Côte-d'Or – 21
  "Dijon, Beaune, Chenôve, Talant, Quetigny, Chevigny-Saint-Sauveur,",
  "Longvic, Marsannay-la-Côte, Genlis, Auxonne, Is-sur-Tille, Montbard, Semur-en-Auxois,",
  // Saône-et-Loire – 71
  "Chalon-sur-Saône, Mâcon, Le Creusot, Montceau-les-Mines, Autun,",
  "Gueugnon, Paray-le-Monial, Digoin, Tournus, Louhans, Chagny,",
  // Yonne – 89
  "Auxerre, Sens, Joigny, Migennes, Avallon, Tonnerre, Villeneuve-sur-Yonne,",
  // Nièvre – 58
  "Nevers, Cosne-Cours-sur-Loire, Varennes-Vauzelles, Decize, Clamecy, La Charité-sur-Loire,",
  // Jura – 39
  "Lons-le-Saunier, Dole, Saint-Claude, Champagnole, Poligny, Morez, Arbois,",
  // Doubs – 25
  "Besançon, Montbéliard, Pontarlier, Audincourt, Valentigney, Bethoncourt,",
  "Baume-les-Dames, Ornans, Morteau, Maîche, Sochaux, Grand-Charmont,",
  // Haute-Saône – 70
  "Vesoul, Lure, Héricourt, Luxeuil-les-Bains, Gray, Fougerolles,",
  // Territoire de Belfort – 90
  "Belfort, Delle, Giromagny, Beaucourt, Valdoie, Bavilliers, Offemont,",
  // Rhône – 69
  "Lyon, Villeurbanne, Vénissieux, Saint-Priest, Vaulx-en-Velin, Bron,",
  "Caluire-et-Cuire, Rillieux-la-Pape, Décines-Charpieu, Meyzieu,",
  "Villefranche-sur-Saône, Givors, Oullins, Pierre-Bénite, Saint-Fons,",
  "Tassin-la-Demi-Lune, Écully, Francheville, Sainte-Foy-lès-Lyon,",
  "Saint-Genis-Laval, Irigny, Feyzin, Mions, Corbas, Chassieu,",
  "Dardilly, Limonest, Champagne-au-Mont-d'Or, Saint-Didier-au-Mont-d'Or,",
  "L'Arbresle, Tarare, Thizy-les-Bourgs, Belleville-en-Beaujolais, Gleizé,",
  // Loire – 42
  "Saint-Étienne, Roanne, Saint-Chamond, Firminy, Rive-de-Gier,",
  "Andrézieux-Bouthéon, Montbrison, Feurs, Saint-Just-Saint-Rambert,",
  "Le Chambon-Feugerolles, Unieux, Roche-la-Molière, Sorbiers,",
  // Ain – 01
  "Bourg-en-Bresse, Oyonnax, Ambérieu-en-Bugey, Bellegarde-sur-Valserine,",
  "Miribel, Beynost, Montluel, Meximieux, Trévoux, Villars-les-Dombes,",
  "Gex, Ferney-Voltaire, Divonne-les-Bains, Prévessin-Moëns, Nantua,",
  // Isère – 38
  "Grenoble, Saint-Martin-d'Hères, Échirolles, Fontaine, Meylan,",
  "Voiron, Bourgoin-Jallieu, Vienne, Villefontaine, L'Isle-d'Abeau,",
  "La Tour-du-Pin, Pont-de-Claix, Seyssinet-Pariset, Sassenage,",
  "Saint-Égrève, Crolles, Le Versoud, Vizille, Moirans, Tullins,",
  "La Mure, Saint-Marcellin, Roussillon, Beaurepaire, Cremieu,",
  // Drôme – 26
  "Valence, Romans-sur-Isère, Montélimar, Bourg-lès-Valence, Portes-lès-Valence,",
  "Pierrelatte, Bourg-de-Péage, Crest, Die, Nyons, Livron-sur-Drôme,",
  // Ardèche – 07
  "Privas, Annonay, Aubenas, Tournon-sur-Rhône, Guilherand-Granges,",
  "Le Teil, Bourg-Saint-Andéol, Largentière, Vals-les-Bains, Les Vans,",
  // Savoie – 73
  "Chambéry, Aix-les-Bains, Albertville, Saint-Jean-de-Maurienne,",
  "Moûtiers, Bourg-Saint-Maurice, La Motte-Servolex, Cognin,",
  "La Ravoire, Montmélian, Saint-Michel-de-Maurienne, Modane,",
  // Haute-Savoie – 74
  "Annecy, Annemasse, Thonon-les-Bains, Évian-les-Bains, Cluses,",
  "Sallanches, Bonneville, La Roche-sur-Foron, Rumilly, Faverges,",
  "Gaillard, Ambilly, Ville-la-Grand, Vétraz-Monthoux, Cranves-Sales,",
  "Saint-Julien-en-Genevois, Passy, Chamonix-Mont-Blanc, Megève, Morzine,",
  // Puy-de-Dôme – 63
  "Clermont-Ferrand, Chamalières, Beaumont, Cournon-d'Auvergne, Gerzat,",
  "Riom, Issoire, Thiers, Ambert, Saint-Éloy-les-Mines, Volvic,",
  // Allier – 03
  "Montluçon, Vichy, Moulins, Cusset, Yzeure, Commentry, Désertines,",
  // Cantal – 15
  "Aurillac, Saint-Flour, Mauriac, Arpajon-sur-Cère, Ytrac,",
  // Haute-Loire – 43
  "Le Puy-en-Velay, Monistrol-sur-Loire, Yssingeaux, Brioude, Langeac,",
  // Gironde – 33
  "Bordeaux, Mérignac, Pessac, Talence, Gradignan, Bègles, Villenave-d'Ornon,",
  "Cenon, Lormont, Floirac, Bruges, Le Bouscat, Blanquefort, Eysines,",
  "Libourne, Arcachon, La Teste-de-Buch, Gujan-Mestras, Andernos-les-Bains,",
  "Langon, Bazas, Lesparre-Médoc, Pauillac, Blaye, Créon, Cadillac,",
  "Carbon-Blanc, Ambarès-et-Lagrave, Saint-André-de-Cubzac, Coutras,",
  "Saint-Médard-en-Jalles, Le Haillan, Martignas-sur-Jalle, Le Taillan-Médoc,",
  // Dordogne – 24
  "Périgueux, Bergerac, Sarlat-la-Canéda, Boulazac, Coulounieix-Chamiers,",
  "Trélissac, Terrasson-Lavilledieu, Nontron, Ribérac, Musidan, Thiviers,",
  // Lot-et-Garonne – 47
  "Agen, Villeneuve-sur-Lot, Marmande, Tonneins, Le Passage, Bon-Encontre,",
  // Landes – 40
  "Mont-de-Marsan, Dax, Biscarrosse, Mimizan, Parentis-en-Born, Saint-Paul-lès-Dax,",
  "Soustons, Capbreton, Labenne, Ondres, Tarnos, Saint-Vincent-de-Tyrosse,",
  // Pyrénées-Atlantiques – 64
  "Pau, Bayonne, Biarritz, Anglet, Hendaye, Saint-Jean-de-Luz,",
  "Oloron-Sainte-Marie, Orthez, Mourenx, Lons, Billère, Lescar, Jurançon,",
  "Hasparren, Cambo-les-Bains, Urrugne, Ciboure, Bidart, Guéthary,",
  // Charente-Maritime – 17
  "La Rochelle, Rochefort, Saintes, Royan, Tonnay-Charente, Aytré,",
  "Lagord, Périgny, Surgères, Saint-Jean-d'Angély, Marennes, Saujon,",
  // Charente – 16
  "Angoulême, Cognac, Soyaux, La Couronne, Ruelle-sur-Touvre, Gond-Pontouvre,",
  // Deux-Sèvres – 79
  "Niort, Bressuire, Thouars, Parthenay, Melle, Saint-Maixent-l'École,",
  // Vienne – 86
  "Poitiers, Châtellerault, Buxerolles, Chauvigny, Loudun, Montmorillon,",
  // Haute-Vienne – 87
  "Limoges, Saint-Junien, Panazol, Isle, Couzeix, Le Palais-sur-Vienne,",
  // Creuse – 23
  "Guéret, La Souterraine, Aubusson, Boussac, Sainte-Feyre,",
  // Corrèze – 19
  "Brive-la-Gaillarde, Tulle, Ussel, Malemort-sur-Corrèze, Égletons, Objat,",
  // Haute-Garonne – 31
  "Toulouse, Colomiers, Tournefeuille, Blagnac, Muret, Plaisance-du-Touch,",
  "Cugnaux, Balma, L'Union, Ramonville-Saint-Agne, Saint-Orens-de-Gameville,",
  "Castanet-Tolosan, Portet-sur-Garonne, Fonsorbes, Saint-Gaudens, Revel,",
  "Castelginest, Launaguet, Aucamville, Fenouillet, Saint-Alban, Pibrac,",
  // Tarn – 81
  "Albi, Castres, Gaillac, Mazamet, Lavaur, Graulhet, Carmaux, Lisle-sur-Tarn,",
  // Tarn-et-Garonne – 82
  "Montauban, Castelsarrasin, Moissac, Caussade, Valence-d'Agen, Négrepelisse,",
  // Hautes-Pyrénées – 65
  "Tarbes, Lourdes, Bagnères-de-Bigorre, Aureilhan, Bordères-sur-l'Échez, Séméac,",
  // Gers – 32
  "Auch, Condom, Fleurance, Lectoure, Mirande, Nogaro, L'Isle-Jourdain,",
  // Lot – 46
  "Cahors, Figeac, Gourdon, Souillac, Gramat, Saint-Céré, Prayssac,",
  // Aveyron – 12
  "Rodez, Millau, Villefranche-de-Rouergue, Onet-le-Château, Decazeville,",
  // Ariège – 09
  "Foix, Pamiers, Saint-Girons, Lavelanet, Mirepoix, Saverdun, Varilhes,",
  // Aude – 11
  "Carcassonne, Narbonne, Castelnaudary, Limoux, Lézignan-Corbières, Trèbes,",
  // Hérault – 34
  "Montpellier, Béziers, Sète, Lunel, Agde, Frontignan, Lattes, Mauguio,",
  "Castelnau-le-Lez, Le Crès, Jacou, Grabels, Juvignac, Saint-Jean-de-Védas,",
  "Pérols, Palavas-les-Flots, Marseillan, Pézenas, Lodève, Clermont-l'Hérault,",
  // Gard – 30
  "Nîmes, Alès, Bagnols-sur-Cèze, Beaucaire, Vauvert, Villeneuve-lès-Avignon,",
  "Saint-Gilles, Pont-du-Gard, Uzès, Le Grau-du-Roi, Aigues-Mortes, Sommières,",
  // Pyrénées-Orientales – 66
  "Perpignan, Canet-en-Roussillon, Saint-Estève, Rivesaltes, Elne, Argelès-sur-Mer,",
  "Céret, Prades, Thuir, Pia, Bompas, Saint-Laurent-de-la-Salanque, Cabestany,",
  // Bouches-du-Rhône – 13
  "Marseille, Aix-en-Provence, Arles, Martigues, Aubagne, Istres,",
  "Salon-de-Provence, Vitrolles, Marignane, La Ciotat, Les Pennes-Mirabeau,",
  "Miramas, Fos-sur-Mer, Port-de-Bouc, Berre-l'Étang, Gardanne,",
  "Trets, Gémenos, Roquevaire, La Penne-sur-Huveaune, Plan-de-Cuques,",
  "Allauch, Septèmes-les-Vallons, Cabriès, Simiane-Collongue,",
  "Châteauneuf-les-Martigues, Carry-le-Rouet, Sausset-les-Pins, Pertuis,",
  "Peyrolles-en-Provence, Lambesc, Pélissanne, Eyguières, Mallemort,",
  "Tarascon, Saint-Rémy-de-Provence, Les Baux-de-Provence, Châteaurenard,",
  // Var – 83
  "Toulon, Fréjus, Draguignan, Hyères, La Seyne-sur-Mer, Six-Fours-les-Plages,",
  "Sanary-sur-Mer, Bandol, Saint-Raphaël, Brignoles, Le Muy, Vidauban,",
  "La Garde, La Valette-du-Var, Ollioules, Le Pradet, Carqueiranne,",
  "Sainte-Maxime, Saint-Tropez, Cogolin, Grimaud, Le Lavandou, Bormes-les-Mimosas,",
  "Lorgues, Trans-en-Provence, Les Arcs, Puget-sur-Argens, Roquebrune-sur-Argens,",
  // Alpes-Maritimes – 06
  "Nice, Cannes, Antibes, Grasse, Cagnes-sur-Mer, Le Cannet, Menton,",
  "Mandelieu-la-Napoule, Mougins, Vallauris, Valbonne, Biot, Villeneuve-Loubet,",
  "Saint-Laurent-du-Var, Vence, Carros, La Trinité, Beausoleil, Roquebrune-Cap-Martin,",
  "Mouans-Sartoux, Pégomas, La Colle-sur-Loup, Tourrette-Levens, Contes,",
  // Vaucluse – 84
  "Avignon, Carpentras, Orange, Cavaillon, L'Isle-sur-la-Sorgue,",
  "Apt, Pertuis, Le Pontet, Sorgues, Entraigues-sur-la-Sorgue,",
  "Bollène, Monteux, Pernes-les-Fontaines, Bédarrides, Courthézon, Vaison-la-Romaine,",
  // Alpes-de-Haute-Provence – 04
  "Digne-les-Bains, Manosque, Sisteron, Forcalquier, Château-Arnoux-Saint-Auban,",
  "Oraison, Castellane, Barcelonnette, Moustiers-Sainte-Marie,",
  // Hautes-Alpes – 05
  "Gap, Briançon, Embrun, Laragne-Montéglin, Veynes, Guillestre, L'Argentière-la-Bessée,",
  // Corse – 2A/2B
  "Ajaccio, Bastia, Porto-Vecchio, Calvi, Corte, Propriano, Sartène,",
  "Biguglia, Borgo, Lucciana, Furiani, Ghisonaccia, Aléria, Île-Rousse,",
  // DOM-TOM
  "Fort-de-France, Le Lamentin, Schoelcher, Le Robert, Ducos, Saint-Joseph,",
  "Pointe-à-Pitre, Les Abymes, Baie-Mahault, Le Gosier, Sainte-Anne, Le Moule,",
  "Saint-Denis-de-la-Réunion, Saint-Pierre, Le Tampon, Saint-Paul, Saint-Louis,",
  "Le Port, La Possession, Saint-André, Saint-Benoît, Sainte-Marie-de-la-Réunion,",
  "Cayenne, Kourou, Matoury, Rémire-Montjoly, Saint-Laurent-du-Maroni,",
  "Mamoudzou, Koungou, Dzaoudzi, Pamandzi, Dembéni, Sada,",
  "Nouméa, Dumbéa, Mont-Dore, Païta, Koné, Lifou, Bourail.",
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
