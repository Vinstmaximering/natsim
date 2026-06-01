// PM sub-app entry-point.
// Lyssnar på postMessage från huvudfönstret:
//   {type:'data', payload:{...}}  → initierar UI med simuleringsdata
//   {type:'load-draft'}           → laddar utkast från localStorage
//
// Postar tillbaka:
//   {type:'ready'}                → när sidan är laddad
//   {type:'save-draft', payload}  → när utkast sparas (vid stegbyte eller spara-knapp)
import { render as renderStep1 } from './steps/step1-project.js';
import { render as renderStep2 } from './steps/step2-reference.js';
import { render as renderStep3 } from './steps/step3-instruments.js';
import { render as renderStep4, collectFormValues as collectStep4 } from './steps/step4-images.js';
import { render as renderStep5 } from './steps/step5-report.js';

// ── PM-state ──────────────────────────────────────────────────────────────
let D    = null;   // payload från huvudfönstret
let imgs = {};     // bilddata (Data URLs)
let vals = {};     // sparade formulärvärden
let cur  = 1;      // aktuellt steg (1–5)

const DRAFT_KEY = "pm_draft";
const IMGS_KEY  = "pm_imgs";
const STEP_LABELS = [
  "Projekt &amp; Personal",
  "Referenssystem",
  "Instrument &amp; Metod",
  "Bilder",
  "Rapport (PDF)",
];

// ── Navigering ───────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  nav.innerHTML = "";
  STEP_LABELS.forEach((label, i) => {
    const n = i + 1;
    const btn = document.createElement("button");
    btn.className = "nb" + (n < cur ? " was" : n === cur ? " on" : "");
    btn.innerHTML = `<span class="nc">${n}</span>${label}`;
    btn.addEventListener("click", () => go(n));
    nav.appendChild(btn);
  });
}

function collectCurrentVals() {
  document.querySelectorAll("[id^='v_']").forEach(el => {
    vals[el.id.slice(2)] = el.value;
  });
}

function saveDraft() {
  collectCurrentVals();
  const draft = { vals, imgs };
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

  if (n === 1) { renderStep1(D, container, vals); wireNavBtn("btn-next1", 2); }
  else if (n === 2) { renderStep2(D, container, vals); wireNavBtn("btn-back2", 1); wireNavBtn("btn-next2", 3); }
  else if (n === 3) { renderStep3(D, container, vals); wireNavBtn("btn-back3", 2); wireNavBtn("btn-next3", 4); }
  else if (n === 4) {
    renderStep4(D, container, vals, imgs);
    wireNavBtn("btn-back4", 3);
    document.getElementById("btn-gen")?.addEventListener("click", () => {
      collectCurrentVals();
      go(5);
    });
  } else if (n === 5) {
    renderStep5(D, container, vals, imgs);
    wireNavBtn("btn-back5", 4);
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
