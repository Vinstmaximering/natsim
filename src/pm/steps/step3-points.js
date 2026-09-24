// Steg 3 – Punkter och markering
//
// Etapp 3. Tre tabeller, alla med en rad per punkt ur nätet:
//   • Markeringstyp per planerad punkt     §2.4.1 K3 Tabell 2
//   • Tillståndsbedömning (endast järnväg)  §2.1 K2 · K5
//   • Gemensamma markeringar (bro, järnväg) §2.11.2 K4
//
// Värdena lagras i PM:ets egna vals, nycklade på punkt-id:
//   vals.markering  = { NY1: { typkod, typ }, … }
//   vals.tillstand  = { FP1: { kat, sikt, datum }, … }
//   vals.gemensam   = { FP1: true, … }
// Huvudappens punktobjekt och src/core/ rörs inte. En punkt som tagits bort ur
// nätet lämnar kvar en död nyckel, som rapporten hoppar över eftersom den
// itererar över nätets punkter och inte över nycklarna.
//
// De tre tabellerna är objekt och inte plana v_-fält, så de kan inte samlas in
// av den generiska [id^='v_']-svepningen i pm.js. Modulen exponerar därför
// collectTables(), som pm.js anropar vid varje stegbyte.
import {
  MARKERINGSTYPER, MARKERING_KALLA, TILLSTAND_KATEGORIER, TILLSTAND_KALLA,
  SIKT_KALLA, migreraMarkering, TABELLER, foraldralosaTabeller, harForaldralosa,
} from '../tdok-v6.js';

// Rubriker för de tre tabellerna, för listan över föräldralösa nycklar.
const TABELL_NAMN = {
  markering: 'Markeringstyp',
  tillstand: 'Tillståndsbedömning',
  gemensam:  'Gemensam markering',
};

// Modulens arbetskopia. Sätts av render(), läses av collectTables().
let _vals = null;

