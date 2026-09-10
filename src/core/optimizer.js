// ─────────────────────────────────────────────────────────────────────────────
// NÄTOPTIMERING – Second-order design (SOD), Etapp E
//
// Second-order design är den geodetiska termen för att välja MÄTNINGS-
// KONFIGURATION till en given nätgeometri: punkterna ligger fast, frågan är
// vilka observationer som ska utföras för att kraven ska nås. Metoden här är
// greedy iterative optimization, den etablerade numeriska ansatsen i
// produktionsprogram:
//
//   Cross, P. A. (1994) "Advanced Least Squares Applied to Position-Fixing",
//     University of East London, Working Paper No. 6 – nätdesign och iterativt
//     val av observationer.
//   Kuang, S. (1996) "Geodetic Network Analysis and Optimal Design: Concepts
//     and Applications", Ann Arbor Press – kap. om second-order design.
//
// Analytiska SOD-lösningar (vikttilldelning via pseudoinvers) ger negativa
// vikter som saknar fysikalisk tolkning – en observation kan inte utföras
// "minus en gång". Den giriga sökningen ger i stället alltid en utförbar
// mätplan, är reproducerbar och kan motiveras rad för rad i beslutsloggen,
// vilket är kravet vid granskning enligt TDOK 2014:0571.
//
// Algoritmen är tvådelad:
//   Fas 1 (additiv):    otillräckliga nät byggs upp tills kriterierna hålls.
//   Fas 2 (subtraktiv): överbestämda nät bantas så länge kriterierna håller.
//
// Modulen är REN: den läser inget state och skriver inget. All beräkning går
// via computeSimulation() – exakt samma kärna som den vanliga simuleringen,
// ingen förenklad modell.
// ─────────────────────────────────────────────────────────────────────────────
import { computeSimulation, stationIds } from './simulation.js';
import { d2EN } from './designmatrix.js';
import { hasLineOfSight } from './visibility.js';
import { INSTRUMENTS } from './constants.js';
import { criteriaForClass, metricsFromSim, checkCriteria } from './optimizer-criteria.js';

// Säkerhetsgränser. Fas 1 får aldrig lägga till mer än MAX_ADDITIONS mätningar
// (nätet är då fundamentalt otillräckligt, inte underdimensionerat), och
// faserna tillsammans får aldrig köra fler än MAX_ITERATIONS varv.
export const MAX_ADDITIONS  = 50;
export const MAX_ITERATIONS = 200;

// Vikterna styr avvägningen mellan σ_pos-förbättring och r-talshöjning.
export const DEFAULT_WEIGHTS = Object.freeze({ sigma: 0.5, r: 0.5 });

/**
 * Normaliserar viktparet till summa 1. Ogiltiga eller negativa värden, och
 * paret 0/0, faller tillbaka på 50/50.
 */
export function normalizeWeights(w) {
  const s = Number(w?.sigma), r = Number(w?.r);
  const okS = Number.isFinite(s) && s >= 0, okR = Number.isFinite(r) && r >= 0;
  if (!okS || !okR) return { ...DEFAULT_WEIGHTS };
  const sum = s + r;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return { sigma: s / sum, r: r / sum };
}

// Stabil, indataoberoende ordning på kandidater. Reproducerbarheten (Test 5)
// vilar på att pooler och sorteringar är totalordnade – aldrig Set-iteration
// eller godtycke vid lika poäng.
const byPair = (a, b) =>
  a.from < b.from ? -1 : a.from > b.from ? 1 :
  a.to   < b.to   ? -1 : a.to   > b.to   ? 1 : 0;

