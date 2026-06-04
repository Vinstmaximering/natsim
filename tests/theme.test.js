import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initTheme, toggleTheme } from '../src/ui/theme.js';

const KEY = 'natsim_theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  // Rensa btn-theme om det finns
  document.getElementById('btn-theme')?.remove();
});

describe('initTheme', () => {
  it('läser tema från localStorage om värde finns', () => {
    localStorage.setItem(KEY, 'dark');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('faller tillbaka på system-preferens om inget sparas i localStorage', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('faller tillbaka på light om system-preferens är light och inget i localStorage', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    vi.unstubAllGlobals();
  });
});

describe('toggleTheme', () => {
  it('växlar data-theme-attribut och sparar i localStorage', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    toggleTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(KEY)).toBe('dark');
  });

  it('växlar tillbaka från dark till light', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    toggleTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
  });
});
