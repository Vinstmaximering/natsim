// Panorering som fungerar i alla verktyg (efter STOPP 4, Lager-verktyg).
//
//   Mittenknappen + drag panorerar alltid.
//   Mellanslag + drag med vänsterknappen panorerar tillfälligt – också när
//   Markera område eller ett ritverktyg är valt och vänsterdrag annars gör
//   något annat.
//
// Lyssnarna sitter i capture-fasen på kartbehållaren, så att en panorering
// aldrig når Leaflet eller verktygen (ingen rektangel, ingen ny punkt). Klicket
// som webbläsaren skickar efter en vänsterdragning med mellanslag spärras.
// Mellanslag gäller inte när fokus är i ett fält, en knapp eller en lista –
// där betyder det mellanslag. Undantag: knapparna i kartans verktygsrad. De
// behåller fokus efter ett klick, och ett mellanslag där ska panorera, inte
// trycka på knappen igen och byta verktyg.

let _space = false;
let _pan = null;           // { x, y, moved } under en panorering
let _swallowClick = false;

export const isSpaceHeld = () => _space;
export const isPanning = () => !!_pan;

/** Tar tangentbordsfokus något annat än kartan, där mellanslag betyder något? */
export function spaceBelongsToFocus(active = document.activeElement) {
  if (!active || active === document.body) return false;
  if (active.tagName === 'BUTTON' && active.closest?.('.map-tools, #mtb')) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(active.tagName)
      || active.isContentEditable === true;
}

const isSpace = e => e.code === 'Space' || e.key === ' ';

export function initPanGestures(map, { doc = document } = {}) {
  const cont = map.getContainer();
  const cursor = v => { if (cont.style) cont.style.cursor = v; };
  let savedCursor = '';

  const start = (e) => {
    _pan = { x: e.clientX, y: e.clientY, moved: false };
    savedCursor = cont.style?.cursor || '';
    cursor('grabbing');
    e.preventDefault();          // mittenknapp: ingen autoscroll i Windows
    e.stopPropagation();
  };

  cont.addEventListener('mousedown', e => {
    if (e.button === 1 || (e.button === 0 && _space)) start(e);
  }, true);

  doc.addEventListener('mousemove', e => {
    if (!_pan) return;
    const dx = e.clientX - _pan.x, dy = e.clientY - _pan.y;
    if (!dx && !dy) return;
    _pan.x = e.clientX; _pan.y = e.clientY; _pan.moved = true;
    map.panBy([-dx, -dy], { animate: false });
  });

  doc.addEventListener('mouseup', e => {
    if (!_pan) return;
    if (_pan.moved && e.button === 0) _swallowClick = true;
    _pan = null;
    cursor(_space ? 'grab' : savedCursor);
  });

  // Klicket efter en vänsterdragning med mellanslag ska inte bli en punkt.
  cont.addEventListener('click', e => {
    if (!_swallowClick) return;
    _swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // Mittenknappens "klick" (auxclick) öppnar annars länkar och liknande.
  cont.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); }, true);

  doc.addEventListener('keydown', e => {
    if (!isSpace(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (spaceBelongsToFocus()) return;
    e.preventDefault();          // sidan ska inte rulla
    if (!_space) { _space = true; savedCursor = cont.style?.cursor || ''; cursor('grab'); }
  });
  doc.addEventListener('keyup', e => {
    if (!isSpace(e) || !_space) return;
    e.preventDefault();          // en fokuserad verktygsknapp aktiveras på keyup
    _space = false;
    if (!_pan) cursor(savedCursor);
  });
  // Tappar fönstret fokus med mellanslaget nere kommer inget keyup.
  (doc.defaultView || window).addEventListener('blur', () => {
    _space = false;
    if (!_pan) cursor(savedCursor);
  });
}
