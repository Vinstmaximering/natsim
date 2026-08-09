// Kopierad exakt från NätSim_Beta_2.html rad 1057–1065 (ptResults-blocket).
// lam1 och lam2 BÅDA skyddade med Math.max(0,...) – STRUCTURE.md krav.
export function computeEllipse(Qee, Qnn, Qen, k_ell = 1.0) {
  const sigE = Math.sqrt(Math.max(0, Qee));
  const sigN = Math.sqrt(Math.max(0, Qnn));
  const mean = (Qee + Qnn) / 2;
  const disc = Math.sqrt(((Qee - Qnn) / 2) ** 2 + Qen * Qen);
  const lam1 = Math.max(0, mean + disc);   // ← STRUCTURE.md: lam1 skyddad
  const lam2 = Math.max(0, mean - disc);   // ← STRUCTURE.md: lam2 skyddad
  const aSemi = k_ell * Math.sqrt(lam1);
  const bSemi = k_ell * Math.sqrt(lam2);
  const theta = 0.5 * Math.atan2(2 * Qen, Qee - Qnn);
  // Standardosäkerhet i plan enligt HMK-Stommätning 2024 Formel F.23:
  //   u(plan) = √[u²(N) + u²(E)]
  // dvs. Helmerts punktmedelfel. HMK-Ordlistan (april 2022) bekräftar att
  // standardosäkerhet i plan är detsamma som punktmedelfel. Ingen delning
  // med 2 – tidigare räknades √((Qee+Qnn)/2), vilket är komponenternas
  // kvadratiska medelvärde och √2 för litet.
  const sigPos = Math.sqrt(Math.max(0, Qee + Qnn));
  return { sigE, sigN, aSemi, bSemi, theta, sigPos };
}
