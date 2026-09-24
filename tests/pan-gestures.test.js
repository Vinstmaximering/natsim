// Panorering i alla verktyg (tillägg efter STOPP 4): mittenknappen och
// mellanslag + drag. Lyssnarna sitter i capture-fasen på kartbehållaren, så
// att varken Leaflet eller verktygen ser gesten.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initPanGestures, isSpaceHeld, isPanning, spaceBelongsToFocus } from '../src/map/pan-gestures.js';

const cont = document.createElement('div');
const inner = document.createElement('div');   // som Leaflets paneler
cont.appendChild(inner);
document.body.appendChild(cont);
const map = { getContainer: () => cont, panBy: vi.fn() };
initPanGestures(map);

// Det som verktygen (Leaflet) skulle ha sett.
const sett = [];
inner.addEventListener('mousedown', () => sett.push('mousedown'));
inner.addEventListener('click', () => sett.push('click'));

const mus = (typ, button, x, y, target = inner) =>
  target.dispatchEvent(new MouseEvent(typ, { button, clientX: x, clientY: y, bubbles: true, cancelable: true }));
const tangent = (typ, code = 'Space') =>
  document.dispatchEvent(new KeyboardEvent(typ, { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }));

beforeEach(() => {
  map.panBy.mockClear();
  sett.length = 0;
  tangent('keyup');
  document.activeElement?.blur?.();
});

describe('mittenknappen', () => {
  it('drag panorerar kartan och når inte verktygen', () => {
    mus('mousedown', 1, 100, 100);
    expect(isPanning()).toBe(true);
    mus('mousemove', 1, 130, 90, document);
    mus('mouseup', 1, 130, 90, document);
    expect(map.panBy).toHaveBeenCalledWith([-30, 10], { animate: false });
    expect(sett).toEqual([]);
    expect(isPanning()).toBe(false);
  });

  it('standardbeteendet (autoscroll) stoppas', () => {
    const e = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true });
    inner.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    mus('mouseup', 1, 0, 0, document);
  });
});

describe('mellanslag + drag', () => {
  it('panorerar och spärrar klicket efteråt', () => {
    tangent('keydown');
    expect(isSpaceHeld()).toBe(true);
    mus('mousedown', 0, 10, 10);
    mus('mousemove', 0, 60, 40, document);
    mus('mouseup', 0, 60, 40, document);
    mus('click', 0, 60, 40);
    expect(map.panBy).toHaveBeenCalledWith([-50, -30], { animate: false });
    expect(sett).toEqual([]);                  // ingen rektangel, ingen punkt
    tangent('keyup');
    expect(isSpaceHeld()).toBe(false);
  });

  it('utan mellanslag når vänsterknappen verktygen som vanligt', () => {
    mus('mousedown', 0, 10, 10);
    mus('mouseup', 0, 10, 10, document);
    mus('click', 0, 10, 10);
    expect(map.panBy).not.toHaveBeenCalled();
    expect(sett).toEqual(['mousedown', 'click']);
  });

  it('mellanslaget rullar inte sidan', () => {
    const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('gäller inte när fokus är i ett fält', () => {
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    inp.focus();
    const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(isSpaceHeld()).toBe(false);
    expect(e.defaultPrevented).toBe(false);    // mellanslaget hamnar i fältet
    inp.remove();
  });

  it('gäller inte en vanlig knapp, men väl knapparna i kartans verktygsrad', () => {
    const vanlig = document.createElement('button');
    const rad = document.createElement('div');
    rad.className = 'map-tools';
    const verktyg = document.createElement('button');
    rad.appendChild(verktyg);
    document.body.append(vanlig, rad);
    expect(spaceBelongsToFocus(vanlig)).toBe(true);
    expect(spaceBelongsToFocus(verktyg)).toBe(false);
    verktyg.focus();
    tangent('keydown');
    expect(isSpaceHeld()).toBe(true);
    const upp = new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(upp);
    expect(upp.defaultPrevented).toBe(true);   // knappen trycks inte igen
    vanlig.remove(); rad.remove();
  });

  it('inte med Ctrl, Alt eller Cmd', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', ctrlKey: true }));
    expect(isSpaceHeld()).toBe(false);
  });

  it('släpps om fönstret tappar fokus', () => {
    tangent('keydown');
    window.dispatchEvent(new Event('blur'));
    expect(isSpaceHeld()).toBe(false);
  });
});
