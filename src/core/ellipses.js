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
  // σ_pos = sqrt((σ_E²+σ_N²)/2) – medellägesfel per Geo Professional
  const sigPos = Math.sqrt(Math.max(0, (Qee + Qnn) / 2));
  return { sigE, sigN, aSemi, bSemi, theta, sigPos };
}