/**
 * Poolen av möjliga mätningar: från varje uppställd punkt till varje annan
 * punkt inom maxSuggestDist med fri sikt förbi hindren – både sträckor som
 * aldrig mätts och ommätningar av befintliga (dubbelmätning).
 *
 * DUBBELMÄTNING (Fas 3). Poolen uteslöt tidigare varje par som redan mättes,
 * vilket gjorde dubbelmätning omöjlig att föreslå och lämnade ett mättat nät
 * utan väg framåt (F-3 i diagnosrapporten). Nu gäller:
 *
 *   • Aldrig mätt sträcka   – kandidat så snart `from` är uppställd. Målet
 *     behöver inte vara uppställbart; en bakåtsikt mot en fixpunkt kräver inte
 *     att man ställer upp på fixpunkten.
 *   • Redan mätt sträcka    – kandidat bara om BÅDA ändarna är uppställda. En
 *     verklig ommätning innebär att instrumentet flyttas till andra änden, och
 *     en punkt utan uppställningsmärke (bergdubb) kan inte bära den. En
 *     upprepning från samma uppställning vore dessutom fel modell: kärnans
 *     viktmatris är diagonal och skulle räkna den som helt oberoende, inklusive
 *     centrering, och därmed överskatta kontrollen. Se
 *     docs/troubleshooting/dubbelmatning_arkitektur_20260902.md.
 *   • Motriktad före upprepad – finns sträckan bara i riktningen s→t föreslås
 *     t→s i stället. Längdraden blir identisk oavsett riktning, men
 *     riktningsraden hänger på den andra uppställningens orienteringsobekant,
 *     vilket är den fysikaliska innebörden av dubbelmätning i svenskt
 *     fältarbete. Finns båda riktningarna redan är en tredje observation i
 *     någon riktning den enda kvarvarande vägen och tillåts då.
 *
 * UPPSTÄLLD PUNKT = punkt som förekommer som `from` i minst en riktnings-
 * observation, dvs. exakt kärnans `stationIds(meas)`. Poolen använde tidigare
 * punkttypen (`isStationPoint`: type "station", eller "known" med isStation),
 * vilket gjorde optimeringen till en no-op på varje nät där uppställningarna är
 * typade "known"/"new" – till exempel allt som importeras från Excel eller
 * extern datakälla. Se F-1 i docs/troubleshooting/etapp_E_diagnos_20260902.md.
 *
 * Punkttypen säger inget om huruvida instrumentet faktiskt stått på punkten i
 * fält; det gör däremot mätningarna. Definitionen sammanfaller nu med den som
 * ekvationsuppställningen i core/simulation.js redan använder, så poolen och
 * utjämningen kan inte längre ha olika uppfattning om vad en uppställning är.
 *
 * @returns {{candidates:Array, filteredByDistance:number, filteredByObstacle:number}}
 */
export function generateCandidates({ pts = [], meas = [], obstacles = [], maxSuggestDist = null }) {
  const active = new Set(meas.map(m => `${m.from} ${m.to}`));
  const occupied = new Set(stationIds(meas));
  const stations = pts.filter(p => occupied.has(p.id));
  const candidates = [];
  let filteredByDistance = 0, filteredByObstacle = 0;

  stations.forEach(s => {
    pts.forEach(t => {
      if (t.id === s.id) return;
      const hasFwd = active.has(`${s.id} ${t.id}`);
      const hasRev = active.has(`${t.id} ${s.id}`);
      const redanMatt = hasFwd || hasRev;
      // Fix 3.2: ommätning kräver uppställningsbar motstående ände.
      if (redanMatt && !occupied.has(t.id)) return;
      // Fix 3.3: motriktad ommätning föredras framför upprepning i samma
      // riktning. t→s ligger i poolen som eget ordnat par.
      if (hasFwd && !hasRev) return;
      const dist = d2EN(s, t);
      // Etapp A: maxavståndet är en fysikalisk gräns (sikt genom tunnelvägg
      // etc.) och får ALDRIG överskridas, oavsett hur mycket nätet skulle
      // förbättras av mätningen.
      if (maxSuggestDist != null && dist > maxSuggestDist) { filteredByDistance++; return; }
      if (obstacles.length && !hasLineOfSight(s, t, obstacles).visible) { filteredByObstacle++; return; }
      candidates.push({
        from: s.id, to: t.id, dist,
        kind: hasFwd ? 'duplicate' : hasRev ? 'reverse' : 'new',
      });
    });
  });

  candidates.sort(byPair);
  return { candidates, filteredByDistance, filteredByObstacle };
}

