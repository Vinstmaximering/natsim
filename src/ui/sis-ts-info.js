// Mätklassrutan under fliken NÄT.
//
// NOTERING (UI-städning Omgång 1, 2026-09-11):
// Raden "r-tal per obs." hette tidigare "k-tal enskild". Storheten
// (SIS_TS_GENERAL_REQS.k_individual_min) är den OBSERVATIONSVISA redundansen,
// alltså samma sak som r_i i resten av UI:t – inte en variant av nätets
// globala k-tal på raden ovanför. Datamodellens nyckel behåller sitt namn
// eftersom den speglar HMK:s beteckning k_i (Formel F.6).
// Se docs/troubleshooting/ui_inventering_20260910.md avsnitt B, punkt 1.
import { SIS_TS_CLASSES, SIS_TS_GENERAL_REQS } from '../data/sis-ts-classes.js';
// Omgång 2: all sifferformatering går genom core/format.js.
import { nf, komma } from '../core/format.js';
import { TIPS, tipAttr } from './tooltip.js';

function row(label, value, tip) {
  return `<div style="display:flex;justify-content:space-between;padding:2px 0;">
    <span style="color:var(--text-muted);font-size:11px;"${tip ? ' ' + tipAttr(tip) : ''}>${label}</span>
    <span style="color:var(--text-value);font-family:monospace;font-size:11px;">${value}</span>
  </div>`;
}

export function renderClassInfo(klass) {
  if (!klass || !SIS_TS_CLASSES[klass]) return '';
  const c = SIS_TS_CLASSES[klass];
  const g = SIS_TS_GENERAL_REQS;
  return `<div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:4px;margin-bottom:8px;overflow:hidden;">
    <div style="background:var(--bg-selected);border-left:3px solid var(--accent);padding:6px 8px;">
      <div style="font-size:12px;font-weight:bold;color:var(--accent);">${c.name}</div>
      <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;line-height:1.4;">${c.usage}</div>
    </div>
    <div style="padding:6px 8px;border-bottom:1px solid var(--border-default);">
      <div style="font-size:10px;font-weight:bold;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:4px;">MÄTKRAV (SIS-TS 21143:2016 A.9)</div>
      ${row('Totalstation', c.totalstation)}
      ${row('Spridning Hv/Vv', '≤ ' + nf(c.spridningHvVv_mgon, 1) + ' mgon')}
      ${row('Spridning längd', '≤ ' + c.spridningLangd_mm + ' mm')}
      ${row('Antal helsatser', '≥ ' + c.antalHelsatser)}
      ${row('Dubbelmätta längder', komma(c.dubbelmattaLangder))}
      ${row('Centrering', komma(c.centreringMedelfel_mm) + ' mm', TIPS.E_C)}
    </div>
    <div style="padding:6px 8px;border-bottom:1px solid var(--border-default);">
      <div style="font-size:10px;font-weight:bold;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:4px;">GENERELLA KRAV (ALLA KLASSER)</div>
      ${row('k-tal nätet', '≥ ' + nf(g.k_global_min, 2), TIPS.K_TAL)}
      ${row('r-tal per obs.', '≥ ' + nf(g.k_individual_min, 2), TIPS.R_TAL)}
      ${row('MUF', '≤ ' + g.muf_factor_max + ' × σ_mät', TIPS.MUF)}
      ${row('YT', '≤ ' + g.yt_factor_max + ' × σ_mät', TIPS.YT)}
    </div>
    <div style="padding:4px 8px;">
      <span style="font-size:10px;color:var(--text-muted);">Ref: ${c._source} + HMK 2024</span>
    </div>
  </div>`;
}
