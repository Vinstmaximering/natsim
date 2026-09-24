// Delade byggstenar för PM-rapportens fyra mallar (Etapp 4).
//
// Allt här är RENA FUNKTIONER som tar ett förberett ctx och returnerar HTML.
// Ingen DOM, inga globaler – mallarna kan därför testas utan webbläsare.
//
// KÄLLPRINCIP. Varje rubrik, gränsvärde och automatisk kontroll bär sin källa.
// Rubriker som kommer ur normen får sin paragraf via H1/H2:s kalla-argument.
// Sådant som är NätSims eget val – urval, ordning, formuleringar utan
// normstöd – märks med `produktval()` och ska inte se ut som ett krav.

import { nf, komma } from '../../core/format.js';
import { ptLabel, klassificeraKtal, K_R_KALLA } from '../../core/constants.js';
import { SLOT_LABEL } from '../image-presets.js';

// ── Grundläggande HTML-hjälp ────────────────────────────────────────────────

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Radbrytningar i fritext blir <br> – men texten escapas först. */
export const escFlerrad = s => esc(s).replace(/\n/g, "<br>");

/** Källhänvisning efter en rubrik. Alltid samma form, alltid dämpad. */
export const kallaSpan = k => k ? ` <span class="rkalla">${esc(k)}</span>` : "";

export const H1 = (text, kalla) => `<h1 class="r">${esc(text)}${kallaSpan(kalla)}</h1>`;
export const H2 = (text, kalla) => `<h2 class="r">${esc(text)}${kallaSpan(kalla)}</h2>`;

/**
 * H2 som utelämnas helt när mallen inte vill ha någon underrubrik. Används när
 * den överordnade H1:an redan säger samma sak – en underrubrik som upprepar
 * sin överrubrik bär ingen information och delar bara upp texten i onödan.
 */
export const H2opt = (text, kalla) => (text ? H2(text, kalla) : "");

/** Avsnitt som är NätSims eget val och inte ett normkrav. */
export const produktval = text =>
  `<p class="rprodukt"><strong>Information:</strong> ${esc(text)} Detta är NätSims eget ` +
  `upplägg och inget krav i TDOK 2014:0571 eller SIS-TS 21143:2016.</p>`;

/** Fritextstycke, eller inget alls om texten är tom. */
export const stycke = t => t ? `<p class="r">${escFlerrad(t)}</p>` : "";

/** Fritextstycke med en dämpad platshållare när fältet är tomt. */
export const styckeEllerTomt = (t, platshallare) => t
  ? `<p class="r">${escFlerrad(t)}</p>`
  : `<p class="r rtom">${esc(platshallare)}</p>`;

/** Två-kolumnstabell: [[etikett, värde], …]. Tomma rader utelämnas inte. */
export const metaTabell = rader =>
  `<table class="rm">${rader.map(([k, v]) =>
    `<tr><td>${esc(k)}</td><td>${v == null || v === "" ? '<span class="rtom">–</span>' : escFlerrad(v)}</td></tr>`
  ).join("")}</table>`;

/** Datatabell med rubrikrad. rader är färdig HTML per <tr>. */
export const dataTabell = (kolumner, rader, tomText = "Inga uppgifter.") =>
  rader
    ? `<table class="r"><tr>${kolumner.map(k => `<th>${esc(k)}</th>`).join("")}</tr>${rader}</table>`
    : `<p class="r rtom">${esc(tomText)}</p>`;

export const mono = v => `<td style="text-align:right;font-family:monospace">${v}</td>`;

// ── Förberedelse: ctx ur data ───────────────────────────────────────────────
// Samlar allt mallarna behöver på ett ställe, så att ingen mall gör sin egen
// tolkning av vals eller sin egen statistik.

