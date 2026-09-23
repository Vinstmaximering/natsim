// Steg 2 – Referenssystem och utgångspunkter
// 13 SWEREF-zoner i dropdown per krav.
import { nf } from '../../core/format.js';
import { kodsystemFor, arTrafikverket } from '../tdok-v6.js';

export function render(D, container, vals) {
  const sweref = [
    ["SWEREF 99 TM","SWEREF 99 TM"], ["SWEREF 99 12 00","SWEREF 99 12 00"],
    ["SWEREF 99 13 30","SWEREF 99 13 30"], ["SWEREF 99 14 15","SWEREF 99 14 15"],
    ["SWEREF 99 15 00","SWEREF 99 15 00"], ["SWEREF 99 15 45","SWEREF 99 15 45"],
    ["SWEREF 99 16 30","SWEREF 99 16 30"], ["SWEREF 99 17 15","SWEREF 99 17 15"],
    ["SWEREF 99 18 00","SWEREF 99 18 00"], ["SWEREF 99 18 45","SWEREF 99 18 45"],
    ["SWEREF 99 20 15","SWEREF 99 20 15"], ["SWEREF 99 21 45","SWEREF 99 21 45"],
    ["SWEREF 99 23 15","SWEREF 99 23 15"], ["Lokalt","Lokalt koordinatsystem"],
  ];
  const kpRows = D.knownPts.map(p =>
    `<tr><td style="font-weight:700">${p.id}</td>
     <td style="text-align:right;font-family:monospace">${nf(p.N, 3)}</td>
     <td style="text-align:right;font-family:monospace">${nf(p.E, 3)}</td>
     <td style="text-align:right;font-family:monospace">${nf(p.H, 3)}</td>
     <td>${p.markering || "–"}</td></tr>`
  ).join("");

  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">🗺️</div><div><div class="ct">Referenssystem och utgångspunkter</div><div class="cd">Koordinatsystem, höjdsystem, geoidmodell och kodning</div></div></div>
      <div class="cb">
        <div class="g2">
          <div>
            <div class="lbl">Koordinatsystem (R1.3)</div>
            <select id="v_plansys">
              ${sweref.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
            </select>
            <small style="color:#506070;font-size:10px;display:block">Konfigurerat i NätSim: ${D.crs}</small>
          </div>
          <div><div class="lbl">Höjdsystem</div>
            <select id="v_hoj"><option>RH 2000</option><option>RH 70</option><option>Lokalt</option></select>
          </div>
          <div class="gw"><div class="lbl">Geoidmodell</div>
            <select id="v_geo"><option>SWEN17_RH2000</option><option>SWEN08_RH2000</option><option>Ej tillämplig</option></select>
          </div>
        </div>
        <div class="sec" style="margin-top:8px">Kända anslutningspunkter</div>
        <div class="hint" style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr style="color:#4fc3f7">
              <th style="padding:2px 5px;text-align:left">Punkt</th>
              <th style="padding:2px 5px;text-align:right">N (m)</th>
              <th style="padding:2px 5px;text-align:right">E (m)</th>
              <th style="padding:2px 5px;text-align:right">H (m)</th>
              <th style="padding:2px 5px;text-align:left">Markering</th>
            </tr>
            ${kpRows}
          </table>
        </div>
        <div><div class="lbl">Koordinatkälla (R3.4)</div><input id="v_kordkalla" placeholder="t.ex. Riksnätet, kommunens geodatatjänst"></div>
        <hr class="hr">
        <div class="sec">Kodning <span class="kalla">TDOK 2014:0571 v6.0 §1.6</span></div>
        <div class="hint">
          §1.6: kodning för järnväg enligt TDOK 2019:0215, för väg enligt BH 90 del 7 bilaga D.1.
          Förvalet följer verksamheten som valdes i steg 1 och kan skrivas över.
        </div>
        <div><div class="lbl">Kodsystem</div><input id="v_kodsystem" placeholder="Kodsystem som tillämpas"></div>
        <div style="margin-top:8px"><div class="lbl">Bedömning koordinatkvalitet</div><textarea id="v_kordkval" rows="2"></textarea></div>
        <div class="br">
          <button class="bo" id="btn-back2">← Tillbaka</button>
          <button class="bp" id="btn-next2">Nästa: Punkter →</button>
        </div>
      </div>
    </div>`;

  Object.entries(vals).forEach(([k, v]) => {
    const el = document.getElementById("v_" + k);
    if (el && v !== undefined) el.value = v;
  });

  // Kodsystemet förväljs ur verksamheten (§1.6) men bara när användaren inte
  // redan skrivit något – ett eget val får aldrig skrivas över.
  const kodEl = document.getElementById("v_kodsystem");
  if (kodEl && !kodEl.value) kodEl.value = kodsystemFor(vals.verksamhet);
  if (kodEl && !arTrafikverket(vals.verksamhet)) {
    kodEl.placeholder = "Kodsystem som tillämpas (TDOK §1.6 gäller Trafikverket)";
  }
}

export function collectFormValues() {
  const vals = {};
  document.querySelectorAll("[id^='v_']").forEach(el => { vals[el.id.slice(2)] = el.value; });
  return vals;
}