/**
 * Viktad poäng för en förändring av nätet, uttryckt som förbättring från
 * `before` till `after`. Båda leden relativiseras mot kravnivån (σ_max
 * respektive r_min) så att millimeter och dimensionslösa r-tal blir
 * jämförbara storheter – annars skulle vikterna 50/50 betyda helt olika saker
 * i ett millimeternät och i ett centimeternät.
 *
 * Samma formel används i båda faserna: i Fas 2 byts argumenten så att poängen
 * blir mätningens BIDRAG till nätet (hur mycket sämre nätet blir utan den).
 */
export function scoreDelta(before, after, criteria, weights) {
  if (!after.computable)  return -Infinity;
  if (!before.computable) {
    // Utgångsläget saknar definierade metrics (singulärt/underdeterminerat
    // nät) – ranka på absolut kvalitet i stället för på skillnad.
    return weights.r * (after.minR / criteria.rMin)
         - weights.sigma * (after.maxSigPosMm / criteria.sigmaMaxMm);
  }
  const dSigma = (before.maxSigPosMm - after.maxSigPosMm) / criteria.sigmaMaxMm;
  const dR     = (after.minR - before.minR) / criteria.rMin;
  return weights.sigma * dSigma + weights.r * dR;
}

const fmtMm = v => (v == null ? '–' : Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : 'oändlig');
const fmtR  = v => (v == null ? '–' : Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(3) : 'oändlig');

/**
 * Fix 2.3: raden som redovisar tvånivåkravet på r efter varje operation.
 * Det mjuka kravet (r < 0,50, HMK Bilaga F.6) räknas och redovisas så att
 * användaren kan motivera observationerna i planeringsrapporten; det hårda
 * (r < 0,35, SIS-TS §6.2.2) bekräftas vara uppfyllt.
 */
export function formatRReport(e) {
  if (e.belowSoft == null) return '';
  const soft = Number(e.softLimit).toFixed(2), hard = Number(e.hardLimit).toFixed(2);
  const mjuk = e.belowSoft === 0
    ? `Inga observationer under r ${soft}.`
    : `${e.belowSoft} observation${e.belowSoft === 1 ? '' : 'er'} under r ${soft} (rapporteras).`;
  const hard_ = e.belowHard === 0
    ? `Inget värde under det hårda kravet r ${hard}.`
    : `⚠ ${e.belowHard} observation${e.belowHard === 1 ? '' : 'er'} UNDER det hårda kravet r ${hard}.`;
  return ` ${mjuk} ${hard_}`;
}

/** Beslutsspårningens radtext. En källa för dialog, tester och rapport. */
export function formatLogEntry(e) {
  const head = `Iteration ${e.iteration} (Fas ${e.phase}): `;
  if (e.action === 'add') {
    const eff = `σ_pos-effekt ${fmtMm(e.sigmaEffectMm)} mm, r-tal-effekt ${fmtR(e.rEffect)}`;
    // Fix 3.4: en dubbelmätning är ingen ny sträcka utan en oberoende
    // ommätning – det måste framgå, annars läser användaren förslaget fel.
    const vad = e.kind === 'reverse'
      ? `dubbelmätning ${e.from}→${e.to} (motriktad ommätning av sträckan ${e.line})`
      : e.kind === 'duplicate'
        ? `dubbelmätning ${e.from}→${e.to} (ytterligare mätning av sträckan ${e.line})`
        : `mätning ${e.from}→${e.to}`;
    const strackan = e.lineRBefore != null && e.lineRAfter != null
      ? ` Höjer r-tal för sträckan ${e.line} från ${e.lineRBefore.toFixed(2)} till ${e.lineRAfter.toFixed(2)}.`
      : '';
    return head + `Lade till ${vad}. Störst förbättring av nätet: ${eff}.${strackan} ` +
      (e.criteriaOk ? 'Alla acceptanskriterier hålls nu.'
                    : `Kvarstår: ${e.violations.map(v => v.text).join('; ')}.`) +
      formatRReport(e);
  }
  if (e.action === 'remove') {
    const eff = `σ_pos-effekt ${fmtMm(e.sigmaEffectMm)} mm, r-tal-effekt ${fmtR(e.rEffect)}`;
    return head + `Tog bort mätning ${e.from}→${e.to}. Bidrog minst till nätet: ${eff}. ` +
      'Alla kriterier hålls fortfarande.' + formatRReport(e);
  }
  return head + e.note;
}