export function prep(data) {
  const { vals = {}, sr, redund = [], ptRes = [], allPts = [], knownPts = [],
          mk, mkKey = "", crs, ins, mHz, mDm, mDp, mSt, dag, centerErr,
          img = "", imgs = {}, dok = null } = data;

  const v = k => (vals[k] || "").toString().trim();

  // Punkt-id som finns i nätet. Tabellerna i vals är nycklade på punkt-id, och
  // en nyckel utan punkt får aldrig nå rapporten – därför slås värden alltid
  // upp utifrån nätets punkter och aldrig genom att iterera över nycklarna.
  const ptIds = new Set(allPts.map(p => p.id));
  const markering = vals.markering || {};
  const tillstand = vals.tillstand || {};
  const gemensam  = vals.gemensam  || {};

  const kKlass = klassificeraKtal(sr.K_global);

  const ctx = {
    vals, v, sr, redund, ptRes, allPts, knownPts, mk, mkKey, crs, ins,
    mHz, mDm, mDp, mSt, dag, centerErr, img, imgs, dok,
    ptIds, markering, tillstand, gemensam,
    kKlass,

    // Grunduppgifter
    proj: v("proj") || "–", projnr: v("projnr") || "–",
    best: v("best") || "–", utf: v("utf") || "–",
    ans: v("ans") || "–", berakn: v("berakn") || "–", falt: v("falt") || "–",
    rapdat: v("rapdat") || dag,
    sek: v("sek") || "Öppen",
    docid: v("docid"),
    matdat: v("matdat"),

    // Verksamhet och nättyp
    verksamhet: v("verksamhet"),
    nattyp: v("nattyp"),

    // §2.5 K2
    syfte: v("syfte"), anslutning: v("anslutning"), genomforande: v("genomforande"),
    tidplan: v("tidplan"), tidstart: v("tidstart"), tidslut: v("tidslut"),
    gnsssess: v("gnsssess"),

    // §1.1
    behtyp: v("behtyp"), behnr: v("behnr"),
    erfprojekt: v("erfprojekt"), erfmiljo: v("erfmiljo"),
    kompetens: v("kompetens"),

    // §1.2, §1.6
    plansys: v("plansys") || crs, hoj: v("hoj") || "RH 2000",
    geo: v("geo") || "SWEN17_RH2000", kodsystem: v("kodsystem"),
    kordkalla: v("kordkalla") || "–", kordkval: v("kordkval"),

    // Instrument och utrustning
    instrV: v("instr") || ins, serienr: v("serienr"), kalib: v("kalib"),
    tvang: v("tvang"), tvangutr: v("tvangutr"),
    termometer: v("termometer"), barometer: v("barometer"), gnssutr: v("gnssutr"),
    swfalt: v("swfalt") || "–", swber: v("swber") || "–",
    metod: v("metod"), korr: v("korr"), omdome: v("omdome"),

    // Toleranskrav
    kravStr: v("krav"), kravk: v("kravk") || "2",
    krav2: v("krav2"),

    // Leverans
    leverans: v("leverans"), levformat: v("levformat"),

    // Bildtexter
    txt: { r32: v("r32txt"), r33: v("r33txt"), r34: v("r34txt"), r312: v("r312txt") },
  };

  // Punktstatistik
  const spv = ptRes.map(r => r.sigPos * 1000);
  ctx.spMax  = spv.length ? nf(Math.max(...spv), 2) : "–";
  ctx.spMean = spv.length ? nf(spv.reduce((a, b) => a + b, 0) / spv.length, 2) : "–";
  ctx.kravSP = parseFloat(ctx.kravStr) || null;

  const ris = redund.map(r => r.ri);
  ctx.rStd = 0;
  if (ris.length) {
    const m = ris.reduce((a, b) => a + b, 0) / ris.length;
    ctx.rStd = Math.sqrt(ris.reduce((a, b) => a + (b - m) * (b - m), 0) / ris.length);
  }

  const mufD = redund.filter(r => r.type === "dist" && r.mdb).map(r => r.mdb.val * 1000);
  const mufH = redund.filter(r => r.type === "hz" && r.mdb).map(r => r.mdb.val);
  ctx.mufMaxD = mufD.length ? nf(Math.max(...mufD), 1) : "–";
  ctx.mufMaxH = mufH.length ? nf(Math.max(...mufH), 3) : "–";
  const ytD = redund.filter(r => r.type === "dist" && r.yt_m != null && r.yt_m !== Infinity)
                    .map(r => r.yt_m * 1000);
  ctx.ytMaxD = ytD.length ? nf(Math.max(...ytD), 1) : "–";

  // Antal gemensamma markeringar (§2.11.2 K4) – bara punkter som finns i nätet.
  ctx.nGemensam = allPts.filter(p => gemensam[p.id]).length;

  // §2.11.2 K2: lagret användaren pekat ut som byggnadsverk, om något. Slås upp
  // ur de lager huvudfönstret skickat – ett sparat lager-id som inte längre
  // finns ger null, och kontrollen blir då "kontrolleras manuellt".
  // Källan för k- och r-gränserna. K_R_KALLA är huvudappens formulering, med
  // TDOK som upplysning – den passar när projekttypen är okänd. I mall D VET vi
  // att uppdraget ligger utanför Trafikverket, och då ska TDOK inte nämnas
  // alls. Mall A–C vet tvärtom att TDOK gäller.
  ctx.kravKalla = ctx.dok?.mall === 'D' ? 'SIS-TS 21143:2016 §6.2.2' : K_R_KALLA;

  ctx.visuellaLager = data.visuellaLager || [];
  ctx.byggnadsverk  = ctx.visuellaLager.find(l => l.id === vals.byggnadsverkLager) || null;

  return ctx;
}