export function render(D, container, vals) {
  _vals = vals;
  const verksamhet = vals.verksamhet || "";
  const nattyp     = vals.nattyp     || "";
  const arJvg      = verksamhet === "jarnvag";
  const arBro      = nattyp === "bro";

  // Migrera fritexten i pt.markering första gången steget öppnas. Skrivs bara
  // för punkter som saknar värde, så att ett användarval aldrig skrivs över.
  if (!vals.markering) vals.markering = {};
  for (const p of D.allPts) {
    if (vals.markering[p.id] === undefined) {
      const m = migreraMarkering(p.markering);
      if (m.typkod || m.typ) vals.markering[p.id] = { typkod: m.typkod, typ: m.typ };
    }
  }
  if (!vals.tillstand) vals.tillstand = {};
  if (!vals.gemensam)  vals.gemensam  = {};

  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">📍</div><div><div class="ct">Punkter och markering</div><div class="cd">Markeringstyp, tillståndsbedömning och gemensamma markeringar</div></div></div>
      <div class="cb">

        <div class="sec">Markeringstyp per punkt <span class="kalla">${MARKERING_KALLA}</span></div>
        <div class="hint">
          Typkoden väljs först – markeringstypen hämtas ur den kodens lista i Tabell 2.
          Flera typer finns under båda koderna, så valet blir entydigt först när koden är satt.
          Befintlig fritext som inte står i tabellen har behållits som <b>Annan: …</b>.
        </div>
        <div class="ptab-wrap" id="mark-wrap"></div>

        <div id="tillstand-sek"></div>
        <div id="byggnadsverk-sek"></div>
        <div id="gemensam-sek"></div>
        <div id="foraldralosa-sek"></div>

        <div class="br">
          <button class="bo" id="btn-back3">← Tillbaka</button>
          <button class="bp" id="btn-next3">Nästa: Instrument →</button>
        </div>
      </div>
    </div>`;

  byggMarkering(D, container.querySelector("#mark-wrap"), vals);
  if (arJvg)         byggTillstand(D, container.querySelector("#tillstand-sek"), vals);
  if (arBro)         byggByggnadsverk(D, container.querySelector("#byggnadsverk-sek"), vals);
  if (arBro && arJvg) byggGemensam(D, container.querySelector("#gemensam-sek"), vals);
  byggForaldralosa(D, container.querySelector("#foraldralosa-sek"), vals);
}

// ── Föräldralösa nycklar ────────────────────────────────────────────────────
// Värden för punkt-id som inte längre finns i nätet. De kommer aldrig med i
// rapporten – den itererar över nätets punkter – men de ligger kvar i utkastet
// och kan innehålla arbete användaren vill ha tillbaka genom att lägga in
// punkten igen. Sektionen visar dem i stället för att tyst kasta dem, och
// borttagningen är alltid användarens eget val.

function byggForaldralosa(D, sek, vals) {
  if (!sek) return;
  const ptIds = D.allPts.map(p => p.id);
  const rita = () => {
    if (!harForaldralosa(vals, ptIds)) { sek.innerHTML = ""; return; }
    const per = foraldralosaTabeller(vals, ptIds);
    const rader = [];
    for (const t of TABELLER) {
      for (const id of per[t]) {
        rader.push(`<tr>
          <td class="ptab-id">${esc(id)}</td>
          <td>${TABELL_NAMN[t]}</td>
          <td>${esc(sammanfatta(t, vals[t][id]))}</td>
          <td><button type="button" class="ifbtn-sm" data-fl-tab="${t}" data-fl-id="${esc(id)}"
                      style="color:#ff6060">🗑 Ta bort</button></td>
        </tr>`);
      }
    }
    sek.innerHTML = `
      <hr class="hr">
      <div class="sec">Värden utan punkt i nätet</div>
      <div class="hint hint-warn">
        Punkterna nedan finns inte längre i nätet, men har kvar värden i det här PM:et.
        <b>De tas inte med i rapporten.</b> Lägg tillbaka punkten i NätSim för att använda
        värdet igen, eller ta bort det här. Borttagning går inte att ångra.
      </div>
      <div class="ptab-wrap">
        <table class="ptab">
          <thead><tr><th>Punkt</th><th>Tabell</th><th>Värde</th><th style="width:12%"></th></tr></thead>
          <tbody>${rader.join("")}</tbody>
        </table>
      </div>
      <div style="margin-top:6px">
        <button type="button" class="ifbtn-sm" id="fl-rensa-alla" style="color:#ff6060">🗑 Ta bort alla ${rader.length}</button>
      </div>`;

    sek.querySelectorAll("[data-fl-tab]").forEach(b => {
      b.addEventListener("click", () => {
        delete vals[b.dataset.flTab][b.dataset.flId];
        rita();
      });
    });
    sek.querySelector("#fl-rensa-alla")?.addEventListener("click", () => {
      for (const t of TABELLER) for (const id of per[t]) delete vals[t][id];
      rita();
    });
  };
  rita();
}

// Kort beskrivning av ett värde, så att användaren kan avgöra om det är värt
// att behålla innan det tas bort.
function sammanfatta(tabell, v) {
  if (tabell === 'gemensam') return v ? 'Markerad som gemensam' : '–';
  if (tabell === 'markering') return [v?.typkod, v?.typ].filter(Boolean).join(' · ') || '–';
  return [v?.kat, v?.sikt, v?.datum].filter(Boolean).join(' · ') || '–';
}

// ── Markeringstyp ───────────────────────────────────────────────────────────

function byggMarkering(D, wrap, vals) {
  if (!wrap) return;
  if (!D.allPts.length) { wrap.innerHTML = `<div class="ptab-tom">Nätet har inga punkter.</div>`; return; }

  wrap.innerHTML = `
    <table class="ptab">
      <thead><tr><th>Punkt</th><th>Typ i nätet</th><th style="width:22%">Typkod</th><th style="width:42%">Markeringstyp</th></tr></thead>
      <tbody>${D.allPts.map(p => `
        <tr>
          <td class="ptab-id">${esc(p.id)}</td>
          <td>${esc(p.type)}</td>
          <td><select data-mk-kod="${esc(p.id)}">
            <option value="">–</option>
            <option value="PP">PP</option>
            <option value="FIX">FIX</option>
          </select></td>
          <td><select data-mk-typ="${esc(p.id)}"></select></td>
        </tr>`).join("")}
      </tbody>
    </table>`;

  for (const p of D.allPts) {
    const kodEl = wrap.querySelector(`[data-mk-kod="${cssEsc(p.id)}"]`);
    const typEl = wrap.querySelector(`[data-mk-typ="${cssEsc(p.id)}"]`);
    const cur   = vals.markering[p.id] || { typkod: "", typ: "" };
    kodEl.value = cur.typkod || "";
    byggTypLista(typEl, kodEl.value, cur.typ);
    kodEl.addEventListener("change", () => {
      const behall = typEl.value;
      byggTypLista(typEl, kodEl.value, behall);
      skrivMarkering(vals, p.id, kodEl.value, typEl.value);
    });
    typEl.addEventListener("change", () => skrivMarkering(vals, p.id, kodEl.value, typEl.value));
  }
}

// Bygger markeringstypslistan för en typkod. En migrerad text som inte finns i
// kodens lista ("Annan: …", eller en Tabell 2-text under den andra koden)
// läggs till som en egen post så att den aldrig tappas bort.
function byggTypLista(sel, typkod, nuvarande) {
  const lista = typkod ? [...(MARKERINGSTYPER[typkod] || [])] : [];
  if (nuvarande && !lista.includes(nuvarande)) lista.unshift(nuvarande);
  sel.innerHTML = `<option value="">–</option>` +
    lista.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  sel.value = nuvarande && lista.includes(nuvarande) ? nuvarande : "";
}

function skrivMarkering(vals, id, typkod, typ) {
  if (!typkod && !typ) delete vals.markering[id];
  else vals.markering[id] = { typkod, typ };
}

// ── Tillståndsbedömning, järnväg ────────────────────────────────────────────
// §2.1 K5: ska minst redovisa punktnummer, kategori, siktförhållande, tidpunkt.
// Punktnumren förifylls från nätets kända punkter – det är de befintliga
// stompunkter bedömningen gäller.

function byggTillstand(D, sek, vals) {
  if (!sek) return;
  const pts = D.knownPts || [];
  sek.innerHTML = `
    <hr class="hr">
    <div class="sec">Tillståndsbedömning av befintliga stompunkter <span class="kalla">${TILLSTAND_KALLA}</span></div>
    <div class="hint">
      Gäller järnväg. §2.1 K5 kräver minst punktnummer, kategori, siktförhållande och tidpunkt.
      Punktnumren är hämtade från nätets kända punkter. Siktförhållandet ska bedömas
      <span class="kalla">${SIKT_KALLA}</span> – normen räknar inte upp några nivåer, så fältet är fritext.
    </div>
    <div class="ptab-wrap">
      ${pts.length ? `
      <table class="ptab">
        <thead><tr><th>Punktnummer</th><th style="width:26%">Kategori</th><th style="width:26%">Siktförhållande</th><th style="width:20%">Tidpunkt</th></tr></thead>
        <tbody>${pts.map(p => `
          <tr>
            <td class="ptab-id">${esc(p.id)}</td>
            <td><select data-ts-kat="${esc(p.id)}">
              <option value="">–</option>
              ${TILLSTAND_KATEGORIER.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join("")}
            </select></td>
            <td><input data-ts-sikt="${esc(p.id)}" placeholder="Bedömning"></td>
            <td><input data-ts-datum="${esc(p.id)}" type="date"></td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="ptab-tom">Nätet har inga kända punkter att bedöma.</div>`}
    </div>`;

  for (const p of pts) {
    const kat   = sek.querySelector(`[data-ts-kat="${cssEsc(p.id)}"]`);
    const sikt  = sek.querySelector(`[data-ts-sikt="${cssEsc(p.id)}"]`);
    const datum = sek.querySelector(`[data-ts-datum="${cssEsc(p.id)}"]`);
    const cur   = vals.tillstand[p.id] || {};
    kat.value = cur.kat || ""; sikt.value = cur.sikt || ""; datum.value = cur.datum || "";
    const skriv = () => {
      if (!kat.value && !sikt.value && !datum.value) delete vals.tillstand[p.id];
      else vals.tillstand[p.id] = { kat: kat.value, sikt: sikt.value, datum: datum.value };
    };
    kat.addEventListener("change", skriv);
    sikt.addEventListener("input", skriv);
    datum.addEventListener("change", skriv);
  }
}

// ── Byggnadsverkets läge, bro ───────────────────────────────────────────────
// §2.11.2 K2 kräver minst 4 punkter som OMSLUTER byggnadsverket. NätSim vet
// inte var byggnadsverket är om användaren inte säger det. Pekas ett visuellt
// lager ut kan rapporten pröva om lagrets objekt ligger innanför nätpunkternas
// konvexa hölje; utan utpekat lager blir kontrollen "kontrolleras manuellt".

function byggByggnadsverk(D, sek, vals) {
  if (!sek) return;
  const lager = D.visuellaLager || [];
  sek.innerHTML = `
    <hr class="hr">
    <div class="sec">Byggnadsverkets läge <span class="kalla">TDOK 2014:0571 v6.0 §2.11.2 K2</span></div>
    <div class="hint">
      §2.11.2 K2 kräver minst 4 punkter som omsluter byggnadsverket. Peka ut det
      visuella lager som visar byggnadsverket, så kontrollerar rapporten automatiskt
      om nätpunkterna omsluter det. Utan utpekat lager redovisas kravet som
      <b>Kontrolleras manuellt</b> – programmet vet då inte var byggnadsverket ligger.
    </div>
    ${lager.length ? `
      <div><div class="lbl">Visuellt lager som visar byggnadsverket</div>
        <select id="v_byggnadsverkLager">
          <option value="">– inget utpekat (kontrolleras manuellt) –</option>
          ${lager.map(l => `<option value="${esc(l.id)}">${esc(l.namn)} (${l.antal} objekt)</option>`).join("")}
        </select>
      </div>`
      : `<div class="ptab-tom">Projektet har inga visuella lager. Importera eller rita
         byggnadsverket i NätSim för att kunna få kravet kontrollerat automatiskt.</div>`}`;

  const sel = sek.querySelector("#v_byggnadsverkLager");
  if (sel && vals.byggnadsverkLager) sel.value = vals.byggnadsverkLager;
}

// ── Gemensamma markeringar, bro + järnväg ───────────────────────────────────
// §2.11.2 K4: minst 2 markeringar gemensamma med stomnät i plan för järnväg.
// Kontrollen i etapp 5 räknar de ikryssade.

function byggGemensam(D, sek, vals) {
  if (!sek) return;
  sek.innerHTML = `
    <hr class="hr">
    <div class="sec">Gemensamma markeringar med stomnät i plan för järnväg <span class="kalla">TDOK 2014:0571 v6.0 §2.11.2 K4</span></div>
    <div class="hint">
      Kryssa för de punkter som är gemensamma med järnvägens stomnät i plan.
      §2.11.2 K4 kräver minst 2. Antalet kontrolleras automatiskt i rapporten.
    </div>
    <div class="ptab-wrap">
      <table class="ptab">
        <thead><tr><th style="width:12%">Gemensam</th><th>Punkt</th><th>Typ i nätet</th></tr></thead>
        <tbody>${D.allPts.map(p => `
          <tr>
            <td><input type="checkbox" data-gem="${esc(p.id)}" style="width:auto"></td>
            <td class="ptab-id">${esc(p.id)}</td>
            <td>${esc(p.type)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="hint" id="gem-antal"></div>`;

  const visaAntal = () => {
    const n = Object.values(vals.gemensam).filter(Boolean).length;
    const el = sek.querySelector("#gem-antal");
    if (el) el.innerHTML = n >= 2
      ? `<b>${n}</b> gemensamma markeringar valda – uppfyller §2.11.2 K4 (minst 2).`
      : `<b>${n}</b> gemensamma markeringar valda – §2.11.2 K4 kräver minst 2.`;
  };

  for (const p of D.allPts) {
    const cb = sek.querySelector(`[data-gem="${cssEsc(p.id)}"]`);
    cb.checked = !!vals.gemensam[p.id];
    cb.addEventListener("change", () => {
      if (cb.checked) vals.gemensam[p.id] = true;
      else delete vals.gemensam[p.id];
      visaAntal();
    });
  }
  visaAntal();
}

// ── Insamling ───────────────────────────────────────────────────────────────
// Tabellerna skrivs direkt in i vals av lyssnarna ovan; den här funktionen
// finns för att pm.js ska ha ett enda ställe att anropa och för att objekten
// aldrig ska bli undefined i ett sparat utkast.

export function collectTables(vals) {
  const mal = vals || _vals;
  if (!mal) return {};
  mal.markering = mal.markering || {};
  mal.tillstand = mal.tillstand || {};
  mal.gemensam  = mal.gemensam  || {};
  return mal;
}

export function collectFormValues() {
  const vals = {};
  document.querySelectorAll("[id^='v_']").forEach(el => { vals[el.id.slice(2)] = el.value; });
  return vals;
}

// ── Hjälpare ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Punkt-id är användardata och kan innehålla tecken som bryter en
// attributselektor. CSS.escape finns i alla målwebbläsare; fallbacken täcker
// jsdom-miljöer utan den.
function cssEsc(s) {
  const t = String(s ?? "");
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(t) : t.replace(/["\\]/g, "\\$&");
}