// Bygger ett mätningsobjekt av samma form som UI:t skapar vid import av
// förslag – annars skulle en optimerad mätning sakna a priori-osäkerheter.
function buildMeas(id, from, to, defaultInstr) {
  const key = INSTRUMENTS[defaultInstr] ? defaultInstr : 'ts16_1';
  const pr  = INSTRUMENTS[key];
  return {
    id, from, to,
    obsType: 'both',
    instrPreset: key,
    sigDist_mm: pr.sigDmm, sigDist_ppm: pr.sigDppm,
    sigHz_mgon: pr.sigHz, numSatser: 3,
    measDist: null, measHz: null,
  };
}

function evaluate(pts, meas, centerErr, criteria) {
  const sim = computeSimulation({ pts, meas, centerErr });
  const metrics = metricsFromSim(sim, criteria);
  return { metrics, check: checkCriteria(metrics, criteria), sim };
}

/**
 * Minsta riktnings-r för en STRÄCKA (oordnat par), oavsett mätriktning.
 * Fix 3.4 redovisar sträckans kontrollerbarhet före och efter en
 * dubbelmätning – inte nätets minsta r-tal, som kan sitta någon annanstans.
 */
export function lineMinHzR(sim, a, b) {
  if (!sim?.ok) return null;
  const rs = sim.redund.filter(r => r.type === 'hz' &&
    ((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a))).map(r => r.ri);
  return rs.length ? Math.min(...rs) : null;
}

/** Minsta riktnings-r för en enskild RIKTNING (ordnat par). */
export function dirMinHzR(sim, from, to) {
  if (!sim?.ok) return null;
  const rs = sim.redund.filter(r => r.type === 'hz' && r.fromId === from && r.toId === to)
                       .map(r => r.ri);
  return rs.length ? Math.min(...rs) : null;
}

/**
 * r-talet som Fix 3.4 rapporterar för en dubbelmätning, mätt på det som
 * faktiskt förändras:
 *
 *   • UPPREKAD riktning – riktningens EGET r-tal. Två identiska observationer
 *     kontrollerar varandra, så det är där hela effekten hamnar (0,22 → 0,56 i
 *     test1_baseline). Motriktningen rör sig knappt.
 *   • MOTRIKTAD ommätning – sträckans lägsta r-tal. Den nya riktningen har
 *     inget r före, och den hänger på den andra uppställningens
 *     orienteringsobekant, så effekten fördelas över sträckan i stället för att
 *     samlas i en riktning.
 */
function reportR(sim, from, to, kind) {
  return kind === 'duplicate' ? dirMinHzR(sim, from, to) : lineMinHzR(sim, from, to);
}

// Sträckans namn, alltid i samma ordning oavsett mätriktning.
const lineLabel = (a, b) => (a < b ? `${a}–${b}` : `${b}–${a}`);

