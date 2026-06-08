import { describe, it, expect } from 'vitest';
import { SIS_TS_CLASSES, SIS_TS_GENERAL_REQS } from '../src/data/sis-ts-classes.js';
import { renderClassInfo } from '../src/ui/sis-ts-info.js';

describe('SIS_TS_CLASSES', () => {
  it('contains all four classes with required fields', () => {
    for (const key of ['G1', 'G2', 'G3', 'G4']) {
      const c = SIS_TS_CLASSES[key];
      expect(c).toBeDefined();
      expect(c.name).toBe(key);
      expect(typeof c.usage).toBe('string');
      expect(typeof c.totalstation).toBe('string');
      expect(typeof c.spridningHvVv_mgon).toBe('number');
      expect(typeof c.spridningLangd_mm).toBe('number');
      expect(typeof c.antalHelsatser).toBe('number');
      expect(typeof c.dubbelmattaLangder).toBe('string');
      expect(c._source).toContain('SIS-TS 21143:2016');
    }
  });

  it('has stricter requirements for higher classes', () => {
    expect(SIS_TS_CLASSES.G1.spridningHvVv_mgon).toBeLessThan(SIS_TS_CLASSES.G2.spridningHvVv_mgon);
    expect(SIS_TS_CLASSES.G2.spridningHvVv_mgon).toBeLessThan(SIS_TS_CLASSES.G3.spridningHvVv_mgon);
    expect(SIS_TS_CLASSES.G3.spridningHvVv_mgon).toBeLessThan(SIS_TS_CLASSES.G4.spridningHvVv_mgon);
  });

  it('SIS_TS_GENERAL_REQS has expected values', () => {
    expect(SIS_TS_GENERAL_REQS.k_global_min).toBe(0.5);
    expect(SIS_TS_GENERAL_REQS.k_individual_min).toBe(0.35);
    expect(SIS_TS_GENERAL_REQS.muf_factor_max).toBe(4);
    expect(SIS_TS_GENERAL_REQS.yt_factor_max).toBe(2);
  });
});

describe('renderClassInfo', () => {
  it('returns empty string for empty or missing class', () => {
    expect(renderClassInfo('')).toBe('');
    expect(renderClassInfo(null)).toBe('');
    expect(renderClassInfo('G9')).toBe('');
  });

  it('returns HTML containing class-specific requirement values', () => {
    const html = renderClassInfo('G1');
    expect(html).toContain('G1');
    expect(html).toContain('mgon');
    expect(html).toContain('mm');
    expect(html).toContain('helsatser');
    expect(html).toContain('ppm');
    expect(html).toContain('SIS-TS 21143:2016');
    expect(html).toContain('T1');
  });

  it('returns HTML with general requirements for all classes', () => {
    for (const key of ['G1', 'G2', 'G3', 'G4']) {
      const html = renderClassInfo(key);
      expect(html).toContain('k-tal');
      expect(html).toContain('MUF');
      expect(html).toContain('YT');
      expect(html).toContain('HMK 2024');
    }
  });

  it('panel content changes between classes', () => {
    const g1 = renderClassInfo('G1');
    const g4 = renderClassInfo('G4');
    expect(g1).not.toBe(g4);
    expect(g1).toContain('T1');
    expect(g4).toContain('T3');
  });
});
