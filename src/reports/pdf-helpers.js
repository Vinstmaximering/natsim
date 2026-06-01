// jsPDF importeras som ES-modul (ej CDN-script) – krav Fas 6.
// Gemensamma hjälpfunktioner för PDF-generering, används av Fas 7 (PM-rapporten).
import { jsPDF } from 'jspdf';

export { jsPDF };

/**
 * Skapar ett nytt jsPDF-dokument med NätSims standardinställningar (A4, portait, mm).
 */
export function createPDF() {
  return new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
}

/**
 * Lägger till en sidfotsrad med sidnummer och projektnamn.
 */
export function addFooter(doc, pageNum, totalPages, label = "NätSim") {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(label, 14, H - 8);
  doc.text(`Sida ${pageNum} / ${totalPages}`, W - 14, H - 8, { align:"right" });
  doc.setTextColor(0);
}

/**
 * Lägger till en sektion-header (blå bakgrund, vit text).
 */
export function addSectionHeader(doc, title, y) {
  doc.setFillColor(10, 30, 56);
  doc.rect(14, y - 4, doc.internal.pageSize.getWidth() - 28, 7, "F");
  doc.setFontSize(9);
  doc.setTextColor(79, 195, 247);
  doc.text(title, 16, y);
  doc.setTextColor(0);
  return y + 6;
}

/**
 * Renderar en enkel tabell (array of arrays) med jsPDF autoTable om det är installerat,
 * annars med manuell cell-rendering.
 */
export function addTable(doc, head, rows, y, options = {}) {
  const cellH  = options.cellH  || 5;
  const colW   = options.colW   || null;  // null = auto
  const margin = options.margin || 14;
  const W      = doc.internal.pageSize.getWidth() - margin * 2;
  const cols   = head.length;
  const cw     = colW || Array(cols).fill(W / cols);

  // Header
  doc.setFontSize(7);
  doc.setFillColor(40, 40, 40);
  doc.setTextColor(255);
  let x = margin;
  head.forEach((h, i) => {
    doc.rect(x, y, cw[i], cellH, "F");
    doc.text(String(h), x + 1, y + cellH - 1);
    x += cw[i];
  });
  y += cellH;

  // Rows
  doc.setTextColor(0);
  rows.forEach((row, ri) => {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(ri % 2 === 0 ? 255 : 248);
    x = margin;
    row.forEach((cell, ci) => {
      doc.rect(x, y, cw[ci], cellH, "F");
      doc.setFontSize(7);
      doc.text(String(cell ?? ""), x + 1, y + cellH - 1);
      x += cw[ci];
    });
    y += cellH;
  });
  return y + 2;
}