// Åtgärdsförslag när Fas 1 kör slut på kandidater eller slår i taket.
function buildSuggestions(violations, ctx) {
  const keys = new Set(violations.map(v => v.key));
  const out = [];
  if (ctx.filteredByDistance > 0 && ctx.maxSuggestDist != null) {
    out.push(`Öka maxavståndet från ${ctx.maxSuggestDist} m till ${Math.round(ctx.maxSuggestDist * 2)} m ` +
             `– ${ctx.filteredByDistance} möjliga mätningar filtrerades bort av avståndsgränsen.`);
  }
  if (ctx.filteredByObstacle > 0) {
    out.push(`${ctx.filteredByObstacle} möjliga mätningar blockeras av hinder – flytta uppställningar ` +
             'eller kontrollera att hindren är rätt inritade.');
  }
  if (ctx.poolEmpty) {
    out.push(ctx.filteredByDistance > 0 || ctx.filteredByObstacle > 0
      ? 'Lägg till fler anslutningspunkter eller uppställningar – alla mätningar som är tillåtna ' +
        'inom nuvarande gränser finns redan i nätet.'
      : 'Lägg till fler anslutningspunkter eller uppställningar – alla möjliga mätningar mellan ' +
        'befintliga punkter finns redan i nätet.');
  }
  if (keys.has('sigmaMax')) {
    out.push(`Sänk kraven på σ_max (${ctx.criteria.sigmaMaxMm} mm gäller för mätklass ${ctx.criteria.klass}) ` +
             'eller använd ett instrument med lägre a priori-osäkerhet.');
  }
  if (keys.has('rMin') || keys.has('kMin')) {
    out.push('Fler uppställningar ger fler oberoende kontroller – nätet saknar överbestämning, ' +
             'inte precision.');
  }
  if (keys.has('berakning')) {
    out.push('Nätet går inte att beräkna: kontrollera att minst en känd punkt är inmätt och att varje ' +
             'fri punkt mäts från minst två håll.');
  }
  return out;
}

/**
 * Optimeringen som generator. Varje yield är en progress-rapport så att UI:t
 * (eller en Web Worker) kan visa framsteg utan att kärnan känner till dem.
 * Returvärdet (generatorns `value` när `done`) är resultatobjektet.
 */