/** Markeringstypens text för en punkt, "PP · Dubb i berg". */
export function markeringText(ctx, id) {
  const m = ctx.markering[id];
  if (!m) return "";
  return [m.typkod, m.typ].filter(Boolean).join(" · ");
}

// ── Försättsblad ────────────────────────────────────────────────────────────

export function forsattsblad(ctx) {
  const logo = ctx.imgs.logo
    ? `<img class="rlogo" src="${ctx.imgs.logo}" alt="Logo">`
    : `<div style="height:10mm"></div>`;

  const normrad = ctx.dok?.mall === 'D'
    ? 'SIS-TS 21143:2016 · HMK – Stommätning 2024'
    : 'TDOK 2014:0571 version 6.0 · SIS-TS 21143:2016 · HMK – Stommätning 2024';

  const rader = [
    ['Projektnummer', ctx.projnr],
    ['Beställare', ctx.best],
    ['Utförare', ctx.utf],
    ['Verksamhet', verksamhetText(ctx.verksamhet)],
    ['Nättyp', nattypText(ctx)],
  ];
  if (ctx.docid) rader.push(['Dokument-ID', ctx.docid]);
  if (ctx.mkKey) rader.push(['Mätklass', `${ctx.mkKey} (SIS-TS 21143:2016 Tabell A.9)`]);
  rader.push(['Datum', ctx.rapdat]);

  // Nätbedömningen på försättsbladet: ett underkänt nät får aldrig se
  // godtagbart ut i det första en beställare läser.
  const netTxt = ctx.kKlass.uppfyllerNorm ? '✓ UPPFYLLER NORMEN' : '✗ UPPFYLLER INTE NORMEN';
  const netCls = ctx.kKlass.uppfyllerNorm ? 'rok' : 'rerr';

  return `<div class="rc">
    ${logo}
    <div class="rbg">${esc(ctx.dok?.typ || 'Mätningsteknisk planering')}</div>
    <div class="rtit">${esc(ctx.proj)}</div>
    <div class="rsub">${esc(dokUndertext(ctx))}</div>
    <div class="rmet">
      ${rader.map(([k, val]) => `<div><strong>${esc(k)}:</strong> ${esc(val)}</div>`).join("")}
      <div><strong>Nätbedömning:</strong>
        <span class="${netCls}">${netTxt} (k=${nf(ctx.sr.K_global, 3)})</span></div>
    </div>
    <div class="rstd">${esc(normrad)} | ${esc(ctx.sek)}</div>
  </div>`;
}

