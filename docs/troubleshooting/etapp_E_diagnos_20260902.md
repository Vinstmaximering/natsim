# Etapp E – diagnostisk rapport (nätoptimering)

| | |
|---|---|
| **Datum** | 2026-09-02 |
| **Commit** | `b511531` (main = dev = lokal gren) |
| **Föregående commit i etappen** | `63932c5` (ursprunglig leverans av Etapp E) |
| **Testsvit vid rapporttillfället** | 509/509 gröna |
| **Kodändringar under detta arbete** | **Inga.** Ingenting i `src/` eller `tests/` har rörts. |

## Om metoden

Optimeringskärnan är en generator (`optimizeNetworkSteps`) som yieldar per
kandidat och per beslut. Därför gick det att producera den iterationslogg som
efterfrågas i steg 4 **utan att lägga till loggning i produktionskoden** – en
diagnostisk harness utanför repot driver generatorn och skriver ut varje steg.
Harnessen skuggberäknar dessutom kandidatpoängen med samma exporterade
funktioner (`generateCandidates`, `scoreDelta`, `checkCriteria`,
`computeSimulation`) som kärnan använder internt.

Harnessens filer (ligger i sessionens scratchpad, inte i repot):

```
<scratchpad>/diag-etapp-e.mjs     – trace-harness med iterationslogg
<scratchpad>/scenarier.mjs        – scenario 1, 2, 3 + kontrollvarianter
<scratchpad>/kontrafaktisk.mjs    – experiment med vidare kandidatpool
```

Fullständig sökväg:
`C:\Users\sjost\AppData\Local\Temp\claude\c--Users-sjost-Documents-natsim\85ca2d7f-a631-4867-a179-dc43374c5db2\scratchpad\`

**En avvikelse från uppdragsbeskrivningen bör noteras direkt:** filen
`test1_baseline.json` finns inte i repot. Nätet som kallas test1_baseline är
definierat inline i [tests/facit.test.js:933-943](../../tests/facit.test.js#L933-L943)
(facittest F20) och det är den definitionen som använts här – A och B kända,
N1 ny, sex mätningar med `obsType: 'both'` = 12 observationer. Något
Ersmarkstunneln-projekt finns inte heller lokalt; scenario 2 kördes därför på
det syntetiska 8-punktersnätet enligt alternativet i beställningen.

---

# Steg 1 – Nuvarande implementation

## Del A – Läsning av mätklass och toleransvärden

**Mätklassen läses från `state.activeMatklass`** på ett enda ställe, i dialogen,
och skickas in i kärnan som `matklass`:

[src/ui/optimizer-modal.js:26](../../src/ui/optimizer-modal.js#L26)
```js
const criteria = criteriaForClass(state.activeMatklass);
```

[src/ui/optimizer-modal.js:220-229](../../src/ui/optimizer-modal.js#L220-L229)
```js
_result = await runOptimization({
  pts: state.pts, meas: state.meas, centerErr: state.centerErr,
  obstacles: state.obstacles || [],
  maxSuggestDist: normalizeMaxSuggestDist(state.maxSuggestDist),
  matklass: state.activeMatklass,
  weights: { sigma: cfg.weightSigma, r: cfg.weightR },
  defaultInstr: state.defaultInstr,
  nextMeasId: state.nMid ?? 1,
}, { onProgress });
```

**Mappningen klass → toleransvärden** sker i
[src/core/optimizer-criteria.js:51-68](../../src/core/optimizer-criteria.js#L51-L68):

```js
export function criteriaForClass(klass) {
  const key = SIS_TS_CLASSES[klass] ? klass : FALLBACK_KLASS;   // FALLBACK_KLASS = 'G2'
  const c = SIS_TS_CLASSES[key];
  const g = SIS_TS_GENERAL_REQS;
  return {
    klass: key,
    assumedClass: key !== klass,
    rMin: R_MIN_DEFAULT,             // = R_OBS_GOD = 0.50
    sigmaMaxMm: c.spridningLangd_mm, // G1 2 · G2 3 · G3 5 · G4 8
    kMin: g.k_global_min,            // 0.50
    mufFactorMax: g.muf_factor_max,  // 4
    ytFactorMax: g.yt_factor_max,    // 2
    enforceMufYt: true,
    source: `${c._source} + SIS-TS 21143:2016 §6.2.2`,
  };
}
```

Värdena är alltså **inte hårdkodade i optimeringen** utan hämtas ur två
befintliga tabeller plus två delade konstanter:

| Storhet | Läses från | Värde (G2) |
|---|---|---|
| `sigmaMaxMm` | [src/data/sis-ts-classes.js:19](../../src/data/sis-ts-classes.js#L19) `spridningLangd_mm` | 3 mm |
| `kMin` | [src/data/sis-ts-classes.js:51](../../src/data/sis-ts-classes.js#L51) `k_global_min` | 0,50 |
| `mufFactorMax` / `ytFactorMax` | [src/data/sis-ts-classes.js:53-54](../../src/data/sis-ts-classes.js#L53-L54) | 4 / 2 |
| `rMin` | [src/core/constants.js:161](../../src/core/constants.js#L161) `R_OBS_GOD` | 0,50 |

`R_OBS_GOLV = 0,30` / `R_OBS_GOD = 0,50` i
[src/core/constants.js:160-161](../../src/core/constants.js#L160-L161) delas med
`validateNetwork()`. **Notera:** `rMin` var 0,30 i den ursprungliga leveransen
och höjdes till 0,50 den 2026-09-01 efter att optimerade nät utlöste
valideringsvarningar. Se F-4 nedan – höjningen har en direkt konsekvens för
scenario 1.

Två tolkningar i mappningen som **inte är verifierade av geodet** och som
behöver granskas:

1. `σ_max` tolkas som Tabell A.9:s kolumn *spridning längd* och prövas mot
   punkternas `σ_pos` (1σ) ur simuleringen. Det är två olika storheter i
   normen – kolumnen anger tillåten spridning i mätserien, inte tak för
   punktosäkerheten.
2. `r_min` är inte hämtat ur normen alls, utan ur NätSims egen färgskala
   (validering/rClass). SIS-TS §6.2.2 anger k > 0,35 för enskild mätning – det
   är k, inte r_i.

## Del B – Generering av kandidatpool

[src/core/optimizer.js:72-94](../../src/core/optimizer.js#L72-L94)
```js
export function generateCandidates({ pts = [], meas = [], obstacles = [], maxSuggestDist = null }) {
  const active = new Set(meas.map(m => `${m.from} ${m.to}`));
  const stations = pts.filter(isStationPoint);
  const candidates = [];
  let filteredByDistance = 0, filteredByObstacle = 0;

  stations.forEach(s => {
    pts.forEach(t => {
      if (t.id === s.id) return;
      if (active.has(`${s.id} ${t.id}`)) return;
      const dist = d2EN(s, t);
      if (maxSuggestDist != null && dist > maxSuggestDist) { filteredByDistance++; return; }
      if (obstacles.length && !hasLineOfSight(s, t, obstacles).visible) { filteredByObstacle++; return; }
      candidates.push({ from: s.id, to: t.id, dist });
    });
  });

  candidates.sort(byPair);
  return { candidates, filteredByDistance, filteredByObstacle };
}
```

Svar på de tre frågorna:

- **Bara mätningar mellan befintliga punkter.** Inga nya punkter och inga nya
  stationer föreslås någonsin. Poolen är en delmängd av de ordnade paren
  (uppställningspunkt → godtycklig annan punkt).
- **`maxSuggestDist` respekteras** på rad 86, före hinderkontrollen, och räknas
  som bortfiltrerat i `filteredByDistance` (används till åtgärdsförslagen).
  Gränsen är hård – ingen kandidat över tröskeln kan väljas.
- **Vad som räknas som uppställningspunkt** avgörs av `isStationPoint()`,
  [src/core/designmatrix.js:8-14](../../src/core/designmatrix.js#L8-L14):
  `type === "station"` eller `type === "known" && isStation === true`.
  Detta är **punkttyp**, inte "punkter som faktiskt är uppställda". Kärnans egen
  definition vid ekvationsuppställningen är en annan – `stationIds(meas)` i
  [src/core/simulation.js:29-33](../../src/core/simulation.js#L29-L33) räknar
  varje punkt som är `from` i minst en icke-`dist_only`-mätning. **De två
  definitionerna sammanfaller inte** (F-1).

Dessutom utesluter rad 81 par som redan mäts, vilket gör dubbelmätning omöjlig
att föreslå (F-3).

## Del C – Poängberäkning

[src/core/optimizer.js:106-117](../../src/core/optimizer.js#L106-L117)
```js
export function scoreDelta(before, after, criteria, weights) {
  if (!after.computable)  return -Infinity;
  if (!before.computable) {
    return weights.r * (after.minR / criteria.rMin)
         - weights.sigma * (after.maxSigPosMm / criteria.sigmaMaxMm);
  }
  const dSigma = (before.maxSigPosMm - after.maxSigPosMm) / criteria.sigmaMaxMm;
  const dR     = (after.minR - before.minR) / criteria.rMin;
  return weights.sigma * dSigma + weights.r * dR;
}
```

Exakt formel (normalläget):

```
poäng = w_σ · (σ_max^före − σ_max^efter)/σ_max^krav
      + w_r · (r_min^efter − r_min^före)/r_min^krav