export function* optimizeNetworkSteps(input) {
  const {
    pts = [], centerErr = 1.0, obstacles = [], maxSuggestDist = null,
    defaultInstr = 'ts16_1', nextMeasId = 1,
    maxAdditions = MAX_ADDITIONS, maxIterations = MAX_ITERATIONS,
  } = input;

  // Fix 2.2: projektets egna σ_max (optimizerConfig.sigma_max_mm) överstyr
  // klassens produktdefault. Utelämnat värde ⇒ klassens default.
  const criteria = input.criteria || criteriaForClass(input.matklass, { sigmaMaxMm: input.sigmaMaxMm });
  const weights  = normalizeWeights(input.weights);
  const baseMeas = (input.meas || []).map(m => ({ ...m }));

  let work = baseMeas.map(m => ({ ...m }));
  let idCounter = Math.max(1, Math.floor(Number(nextMeasId) || 1));
  const usedIds = new Set(work.map(m => m.id));
  const nextId = () => {
    let id = `M${idCounter++}`;
    while (usedIds.has(id)) id = `M${idCounter++}`;
    usedIds.add(id);
    return id;
  };

  const log = [];
  const added = [], removed = [];
  let iteration = 0;

  const base = evaluate(pts, work, centerErr, criteria);
  let cur = base;

  const push = e => { e.text = formatLogEntry(e); log.push(e); return e; };
  const fail = (message, violations, ctx) => ({
    ok: false,
    error: { message, violations, suggestions: buildSuggestions(violations, { ...ctx, criteria }) },
    meas: baseMeas,               // nätet lämnas orört vid avbrott
    addedIds: [], removedIds: [],
    log, criteria, weights,
    baseMetrics: base.metrics, finalMetrics: base.metrics,
    nextMeasId: Math.max(1, Math.floor(Number(nextMeasId) || 1)),
    iterations: iteration,
  });

  // ── Fas 1 – additiv ────────────────────────────────────────────────────────
  let additions = 0;
  if (cur.check.ok) {
    push({ iteration: 0, phase: 1, action: 'skip',
           note: 'Alla acceptanskriterier hålls redan – ingen mätning behövde läggas till.' });
  }
  while (!cur.check.ok) {
    if (additions >= maxAdditions) {
      return fail(
        `Optimeringen avbröts: säkerhetsgränsen ${maxAdditions} tillagda mätningar nåddes utan att ` +
        'acceptanskriterierna kunde uppfyllas. Nätet är fundamentalt otillräckligt för kravnivån.',
        cur.check.violations,
        { maxSuggestDist, filteredByDistance: 0, filteredByObstacle: 0, poolEmpty: false });
    }
    if (iteration >= maxIterations) {
      return fail(`Optimeringen avbröts: iterationsgränsen ${maxIterations} nåddes.`,
        cur.check.violations,
        { maxSuggestDist, filteredByDistance: 0, filteredByObstacle: 0, poolEmpty: false });
    }

    const pool = generateCandidates({ pts, meas: work, obstacles, maxSuggestDist });
    if (pool.candidates.length === 0) {
      return fail(
        'Optimeringen avbröts: det finns inga fler möjliga mätningar att lägga till, och ' +
        'acceptanskriterierna är fortfarande inte uppfyllda.',
        cur.check.violations,
        { maxSuggestDist, filteredByDistance: pool.filteredByDistance,
          filteredByObstacle: pool.filteredByObstacle, poolEmpty: true });
    }

    yield { phase: 1, iteration: iteration + 1, kind: 'search',
            message: `Fas 1: prövar ${pool.candidates.length} kandidatmätningar`,
            candidates: pool.candidates.length };

    let best = null;
    for (let i = 0; i < pool.candidates.length; i++) {
      const c = pool.candidates[i];
      const trial = [...work, buildMeas('__trial__', c.from, c.to, defaultInstr)];
      const ev = evaluate(pts, trial, centerErr, criteria);
      const score = scoreDelta(cur.metrics, ev.metrics, criteria, weights);
      // Strikt > i en totalordnad lista ⇒ första kandidaten vinner vid lika
      // poäng, vilket gör valet reproducerbart.
      if (best === null || score > best.score) best = { cand: c, ev, score };
      yield { phase: 1, iteration: iteration + 1, kind: 'candidate',
              index: i + 1, total: pool.candidates.length };
    }

    // Alla kandidater lämnar nätet oberäkningsbart – ta den första i den
    // deterministiska ordningen och fortsätt bygga. Fallet slutar antingen i
    // ett beräkningsbart nät eller i säkerhetsgränsen ovan.
    if (best.score === -Infinity) {
      const first = pool.candidates[0];
      best = {
        cand: first, score: -Infinity,
        ev: evaluate(pts, [...work, buildMeas('__trial__', first.from, first.to, defaultInstr)],
                     centerErr, criteria),
      };
    }

    iteration++; additions++;
    const id = nextId();
    work = [...work, buildMeas(id, best.cand.from, best.cand.to, defaultInstr)];
    added.push(id);
    const prev = cur;
    cur = best.ev;
    const bothComputable = prev.metrics.computable && cur.metrics.computable;
    const kind = best.cand.kind || 'new';
    const line = lineLabel(best.cand.from, best.cand.to);
    const entry = push({
      iteration, phase: 1, action: 'add', measId: id,
      from: best.cand.from, to: best.cand.to, dist: best.cand.dist,
      kind, line,
      lineRBefore: kind === 'new' ? null : reportR(prev.sim, best.cand.from, best.cand.to, kind),
      lineRAfter:  kind === 'new' ? null : reportR(cur.sim,  best.cand.from, best.cand.to, kind),
      sigmaEffectMm: bothComputable ? prev.metrics.maxSigPosMm - cur.metrics.maxSigPosMm : null,
      rEffect:       bothComputable ? cur.metrics.minR - prev.metrics.minR : null,
      score: best.score,
      criteriaOk: cur.check.ok,
      violations: cur.check.violations,
      metrics: cur.metrics,
      belowSoft: cur.metrics.nBelowSoft, belowHard: cur.metrics.nBelowHard,
      softLimit: criteria.rSoft, hardLimit: criteria.rMin,
    });
    yield { phase: 1, iteration, kind: 'operation', entry };
  }

  // ── Fas 2 – subtraktiv ─────────────────────────────────────────────────────
  for (;;) {
    if (iteration >= maxIterations) {
      push({ iteration, phase: 2, action: 'stop',
             note: `Iterationsgränsen ${maxIterations} nåddes – bantningen avbröts här.` });
      break;
    }
    if (work.length === 0) break;

    yield { phase: 2, iteration: iteration + 1, kind: 'search',
            message: `Fas 2: prövar att ta bort ${work.length} mätningar`,
            candidates: work.length };

    // Bidrag = hur mycket sämre nätet blir utan mätningen (samma viktade
    // formel som Fas 1, med argumenten omkastade).
    const ranked = [];
    for (let i = 0; i < work.length; i++) {
      const trial = work.filter((_, j) => j !== i);
      const ev = evaluate(pts, trial, centerErr, criteria);
      const contribution = ev.metrics.computable
        ? scoreDelta(ev.metrics, cur.metrics, criteria, weights)
        : Infinity;   // oberäkningsbart utan den ⇒ oumbärlig
      ranked.push({
        index: i, meas: work[i], ev, contribution,
        sigmaEffectMm: ev.metrics.computable && cur.metrics.computable
          ? ev.metrics.maxSigPosMm - cur.metrics.maxSigPosMm : null,
        rEffect: ev.metrics.computable && cur.metrics.computable
          ? ev.metrics.minR - cur.metrics.minR : null,
      });
      yield { phase: 2, iteration: iteration + 1, kind: 'candidate',
              index: i + 1, total: work.length };
    }

    // Minst bidrag först; lika bidrag bryts på mätningens plats i listan så
    // att ordningen är entydig.
    ranked.sort((a, b) => a.contribution - b.contribution || a.index - b.index);

    const victim = ranked.find(r => r.ev.check.ok);
    if (!victim) {
      push({ iteration, phase: 2, action: 'stop',
             note: 'Ingen ytterligare mätning kan tas bort utan att bryta acceptanskriterierna – ' +
                   'det optimerade nätet är hittat.' });
      break;
    }

    iteration++;
    work = work.filter((_, j) => j !== victim.index);
    removed.push(victim.meas.id);
    cur = victim.ev;
    const entry = push({
      iteration, phase: 2, action: 'remove', measId: victim.meas.id,
      from: victim.meas.from, to: victim.meas.to,
      sigmaEffectMm: victim.sigmaEffectMm, rEffect: victim.rEffect,
      score: victim.contribution,
      criteriaOk: true, violations: [],
      metrics: cur.metrics,
      belowSoft: cur.metrics.nBelowSoft, belowHard: cur.metrics.nBelowHard,
      softLimit: criteria.rSoft, hardLimit: criteria.rMin,
    });
    yield { phase: 2, iteration, kind: 'operation', entry };
  }

  return {
    ok: true,
    meas: work,
    addedIds: added,
    removedIds: removed,
    log, criteria, weights,
    baseMetrics: base.metrics,
    finalMetrics: cur.metrics,
    nextMeasId: idCounter,
    iterations: iteration,
  };
}

/** Synkron körning – driver generatorn till slut och returnerar resultatet. */
export function optimizeNetwork(input, onProgress) {
  const it = optimizeNetworkSteps(input);
  let step = it.next();
  while (!step.done) {
    if (onProgress) onProgress(step.value);
    step = it.next();
  }
  return step.value;
}