const VERKSAMHET_TEXT = { vag: 'Väg', jarnvag: 'Järnväg', 'ej-tv': 'Ej Trafikverket' };
export const verksamhetText = v => VERKSAMHET_TEXT[v] || '– ej vald –';

export function nattypText(ctx) {
  return ctx.dok?.nattypLabel || '– ej vald –';
}

function dokUndertext(ctx) {
  if (!ctx.dok) return 'Stomnät i plan';
  return `Stomnät i plan – ${ctx.dok.typ} enligt ${ctx.dok.kalla}`;
}

// ── Varning när dokumenttypen inte är bestämd ───────────────────────────────

export const dokumenttypSaknas = () => `<div class="rb">
  <div class="rbox berr">
    <strong>⚠ Dokumenttypen är inte bestämd.</strong>
    Verksamhet och nättyp är inte valda i steg 1. Vilket dokument som ska tas fram
    – Redovisning av planerat stomnät, Åtgärdsförslag eller Mätningsprogram – följer
    av de valen (TDOK 2014:0571 v6.0 §2.5, §1.7). Dokumentet nedan visas tills vidare
    med neutral struktur och följer ingen bestämd dokumenttyp. Gå tillbaka till steg 1
    och välj innan det lämnas till beställaren.
  </div></div>`;

// ── Gällande föreskrifter ───────────────────────────────────────────────────
// Titlar och versioner ordagrant. SIS-TS är licensierad – bara titel och
// avsnittsnummer återges, aldrig normtext.

export function foreskrifter(ctx, kalla) {
  const rader = [];
  if (ctx.dok?.mall !== 'D') {
    rader.push(['TDOK 2014:0571 version 6.0',
      'Geodetiska mätningsarbeten och geografisk lägesbestämning – Väg och järnväg',
      'Trafikverkets krav']);
    rader.push(['TDOK 2016:0257', 'Referenssystem i plan och höjd', 'Referenssystem, realisering och geoidmodell (§1.2)']);
  }
  rader.push(['SIS-TS 21143:2016',
    'Byggmätning – Geodetisk mätning, beräkning och redovisning av byggnadsverk och infrastruktur',
    ctx.dok?.mall === 'D' ? 'Primär standard' : 'Mätklass, simulering och viktsättning']);
  rader.push(['HMK – Stommätning 2024', 'Handbok i mät- och kartfrågor, Lantmäteriet',
    'Grundutföranden och kvalitetsmått']);
  if (ctx.kodsystem) rader.push([esc(ctx.kodsystem), 'Kodning', 'Kodsystem (§1.6)']);

  return H2('Gällande föreskrifter', kalla) +
    dataTabell(['Dokument', 'Titel', 'Tillämpning'],
      rader.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join(""));
}

// ── Personal och behörighet (§1.1) ──────────────────────────────────────────

export function personal(ctx, kalla, rubrik = 'Personal') {
  const rader = [
    ['Ansvarig mätingenjör', ctx.ans],
    ['Behörighetstyp', ctx.behtyp],
    ['Behörighetsintyg nr', ctx.behnr],
    ['Beräkning och rapportering', ctx.berakn],
    ['Fältpersonal', ctx.falt],
  ];
  if (ctx.verksamhet === 'jarnvag') {
    rader.push(['Erfarenhet av likartat järnvägsprojekt', ctx.erfprojekt]);
    rader.push(['Erfarenhet av mätning i järnvägsmiljö', ctx.erfmiljo]);
  }
  if (ctx.kompetens) rader.push(['Kompetenskrav', ctx.kompetens]);

  const not = ctx.verksamhet === 'jarnvag'
    ? '§1.1 K1: ansvarig ska ha giltigt behörighetsintyg utfärdat av Trafikverket enligt ' +
      'TDOK 2018:0008 med den behörighetstyp som kravställs. §1.1 K2–K3: dokumenterad ' +
      'erfarenhet av likartat järnvägsprojekt och av mätning i järnvägsmiljö.'
    : '§1.1 K1: ansvarig ska ha giltigt behörighetsintyg utfärdat av Trafikverket enligt ' +
      'TDOK 2018:0008 med den behörighetstyp som kravställs.';

  return H2opt(rubrik, kalla) + metaTabell(rader) +
    (ctx.dok?.mall === 'D' ? '' : `<p class="rnot">${esc(not)}</p>`);
}

