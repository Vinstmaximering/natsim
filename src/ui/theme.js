const KEY = 'natsim_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}

export function initTheme() {
  const saved = localStorage.getItem(KEY);
  const theme = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') ?? 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(KEY, next);
}
