# Dubbelmätning – hur utjämningskärnan hanterar den (2026-09-02)

Underlag för Fas 3-åtgärden i Etapp E. **Ingen kod ändrad.** Commit `b511531`.

Hela utjämningen ligger i `computeSimulation()`,
[src/core/simulation.js:35-273](../../src/core/simulation.js#L35-L273). Någon
separat adjust-modul finns inte.

## Kort svar

| Fråga | Svar |
|---|---|
| 1. Två mätobjekt med samma (from, to) | **Två separata rader per observationstyp.** Ingen dedup, ingen groupby. |
| 2. A→B och B→A | **Två helt oberoende observationer.** Ingen logik känner igen dem som samma sträcka. Längdraderna blir *identiska*, riktningsraderna hänger på var sin orienteringsobekant. |
| 3. σ_c | Globalt `state.centerErr`, med **override per punkt** (`pts[].centerErr`). Inget per mätobjekt. Viktmatrisen är diagonal – ingen korrelation mellan observationer kan uttryckas. |

---

## Fråga 1 – multipla mätobjekt med samma (from, to)

Radbygget är en rak `forEach` över `meas`. Varje mätobjekt ger en längdrad
och/eller en riktningsrad, utan att någonsin titta på vad som redan lagts till:

[src/core/simulation.js:79-80](../../src/core/simulation.js#L79-L80)
```js
  // ── Bygg observationsmatris – rad 896–956 ──
  meas.forEach(m => {
    const md = calcM(m, pts);
    if (!md) return;
```

[src/core/simulation.js:131-132](../../src/core/simulation.js#L131-L132) och
[151-152](../../src/core/simulation.js#L151-L152)
```js
      obsRows.push({ row: rowD, sig: sigD, type: "dist", measId: m.id, ... });
      obsRows.push({ row: rowH, sig: sigH_arc, type: "hz", measId: m.id, ... });
```

**Det finns ingen dedup-funktion och ingen groupby på (from, to) någonstans i
kärnan.** Den enda `Set`-baserade avduplicering som finns gäller *stations-ID*,
inte mätningar – `stationIds()`,
[src/core/simulation.js:29-33](../../src/core/simulation.js#L29-L33), så att två
uppställningar på samma punkt delar en orienteringsobekant. Nyckeln `m.id` följer
med till `redund[]`, så två poster med samma (from, to) men olika `id` hålls isär
hela vägen ut i rapporterna.

### Evidens

test1_baseline plus ett extra mätobjekt `dup` med `from='A'`, `to='B'` och
identiska parametrar:

| | n | u | f | Σr_i | r(A→B riktning) |
|---|---|---|---|---|---|
| Baseline, 6 mätobjekt | 12 | 5 | 7 | 7,0000000000 | 0,223701 |
| + `dup` A→B | **14** | 5 | **9** | 9,0000000000 | **0,562968** |

Raderna 1 och 13 i A blir bit för bit identiska, får samma σ (1,030e-3) och
samma r-tal (0,562968 vardera). Att `Σr_i = f` håller exakt i båda fallen
bekräftar att de behandlas som två fullvärdiga, oberoende observationer.

---

## Fråga 2 – motriktad mätning

Ingen kod jämför `m.from`/`m.to` mot andra mätningars ändpunkter. A→B och B→A
är två `meas`-poster som passerar samma `forEach` var för sig. Skillnaden ligger
i vilka kolumner de laddar:

[src/core/simulation.js:125-130](../../src/core/simulation.js#L125-L130) (längd)
```js
      if (freeIdx[p1.id] !== undefined) {
        const i1 = freeIdx[p1.id]; rowD[i1*2] -= ex; rowD[i1*2+1] -= ey;
      }
      if (freeIdx[p2.id] !== undefined) {
        const i2 = freeIdx[p2.id]; rowD[i2*2] += ex; rowD[i2*2+1] += ey;
      }
```
[src/core/simulation.js:145-151](../../src/core/simulation.js#L145-L151) (riktning –
orienteringskonstanten i UPPSTÄLLNINGEN, kommentarrader elididerade)
```js
      if (stnIdx[p1.id] !== undefined) {
        // ...
        rowH[nFree * 2 + stnIdx[p1.id]] = -dist_m;
      }
```

### Evidens – A-matrisens rader för test1_baseline

Obekanta: `[N1.E, N1.N, z_A, z_B, z_N1]`. Raderna nedan är kärnans egna:
transkriptionen som skrev ut dem reproducerar `computeSimulation()`:s r-tal med
största avvikelse **1,11e-16**.

```
idx  mät    obs   från→till        N1.E      N1.N       z_A       z_B      z_N1        σ            r_i
  0  m0     dist  A→B            0.0000    0.0000    0.0000    0.0000    0.0000  1.562e-3  1.000000
  1  m0     hz    A→B            0.0000    0.0000 -200.0000    0.0000    0.0000  1.030e-3  0.223701
  2  m1     dist  A→N1           0.7071    0.7071    0.0000    0.0000    0.0000  1.518e-3  0.768631
  3  m1     hz    A→N1          -0.7071    0.7071 -141.4214    0.0000    0.0000  1.015e-3  0.434748
  4  m2     dist  B→A            0.0000    0.0000    0.0000    0.0000    0.0000  1.562e-3  1.000000
  5  m2     hz    B→A            0.0000    0.0000    0.0000 -200.0000    0.0000  1.030e-3  0.223701
  6  m3     dist  B→N1          -0.7071    0.7071    0.0000    0.0000    0.0000  1.518e-3  0.768631
  7  m3     hz    B→N1          -0.7071   -0.7071    0.0000 -141.4214    0.0000  1.015e-3  0.434748
  8  m4     dist  N1→A           0.7071    0.7071    0.0000    0.0000    0.0000  1.518e-3  0.768631
  9  m4     hz    N1→A          -0.7071    0.7071    0.0000    0.0000 -141.4214  1.015e-3  0.304289
 10  m5     dist  N1→B          -0.7071    0.7071    0.0000    0.0000    0.0000  1.518e-3  0.768631
 11  m5     hz    N1→B          -0.7071   -0.7071    0.0000    0.0000 -141.4214  1.015e-3  0.304289
```

Tre observationer ur detta som är viktiga för Fas 3:

1. **Riktningsraderna skiljer sig – i orienteringsledet.** `m0 hz` (A→B) laddar
   `z_A` med −200, `m2 hz` (B→A) laddar `z_B` med −200. De är knutna till var
   sin uppställning och är därför genuint oberoende observationer. Samma sak för
   `m1 hz` (rad 3, `z_A`) mot `m4 hz` (rad 9, `z_N1`).
2. **Längdraderna är IDENTISKA, inte spegelvända.** Rad 2 (A→N1) och rad 8
   (N1→A) är båda `(+0,7071, +0,7071)`. Avståndet är symmetriskt, så
   ∂d/∂x beror inte på vilken ände som kallas `from`. Motriktad längdmätning är
   alltså matematiskt **samma sak som att duplicera längdraden** – det syns även
   på att de får identiskt r-tal (0,768631).
3. **Längd mellan två fasta punkter ger nollrad** (rad 0 och 4): båda ändarna är
   kända, inga koordinatobekanta berörs. Raden bidrar inte till N och får
   r = 1,000 – en ren kontrollmätning. Det stämmer med SBG Geos `abL = 1.000` i
   facittest F20.

**Slutsats för Fas 3:** motriktad dubbelmätning A→B + B→A ger, jämfört med att
mäta A→B två gånger, exakt samma tillskott i längddelen men en riktningsrad som
hänger på den andra uppställningens orienteringsobekant. Skillnaden mellan de
två alternativen ligger alltså helt i riktningsobservablen.

---

## Fråga 3 – konfigurerbarhet av σ_c

Centreringsfelet slås upp **per punkt med globalt fallback**, och de två
ändarnas värden kombineras till EN C-term (kvadratiskt medelvärde, HMK
Bilaga C.1.1/C.1.2):

[src/core/simulation.js:99-101](../../src/core/simulation.js#L99-L101)
```js
    const e_from = (p1.centerErr != null ? p1.centerErr : centerErr) / 1000;
    const e_to   = (p2.centerErr != null ? p2.centerErr : centerErr) / 1000;
    const e_c    = Math.sqrt((e_from * e_from + e_to * e_to) / 2);
```

- **Globalt värde:** `state.centerErr` (default 1,0 mm),
  [src/state/store.js:10](../../src/state/store.js#L10).
- **Per punkt:** `pts[].centerErr`, sätts i punktdialogen,
  [src/ui/modals.js:180](../../src/ui/modals.js#L180) (tomt fält ⇒ `null` ⇒
  globalt värde används). Samma mönster i fristationsberäkningen,
  [src/core/stations.js:50-51](../../src/core/stations.js#L50-L51).
- **Per mätobjekt: finns inte.** Det går inte att ge två mätningar mellan samma
  punktpar olika σ_c.

Evidens (test1_baseline): `N1.centerErr = 3,0 mm` i stället för globalt 1,0 mm
höjer σ för A→N1-längden från 1,5175e-3 till 2,5105e-3 m och σ_pos(N1) från
1,0323 till 1,8569 mm, medan σ för A→B (som inte rör N1) är oförändrad.

### Konsekvens för hur en dubbelmätning kan modelleras

Viktmatrisen är **diagonal** – `P` är en vektor, inte en matris:

[src/core/simulation.js:164](../../src/core/simulation.js#L164)
```js
  const P = obsRows.map(o => 1 / (o.sig * o.sig));
```

Kärnan kan alltså inte uttrycka någon korrelation mellan observationer. Det får
två följder som Fas 3 måste förhålla sig till:

1. Ett duplicerat mätobjekt modelleras **automatiskt som en helt oberoende
   ommätning**, inklusive oberoende centrering. Det är den geodetiskt riktiga
   modellen för en verklig ny uppställning.
2. Motsatsen går **inte** att modellera: två helsatser från *samma* uppställning
   delar i verkligheten centreringsfel, men kärnan skulle ändå räkna dem som
   oberoende och därmed överskatta kontrollen. Vill man uttrycka "fler helsatser"
   är rätt väg i nuvarande modell att höja `numSatser` på den befintliga
   mätningen (sänker σ_Hz med √n, [rad 111](../../src/core/simulation.js#L111))
   – vilket ändrar vikten men **inte** ger någon ny rad och alltså inte höjer
   redundansen.

Skillnaden mellan de två är precis den fråga Fas 3 behöver svar på från geodet:
vad "dubbelmätning" ska betyda i förslagen – ny uppställning (ny rad, oberoende
σ_c) eller fler helsatser (samma rad, lägre σ).

---

### Reproduktion

Skriptet som skrev ut A-matrisen ligger i sessionens scratchpad,
`amatris.mjs` (importerar kärnan via absolut `file://`-URL, ändrar inget):

```bash
node amatris.mjs
```

Det bygger raderna som en transkription av
[src/core/simulation.js:79-155](../../src/core/simulation.js#L79-L155) och
verifierar transkriptionen genom att jämföra sina r-tal mot `computeSimulation()`
(avvikelse 1,11e-16).