// ── Referenssystem (§1.2) och kodning (§1.6) ────────────────────────────────

export function referenssystem(ctx, kalla, rubrik = 'Referenssystem och kodning') {
  const rader = [
    ['Referenssystem i plan', `${ctx.plansys} (konfigurerat i NätSim: ${ctx.crs})`],
    ['Referenssystem i höjd', ctx.hoj],
    ['Geoidmodell', ctx.geo],
  ];
  if (ctx.kodsystem) rader.push(['Kodsystem', ctx.kodsystem]);

  const not = ctx.dok?.mall === 'D' ? '' :
    `<p class="rnot">Referenssystem i plan och höjd, realisering och geoidmodell enligt ` +
    `TDOK 2016:0257 (TDOK 2014:0571 v6.0 §1.2).` +
    (ctx.kodsystem ? ` Kodning enligt TDOK 2014:0571 v6.0 §1.6.` : '') + `</p>`;

  return H2opt(rubrik, kalla) + metaTabell(rader) + not;
}

// ── Utgångspunkter: kända punkter ───────────────────────────────────────────

export function kandaPunkter(ctx, rubrik, kalla) {
  const rader = ctx.knownPts.map(p => `<tr>
    <td style="font-weight:700">${esc(p.id)}</td>
    ${mono(nf(p.N, 4))}${mono(nf(p.E, 4))}${mono(nf(p.H, 4))}
    <td>${esc(markeringText(ctx, p.id) || p.markering || "–")}</td></tr>`).join("");

  return H2(rubrik, kalla) +
    `<p class="r">Koordinatkälla: ${esc(ctx.kordkalla)}</p>` +
    (ctx.kordkval ? `<p class="r">Bedömning av koordinatkvalitet: ${escFlerrad(ctx.kordkval)}</p>` : "") +
    dataTabell(['Punkt', 'N (m)', 'E (m)', 'H (m)', 'Markering'], rader,
      'Nätet har inga kända anslutningspunkter.');
}

// ── Planerade punkter och markeringstyper (§2.4.1 K3) ───────────────────────

export function planeradePunkter(ctx, rubrik, kalla) {
  const nya = ctx.allPts.filter(p => p.type !== 'known');
  const rader = nya.map(p => `<tr>
    <td style="font-weight:700">${esc(p.id)}</td>
    <td>${ptLabel(p.type)}</td>
    ${mono(nf(p.N, 4))}${mono(nf(p.E, 4))}
    <td>${esc(markeringText(ctx, p.id) || "–")}</td>
    <td>${esc(p.prisma || "–")}</td></tr>`).join("");

  return H2(rubrik, kalla) +
    dataTabell(['Punkt', 'Typ', 'N (m)', 'E (m)', 'Markeringstyp', 'Prisma'], rader,
      'Nätet har inga planerade nypunkter.') +
    `<p class="rnot">Markeringstyperna är valda ur TDOK 2014:0571 v6.0 §2.4.1 K3 Tabell 2. ` +
    `Typkoden (PP eller FIX) står före markeringstypen.</p>`;
}

/**
 * Hela punktförteckningen, alla typer.
 *
 * `produktvalText` gör avsnittet till information i stället för krav. I mall
 * A–C är det NätSims eget tillägg: varken §2.5 K2 eller §1.7 K1 kräver en
 * koordinatförteckning, och SIS-TS Bilaga B R3.13 hör till kolumn R
 * (redovisning), inte till kolumn P (planering) som mallarna följer.
 */
