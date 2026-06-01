// Steg 5 – Rapport (PDF-förhandsvisning)
import { buildReport } from '../report-generator.js';

export function render(D, container, vals, imgs) {
  container.innerHTML = `
    <div class="np" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <button class="bo" id="btn-back5">← Ändra</button>
      <button class="bpr" id="btn-print">🖨️ Skriv ut / Spara PDF</button>
    </div>
    <div id="rpt"></div>`;

  document.getElementById("btn-print")?.addEventListener("click", () => window.print());

  const reportData = { ...D, vals, imgs };
  const html = buildReport(reportData);
  const rpt = document.getElementById("rpt");
  if (rpt) rpt.innerHTML = html;
}

export function collectFormValues() {
  return {};
}
