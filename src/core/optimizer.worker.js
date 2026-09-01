// Web Worker-skal för nätoptimeringen (Etapp E).
//
// Optimeringen räknar om Q_xx för varje kandidat, vilket är O(u³) per
// inversion. För stora nät blir en körning tillräckligt lång för att frysa
// UI:t, och då flyttas hela beräkningen hit. Workern innehåller ingen logik –
// den driver generatorn i src/core/optimizer.js och postar progress. Kärnan är
// ren och rör varken DOM eller store, vilket är förutsättningen för att den
// ska kunna köras här.
import { optimizeNetworkSteps } from './optimizer.js';

self.onmessage = (e) => {
  const input = e.data;
  try {
    const it = optimizeNetworkSteps(input);
    let step = it.next();
    let last = 0;
    while (!step.done) {
      // Strypning: kandidat-yields kommer tusentals i sekunden och skulle
      // annars dränka huvudtråden i meddelanden. Operationer släpps alltid
      // igenom eftersom de utgör beslutsloggen.
      const now = Date.now();
      if (step.value.kind !== 'candidate' || now - last > 100) {
        last = now;
        self.postMessage({ type: 'progress', progress: step.value });
      }
      step = it.next();
    }
    self.postMessage({ type: 'done', result: step.value });
  } catch (err) {
    self.postMessage({ type: 'failed', message: String(err?.message || err) });
  }
};
