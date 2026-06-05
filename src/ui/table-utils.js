// Återanvändbara tabell-hjälpare för studio-vyer.

/**
 * Sorterar en array av objekt på en nyckel.
 * @param {object[]} rows
 * @param {string}   key
 * @param {'asc'|'desc'} direction
 */
export function sortByColumn(rows, key, direction = 'asc') {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    // null/undefined alltid sist, oavsett riktning
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = (typeof av === 'number' && typeof bv === 'number')
      ? av - bv
      : String(av).localeCompare(String(bv), 'sv');
    return direction === 'asc' ? cmp : -cmp;
  });
}

/**
 * Filtrerar rader som innehåller query i något av searchKeys-fälten.
 * @param {object[]} rows
 * @param {string}   query
 * @param {string[]} searchKeys
 */
export function filterByText(rows, query, searchKeys) {
  if (!query) return rows;
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(q)));
}

/**
 * Filtrerar rader vars typeKey-värde finns i allowedTypes.
 * Tom allowedTypes = visa alla.
 * @param {object[]} rows
 * @param {string[]} allowedTypes
 * @param {string}   typeKey
 */
export function filterByType(rows, allowedTypes, typeKey = 'type') {
  if (!allowedTypes || allowedTypes.length === 0) return rows;
  const set = new Set(allowedTypes);
  return rows.filter(r => set.has(r[typeKey]));
}

/**
 * Exporterar rader som CSV och triggar nedladdning.
 * @param {object[]} rows
 * @param {{ key: string, label: string }[]} columns
 * @param {string} filename  (utan .csv-suffix)
 */
export function exportToCSV(rows, columns, filename) {
  const escape = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map(c => escape(c.label)).join(',');
  const body   = rows.map(r => columns.map(c => escape(r[c.key])).join(',')).join('\n');
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