export function allaPunkter(ctx, rubrik, kalla, produktvalText = null) {
  const rader = ctx.allPts.map(p => `<tr>
    <td style="font-weight:${p.type === 'known' ? '700' : 'normal'}">${esc(p.id)}</td>
    <td>${ptLabel(p.type)}</td>
    ${mono(nf(p.N, 4))}${mono(nf(p.E, 4))}${mono(nf(p.H, 4))}
    <td>${esc(markeringText(ctx, p.id) || p.markering || "–")}</td>
    <td>${esc(p.prisma || "–")}</td></tr>`).join("");

  return H2opt(rubrik, kalla) +
    (produktvalText ? produktval(produktvalText) : "") +
    dataTabell(['Punkt', 'Typ', 'N (m)', 'E (m)', 'H (m)', 'Markeringstyp', 'Prisma'], rader);
}

// ── Tillståndsbedömning (§2.1 K5) ───────────────────────────────────────────

export function tillstandsbedomning(ctx, rubrik, kalla) {
  // Bara punkter som finns i nätet – nycklar utan punkt tas aldrig med.
  const rader = ctx.knownPts.map(p => {
    const t = ctx.tillstand[p.id] || {};
    return `<tr>
      <td style="font-weight:700">${esc(p.id)}</td>
      <td>${esc(t.kat || "–")}</td>
      <td>${esc(t.sikt || "–")}</td>
      <td>${esc(t.datum || "–")}</td></tr>`;
  }).join("");

  const bedomda = ctx.knownPts.filter(p => ctx.tillstand[p.id]?.kat).length;

  return H2(rubrik, kalla) +
    dataTabell(['Punktnummer', 'Kategori', 'Siktförhållande', 'Tidpunkt'], rader,
      'Nätet har inga befintliga stompunkter att bedöma.') +
    `<p class="rnot">§2.1 K2 anger kategorierna. §2.1 K3: siktförhållandet ska bedömas. ` +
    `§2.1 K5: redovisningen ska minst omfatta punktnummer, kategori, siktförhållande och ` +
    `tidpunkt. ${bedomda} av ${ctx.knownPts.length} punkter är bedömda.</p>`;
}

// ── Bilder ──────────────────────────────────────────────────────────────────

/** Bildavsnitt för en slot. Rubrik och källa sätts av mallen. */
export function bild(ctx, slot, rubrik, kalla, bildtext) {
  const src = ctx.imgs[slot] || (slot === 'r32' ? ctx.img : "");
  const txt = ctx.txt[slot];
  return H2opt(rubrik, kalla) +
    stycke(txt) +
    (src
      ? `<div class="fig"><img src="${src}" style="max-width:155mm">
         <div class="fcp">${esc(bildtext || SLOT_LABEL[slot])}</div></div>`
      : `<p class="r rtom">Ingen bild vald. Bilder skapas i steg 5.</p>`);
}

// ── Stommätningsplan ────────────────────────────────────────────────────────
// Definition (TDOK v6 s. 8): grafisk redovisning av de tänkta observationerna
// vid kommande stommätning så att nätets utformning åskådliggörs; kan redovisas
// schematiskt. Bilden är nätkartan med mätningarna utritade; listan under är
// samma observationer i text.

export function stommatningsplan(ctx, rubrik, kalla) {
  const rader = (ctx.redund || [])
    .filter(r => r.type === 'dist')
    .map(r => `<tr><td style="font-weight:700">${esc(r.fromId)} → ${esc(r.toId)}</td>
      ${mono(r.d != null ? nf(r.d, 1) : "–")}</tr>`).join("");

  return bild(ctx, 'r34', rubrik, kalla,
              'Stommätningsplan – planerade observationer') +
    dataTabell(['Planerad observation', 'Avstånd (m)'], rader,
      'Nätet har inga planerade observationer.') +
    `<p class="rnot">Stommätningsplanen redovisar de tänkta observationerna grafiskt så att ` +
    `nätets utformning åskådliggörs, och får redovisas schematiskt (TDOK 2014:0571 v6.0, ` +
    `definition s. 8). Varje rad avser en uppställning med riktning och avstånd.</p>`;
}

