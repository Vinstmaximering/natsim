// Optimeringsförslaget som eget visningslager (Etapp E).
//
// "Behåll som förslag" ändrar inte nätet. Det optimerade nätet läggs i
// state.optimizerProposal och kartan/statistiken kan växlas mellan
// "original" och "optimized" via state.netView. Reversibilitetskravet i
// beställningen betyder just detta: användaren ska kunna jämföra före/efter
// innan hen bestämmer sig, och ett förkastat förslag ska inte lämna spår.
//
// Förslaget lever bara i sessionen och sparas aldrig i projektfilen – ett
// förslag är inte ett projekttillstånd.
import { getState, setState } from './store.js';
import { saveUndo } from './undo.js';
import { computeSimulation } from '../core/simulation.js';

/**
 * Bygger förslagsobjektet ur ett optimeringsresultat. Förslagets egen
 * simulering räknas ut här så att kartan kan rita rätt felellipser och
 * r-talsfärger i förslagsvyn utan att röra state.simResult.
 */
export function createProposal(result, { pts, meas, centerErr }) {
  return {
    createdAt: new Date().toISOString(),
    baseMeas:  meas.map(m => ({ ...m })),
    meas:      result.meas.map(m => ({ ...m })),
    addedIds:  [...result.addedIds],
    removedIds: [...result.removedIds],
    log:       result.log,
    criteria:  result.criteria,
    weights:   result.weights,
    baseMetrics:  result.baseMetrics,
    finalMetrics: result.finalMetrics,
    nextMeasId:   result.nextMeasId,
    simResult:    computeSimulation({ pts, meas: result.meas, centerErr }),
  };
}

/** Lägger förslaget i sessionen och slår om kartan till förslagsvyn. */
export function storeProposal(proposal) {
  setState({ optimizerProposal: proposal, netView: 'optimized' });
}

/**
 * Nätet som VISAS just nu – originalet eller förslaget. Kartan, valideringen
 * och kvalitetspanelen måste alla läsa härifrån, annars kan användaren titta på
 * förslaget medan siffrorna beskriver originalnätet.
 */
export function viewNet(state = getState()) {
  const p = state.optimizerProposal;
  return state.netView === 'optimized' && p
    ? { meas: p.meas, simResult: p.simResult, isProposal: true }
    : { meas: state.meas, simResult: state.simResult, isProposal: false };
}

/** Växlar visningslager. Okänt värde ⇒ original. */
export function setNetView(view) {
  const v = view === 'optimized' && getState().optimizerProposal ? 'optimized' : 'original';
  setState({ netView: v });
  return v;
}

/**
 * Gör förslaget till det aktiva nätet. Går att ångra via ångra-stacken – och
 * bara den vägen, precis som import av mätförslag.
 */
export function applyProposal(proposal = getState().optimizerProposal) {
  if (!proposal) return false;
  const { selMId } = getState();
  const keptIds = new Set(proposal.meas.map(m => m.id));
  saveUndo('Optimera nät');
  setState({
    meas: proposal.meas.map(m => ({ ...m })),
    nMid: Math.max(getState().nMid ?? 1, proposal.nextMeasId ?? 1),
    selMId: selMId && keptIds.has(selMId) ? selMId : null,
    simResult: null,
    suggestedMeas: [],
    optimizerProposal: null,
    netView: 'original',
  });
  return true;
}

/** Kastar förslaget utan att röra nätet. */
export function discardProposal() {
  setState({ optimizerProposal: null, netView: 'original' });
}

/**
 * Jämförelserader Original vs Optimerat förslag, för dialogens och panelens
 * statistiktabeller. Returnerar färdigformaterade strängar så att de två
 * vyerna inte kan visa olika avrundning.
 */
export function comparisonRows(baseMetrics, finalMetrics, criteria) {
  const num = (v, dec, suffix = '') =>
    v == null || !Number.isFinite(v) ? '–' : v.toFixed(dec) + suffix;
  const rows = [
    { label: 'Antal mätningar', base: baseMetrics.nMeas, opt: finalMetrics.nMeas, krav: '–',
      ok: true },
    { label: 'Minsta r-tal', base: num(baseMetrics.minR, 3), opt: num(finalMetrics.minR, 3),
      krav: '≥ ' + criteria.rMin.toFixed(2), ok: finalMetrics.minR >= criteria.rMin },
    // Fix 2.3: det mjuka kravet redovisas bredvid det hårda. Raden är
    // informativ – den kan aldrig underkänna ett nät (ok: true).
    { label: `Obs. med r < ${(criteria.rSoft ?? 0.5).toFixed(2)}`,
      base: baseMetrics.nBelowSoft ?? '–', opt: finalMetrics.nBelowSoft ?? '–',
      krav: 'rapporteras', ok: true },
    { label: 'Största σ_pos', base: num(baseMetrics.maxSigPosMm, 2, ' mm'),
      opt: num(finalMetrics.maxSigPosMm, 2, ' mm'),
      krav: '≤ ' + criteria.sigmaMaxMm.toFixed(1) + ' mm',
      ok: finalMetrics.maxSigPosMm <= criteria.sigmaMaxMm },
    { label: 'Kontrollerbarhet k', base: num(baseMetrics.kGlobal, 3), opt: num(finalMetrics.kGlobal, 3),
      krav: '≥ ' + criteria.kMin.toFixed(2), ok: finalMetrics.kGlobal >= criteria.kMin },
    { label: 'Största MUF', base: num(baseMetrics.maxMufFactor, 2, ' × σ'),
      opt: num(finalMetrics.maxMufFactor, 2, ' × σ'),
      krav: '≤ ' + criteria.mufFactorMax + ' × σ',
      ok: finalMetrics.maxMufFactor <= criteria.mufFactorMax },
    { label: 'Största YT', base: num(baseMetrics.maxYtFactor, 2, ' × σ'),
      opt: num(finalMetrics.maxYtFactor, 2, ' × σ'),
      krav: '≤ ' + criteria.ytFactorMax + ' × σ',
      ok: finalMetrics.maxYtFactor <= criteria.ytFactorMax },
  ];
  return rows;
}