```

- **σ_pos-effekten** är skillnaden i **största** σ_pos över alla fria punkter,
  i mm, dividerad med kravet (3 mm för G2).
- **r-tal-effekten** är skillnaden i **minsta** r_i över alla observationer,
  dividerad med kravet (0,50).
- Båda är alltså **extremvärden**, inte medelvärden. En kandidat som förbättrar
  nio punkter men lämnar den sämsta orörd får noll i σ-ledet.

Metrics som formeln läser kommer från
[src/core/optimizer-criteria.js:80-99](../../src/core/optimizer-criteria.js#L80-L99):
`minR = min(r_i)`, `maxSigPosMm = max(σ_pos)·1000`, `kGlobal = K_global`,
`maxMufFactor = κ/√minR`, `maxYtFactor = (1−minR)·κ/√minR` med κ = 2,80.

**Fas 2 använder samma funktion med omkastade argument**
([src/core/optimizer.js:336-338](../../src/core/optimizer.js#L336-L338)):

```js
const contribution = ev.metrics.computable
  ? scoreDelta(ev.metrics, cur.metrics, criteria, weights)
  : Infinity;   // oberäkningsbart utan den ⇒ oumbärlig
```

alltså *hur mycket sämre nätet blir utan mätningen*.

**Viktningen** läses ur `state.optimizerConfig` (default 50/50), normaliseras
till summa 1 i `normalizeWeights()`
([src/core/optimizer.js:49-56](../../src/core/optimizer.js#L49-L56)) och sparas
i projektfilen som `optimizerConfig`
([src/io/export-project.js:38](../../src/io/export-project.js#L38)).

## Del D – Iterativ Q_xx-beräkning

**Allt räknas om från början vid varje prövning.** Ingen inkrementell
uppdatering, ingen Sherman–Morrison, ingen caching mellan iterationer.

[src/core/optimizer.js:154-157](../../src/core/optimizer.js#L154-L157)
```js
function evaluate(pts, meas, centerErr, criteria) {
  const metrics = metricsFromSim(computeSimulation({ pts, meas, centerErr }));
  return { metrics, check: checkCriteria(metrics, criteria) };
}
```

`computeSimulation()` bygger A och P från noll, formar N = AᵀPA med tre
nästlade loopar, inverterar med `invertMatrix()` och räknar r_i via
h_ii = a_iᵀ Q_xx a_i · p_i. Per iteration görs alltså:

- **Fas 1:** en full simulering per kandidat (poolens storlek), plus en till för
  det valda nätet.
- **Fas 2:** en full simulering per aktiv mätning.

Kostnaden är O(m · (n·u² + u³)) per iteration. Det är medvetet valt (samma kärna
som den vanliga simuleringen ⇒ inga avvikelser i matematiken) men är också
förklaringen till prestandaproblemet i F-6.

## Del E – Fas-övergången

Det finns ingen explicit övergång: Fas 1 är en `while`-loop som lämnas när
kriterierna håller, varefter Fas 2 börjar.

[src/core/optimizer.js:240-244](../../src/core/optimizer.js#L240-L244)
```js
let additions = 0;
if (cur.check.ok) {
  push({ iteration: 0, phase: 1, action: 'skip',
         note: 'Alla acceptanskriterier hålls redan – ingen mätning behövde läggas till.' });
}
while (!cur.check.ok) {
```

Det exakta villkoret är alltså `checkCriteria(metrics, criteria).ok`, dvs.
**alla** kriterier samtidigt:
[src/core/optimizer-criteria.js:107-126](../../src/core/optimizer-criteria.js#L107-L126)
– `minR ≥ rMin`, `maxSigPosMm ≤ sigmaMaxMm`, `kGlobal ≥ kMin`, och (sedan
2026-09-01) `maxMufFactor ≤ 4`, `maxYtFactor ≤ 2`. Ett nät som inte går att
beräkna räknas som brott mot kriteriet `berakning`.

Fas 2 är en `for(;;)`-loop, [src/core/optimizer.js:318](../../src/core/optimizer.js#L318),
som avbryts när ingen mätning kan tas bort utan att bryta kriterierna:

[src/core/optimizer.js:352-360](../../src/core/optimizer.js#L352-L360)
```js
ranked.sort((a, b) => a.contribution - b.contribution || a.index - b.index);

const victim = ranked.find(r => r.ev.check.ok);
if (!victim) {
  push({ iteration, phase: 2, action: 'stop',
         note: 'Ingen ytterligare mätning kan tas bort utan att bryta acceptanskriterierna – ' +
               'det optimerade nätet är hittat.' });
  break;
}
```

Kritisk konsekvens: **Fas 2 körs bara om Fas 1 lyckades.** Misslyckas Fas 1
returneras `fail(...)` direkt och bantningen sker aldrig. Ett nät som är både
otillräckligt i en del och överbestämt i en annan får alltså ingen bantning alls.

## Del F – Terminering

Säkerhetsgränserna som faktiskt är satta:

[src/core/optimizer.js:39-40](../../src/core/optimizer.js#L39-L40)
```js
export const MAX_ADDITIONS  = 50;
export const MAX_ITERATIONS = 200;
```

| # | Villkor | Var | Utfall |
|---|---|---|---|
| 1 | `additions >= maxAdditions` (50) | [rad 245](../../src/core/optimizer.js#L245) | `fail()` – "säkerhetsgränsen 50 tillagda mätningar nåddes" |
| 2 | `iteration >= maxIterations` (200) i Fas 1 | [rad 252](../../src/core/optimizer.js#L252) | `fail()` – "iterationsgränsen 200 nåddes" |
| 3 | Tom kandidatpool i Fas 1 | [rad 259](../../src/core/optimizer.js#L259) | `fail()` – "inga fler möjliga mätningar att lägga till" |
| 4 | Kriterierna uppfyllda | [rad 244](../../src/core/optimizer.js#L244) | Fas 1 lämnas, Fas 2 börjar |
| 5 | `iteration >= maxIterations` i Fas 2 | [rad 319](../../src/core/optimizer.js#L319) | logg-post `stop`, bantningen avbryts, resultatet returneras som `ok` |
| 6 | Ingen borttagbar mätning | [rad 354](../../src/core/optimizer.js#L354) | logg-post `stop`, normal avslutning |
| 7 | `work.length === 0` | [rad 322](../../src/core/optimizer.js#L322) | loop bryts (kan i praktiken inte nås, eftersom kriterierna faller långt innan) |

Vid `fail()` returneras **originalnätet oförändrat** (`meas: baseMeas`), med
brutna kriterier och genererade åtgärdsförslag.

I samtliga körningar i denna rapport träffades villkor 3 eller 6 – gränserna 50
och 200 har aldrig varit nära att lösa ut.

---

# Steg 2 – Symptom

**Viktig avgränsning:** jag har inte fått någon symptombeskrivning från en
användare. Det som beskrivs nedan är vad jag observerar när jag kör funktionen
på de tre scenarierna. Klassificerat enligt din indelning:

| Kategori | Observerat? | Var |
|---|---|---|
| Funktionen kraschar | **Nej.** Inga undantag, inga avbrutna körningar, inga fel i konsolen i något scenario. | – |
| Funktionen ger inget resultat | **Ja.** På test1_baseline avbryts optimeringen omedelbart (0 iterationer) med felmeddelande, och nätet lämnas orört. | Scenario 1, 3 |
| Funktionen ger felaktigt resultat | **Nej, inte i betydelsen "bryter mot sina egna kriterier".** Alla levererade nät uppfyller kriterierna; inget nät levererades med r under kravet. | – |
| Rimligt resultat som inte matchar förväntningen | **Ja.** På 8-punktersnätet växer nätet från 28 till 29 mätningar under en operation som heter "optimera", och två av tillskotten är riktningsvändningar av mätningar som samma körning tar bort. | Scenario 2 |

Konkreta värden:

**Symptom 1 – optimeringen vägrar arbeta på test1_baseline.**
Nätet har r_min = 0,2237 (riktning A→B), k = 0,583, σ_pos(N1) = 1,032 mm. Det är
samma nät vars k-tal är verifierade mot SBG Geo i facittest F20. Optimeringen
returnerar:

```
Optimeringen avbröts: det finns inga fler möjliga mätningar att lägga till, och
acceptanskriterierna är fortfarande inte uppfyllda.
  brutet kriterium: Minsta r-tal 0.224 < krav 0.500
  brutet kriterium: Största MUF 5.92 × σ > krav 4.00 × σ
  brutet kriterium: Största YT 4.60 × σ > krav 2.00 × σ
```

Två oberoende orsaker samverkar: kandidatpoolen är tom (F-1/F-3) **och**
kravnivån r ≥ 0,50 är oåtkomlig för nätet med de mätningar poolen tillåter (F-4).

**Symptom 2 – åtgärdsförslaget är felaktigt när poolen är tom av fel skäl.**
I scenario 3 (bara A→B och A→N1 kvar, alltså fyra av sex ordnade par saknas)
säger meddelandet ändå:

```
åtgärdsförslag: Lägg till fler anslutningspunkter eller uppställningar – alla
möjliga mätningar mellan befintliga punkter finns redan i nätet.
```

Det stämmer inte: fyra par saknas, men ingen punkt passerar `isStationPoint()`
så poolen blir tom. Meddelandet pekar användaren åt fel håll.

**Symptom 3 – orimliga MUF/YT-tal i loggen.** När r_min är numeriskt noll
(≈ 1e-16) skrivs MUF ut som ett stort ändligt tal i beslutsloggen:

```
Kvarstår: Minsta r-tal 0.000 < krav 0.500; Kontrollerbarhet k 0.333 < krav 0.500;
Största MUF 265737543.75 × σ > krav 4.00 × σ; Största YT 265737543.75 × σ > krav 2.00 × σ.
```

**Symptom 4 – nätet växer under optimering.** Scenario 2: 28 mätningar in,
29 ut (7 tillagda, 6 borttagna). Två av tillskotten är omvända riktningar av
mätningar som samma körning tar bort: `P2→P1` läggs till i iteration 2, `P1→P2`
tas bort i iteration 13; `P7→P1` läggs till i iteration 6, `P1→P7` tas bort i
iteration 12.

---

# Steg 3 – Diagnostiska scenarier

## Scenario 1 – test1_baseline

Nät: A (känd), B (känd), N1 (ny). Sex mätningar `obsType: 'both'`, alltså 12
observationer. n = 12, u = 5, f = 7. Mätklass G2, maxSuggestDist 500 m.

| Fråga | Svar |
|---|---|
| Vilka mätningar togs bort / lades till? | **Inga.** Kandidatpoolen är tom (0 kandidater) och Fas 1 avbryter före första iterationen. Nätet returneras oförändrat. |
| σ_pos för N1 i slutresultatet | **1,032 mm** – oförändrat, eftersom nätet inte ändrades. |
| Minsta r-tal i det optimerade nätet | **0,2237** – oförändrat. Ligger under kravet 0,50 och även under valideringens felgräns 0,30. |
| Antal iterationer | **0** |

Kontrollvariant 1b: samma nät men med A och B markerade som kombipunkter
(`isStation: true`) ger **samma utfall** – poolen är fortfarande tom, eftersom
alla sex ordnade par redan är mätta. Nätet är mättat i den mening poolen kan se.

## Scenario 2 – överbestämt nät

Ersmarkstunneln finns inte lokalt. Syntetiskt nät enligt beställningens
alternativ: 8 punkter på en cirkel med radie 300 m (P1, P2 kända kombipunkter;
P3–P8 uppställningar), alla 28 par mätta med `obsType: 'both'` = 28 riktningar
+ 28 längder = 56 observationer. n = 56, u = 19, f = 37.

| Fråga | Svar |
|---|---|
| Tillagda (7) | M100 P7→P6, M101 P2→P1, M102 P6→P5, M103 P7→P5, M104 P5→P2, M105 P7→P1, M106 P6→P1 |
| Borttagna (6) | M16 P3→P6, M12 P2→P7, M11 P2→P6, M4 P1→P5, M6 P1→P7, M1 P1→P2 |
| Mätningar | 28 → **29** |
| σ_pos per fri punkt (slut) | P3 1,646 · P4 2,053 · P5 2,255 · P6 2,277 · P7 2,022 · P8 1,526 mm |
| Minsta r-tal (slut) | **0,5001** (start: 0,0000) |
| k (slut) | 0,672 (start: 0,661) |
| Iterationer | **13** (7 i Fas 1, 6 i Fas 2) |
| Observationer i varningsbandet 0,30 ≤ r < 0,50 | **0** |
| Körtid, enbart kärnan | 153 ms |

Notera att utgångsnätet har r_min = 0,0000: när varje par mäts i **en** riktning
blir P7 uppställd med exakt en riktning (P7→P8), som helt absorberas av
orienteringsobekanten. Algoritmens allra första drag – att lägga till P7→P6 –
är den geodetiskt riktiga åtgärden på just det.

## Scenario 3 – otillräckligt nät

test1_baseline reducerat till två mätningar (A→B, A→N1). n = 4, u = 3, f = 1,
r_min = 0,0000, k = 0,250.

| Fråga | Svar |
|---|---|
| Byter algoritmen till Fas 1? | **Nej.** Fas 1 nås, men avbryter i första varvet: kandidatpoolen är tom (0 kandidater) trots att fyra av sex ordnade par saknas. |
| Vad händer | Avbrott med felmeddelande, 0 iterationer, nätet oförändrat. |

Kontrollvariant 3b (A och B som kombipunkter) visar vad som händer när poolen
inte är tom:

- Pool: 2 kandidater (B→N1, B→A). Fas 1 kör två iterationer och lägger till båda.
- Slutläge: r_min = 0,132, k = 0,500 – fortfarande under kravet.
- Avbrott: poolen är slut. **N1→A och N1→B kan aldrig föreslås**, eftersom N1 är
  `type: 'new'` och därmed aldrig räknas som uppställningspunkt – trots att N1 är
  uppställd i originalnätet.

---

# Steg 4 – Loggutskrift

## Brist: produktionskoden loggar ingenting

Det finns **ingen** `console`-loggning i optimeringen. Beslutsspårningen byggs
som textsträngar i resultatobjektet (`result.log[].text`) och visas i dialogens
resultatsektion, men skrivs aldrig till konsolen. Progress-yields innehåller
dessutom **inte** kandidatpoängen – bara fas, iteration, index och totalantal
([src/core/optimizer.js:280-281](../../src/core/optimizer.js#L280-L281)) – så
en utvecklare kan inte i efterhand se varför en viss kandidat vann.

Enligt uppdraget har jag därför lagt loggningen **utanför** repot (se "Om
metoden" ovan). Algoritmen är oförändrad; harnessen driver samma generator och
skuggberäknar poängen med kärnans egna exporterade funktioner.

## Scenario 1 – verbatim

Scenario 1 producerar per konstruktion ingen iterationslogg, eftersom noll
iterationer körs. Fullständig utskrift:

```
==============================================================================
SCENARIO: 1 – test1_baseline (A, B kända + N1 ny, 6 mätningar / 12 obs)
==============================================================================
Punkter (3): A[known] B[known] N1[new]
  * = räknas som uppställningspunkt av generateCandidates()
Mätningar (6): A→B A→N1 B→A B→N1 N1→A N1→B
Mätklass: G2  krav: r≥0.5 σ≤3mm k≥0.5 MUF≤4σ YT≤2σ (enforceMufYt=true)
maxSuggestDist: 500 m
Vikter: σ=0.5 r=0.5

UTGÅNGSLÄGE: n_obs=12 u=5 f=7 k=0.583 r_min=0.2237 σ_max=1.032 mm MUF=5.920σ YT=4.596σ
Kriterier: EJ UPPFYLLDA – Minsta r-tal 0.224 < krav 0.500; Största MUF 5.92 × σ > krav 4.00 × σ; Största YT 4.60 × σ > krav 2.00 × σ
Kandidatpool vid start: 0 (bortfiltrerat: 0 p.g.a. avstånd, 0 p.g.a. hinder)

------------------------------------------------------------------------------
RESULTAT: ok=false  iterationer=0  tid=1 ms (inkl. skuggberäkning)
  FEL: Optimeringen avbröts: det finns inga fler möjliga mätningar att lägga till, och acceptanskriterierna är fortfarande inte uppfyllda.
    brutet kriterium: Minsta r-tal 0.224 < krav 0.500
    brutet kriterium: Största MUF 5.92 × σ > krav 4.00 × σ
    brutet kriterium: Största YT 4.60 × σ > krav 2.00 × σ
    åtgärdsförslag: Lägg till fler anslutningspunkter eller uppställningar – alla möjliga mätningar mellan befintliga punkter finns redan i nätet.
    åtgärdsförslag: Fler uppställningar ger fler oberoende kontroller – nätet saknar överbestämning, inte precision.
```

## Scenario 3b – verbatim, med iterationer

Eftersom scenario 1 inte ger några iterationer följer här närmast möjliga
körning på samma nät (test1_baseline reducerat, A/B som kombipunkter), där
Fas 1 faktiskt arbetar. Denna utskrift innehåller allt som efterfrågas i steg 4:
fas, nätets k/r_min/σ_max, övervägd mätning, beräknad poäng, beslut och skäl.

```
==============================================================================
SCENARIO: 3b – KONTROLL: samma 2 mätningar, A och B som kombipunkter
==============================================================================
Punkter (3): A[known+stn]* B[known+stn]* N1[new]
  * = räknas som uppställningspunkt av generateCandidates()
Mätningar (2): A→B A→N1
Mätklass: G2  krav: r≥0.5 σ≤3mm k≥0.5 MUF≤4σ YT≤2σ (enforceMufYt=true)
maxSuggestDist: 500 m
Vikter: σ=0.5 r=0.5

UTGÅNGSLÄGE: n_obs=4 u=3 f=1 k=0.250 r_min=0.0000 σ_max=1.965 mm MUF=∞σ YT=∞σ
Kriterier: EJ UPPFYLLDA – Minsta r-tal 0.000 < krav 0.500; Kontrollerbarhet k 0.250 < krav 0.500; Största MUF ∞ × σ > krav 4.00 × σ; Största YT ∞ × σ > krav 2.00 × σ
Kandidatpool vid start: 2 (bortfiltrerat: 0 p.g.a. avstånd, 0 p.g.a. hinder)

--- Iteration 1 | Fas 1 ---
  Nätets läge: n_obs=4 u=3 f=1 k=0.250 r_min=0.0000 σ_max=1.965 mm MUF=∞σ YT=∞σ
  Kriterier: EJ uppfyllda – Minsta r-tal 0.000 < krav 0.500; Kontrollerbarhet k 0.250 < krav 0.500; Största MUF ∞ × σ > krav 4.00 × σ; Största YT ∞ × σ > krav 2.00 × σ
  Kandidater: 2 (visar 2 bästa)
    → B→N1 (141.4 m) poäng=0.0267 Δσ=0.1602 mm Δr=0.0000 kriterier efter=ej OK
      B→A (200.0 m) poäng=0.0000 Δσ=0.0000 mm Δr=0.0000 kriterier efter=ej OK
  BESLUT: lade till M7 B→N1  poäng/bidrag=0.0267
          Iteration 1 (Fas 1): Lade till mätning B→N1. Störst förbättring av nätet: σ_pos-effekt +0.16 mm, r-tal-effekt +0.000. Kvarstår: Minsta r-tal 0.000 < krav 0.500; Kontrollerbarhet k 0.333 < krav 0.500; Största MUF 265737543.75 × σ > krav 4.00 × σ; Största YT 265737543.75 × σ > krav 2.00 × σ.

--- Iteration 2 | Fas 1 ---
  Nätets läge: n_obs=6 u=4 f=2 k=0.333 r_min=0.0000 σ_max=1.805 mm MUF=265737543.748σ YT=265737543.748σ
  Kriterier: EJ uppfyllda – Minsta r-tal 0.000 < krav 0.500; Kontrollerbarhet k 0.333 < krav 0.500; Största MUF 265737543.75 × σ > krav 4.00 × σ; Största YT 265737543.75 × σ > krav 2.00 × σ
  Kandidater: 1 (visar 1 bästa)
    → B→A (200.0 m) poäng=0.1988 Δσ=0.4034 mm Δr=0.1315 kriterier efter=ej OK
  BESLUT: lade till M8 B→A  poäng/bidrag=0.1988
          Iteration 2 (Fas 1): Lade till mätning B→A. Störst förbättring av nätet: σ_pos-effekt +0.40 mm, r-tal-effekt +0.132. Kvarstår: Minsta r-tal 0.132 < krav 0.500; Största MUF 7.72 × σ > krav 4.00 × σ; Största YT 6.70 × σ > krav 2.00 × σ.

------------------------------------------------------------------------------
RESULTAT: ok=false  iterationer=2  tid=1 ms (inkl. skuggberäkning)
  FEL: Optimeringen avbröts: det finns inga fler möjliga mätningar att lägga till, och acceptanskriterierna är fortfarande inte uppfyllda.
    brutet kriterium: Minsta r-tal 0.132 < krav 0.500
    brutet kriterium: Största MUF 7.72 × σ > krav 4.00 × σ
    brutet kriterium: Största YT 6.70 × σ > krav 2.00 × σ
    åtgärdsförslag: Lägg till fler anslutningspunkter eller uppställningar – alla möjliga mätningar mellan befintliga punkter finns redan i nätet.
    åtgärdsförslag: Fler uppställningar ger fler oberoende kontroller – nätet saknar överbestämning, inte precision.
```

## Scenario 2 – utdrag med fas-övergången

Fas 1 slutar efter iteration 7, Fas 2 tar vid i iteration 8 utan explicit
markering i loggen (fasen framgår bara av rubriken):

```
--- Iteration 7 | Fas 1 ---
  Nätets läge: n_obs=68 u=19 f=49 k=0.721 r_min=0.4088 σ_max=1.867 mm MUF=4.379σ YT=2.589σ
  Kriterier: EJ uppfyllda – Minsta r-tal 0.409 < krav 0.500; Största MUF 4.38 × σ > krav 4.00 × σ; Största YT 2.59 × σ > krav 2.00 × σ
  Kandidater: 22 (visar 5 bästa)
    → P6→P1 (554.3 m) poäng=0.1269 Δσ=0.0214 mm Δr=0.1233 kriterier efter=OK
      P6→P2 (600.0 m) poäng=0.1246 Δσ=0.0303 mm Δr=0.1196 kriterier efter=OK
      P6→P4 (424.3 m) poäng=0.0783 Δσ=0.0091 mm Δr=0.0768 kriterier efter=ej OK
      P6→P3 (554.3 m) poäng=0.0720 Δσ=0.0100 mm Δr=0.0703 kriterier efter=ej OK
      P7→P2 (554.3 m) poäng=0.0061 Δσ=0.0298 mm Δr=0.0011 kriterier efter=ej OK
  BESLUT: lade till M106 P6→P1  poäng/bidrag=0.1269
          Iteration 7 (Fas 1): Lade till mätning P6→P1. Störst förbättring av nätet: σ_pos-effekt +0.02 mm, r-tal-effekt +0.123. Alla acceptanskriterier hålls nu.

--- Iteration 8 | Fas 2 ---
  Nätets läge: n_obs=70 u=19 f=51 k=0.729 r_min=0.5321 σ_max=1.846 mm MUF=3.838σ YT=1.796σ
  Kriterier: uppfyllda
  Borttagningskandidater: 35 (minst bidrag först)
      M16 P3→P6 bidrag=0.0016 Δσ=0.0050 mm Δr=-0.0007 | kriterier håller ⇒ FÅR tas bort
      M18 P3→P8 bidrag=0.0056 Δσ=0.0028 mm Δr=-0.0051 | kriterier håller ⇒ FÅR tas bort
      M14 P3→P4 bidrag=0.0069 Δσ=0.0388 mm Δr=-0.0004 | kriterier håller ⇒ FÅR tas bort
      M11 P2→P6 bidrag=0.0070 Δσ=0.0395 mm Δr=-0.0004 | kriterier håller ⇒ FÅR tas bort
      M12 P2→P7 bidrag=0.0089 Δσ=0.0208 mm Δr=-0.0054 | kriterier håller ⇒ FÅR tas bort
  BESLUT: tog bort M16 P3→P6  poäng/bidrag=0.0016
          Iteration 8 (Fas 2): Tog bort mätning P3→P6. Bidrog minst till nätet: σ_pos-effekt +0.01 mm, r-tal-effekt -0.001. Alla kriterier hålls fortfarande.
```

Observera att den vinnande kandidaten i iteration 7 (`P6→P1`) och tvåan
(`P6→P2`) båda uppfyller kriterierna efter tillägg – de skiljs åt av 0,0023 i
poäng, och den dyrare sikten på 600 m förlorar mot den på 554 m med marginal
som ligger inom vad en annan viktning hade kastat om.

Sista iterationen visar hur överhoppning fungerar – de fem minst bidragande
mätningarna kan alla inte tas bort, och kärnan går vidare till den sjätte:

```
--- Iteration 13 | Fas 2 ---
  Borttagningskandidater: 30 (minst bidrag först)
      M19 P4→P5 bidrag=0.0249 Δσ=0.0499 mm Δr=-0.0166 | HOPPAS ÖVER – Minsta r-tal 0.496 < krav 0.500; Största YT 2.00 × σ > krav 2.00 × σ
      M14 P3→P4 bidrag=0.0340 Δσ=0.0017 mm Δr=-0.0337 | HOPPAS ÖVER – Minsta r-tal 0.479 < krav 0.500; Största MUF 4.05 × σ > krav 4.00 × σ; Största YT 2.11 × σ > krav 2.00 × σ
      M24 P5→P7 bidrag=0.0346 Δσ=0.0006 mm Δr=-0.0346 | HOPPAS ÖVER – Minsta r-tal 0.478 < krav 0.500; Största MUF 4.05 × σ > krav 4.00 × σ; Största YT 2.11 × σ > krav 2.00 × σ
      M8 P2→P3 bidrag=0.0371 Δσ=0.0841 mm Δr=-0.0230 | HOPPAS ÖVER – Minsta r-tal 0.489 < krav 0.500; Största MUF 4.00 × σ > krav 4.00 × σ; Största YT 2.04 × σ > krav 2.00 × σ
      M26 P6→P7 bidrag=0.0404 Δσ=0.0126 mm Δr=-0.0383 | HOPPAS ÖVER – Minsta r-tal 0.474 < krav 0.500; Största MUF 4.07 × σ > krav 4.00 × σ; Största YT 2.14 × σ > krav 2.00 × σ
  BESLUT: tog bort M1 P1→P2  poäng/bidrag=0.0566
```

Observera raden `M8 P2→P3 ... Största MUF 4.00 × σ > krav 4.00 × σ` – ett
gränsfall som underkänns på avrundningsnivå (jämförelsen är `>` mot exakt 4).

---

# Steg 5 – Testresultat

Frågan gäller "319/319". **Den siffran har aldrig stämt för det här repot.**
Baslinjen före Etapp E var 437 tester (24 filer), verifierad före arbetets
början. Etapp E lade till en fil, `tests/optimizer.test.js`, med **72 tester**
(69 vid första leveransen, 3 till vid tröskelfixen 2026-09-01).

Aktuell körning, verbatim:

```
 RUN  v2.1.9 C:/Users/sjost/Documents/natsim

 ✓ tests/ref-hmk.test.js (21 tests) 7ms
 ✓ tests/visibility.test.js (31 tests) 5ms
 ✓ tests/pm.test.js (15 tests) 7ms
 ✓ tests/osm-import.test.js (25 tests) 14ms
 ✓ tests/net-image.test.js (11 tests) 10ms
 ✓ tests/calc.test.js (12 tests) 6ms
 ✓ tests/obstacle-editing.test.js (33 tests) 10ms
 ✓ tests/obstacle-color.test.js (24 tests) 9ms
 ✓ tests/persistence.test.js (27 tests) 10ms
 ✓ tests/facit.test.js (49 tests) 93ms
 ✓ tests/simulation-studio.test.js (9 tests) 163ms
 ✓ tests/max-suggest-dist.test.js (24 tests) 10ms
 ✓ tests/visual-layer.test.js (40 tests) 17ms
 ✓ tests/regression.test.js (17 tests) 10ms
 ✓ tests/table-utils.test.js (21 tests) 22ms
 ✓ tests/obstacle-selection.test.js (13 tests) 5ms
 ✓ tests/measurement-selection.test.js (11 tests) 4ms
 ✓ tests/panel-resize.test.js (9 tests) 29ms
 ✓ tests/blocked-measurements.test.js (15 tests) 6ms
 ✓ tests/sis-ts-info.test.js (7 tests) 5ms
 ✓ tests/net-studio.test.js (9 tests) 128ms
 ✓ tests/pm-images.test.js (4 tests) 80ms
 ✓ tests/matrix.test.js (4 tests) 3ms
 ✓ tests/optimizer.test.js (72 tests) 777ms
 ✓ tests/report-studio.test.js (6 tests) 187ms

 Test Files  25 passed (25)
      Tests  509 passed (509)
   Start at  18:22:41
   Duration  2.14s
```

**Alla 509 gröna, inklusive facittesterna F1–F20 för beräkningskärnan.**

Detta är samtidigt rapportens obehagligaste punkt: **testsviten är grön trots
allt som beskrivs ovan.** Skälet är att testerna för Etapp E använder nät där
uppställningarna är typade `station` – aldrig ett nät byggt som test1_baseline.
Testerna kodifierar alltså implementationens antagande i stället för att pröva
det. Se F-1.

---

# Steg 6 – Min egen bedömning

## Mest sannolik rot

**Kandidatpoolens definition av "uppställningspunkt" är fel abstraktionsnivå.**
Poolen frågar efter punktens *typ* (`isStationPoint`), medan beräkningskärnan
frågar efter *vad som faktiskt mäts* (`stationIds(meas)` = punkter som är `from`
i minst en riktningsmätning). I ett nät som test1_baseline – där alla punkter är
`known`/`new` men alla tre är uppställda – blir poolen tom och hela funktionen
en no-op. Det gäller sannolikt varje nät som importerats från `.geo`/CSV snarare
än ritats punkt för punkt i UI:t med verktyget "Uppställning".

Att felet inte syns i testsviten är en följd av samma missförstånd: jag skrev
testerna med typade stationer, eftersom det var så jag tänkte mig nätet.

Att vara tydlig med ansvarsfördelningen: `isStationPoint` är inte ny i Etapp E
utan ärvd från `suggestMeasurements()` (Etapp A). Jag har verifierat att den
äldre funktionen "Analysera och föreslå mätningar" också ger **0 förslag** på
test1_baseline, både med sex och två mätningar. Etapp E ärvde alltså en
begränsning som ingen tidigare märkt, och gjorde den synlig genom att bygga en
helt automatisk funktion ovanpå den.

## Tre områden jag skulle fokusera på

**1. Kandidatrymden (F-1, F-2, F-3).** Tre separata begränsningar som alla pekar
åt samma håll: poolen är för smal.
 - Vilka punkter får vara `from`? Bör vara "punkter som är uppställda i nätet"
   ∪ "punkter som får ställas upp" – inte enbart punkttyp.
 - Kan en punkt som inte redan är uppställd bli det? I dag: nej.
 - Får ett redan mätt par mätas igen (dubbelmätning)? I dag: nej. Detta är den
   enda åtgärd som kan höja r i ett mättat nät, och kontraexperimentet visar att
   test1_baseline når kraven på 10 tillägg om dubbelmätning tillåts (r_min går
   0,2237 → 0,5153). Frågan till geodeten: är "mät om samma sikt" ett
   acceptabelt förslag, eller ska det uttryckas som fler helsatser – och i så
   fall, hur ska modellen representera det (fler helsatser sänker σ men ändrar
   inte redundansen)?

**2. Kravnivåernas härledning (F-4).** r ≥ 0,50 per observation underkänner ett
nät vars k-tal är verifierade mot SBG Geo. Antingen är kravet fel härlett, eller
så är test1_baseline faktiskt underdimensionerat enligt SIS-TS – det är precis
en sådan fråga en geodet ska avgöra, inte jag. Samma gäller tolkningen
σ_max = Tabell A.9:s "spridning längd" prövat mot σ_pos. Notera kopplingen till
område 1: med r_min = 0,30 (som beställningen ursprungligen angav) hade
scenario 1 fortfarande avbrutits, men σ/MUF/YT-bilden sett annorlunda ut.

**3. Poängfunktionens extremvärdesberoende (F-7).** Både σ- och r-ledet ser bara
*en* observation respektive *en* punkt – nätets sämsta. Det gör poängen platt:
i scenario 2 iteration 2 vinner `P2→P1` med poäng 0,0436 helt på σ-ledet
(Δσ = 0,2614 mm, Δr = 0,0000) framför `P6→P5` med 0,0115, som till skillnad
från vinnaren faktiskt höjer r_min (Δr = 0,0074). Greedy-steget väljer alltså
bort den enda kandidat som förbättrar det kriterium som blockerar körningen. Det förklarar också riktningsvändningarna och att nätet växer
med en mätning under en "optimering". Ett alternativ vore A-optimalitet
(spår av Q_xx) för precisionsledet och t.ex. summan av (r_min − r_i)⁺ för
tillförlitlighetsledet, så att poängen ser hela nätet.

---

# Fyndlista

| # | Fynd | Var | Allvar (min bedömning) |
|---|---|---|---|
| F-1 | Kandidatpoolen använder punkttyp (`isStationPoint`) i stället för faktiskt uppställda punkter (`stationIds`). Ger tom pool på nät där uppställningar är typade `known`/`new`. | [optimizer.js:74](../../src/core/optimizer.js#L74) | Hög – funktionen är en no-op på sådana projekt |
| F-2 | Poolen kan aldrig föreslå att en punkt börjar användas som uppställning. | [optimizer.js:74-89](../../src/core/optimizer.js#L74-L89) | Hög |
| F-3 | Redan mätta par utesluts ⇒ dubbelmätning kan aldrig föreslås, trots att det är enda sättet att höja r i ett mättat nät. | [optimizer.js:81](../../src/core/optimizer.js#L81) | Hög |
| F-4 | r ≥ 0,50 underkänner test1_baseline (r_min 0,224), ett nät verifierat mot SBG Geo. Kravets härledning är produktvald, inte normcitat. | [optimizer-criteria.js:58](../../src/core/optimizer-criteria.js#L58), [constants.js:161](../../src/core/constants.js#L161) | Hög – normfråga för geodet |
| F-5 | MUF/YT redovisas som stora ändliga tal (2,66e8 × σ) när r_min ≈ 0. | [optimizer-criteria.js:87-88](../../src/core/optimizer-criteria.js#L87-L88) | Låg – kosmetiskt |
| F-6 | Worker-tröskeln går på antal **punkter** (≥30), men kostnaden styrs av antal **mätningar**. Uppmätt: 16 punkter/120 mätningar = 6,9 s, alltså huvudtråden och fryst UI. | [optimizer-runner.js:22-26](../../src/core/optimizer-runner.js#L22-L26) | Medel |
| F-7 | Poängen ser bara nätets extremvärden ⇒ platta poäng, riktningsvändningar, nät som växer 28 → 29 under "optimering". | [optimizer.js:106-117](../../src/core/optimizer.js#L106-L117) | Medel |
| F-8 | Progress annonserar en iteration som aldrig körs (rubrik "Iteration 14" följt av resultat "iterationer=13"). | [optimizer.js:326](../../src/core/optimizer.js#L326) | Låg |
| F-9 | Åtgärdsförslaget "alla möjliga mätningar finns redan i nätet" visas även när poolen är tom av helt andra skäl. | [optimizer.js:168-174](../../src/core/optimizer.js#L168-L174) | Medel – vilseleder användaren |
| F-10 | Ingen loggning i produktionskoden; progress-yields saknar kandidatpoäng. | [optimizer.js:280](../../src/core/optimizer.js#L280) | Medel – felsökningsbarhet |
| F-11 | Tillagda mätningar är alltid `obsType: 'both'`; optimeringen kan varken föreslå enbart riktning/längd eller ta bort halva en mätning. | [optimizer.js:141-152](../../src/core/optimizer.js#L141-L152) | Medel – geodetisk fråga |
| F-12 | Fas 2 körs aldrig om Fas 1 misslyckas. Nät som är otillräckliga i en del och överbestämda i en annan får ingen bantning alls. | [optimizer.js:244-317](../../src/core/optimizer.js#L244-L317) | Medel |
| F-13 | Testsviten är grön eftersom Etapp E-testerna uteslutande använder typade `station`-punkter – antagandet i F-1 prövas aldrig. | [tests/optimizer.test.js:31-39](../../tests/optimizer.test.js#L31-L39) | Hög – täckningslucka |

---

# Bilaga A – kontrafaktiskt experiment

Frågan: skulle Fas 1 konvergera på test1_baseline om poolen vore vidare? Två
utvidgningar prövades var för sig och tillsammans, med samma poängformel och
samma kriteriekontroll som kärnan (skript: `kontrafaktisk.mjs`).

```
KONTRAFAKTISKT: test1_baseline (6 mätningar), krav r≥0,50

(0) nuvarande pool: typ-baserad, inga dubbletter
  avbrott: tom kandidatpool efter 0 tillägg
  slut: ok=false tillägg=0 mätningar=6 r_min=0.2237 k=0.583

(a) pool på FAKTISKT uppställda punkter, inga dubbletter
  avbrott: tom kandidatpool efter 0 tillägg
  slut: ok=false tillägg=0 mätningar=6 r_min=0.2237 k=0.583

(b) typ-baserad pool, dubbelmätning tillåten
  avbrott: tom kandidatpool efter 0 tillägg
  slut: ok=false tillägg=0 mätningar=6 r_min=0.2237 k=0.583

(a+b) uppställda punkter + dubbelmätning
  + 1 A→N1 poäng=0.0358 r_min=0.2449 k=0.643 σ=0.945mm
  + 2 B→N1 poäng=0.0836 r_min=0.3171 k=0.688 σ=0.876mm
  + 3 A→N1 poäng=0.0318 r_min=0.3412 k=0.722 σ=0.830mm
  + 4 B→N1 poäng=0.0365 r_min=0.3710 k=0.750 σ=0.790mm
  + 5 N1→A poäng=0.0270 r_min=0.3922 k=0.773 σ=0.755mm
  + 6 N1→B poäng=0.0365 r_min=0.4220 k=0.792 σ=0.715mm
  + 7 B→N1 poäng=0.0199 r_min=0.4379 k=0.808 σ=0.691mm
  + 8 A→N1 poäng=0.0394 r_min=0.4737 k=0.821 σ=0.669mm
  + 9 A→N1 poäng=0.0182 r_min=0.4889 k=0.833 σ=0.651mm
  +10 B→N1 poäng=0.0293 r_min=0.5153 k=0.844 σ=0.634mm KRITERIER UPPFYLLDA
  slut: ok=true tillägg=10 mätningar=16 r_min=0.5153 k=0.844
```

Samma experiment på det reducerade nätet (A→B, A→N1) når kraven på fyra tillägg
(r_min 0,6206, k 0,750).

Kompletterande handräkning: dubbleras **alla sex** mätningar i test1_baseline
uppfylls kriterierna direkt (n = 24, f = 19, k = 0,792, r_min = 0,6119,
σ_pos(N1) = 0,730 mm). En enskild dubblering räcker inte – r_min rör sig då
bara från 0,2237 till som mest 0,2462.

# Bilaga B – prestandamätning

Kärnan ensam (utan skuggberäkning), Node 24 på samma maskin:

| Nät | Mätningar | Iterationer | Tid | Väg i webbläsaren |
|---|---|---|---|---|
| 8 punkter, alla par | 28 | 13 | 153 ms | Huvudtråden (< 30 punkter) |
| 16 punkter, alla par | 120 | 27 | **6 870 ms** | Huvudtråden (< 30 punkter) ⇒ fryst UI |

Tröskeln för Web Worker är `pts.length >= 30`
([optimizer-runner.js:22](../../src/core/optimizer-runner.js#L22)), vilket alltså
inte fångar det dyra fallet. Worker-vägen är dessutom fortfarande oprövad i
skarp miljö – jsdom saknar `Worker`, så testsviten kör enbart huvudtrådsvägen.

# Bilaga C – så återskapar du körningarna

```bash
# 1. Kopiera de tre skripten från scratchpad-sökvägen ovan till valfri katalog.
# 2. Skripten importerar via absoluta file://-URL:er mot C:/Users/sjost/Documents/natsim
#    – justera sökvägen i toppen av diag-etapp-e.mjs och kontrafaktisk.mjs vid behov.
node scenarier.mjs 1      # scenario 1 + kontrollvariant 1b
node scenarier.mjs 2      # scenario 2 (8 punkter, alla par)
node scenarier.mjs 3      # scenario 3 + kontrollvariant 3b
node kontrafaktisk.mjs    # bilaga A
```

Ingen del av detta kräver ändringar i `src/`.
