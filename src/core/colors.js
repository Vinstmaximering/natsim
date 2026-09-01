// Gemensamma färghjälpare för lager som låter användaren välja färg per objekt
// (hinder i Etapp B, visuella objekt i Etapp D).
// Konventionen genomgående: null = "ingen egen färg" ⇒ lagrets standardfärg.

// Normaliserar en färgsträng till "#rrggbb" i gemener.
// Accepterar "#abc", "abc", "#AABBCC", "AABBCC". Allt annat → null.
export function normalizeHexColor(v) {
  if (typeof v !== 'string') return null;
  const hit = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!hit) return null;
  let h = hit[1].toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return '#' + h;
}

// "#rrggbb" + alfa → "rgba(r,g,b,a)". Returnerar null för ogiltig hex så att
// anroparen kan falla tillbaka på sin standardfärg.
export function hexToRgba(hex, alpha) {
  const h = normalizeHexColor(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
