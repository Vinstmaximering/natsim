import { SIS_TS_CLASSES, SIS_TS_GENERAL_REQS } from '../data/sis-ts-classes.js';

function row(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:2px 0;">
    <span style="color:var(--text-muted);font-size:11px;">${label}</span>
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
      ${row('Spridning Hv/Vv', '≤ ' + c.spridningHvVv_mgon.toFixed(1).replace('.', ',') + ' mgon')}
      ${row('Spridning längd', '≤ ' + c.spridningLangd_mm + ' mm')}
      ${row('Antal helsatser', '≥ ' + c.antalHelsatser)}
      ${row('Dubbelmätta läng.', c.dubbelmattaLangder)}
      ${row('Centrering', c.centreringMedelfel_mm + ' mm')}
    </div>
    <div style="padding:6px 8px;border-bottom:1px solid var(--border-default);">
      <div style="font-size:10px;font-weight:bold;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:4px;">GENERELLA KRAV (ALLA KLASSER)</div>
      ${row('k-tal nätet', '≥ ' + g.k_global_min.toFixed(2).replace('.', ','))}
      ${row('k-tal enskild', '≥ ' + g.k_individual_min.toFixed(2).replace('.', ','))}
      ${row('MUF', '≤ ' + g.muf_factor_max + ' × σ_mät')}
      ${row('YT', '≤ ' + g.yt_factor_max + ' × σ_mät')}
    </div>
    <div style="padding:4px 8px;">
      <span style="font-size:10px;color:var(--text-muted);">Ref: ${c._source} + HMK 2024</span>
    </div>
  </div>`;
}
