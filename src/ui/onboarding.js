// D4: Onboarding-overlay – visas vid första besök (inga punkter)
// Bevaras exakt per krav
export function initOnboarding() {
  const el = document.getElementById("onboarding");
  if (!el) return;
  // Visa om användaren inte avfärdat onboarding tidigare
  if (!localStorage.getItem("nb_onboarded")) {
    el.style.display = "block";
  }
}

export function showOnboarding() {
  const el = document.getElementById("onboarding");
  if (el) el.style.display = "block";
}

export function hideOnboarding() {
  const el = document.getElementById("onboarding");
  if (el) el.style.display = "none";
  localStorage.setItem("nb_onboarded", "1");
}
