// D4: Onboarding-overlay – visas vid första besök (inga punkter)
// Fas D: touch- och phone-anpassad text genereras dynamiskt vid init.

const _isTouch = (typeof window !== 'undefined') &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// Genererar onboarding-innehållet baserat på enhet och viewport.
function _buildContent() {
  const phone = window.innerWidth < 768;
  const touch = _isTouch;

  // ── Steg ──────────────────────────────────────────────────────────────────
  let steps;

  if (phone) {
    // 4 komprimerade steg för telefon
    steps = [
      `<b>Tryck på kartan</b> → välj <i>"Känd punkt"</i>.<br>Lägg till fler kända punkter + en <b>uppställning</b>.`,
      `Tryck <b>📏 Mätning</b> och koppla punkterna.`,
      `<b>Tryck och håll</b> på en punkt för att redigera den.`,
      `Tryck <b>☰ / ⊞</b> för paneler. <span style="color:#ff9900">PM kräver tablet/dator.</span>`,
    ];
  } else if (touch) {
    // Touch-tablet: 5 steg, touch-justerade termer
    steps = [
      `<b>Tryck på kartan</b> för att lägga första punkten – välj <i>"Känd punkt"</i>.`,
      `Lägg till fler kända punkter och minst en <b>uppställning</b>.`,
      `Tryck <b>📏 Lägg till mätning</b> och dra linjer mellan punkter.`,
      `<b>Tryck och håll</b> på en punkt för att redigera den.`,
      `Tryck <b>🔍 Validera nät</b> och sedan <b>📐 Generera PM</b>.`,
    ];
  } else {
    // Desktop: 5 steg, original
    steps = [
      `<b>Klicka på kartan</b> för att lägga första punkten – välj <i>"Känd punkt"</i>.`,
      `Lägg till fler kända punkter och minst en <b>uppställning</b>.`,
      `Klicka <b>📏 Lägg till mätning</b> och dra linjer mellan punkter.`,
      `Aktivera <b>mätklass G1–G4</b> i högerpanelen om SIS-TS-krav ska gälla.`,
      `Tryck <b>🔍 Validera nät</b> och sedan <b>📐 Generera PM</b>.`,
    ];
  }

  // ── Knappstil ─────────────────────────────────────────────────────────────
  const btnStyle = phone
    ? `margin-top:14px;padding:12px 20px;font-size:14px;width:100%;background:#00c87a;color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:600;`
    : `margin-top:10px;padding:6px 14px;font-size:12px;background:#00c87a;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:600;`;

  const fontSize = phone ? '13px' : '12px';

  return `
    <div style="font-size:${phone ? '15px' : '15px'};color:#00c87a;font-weight:700;margin-bottom:10px">📐 Välkommen till NätSim Beta 2</div>
    <div style="font-size:${fontSize};color:#8aaccc;line-height:1.6">
      Snabbstart:
      <ol style="margin:8px 0 8px 18px;padding:0">
        ${steps.map(s => `<li style="margin-bottom:4px">${s}</li>`).join("")}
      </ol>
    </div>
    <button
      onclick="document.getElementById('onboarding').style.display='none';localStorage.setItem('nb_onboarded','1')"
      style="${btnStyle}">Förstått</button>
  `;
}

export function initOnboarding() {
  const el = document.getElementById("onboarding");
  if (!el) return;
  if (!localStorage.getItem("nb_onboarded")) {
    el.innerHTML = _buildContent();
    el.style.display = "block";
  }
}

export function showOnboarding() {
  const el = document.getElementById("onboarding");
  if (!el) return;
  el.innerHTML = _buildContent();
  el.style.display = "block";
}

export function hideOnboarding() {
  const el = document.getElementById("onboarding");
  if (el) el.style.display = "none";
  localStorage.setItem("nb_onboarded", "1");
}
