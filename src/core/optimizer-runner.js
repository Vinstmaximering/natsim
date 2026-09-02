// Körning av nätoptimeringen utan att frysa UI:t (Etapp E).
//
// Två vägar, samma generator i botten (src/core/optimizer.js) så att resultatet
// är identiskt oavsett väg:
//
//   • Web Worker – för mätningstunga nät, där en körning tar sekunder. Kräver att
//     miljön har Worker och att bundlern kan följa new URL(...)-mönstret
//     (Vite gör det). Faller tillbaka på huvudtråden om något går fel.
//   • Huvudtråden i tidsskivor – generatorn körs i block om ~25 ms med
//     kontrollen återlämnad till event-loopen däremellan, så att progress
//     hinner ritas ut och sidan inte hänger. Detta är också vägen i
//     testmiljön (jsdom saknar Worker).
import { optimizeNetworkSteps } from './optimizer.js';

// ── Worker-tröskel ───────────────────────────────────────────────────────────
// Tröskeln går på ANTAL MÄTNINGAR, inte antal punkter. Kostnaden per iteration
// är (antal kandidater) × en full utjämning, och en utjämning är O(n·u²) för
// N = AᵀPA plus O(u³) för inversen. Både kandidatantalet och n växer med
// mätningarna, så mätningsantalet – inte punktantalet – styr körtiden.
//
// Den tidigare gränsen (≥ 30 punkter) missade just de dyra fallen. Mätning i
// bilaga B till docs/troubleshooting/etapp_E_diagnos_20260902.md:
//
//   8 punkter /  28 mätningar →  0,15 s   (kördes på huvudtråden – rimligt)
//  16 punkter / 120 mätningar →  6,9 s    (kördes OCKSÅ på huvudtråden ⇒ fryst UI)
//
// Skalningen mellan de två mätpunkterna är brant (≈ 45× på 4,3× mätningar), så
// gränsen ska ligga lågt. 50 mätningar motsvarar i den mätserien några hundra
// millisekunder – under tröskeln där en användare uppfattar gränssnittet som
// fruset – och lägger allt tyngre över på workern med god marginal.
export const WORKER_MEAS_THRESHOLD = 50;

// Tidsskiva innan huvudtrådskörningen lämnar tillbaka kontrollen.
const SLICE_MS = 25;

/**
 * @param {{meas?:Array}} input – optimeringens indata (eller state; bara meas läses)
 */
export function shouldUseWorker({ meas = [] } = {}) {
  return typeof Worker !== 'undefined' && meas.length >= WORKER_MEAS_THRESHOLD;
}

const nextTick = () => new Promise(res => setTimeout(res, 0));

/** Kör generatorn på huvudtråden i tidsskivor. */
export async function runOptimizationInline(input, onProgress) {
  const it = optimizeNetworkSteps(input);
  let step = it.next();
  let sliceStart = Date.now();
  let lastProgress = 0;
  while (!step.done) {
    const now = Date.now();
    if (onProgress && (step.value.kind !== 'candidate' || now - lastProgress > 100)) {
      lastProgress = now;
      onProgress(step.value);
    }
    if (now - sliceStart > SLICE_MS) {
      await nextTick();
      sliceStart = Date.now();
    }
    step = it.next();
  }
  return step.value;
}

/** Kör optimeringen i en Web Worker. Rejectar om workern inte kan startas. */
export function runOptimizationInWorker(input, onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    worker.onmessage = ev => {
      const msg = ev.data;
      if (msg.type === 'progress') { onProgress?.(msg.progress); return; }
      worker.terminate();
      if (msg.type === 'done') resolve(msg.result);
      else reject(new Error(msg.message || 'Optimeringen misslyckades i bakgrundstråden'));
    };
    worker.onerror = err => { worker.terminate(); reject(err instanceof Error ? err : new Error('Worker-fel')); };
    worker.postMessage(input);
  });
}

/**
 * Kör optimeringen och returnerar resultatobjektet från optimizeNetworkSteps.
 *
 * @param {object} input         – indata till optimeringen
 * @param {object} [opts]
 * @param {Function} [opts.onProgress] – anropas med progress-objekt
 * @param {boolean} [opts.useWorker]   – tvinga på/av worker (default: automatiskt)
 */
export async function runOptimization(input, { onProgress, useWorker } = {}) {
  const wantWorker = useWorker !== undefined ? useWorker : shouldUseWorker(input);
  if (wantWorker && typeof Worker !== 'undefined') {
    try {
      return await runOptimizationInWorker(input, onProgress);
    } catch (e) {
      // Bättre att köra långsamt på huvudtråden än att inte köra alls.
      console.warn('Optimering i Web Worker misslyckades – kör på huvudtråden:', e);
    }
  }
  return runOptimizationInline(input, onProgress);
}