// ── Tidplan (§2.5 K2) ───────────────────────────────────────────────────────

export function tidplan(ctx, rubrik, kalla) {
  const rader = [];
  if (ctx.tidstart || ctx.tidslut) {
    rader.push(['Period', [ctx.tidstart, ctx.tidslut].filter(Boolean).join(' – ')]);
  }
  if (ctx.matdat) rader.push(['Planerat fältmätningsdatum', ctx.matdat]);
  rader.push(['Tidplan', ctx.tidplan]);
  if (ctx.gnsssess) rader.push(['Sessionsindelning vid GNSS-mätning', ctx.gnsssess]);

  return H2opt(rubrik, kalla) + metaTabell(rader);
}

// ── Instrument och utrustning ───────────────────────────────────────────────

export function instrument(ctx, rubrik, kalla) {
  const rader = [
    ['Totalstation', ctx.instrV],
    ['Serienummer', ctx.serienr],
    ['Kalibrering / verifikat', ctx.kalib],
    ['Tvångscentrering', ctx.tvangutr || ctx.tvang],
    ['Termometer', ctx.termometer],
    ['Barometer', ctx.barometer],
  ];
  if (ctx.gnssutr) rader.push(['GNSS-mottagare och antenner', ctx.gnssutr]);

  const not = ctx.dok?.mall === 'D' ? '' :
    `<p class="rnot">§2.8 K15: tvångscentrering ska användas. §2.8 K19: temperatur och ` +
    `lufttryck ska mätas med kalibrerad termometer och barometer. Kontrolleras i ` +
    `kravtabellen nedan.</p>`;

  return H2opt(rubrik, kalla) + metaTabell(rader) + not;
}

export function programvaror(ctx, rubrik, kalla) {
  return H2opt(rubrik, kalla) + metaTabell([
    ['Fältprogramvara', ctx.swfalt],
    ['Beräkningsprogramvara', ctx.swber],
    ['Simulering och analys', 'NätSim'],
  ]) + `<p class="rnot">Programvaror inklusive version (SIS-TS 21143:2016 Bilaga B R3.11).</p>`;
}

export function matklass(ctx, rubrik, kalla) {
  if (!ctx.mkKey || !ctx.mk) return "";
  return H2(rubrik, kalla) +
    `<div class="rbox">${esc(ctx.mk.beskrivning)}</div>` +
    dataTabell(['Parameter', 'Krav'], [
      ['Totalstation', esc(ctx.mk.totalstation)],
      ['σ riktning', `${komma(ctx.mk.sigHz_mgon)} mgon`],
      ['σ avstånd', `${komma(ctx.mk.sigDist_mm)} mm + ${komma(ctx.mk.sigDist_ppm)} ppm`],
      ['Helsatser', `≥${ctx.mk.numSatser}`],
      ['Centrering', `${komma(ctx.mk.centerErr)} mm`],
    ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join(""));
}

// ── Metod och genomförande ──────────────────────────────────────────────────

export function genomforande(ctx, rubrik, kalla) {
  return H2(rubrik, kalla) +
    styckeEllerTomt(ctx.genomforande, 'Planerat genomförande anges i steg 1.') +
    (ctx.metod ? H2('Mätmetod') + stycke(ctx.metod) : "") +
    (ctx.korr ? H2('Korrektioner') + stycke(ctx.korr) : "");
}

// ── Leverans ────────────────────────────────────────────────────────────────

export function leverans(ctx, rubrik, kalla) {
  return H2(rubrik, kalla) + metaTabell([
    ['Leveransomfattning', ctx.leverans],
    ['Leveransformat', ctx.levformat],
  ]) + `<p class="rnot">Leveransomfattning och leveransformat ` +
    `(SIS-TS 21143:2016 Bilaga B R4.1 och R4.2).</p>`;
}

// ── Godkännanderad ──────────────────────────────────────────────────────────

export const godkannande = (text, kalla) =>
  `<div class="rbox bwrn"><strong>Godkännande:</strong> ${esc(text)}${kallaSpan(kalla)}</div>`;

