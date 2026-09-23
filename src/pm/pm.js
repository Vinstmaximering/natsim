// PM sub-app entry-point.
// Lyssnar på postMessage från huvudfönstret:
//   {type:'data', payload:{...}}  → initierar UI med simuleringsdata
//   {type:'load-draft'}           → laddar utkast från localStorage
//
// Postar tillbaka:
//   {type:'ready'}                → när sidan är laddad
//   {type:'save-draft', payload}  → när utkast sparas (vid stegbyte eller spara-knapp)
//
// Etapp 3: guiden har sex steg. Steg 3 (Punkter och markering) tillkom med
// v6-kraven på markeringstyp (§2.4.1 K3), tillståndsbedömning (§2.1 K5) och
// gemensamma markeringar (§2.11.2 K4). Filnamnen på de efterföljande stegen är
// oförändrade – step3-instruments.js är alltså steg 4, step4-images.js steg 5
// och step5-report.js steg 6. Numret i filnamnet säger inget om ordningen;
// STEPS-tabellen nedan gör det.
import { render as renderProject }  from './steps/step1-project.js';
import { render as renderReference } from './steps/step2-reference.js';
import { render as renderPoints, collectTables } from './steps/step3-points.js';
import { render as renderInstr }    from './steps/step3-instruments.js';
import { render as renderImages }   from './steps/step4-images.js';
import { render as renderReport }   from './steps/step5-report.js';
import { migreraUtkast }            from './tdok-v6.js';

// ── PM-state ──────────────────────────────────────────────────────────────
let D    = null;   // payload från huvudfönstret
let imgs = {};     // bilddata (Data URLs)
let vals = {};     // sparade formulärvärden
let cur  = 1;      // aktuellt steg (1–6)

const DRAFT_KEY = "pm_draft";
const IMGS_KEY  = "pm_imgs";

// Ett steg = etikett + renderare + knapp-id:n som leder vidare och tillbaka.
// Tabellen är enda stället ordningen står, så ett nytt steg läggs till här.
const STEPS = [
  { label: "Projekt &amp; Personal", render: renderProject,   next: "btn-next1" },
  { label: "Referenssystem",         render: renderReference, back: "btn-back2", next: "btn-next2" },
  { label: "Punkter &amp; Markering", render: renderPoints,   back: "btn-back3", next: "btn-next3" },
  { label: "Instrument &amp; Metod", render: renderInstr,     back: "btn-back4", next: "btn-next4" },
  { label: "Bilder",                 render: renderImages,    back: "btn-back5", gen: "btn-gen" },
  { label: "Rapport (PDF)",          render: renderReport,    back: "btn-back6" },
];

// ── Navigering ───────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  nav.innerHTML = "";
  STEPS.forEach((step, i) => {
    const n = i + 1;
    const btn = document.createElement("button");
    btn.className = "nb" + (n < cur ? " was" : n === cur ? " on" : "");
    btn.innerHTML = `<span class="nc">${n}</span>${step.label}`;
    btn.addEventListener("click", () => go(n));
    nav.appendChild(btn);
  });
}

function collectCurrentVals() {
  document.querySelectorAll("[id^='v_']").forEach(el => {
    vals[el.id.slice(2)] = el.value;
  });
  // Steg 3:s tabeller är objekt nycklade på punkt-id och kan inte samlas in av
  // svepningen ovan. De skrivs direkt i vals av sina lyssnare; anropet
  // säkerställer bara att nycklarna finns även om steget aldrig öppnats.
  collectTables(vals);
}

function saveDraft() {
  collectCurrentVals();
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ vals }));
    // Bilder sparas separat (kan vara stora)
    const imgsStr = JSON.stringify(imgs);
    if (imgsStr.length < 5_000_000) localStorage.setItem(IMGS_KEY, imgsStr);
  } catch {}
  // Posta tillbaka till huvudfönstret
  window.opener?.postMessage({ type: "save-draft", payload: { vals } }, "*");
}

function loadDraft() {
  try { vals  = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}").vals || {}; } catch {}
  try { imgs  = JSON.parse(localStorage.getItem(IMGS_KEY)  || "{}"); } catch {}
  // Etapp 3: ett utkast sparat före v6 har bara v_nats och ingen
  // täckningsfaktor. migreraUtkast() är idempotent, så den kan köras på varje
  // laddning utan att röra ett redan migrerat utkast.
  vals = migreraUtkast(vals);
  window._pmImgs = imgs;
}

function go(n) {
  saveDraft();
  cur = n;
  buildNav();
  renderStep(n);
  window.scrollTo(0, 0);
}

function renderStep(n) {
  const container = document.getElementById("app");
  if (!container || !D) return;
  container.innerHTML = "";

  const step = STEPS[n - 1];
  if (!step) return;

  step.render(D, container, vals, imgs);

  if (step.back) wireNavBtn(step.back, n - 1);
  if (step.next) wireNavBtn(step.next, n + 1);
  if (step.gen) {
    document.getElementById(step.gen)?.addEventListener("click", () => {
      collectCurrentVals();
      go(n + 1);
    });
  }
}

function wireNavBtn(id, target) {
  document.getElementById(id)?.addEventListener("click", () => go(target));
}

// ── postMessage-protokoll ─────────────────────────────────────────────────
window.addEventListener("message", e => {
  if (e.data?.type === "data") {
    D = e.data.payload;
    loadDraft();
    buildNav();
    go(1);
  }
});

// ── Spara utkast-knapp ───────────────────────────────────────────────────
document.getElementById("btn-draft")?.addEventListener("click", () => {
  saveDraft();
  const btn = document.getElementById("btn-draft");
  if (btn) { btn.textContent = "✓ Sparat"; setTimeout(() => { btn.textContent = "💾 Spara utkast"; }, 1500); }
});

// ── Signalera att sidan är klar ──────────────────────────────────────────
// Väntar tills DOM är redo sedan postar 'ready' till öppnaren.
window.opener?.postMessage({ type: "ready" }, "*");
