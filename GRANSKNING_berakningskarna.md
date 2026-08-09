# Granskning av NätSims beräkningskärna

**Datum:** 2026-08-09 (granskning), uppdaterad efter åtgärd
**Omfattning:** `src/core/*`, `src/reports/sim-report.js` samt de UI-moduler som återger r-tal, MUF och YT.
**Metod:** Kodläsning + oberoende referensimplementation av 2D MK-utjämning skriven från lärobokens formler (inte från NätSims kod), samt handräknade minimalnät med slutet facit.

> **Läsanvisning:** avsnitt 1–3 beskriver nätet *som det såg ut vid granskningen*. Pipeline-kartan, radnumren och formlerna där speglar alltså läget före åtgärd. Varje fyndpost är märkt med sin nuvarande status. Avsnitt 4 (handlingsplanen) är bevarad som historik över analysen — den beskriver inte kvarvarande arbete. Aktuellt läge finns i statustabellen nedan och i sammanfattningen.

---

## 0. Åtgärdsstatus

Åtgärdat i tre omgångar, en atomär commit per post, varje fix belagd med facittest som gick rött → grönt. Skyddsnätet ligger i `tests/facit.test.js` (oberoende facit) vid sidan av `tests/calc.test.js` (omskriven från golden master till facit).

| Post | Status | Grund |
|---|---|---|
| **F1** ∂riktning/∂z = −d | ✅ åtgärdad | HMK Formel 3.3 / Bilaga F |
| **F2** orienteringsobekant endast vid riktning | ✅ åtgärdad | rangdefekt, handräknat facit |
| **F3** anslutningsosäkerhet som varians | ✅ åtgärdad | felfortplantning, gränsvärdesanalys |
| **F4** centreringen som en C-term | ✅ åtgärdad | HMK Bilaga C.1.1 / C.1.2 |
| **F5** u(plan) = √(σN² + σE²) | ✅ åtgärdad | HMK Formel F.23 + HMK-Ordlistan |
| **F6** Q_xx-indexering i rapporten | ✅ åtgärdad | delad `stationIds()` |
| **F7** klassgränsen k > 1,14 | ⏸ **stoppad** | storheten är k-talet, inte u₀ — se posten |
| **F8** YT för riktningar i mgon | ✅ åtgärdad | HMK F.4.1 |
| **F9** rubriken 95 % → 1σ | ✅ åtgärdad | HMK Bilaga B.3.3 |
| **F17** σ_D = √[(A + B·L)² + C²] | ✅ åtgärdad | HMK Bilaga C.1.2 + TDOK 2014:0571 §4.6.1.2 |
| **F18** κ = 2,80 | ✅ **prövad och avförd** | HMK Formel F.16 — koden var rätt |
| F10–F16, F19 | ⬜ öppna | låg allvarlighetsgrad, se respektive post |

**Två poster där min ursprungliga hypotes var fel och standardtexten avgjorde:** F17 (jag bedömde kvadratisk summering som rätt — C.1.2 föreskriver hybridform) och F18 (jag flaggade κ = 2,80 mot Baardas 4,13 — F.16 föreskriver 2,80).

**Två gånger replikerade den oberoende referensimplementationen samma fel som kärnan** och gav falsk överensstämmelse: `sigPos` som mean-form (F5) och längd-σ som helt kvadratisk (F17). Båda upptäcktes först när facit härleddes ur standardtexten i stället för ur referensen. **En referens som speglar koden kan inte fånga kodens fel** — det är granskningens viktigaste metodlärdom.

---

## 1. Pipeline-karta

```
                          state/store.js  { pts, meas, centerErr }
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │  core/simulation.js :: runSimulation()                     │
        └────────────────────────────────────────────────────────────┘
                                     │
  (a) DATUM        rad 19–20   knownPts / freePts  →  kända punkter utesluts helt
                               ur obekantvektorn (absolut anslutning, hård fixering)
                                     │
  (b) OBEKANTA     rad 51–60   freeIdx  : block 1  [0 .. 2·nFree−1]   E,N per fri punkt
                               stnIdx   : block 2  [2·nFree .. +nStn] z per uppställning
                               nu = 2·nFree + nStn
                                     │
  (c) σ a priori   rad 69–89   INSTRUMENTS (core/constants.js) → σ_Dmm, σ_Dppm, σ_Hz
                               numSatser →  σ_Hz,eff = σ_Hz/√n          (rad 85)
                               centrering→  e_c = √(e_from² + e_to²)     (rad 82)
                               σ_D   = √(σ_mm² + (d·ppm)² + e_c²)        (rad 84)
                               σ_Hz,c= e_c/d · 200000/π  [mgon]          (rad 86)
                               σ_arc = d · σ_Hz,tot · 0,001 · π/200 [m]  (rad 88–89)
                                     │
  (d) DESIGNMATRIS A
        core/designmatrix.js :: calcM()  → p1, p2, bäring via atan2(dE, dN)
        core/simulation.js
          rad 97–107   avståndsrad   ∂d/∂E,N   = ∓ex, ∓ey
          rad 110–124  riktningsrad  (bågmeter) ±ey, ∓ex  och  ∂/∂z = −1   ← se F1
                                     │
  (e) VIKTMATRIS P rad 136     P_i = 1/σ_i²   (diagonal, lagrad som vektor)
                                     │
  (f) NORMALMATRIS rad 138–142 N = AᵀPA   (trippelloop, tät lagring)
                                     │
  (g) INVERTERING  core/matrix.js :: invertMatrix()
                               Gauss–Jordan, partiell pivotering, singulär om |piv| < 1e−14
                               → Q_xx = N⁻¹                              (rad 144)
                                     │
  (h) DATUMKONTROLL core/datum-check.js :: checkDatumDefect()
                               larmar om Q_xx[i][i] ej ändlig, < 0 eller > 100  (rad 151)
                                     │
  (i) REDUNDANS    rad 161–185 h_ii = a_iᵀ Q_xx a_i · P_i
                               r_i  = 1 − h_ii, klampat till [0,1]        (rad 171)
                               MUF  = κ · σ_i / √r_i,  κ = 2,80           (rad 174)
                               YT   = (1 − r_i) · MUF                     (rad 180)
                                     │
  (j) PUNKTOSÄKERHET core/ellipses.js :: computeEllipse()                 (rad 189–193)
                               egenvärden av 2×2-blocket ur Q_xx per punkt
                               a, b, θ = ½·atan2(2Q_en, Q_ee − Q_nn), σ_pos
                                     │
  (k) k-TAL        rad 196–199 f = n − u,  k = f/n,  klassning
                                     │
  (l) SIMSTATIONER core/stations.js :: runSimStations()                   (rad 232)
                               separat 3×3-system [E, N, z] per simulerad uppställning
                                     │
                                     ▼
                        setState({ simResult })  (rad 238)
                                     │
        ┌────────────────┬───────────┴────────────┬─────────────────────┐
        ▼                ▼                        ▼                     ▼
 reports/sim-report.js  ui/right-panel.js  ui/studio-views/*.js   map/leaflet-setup.js
 (räknar om σ och YT)   (räknar om YT)     (räknar om YT)         (ritar ellipser)
```

**Nyckelobservation om dataflödet:** `simResult` bär r-tal och MUF färdiga från kärnan, men **YT räknas om på fyra ställen i presentationslagret** (`sim-report.js:53`, `sim-report.js` implicit, `right-panel.js:391`, `report-studio.js:124`, `simulation-studio.js:65`) i stället för att läsas från `redund[].yt_m`. Formeln är i dagsläget identisk överallt, så de divergerar inte numeriskt — men enheten märks fel i alla fyra (se F8).

---

## 2. Verifierat korrekt

| Del | Belägg |
|---|---|
| **Avståndets partialderivator** ∂d/∂E_j = e_x, ∂d/∂N_j = e_y, ∂d/∂E_i = −e_x, ∂d/∂N_i = −e_y | `simulation.js:97–107`. Identiska med referensimplementationen. Avståndsraderna gav bit-identiska r-tal i T3 (`r = 0,333333` × 3, handräknat facit 1/3 vid symmetri). |
| **Σr_i = n − u** | Håller exakt i samtliga testfall (T3: 1,000000; T5: 12,000000; B: 2,000000). **Varning:** detta är en spåridentitet som gäller för *varje* A med full rang — den bevisar **inte** att A är rätt. Se avsnitt 5. |
| **numSatser skalar bara riktningen** | T7: σ_dist = 1,0050 mm oförändrad för n = 1, 3, 9 medan σ_arc går 0,4712 → 0,2721 → 0,1571 mm (∝ 1/√n). Den misstänkta buggen i uppdraget **finns inte**. `simulation.js:85` är korrekt enligt HMK §6.4.2. |
| **Vikt P = 1/σ²** | `simulation.js:136`. Diagonal, korrekt. |
| **mgon → radian** | `simulation.js:88`: `·0,001·(π/200)`. Korrekt (1 mgon = 10⁻³ gon, 1 gon = π/200 rad). Konsekvent i hela kärnan; ingen enhetsblandning hittad mellan mgon/gon/rad. |
| **Dimensionskonsistens A ↔ P** | Riktningsraden är bågmeter-parameteriserad (rad × d) och σ_arc = d·σ_rad. Vinkel- och längdobservationer hamnar därmed i samma enhet (meter) i både A och P. Konceptuellt rätt. |
| **Datumhantering** | Kända punkter får aldrig index i `freeIdx` (`simulation.js:52`) och elimineras därmed helt ur obekantvektorn. Ren absolut anslutning, ingen blandning med fri/elastisk utjämning (dessa är inte implementerade). Rangdefekt = 0 verifierad i T1, T3, T5, T9. |
| **Matrisinvertering** | `matrix.js`. Gauss–Jordan med partiell pivotering på kolumn, singularitetströskel 1e−14, returnerar `null` i stället för NaN. Anropssidan (`simulation.js:145`) hanterar `null` med felmeddelande — ingen tyst felaktig utdata. |
| **Felellipsens egenvärdesuppdelning** | `ellipses.js:6–12`. Verifierad mot direkt egenvektorberäkning i test D: a = 5,590 mm längs E, b = 0,607 mm, θ = 0,000° för en geometri där alla sikter går i N-riktning. Matematiskt korrekt. Båda egenvärdena skyddade med `Math.max(0, …)`. |
| **95 %-faktorn 2,4477** | `leaflet-setup.js:344`, `net-image.js:298`. √χ²(2; 0,95) = √5,9915 = 2,4477. Korrekt för 2D-konfidensellips. |
| **Riktningsradens teckenkonvention** | Koordinatpartialerna i `simulation.js:113–116` är negerade mot lärobokens (koden ger +e_y, −e_x för stationen; korrekt är −e_y, +e_x). Detta är **ofarligt** och ska **inte** åtgärdas isolerat: raden motsvarar en ren omparametrisering z → −z, och h_ii = a_iᵀQa_i·P_i är invariant under sådan teckenväxling. Bekräftat numeriskt — T1, T3, T9 ger bit-identiska r-tal och σ mot referensen. |

---

## 3. Fynd

### F1 — KRITISK: ∂riktning/∂z = −1 i stället för −d

**Fil:** `src/core/simulation.js:120`
```js
rowH[nFree * 2 + stnIdx[p1.id]] = -1;   // kommentar: "rad 951 exakt (ej -dist_m)"
```

**Fel:** Riktningsraden är bågmeter-parameteriserad — koordinatleden är multiplicerade med *d* (±e_y, ∓e_x i stället för ±dN/d², ∓dE/d²) och σ är skalad som σ_arc = d·σ_rad. Då **måste** även orienteringsledet skalas: ∂/∂z = −d. Koden använder −1, vilket blandar bågmeter i koordinatkolumnerna med radian i orienteringskolumnen inom en och samma rad.

**Standardreferens:** `src/core/stations.js:66` gör rätt i samma kodbas: `const aH = [ey, -ex, -dist_m]`. Och `src/reports/sim-report.js:220` **dokumenterar** den korrekta formeln:
> `Designmatris riktning: ∂r/∂E_i=+ey, ∂r/∂N_i=-ex, ∂r/∂E_j=-ey, ∂r/∂N_j=+ex, ∂r/∂z_k=-d`

Rapportgeneratorn skriver alltså ut `−d` medan kärnan räknar med `−1`. Kärnan är fel — inte rapporten.

**Konsekvens:** Påverkar **r-tal, MUF, YT, punktosäkerheter och felellipser** — allt utom Σr. Felet uppstår så fort siktlängderna från en uppställning skiljer sig åt. Vid *lika* siktlängder är −1 vs −d en ren kolumnskalning och därmed ofarlig, vilket är exakt varför nätets symmetriska referenstester inte fångar det.

**Minimalt reproducerande testfall (handverifierat, slutet facit):**

Uppställning `S` på en **känd** punkt mäter tre riktningar (`hz_only`) mot tre kända punkter på avstånden 50 / 100 / 400 m. Enda obekant är orienteringskonstanten ⇒ n = 3, u = 1, f = 2.

*Handräkning, korrekt modell:* a_i = −d_i, σ_i = d_i·σ_α ⇒ p_i = 1/(d_i²σ_α²).
N = Σ p_i d_i² = 3/σ_α². h_ii = a_i²p_i/N = d_i²·(1/(d_i²σ_α²))·(σ_α²/3) = **1/3** oberoende av d_i.
⇒ **r_i = 2/3 för alla tre**, Σr = 2 = f. ✔

*Handräkning, NätSims modell:* a_i = −1 ⇒ h_ii = p_i/Σp_j = (1/d_i²)/Σ(1/d_j²).
Med d = 50, 100, 400: vikterna förhåller sig som 64 : 16 : 1, summa 81.
⇒ r = 1 − 64/81 = **0,209877**, 1 − 16/81 = **0,802469**, 1 − 1/81 = **0,987654**.

*Uppmätt utfall från NätSim:*

| Sikt | d | r NätSim | r korrekt (facit) |
|---|---|---|---|
| S→FP1 | 50 m | **0,209877** | 0,666667 |
| S→FP2 | 100 m | **0,802469** | 0,666667 |
| S→FP3 | 400 m | **0,987654** | 0,666667 |
| | Σ | 2,000000 | 2,000000 |

NätSims utfall reproducerar handräkningen av den **felaktiga** modellen till sista siffran (64/81, 16/81, 1/81). Diagnosen är därmed sluten, inte en hypotes.

**Effekt på levererade resultat i ett realistiskt nät** (T5: fackverk, 2 kända + 2 nya, reciproka sikter, siktlängder 91–200 m):

| Storhet | NätSim | Korrekt | Avvikelse |
|---|---|---|---|
| r (NY1→FP1, riktning) | 0,293308 | 0,192757 | **+0,101** |
| r (NY2→NY1, riktning) | 0,310461 | 0,450624 | **−0,140** |
| σ_pos NY1 | 0,9535 mm | 0,9364 mm | +1,8 % |
| σ_pos NY2 | 0,9805 mm | 0,9651 mm | +1,6 % |

Riktningen på felet är systematisk: **långa sikter får för högt r-tal, korta sikter för lågt.** Det betyder att verktyget i dag *underskattar* kontrollbehovet på korta sikter och *överskattar* tillförlitligheten på långa — precis fel håll ur ett kvalitetssäkringsperspektiv.

**Kontrollverifikation:** referensimplementationen kördes med ∂/∂z tvingat till −1 och gav då max |r_NätSim − r_ref| = 2,2·10⁻¹⁶ (maskinprecision), mot 1,4·10⁻¹ med −d. Ingen annan skillnad mellan implementationerna kvarstår.

---

### F2 — KRITISK: orienteringsobekant tilldelas även uppställningar utan riktningsobservationer

**Fil:** `src/core/simulation.js:55–58`
```js
const stnIds = [...new Set(meas.map(m => m.from))];
```

**Fel:** Varje unikt `from`-id får en orienteringsobekant, oavsett `obsType`. En uppställning som bara har `dist_only`-mätningar får därför en kolumn i A som aldrig fylls i (riktningsraden byggs bara under `addHz`, rad 110). Kolumnen är identiskt noll ⇒ N är singulär.

**Konsekvens:** NätSim kan **inte beräkna rena trilaterationsnät alls**, och kraschar även på blandade nät där en enda uppställning råkar ha enbart avståndsmätningar. Användaren får meddelandet *"Normalmatrisen är singulär"* med tre förslag som alla är felaktiga för situationen — nätet är i själva verket väl bestämt.

**Minimalt reproducerande testfall:** punkt `NY1` (ny) mäter tre avstånd (`dist_only`) till tre kända punkter i god geometri.

| | Facit (handräknat) | NätSim |
|---|---|---|
| n | 3 | 3 |
| u | 2 | **3** (2 koordinater + 1 onödig z) |
| f | 1 | 0 |
| Resultat | r = [0,4899, 0,0017, 0,5084], Σr = 1,000000 ✔<br>σ_E = 0,9325 mm, σ_N = 0,8702 mm | **Fel: "Normalmatrisen är singulär"** |

Samma fel i blandat nät: två uppställningar med `both` + en med `dist_only` mot samma nya punkt ⇒ korrekt n = 5, u = 4, f = 1, men NätSim räknar u = 5 och avbryter.

**Föreslagen fix:** bygg `stnIds` bara av mätningar som faktiskt ger en riktningsrad:
```js
const stnIds = [...new Set(meas.filter(m => (m.obsType || "both") !== "dist_only").map(m => m.from))];
```

---

### F3 — HÖG: felfortplantningen för simulerade uppställningar går åt fel håll

**Fil:** `src/core/stations.js:73–98` och `:106`
```js
const N_tot = N_obs.map((row, r) => row.map((v, c) => v + N_prop[r][c]));
```

**Fel:** Anslutningspunkternas osäkerhet hanteras genom att bygga en *separat normalmatris* `N_prop` med vikten v = aᵀQ_k⁻¹a och sedan **addera** den till observationernas `N_obs`. Att addera två normalmatriser betyder matematiskt "lägg till ytterligare en oberoende observationsuppsättning" — resultatet kan därför bara bli **bättre**, aldrig sämre. Korrekt felfortplantning är att osäkerheten hos anslutningspunkten *degraderar* observationen: σ²_eff = σ²_obs + aᵀQ_k a, och vikten blir 1/σ²_eff.

**Konsekvens:** simulerade uppställningars σ_pos, felellipser och kartvisning är kvalitativt fel. Verktyget svarar systematiskt fel på precis den fråga en simstation ska besvara.

**Minimalt reproducerande testfall:** en simstation mäter `both` mot tre fria punkter i god geometri. Anslutningspunkternas Q_xx sätts isotropt och varieras:

| σ anslutningspunkter | σ_pos(SS1) enligt NätSim |
|---|---|
| 0,5 mm | 0,1440 mm |
| 1,0 mm | 0,1603 mm |
| 2,0 mm | 0,1654 mm |
| 5,0 mm | 0,1669 mm |
| 20,0 mm | 0,1672 mm |
| 100,0 mm | 0,1672 mm |

Två oberoende brott mot facit:
1. σ_pos **minskar** när anslutningen blir *bättre* — men startar för lågt och **mättas** vid 0,1672 mm när anslutningen blir godtyckligt dålig. Med 100 mm osäkra anslutningspunkter borde uppställningen vara i det närmaste obestämbar.
2. σ_pos är i **samtliga** fall lägre än `sigPos_obs` = 0,2365 mm (osäkerheten med *perfekta* anslutningspunkter, `stations.js:116`). Anslutningsosäkerhet gör alltså stationen bättre än det teoretiska bästa fallet. Detta är omöjligt.

Facit: σ_pos ska **växa** monotont med anslutningsosäkerheten och gå mot σ_pos_obs när den går mot noll.

---

### F4 — HÖG: √2-diskrepans i centreringsfelet mellan kärna och rapport

**Filer:** `src/core/simulation.js:82` mot `src/reports/sim-report.js:148`

```js
// simulation.js:82   (även stations.js:49)
const e_c = Math.sqrt(e_from * e_from + e_to * e_to);
// sim-report.js:148
const e_c = Math.sqrt((e_from * e_from + e_to * e_to) / 2);
```

**Konsekvens:** Den detaljerade beräkningsrapporten — den handling som ska *bevisa* hur nätet räknats — redovisar andra σ-värden och andra vikter än kärnan faktiskt använde. Med e_from = e_to = 2,0 mm och d = 100 m:

| | e_c | σ_D | σ_Hz,centrering |
|---|---|---|---|
| `simulation.js` (används i beräkningen) | 2,8284 mm | 3,0017 mm | 1,8006 mgon |
| `sim-report.js` (skrivs ut i rapporten) | 2,0000 mm | 2,2383 mm | 1,2732 mgon |
| Kvot | **√2** | 1,341 | **√2** |

**Vilken är rätt?** Frågan hänger på hur `centerErr` är *definierad* i användargränssnittet:

- Om `centerErr` är **1D-komponentosäkerhet** (σ per koordinatriktning) är `simulation.js` rätt: två oberoende centreringar adderas kvadratiskt, e_c = √(e₁² + e₂²).
- Om `centerErr` är **2D-punktosäkerhet** (Helmert, den vanliga tolkningen av "centreringsfel 2 mm" i HMK/SIS-TS-sammanhang) är komponentosäkerheten e/√2, och då gäller e_c = √((e₁² + e₂²)/2) — dvs. `sim-report.js`.

`src/core/constants.js:70,84,98,112` sätter `centerErr` per mätklass till 1/1/2/3 mm med hänvisning till **SIS-TS 21143:2016 Tabell A.9**. Tabell A.9 anger centreringstoleransen som en punktstorhet, vilket talar för **2D-tolkningen och därmed att `sim-report.js` har rätt och kärnan överskattar centreringsbidraget med √2**.

Detta är den enda punkten i granskningen där jag **inte** kan sluta beviskedjan från koden och handräkning ensamt — den kräver att tolkningen av `centerErr` mot SIS-TS Tabell A.9 fastställs. Se avsnitt 5 (Öppna punkter). Oavsett vilken tolkning som väljs är det ett fel att de två kodvägarna har olika formel.

**Reproducerande testfall:** T6 i granskningsskriptet; kör samma nät genom `runSimulation()` och `exportCalcReport()` och jämför σ_D-kolumnen.

---

### F5 — ✅ ÅTGÄRDAD: σ_pos använde fel definition

**Fil:** `src/core/ellipses.js:14`

```js
// FÖRE – kvadratiskt medelvärde av komponenterna, √2 för litet
const sigPos = Math.sqrt(Math.max(0, (Qee + Qnn) / 2));
// EFTER – u(plan) enligt HMK-Stommätning 2024 Formel F.23
const sigPos = Math.sqrt(Math.max(0, Qee + Qnn));
```

**Slutsats:** **HMK-Stommätning 2024 Bilaga F, Formel F.23** definierar standardosäkerheten i plan som

> u(plan) = √[u²(N) + u²(E)]

dvs. Helmerts punktmedelfel. **HMK-Ordlistan (april 2022)** bekräftar: standardosäkerhet i plan = punktmedelfel. Det finns ingen delning med 2. `stations.js` hade alltså redan rätt form; `computeEllipse` var √2 för liten. Motiveringen "per Geo Professional" i den gamla kommentaren är struken — Geo är inte korrekthetskriterium.

**Två fällor som noterades under åtgärden:**

1. **Referensimplementationen kodade samma fel.** `ref.mjs` hade `sigPos: √(mean)` och matchade därför kärnan med avvikelse < 5e-16 — mot fel svar. En referens som replikerar buggen kan inte fånga den. Facit härleddes i stället ur F.23 och de *definitionsoberoende* komponenterna σ_E och σ_N, som var validerade. `ref.mjs` är rättad.
2. **Halvaxlarna rördes inte.** a och b kommer ur egenvärdesuppdelningen och är oberoende av σ_pos-definitionen. Verifierat med invarianten a² + b² = σN² + σE² = σ_pos², som håller till 1e-15.

**Tröskelförflyttning (icke-konservativ riktning):** σ_pos steg med √2, så nät som tidigare klarade en gräns kan nu underkännas. Berörda: `sigReq` (`sim-report.js`, standard 3 mm), `kravSP` (`pm/report-generator.js`), samt färgbanden 5/20 mm i `simulation-studio.js` och `leaflet-setup.js`.

---

### F6 — MEDEL: beräkningsrapporten indexerar Q_xx fel när simulerade uppställningar finns

**Fil:** `src/reports/sim-report.js:114`
```js
const freePts_ = pts.filter(p => p.type !== "known" && p.type !== "simstation");
```
mot `src/core/simulation.js:20`
```js
const freePts = pts.filter(p => p.type !== "known");     // simstation INGÅR
```

**Konsekvens:** Kärnan ger simulerade uppställningar egna koordinatobekanta i huvudnätet; rapporten utesluter dem. Q_xx-index förskjuts, och avsnitt 2 (obekantförteckning), 3 (designmatrisrader) och 4 (kovariansblock per punkt) i den detaljerade beräkningsrapporten **märker fel punkt på fel siffror**.

**Reproducerande testfall:** nät med FP1, FP2 (kända), SS1 (simstation), NY1 (ny):

```
freeIds i kärnan:              ["SS1", "NY1"]
freePts_ i sim-report.js:      ["NY1"]
→ rapporten läser NY1:s ellips ur Q_xx-index 0, men kärnans NY1 ligger på index 2
  (index 0 tillhör SS1)
```

Samma nät avslöjar en **strukturell fråga som behöver ett designbeslut**: SS1 får σ_pos = 1,090 mm som vanlig fri punkt i huvudnätet *och* σ_pos = 0,780 mm ur `runSimStations()`. Punkten beräknas alltså två gånger med två svar. Vilket som är avsett framgår inte av koden.

---

### F7 — MEDEL: klassgränsen k > 1,14 är matematiskt onåbar

**Filer:** `src/core/simulation.js:198–199`, `src/ui/validation.js:16`, `src/ui/quality-panel.js:11`, `src/ui/right-panel.js:251`, `src/ui/studio-views/report-studio.js:8`, `src/ui/studio-views/simulation-studio.js:12`

```js
const K_class = K_global > 1.14 ? "Överbestämt" : …
```

Med k = f/n = (n − u)/n och u ≥ 1 gäller alltid **k < 1**. Grenen "Överbestämt" (och färgen `val-purple` / `#ce93d8`) kan aldrig nås, och varningen i `validation.js:16` kan aldrig utlösas.

**Konsekvens:** Låg direkt skada — men klassificeringen ger sken av ett tak som inte finns, och testet i `tests/calc.test.js` är skrivet som om k > 1,14 vore möjligt (med en kommentar som medger att det inte gick att konstruera).

**Reproducerande testfall:** T8 — fyra kända punkter mäter `both` mot en ny punkt: n = 8, u = 6, f = 2, k = 0,2500. Maximalt möjligt k i vilket nät som helst är (n − u)/n < 1.

#### ⏸ STOPPAD I AVVAKTAN PÅ BESLUT — storheten är k-talet, inte u₀

Hypotesen att 1,14 skulle vara ett feltolkat gränsvärde för **viktsenhetens standardosäkerhet u₀** är prövad. Talet stämmer misstänkt väl: 1,14 är exakt maxvärdet för u₀ vid f = 70 i **HMK Tabell 53** (övre gräns ≈ 0,96 + f⁻⁰⋅⁴, undre ≈ 1/(0,96 + f⁻⁰⋅⁴)). Men kontroll av koden visar att så inte är fallet:

1. `simulation.js:220` beräknar `K_global = dof / n_obs`, dvs. **f/n — kontrollerbarhetstalet**, inte u₀.
2. Samtliga sex 1,14-ställen konsumerar `sr.K_global`. De syftar alltså på samma storhet.
3. **Det finns inget u₀ i kodbasen.** NätSim är ett rent simuleringsverktyg utan observationer, alltså utan residualer — vᵀPv/f existerar inte och kan inte beräknas.

Att införa de f-beroende gränserna ur Tabell 53 skulle därför kräva att u₀ **först implementeras**, vilket förutsätter en utjämning av faktiska mätningar. Det är en funktionell utvidgning, inte en buggfix.

**Kvarstår att avgöra:** var 1,14 avsett som (a) en u₀-gräns som hamnat på fel storhet, (b) en gräns på en helt annan kvot (n/u > 1,14 ⇔ k > 0,123), eller (c) ett rent misstag där grenen ska bort? Ingen ändring görs förrän detta är klarlagt.

---

### F8 — ✅ ÅTGÄRDAD: YT för riktningsobservationer märktes "gon" men är mgon

**Filer:** `src/reports/sim-report.js:54`, `src/ui/right-panel.js:394`, `src/ui/studio-views/report-studio.js:125`, `src/ui/studio-views/simulation-studio.js:67`

```js
const yt = rd.mdb.val * (1 - rd.ri);            // rd.mdb.val är i MGON för type === "hz"
const ytStr = … : yt.toFixed(4) + "gon";        // ← märks "gon"
```

`simulation.js` konverterar MUF för riktningar till **mgon**. YT ärver den enheten men presenterades med suffixet `gon` på alla fyra ställen. **Konsekvens:** yttre tillförlitlighet för riktningar redovisades 1000 gånger för stor i förhållande till sin etikett. MUF-kolumnen intill var korrekt märkt `mgon`, vilket gjorde felet extra förvillande.

**Åtgärdad** enligt **HMK-Stommätning 2024 F.4.1**: tillförlitlighetsmåtten ges i samma enhet som mätningarna, och riktningarnas u(l) är i mgon. Etiketten rättad på alla fyra ställen — **endast märkning, inget talvärde rört**. Före: `MUF 5.88mgon  YT 3.6793gon`. Efter: `MUF 5.88mgon  YT 3.6793mgon`.

---

### F9 — ✅ ÅTGÄRDAD: rubriken lovade 95 % men värdena är 1σ

**Fil:** `src/reports/sim-report.js:39`
```js
r += `3. PUNKTOSÄKERHETER (95%, k=2.45)\n${sep}\n`;
```

`simulation.js` sätter `const k_ell = 1.0`, så `sigE`, `sigN`, `sigPos`, `aSemi`, `bSemi` i `ptResults` är **1σ**. Rapporten skrev ut dem oförändrade under en rubrik som utlovade 95 %-nivå. **Konsekvens:** punktosäkerheter i den levererade rapporten underskattades med faktor 2,45 mot sin egen rubrik.

**Åtgärdad** enligt **HMK-Stommätning 2024 Bilaga B.3.3**, som redovisar σ_pos, MUF och YT som standardosäkerheter. Rubrikerna i avsnitt 3 och 4 anger nu "standardosäkerhet 1σ (k=1)". **Värdena är inte uppblåsta** — det är HMK:s default. Utvidgad osäkerhet på 95 % vore ett separat produktbeslut som kräver rätt täckningsfaktor. Kartlagret (`leaflet-setup.js`) gjorde redan rätt och skalar med 2,4477 när `ellipsMode === "95"`.

---

### F10 — LÅG: formelförteckningen dokumenterar en formel koden inte använder

**Fil:** `src/reports/sim-report.js:179, 220`

Rapporten skriver både designmatrisraden `a[…](z_…) = ${f6(-dist_m)}` och formelförteckningens `∂r/∂z_k = -d`. Kärnan använder −1 (F1). Posten löser sig automatiskt när F1 åtgärdas, men bör verifieras i samma svep.

---

### F11 — LÅG: θ:s vinkelkonvention dokumenteras inte och formateras som bäring

**Filer:** `src/core/ellipses.js:12`, `src/reports/sim-report.js:43`, `src/ui/right-panel.js:334`, `src/ui/studio-views/report-studio.js:112`

θ = ½·atan2(2Q_en, Q_ee − Q_nn) mäts **från E-axeln moturs mot N** (matematisk konvention). Verifierat i test D: en geometri med storaxeln längs E ger θ = 0,000°.

Värdet formateras sedan med `fG()` — `designmatrix.js:15`, som är avsedd för **bäringar i gon** (norr = 0, medsols). En användare som läser θ som geodetisk bäring får fel: sambandet är bäring = 100 gon − θ_gon, alltså både förskjutning **och spegling**. Ritningen är däremot korrekt: canvas roterar med `-theta` (`leaflet-setup.js:351`, `net-image.js:308`), vilket stämmer med skärmens inverterade N-axel.

Dessutom: `fG()` gör `String(gi).padStart(3,"0")` och hanterar inte negativa vinklar snyggt — θ ∈ (−90°, 90°] ger utskrifter som `-33g…`.

---

### F12 — LÅG: observationsräkningen per punkt antar två rader per mätning

**Fil:** `src/reports/sim-report.js:67`
```js
const nObs = Math.round(myR.length / 2);
```
Antar att varje mätning ger både avstånd och riktning. För `hz_only`/`dist_only` blir "Obs"-kolumnen i avsnitt 5 hälften av rätt värde (avrundat).

---

### F13 — LÅG: `redundTotal` är en sträng

**Fil:** `src/core/simulation.js:221`
```js
redundTotal: redund.reduce((a, r) => a + r.ri, 0).toFixed(2),
```
`.toFixed()` ger en `string` i `simResult`. `tests/calc.test.js:40` gör `expect(sr.redundTotal).toBeCloseTo(3.00, 2)` på strängen — det passerar i dag genom typkoercion, men kontrollsumman Σr = f är den viktigaste sanity-checken i hela kärnan och bör exponeras som `number` med full precision.

---

### F14 — LÅG: tyst fallback vid sammanfallande punkter

**Fil:** `src/core/simulation.js:76`
```js
const d_m = Math.sqrt(dE * dE + dN * dN) || 1;
```
Om två punkter har identiska koordinater blir d = 0 → d_m = 1, och e_x = e_y = 0 ger en **nollrad** i A som tyst bidrar med r = 1 och noll information. Bör avvisas med ett felmeddelande i stället.

---

### F15 — LÅG: σ beräknas på `measDist`, designmatrisen på koordinatavståndet

**Fil:** `src/core/simulation.js:76–89`

`d_m` (ur koordinater) styr e_x, e_y och därmed A-raden, medan `dist_m` (= `m.measDist` om satt) styr σ_D, σ_Hz,c och σ_arc. I en ren simulering är de identiska; med importerad mätdata där `measDist` avviker blir A och P inbördes inkonsistenta. `obs.d` som används för MUF-konverteringen (rad 177) är `dist_m`.

---

### F16 — LÅG: föråldrad term "redovisning"

**Fil:** `src/pm/report-generator.js:123`
```js
h += `<div class="rbg">Mätningsteknisk redovisning – Planering</div>`;
```
Enligt uppdaterad TDOK ska termen vara **rapport**: *"Mätningsteknisk rapport – Planering"*. Enda förekomsten i `src/`. `sim-report.js` använder redan genomgående "rapport".

---

### F17 — ✅ ÅTGÄRDAD: σ_D-ledens kombination var helt kvadratisk

**Filer:** `src/core/simulation.js:104`, `src/core/stations.js:52`, `src/reports/sim-report.js:152`
```js
// FÖRE – allt kvadratiskt
const sigD = Math.sqrt((sDmm/1000)**2 + (dist_m*sDppm*1e-6)**2 + e_c*e_c);
// EFTER – HMK Bilaga C.1.2: u(L) = √[(A + B·L)² + C²]
const sigD = Math.hypot((sDmm/1000) + (dist_m*sDppm*1e-6), e_c);
```

**Slutsats:** **HMK-Stommätning 2024 Bilaga C.1.2** ger u(L) = √[(A + B·L)² + C²]. Konstantledet A och det avståndsberoende ledet B·L adderas **linjärt**; först centreringen C kombineras kvadratiskt. **TDOK 2014:0571 §4.6.1.2** bekräftar det linjära med ordet "adderas". Min ursprungliga bedömning i denna rapport — att kvadratisk summering vore rätt — var alltså fel; standarden föreskriver hybridformen.

**HMK:s räkneexempel** (A = 2 mm, B = 3 ppm, L = 300 m, C = 3 mm):

| | Resultat |
|---|---|
| Korrekt (hybrid) | √[(2 + 0,9)² + 3²] = **4,1725 mm** |
| Kärnan före fix | √[2² + 0,9² + 3²] = 3,7162 mm |

**Samma fälla som F5:** `ref.mjs` summerade också helt kvadratiskt och kunde därför inte fånga felet. Kontrollerad och rättad före användning som facit.

**Tröskelförflyttning (konservativ riktning):** A + B·L > √(A² + (B·L)²), så längd-σ stiger. +2 % vid 100 m i referensnätet, +41 % vid 1000 m med A = 2 mm, B = 2 ppm. Längd-r-tal, MUF/YT för längder och σ_pos rör sig uppåt.

---

### F18 — ✅ PRÖVAD OCH AVFÖRD: κ = 2,80 är korrekt, ingen kodändring

**Filer:** `src/core/simulation.js:182`, `src/core/stations.js:18`

Flaggades ursprungligen som "att bekräfta" mot Baardas δ₀ = 4,13. **Kontroll mot standarden visar att 2,80 är rätt och att 4,13 vore fel för NätSims ändamål.**

**HMK-Stommätning 2024 Formel F.16** sätter α = 5 %, β = 80 %:

> δ₀ = λ(α/2) + λ(β) = 1,96 + 0,84 = **2,80**

**Tabell 55** visar hela fältet av risknivåer. Baardas 4,13 svarar mot α = 0,1 % — en annan risknivå som HMK **medvetet valt bort**. Ett byte hade gjort NätSim icke-HMK-kompatibelt och blåst upp alla MUF- och YT-värden med 47,5 %.

**Åtgärd:** endast en kommentar som citerar F.16 vid båda konstanterna, plus ett låstest (`F18 – δ₀ = 2,80 låst enligt HMK Formel F.16`) som hindrar att konstanten "rättas" av misstag. Konstanten är oförändrad.

> **Lärdom för framtida granskningar:** min ursprungliga formulering ("Baardas 4,13 är den internationellt vedertagna nivån") pekade åt fel håll. Att en konstant avviker från internationell praxis är inte i sig ett fel när det finns en nationell standard som uttryckligen föreskriver något annat. Både F17 och F18 var poster där min *hypotes* var fel och standardtexten avgjorde — F17 till kodens nackdel, F18 till kodens fördel.

---

### F19 — PROCESS: regressionstesterna låser fast de felaktiga värdena

**Fil:** `tests/calc.test.js`

Alla 255 tester passerar i dag. `calc.test.js` är uttryckligen skriven som *golden master* mot `NätSim_Beta_2.html` ("Värden från original … verifierade mot NumPy", rad 176). Testnätet på rad 13–27 har dock **tre sikter med olika längd men σ_pos-värden som validerats mot samma felaktiga modell** — så testsviten kommer att gå från grön till röd när F1 rättas, trots att rättningen är korrekt. Referensvärdena härrör från en NumPy-implementation som uppenbarligen replikerade samma −1.

Det här är den viktigaste processpunkten i granskningen: **kärnans nuvarande skyddsnät verifierar överensstämmelse med originalet, inte överensstämmelse med geodetisk felteori.** Kommentarerna i kärnan ("Matematiken är oförändrad", "Beräkningskärnan är helig", `simulation.js:119` "rad 951 exakt (ej -dist_m)") visar att avvikelsen från −d var *observerad* under migreringen och medvetet bevarad som troget original. Migreringen är därmed lyckad — felet är ärvt, inte infört.

---

## 4. Prioriterad handlingsplan

### Steg 1 — F1: ∂riktning/∂z = −d  🔴 KRITISK

**Ändras:** `src/core/simulation.js:120`
```js
- rowH[nFree * 2 + stnIdx[p1.id]] = -1;
+ rowH[nFree * 2 + stnIdx[p1.id]] = -dist_m;   // bågmeter: ∂(d·r)/∂z = -d
```
**Varför:** enda stället i kärnan där bågmeter-skalningen inte fullföljs. `stations.js:66` och `sim-report.js:220` gör redan rätt.
**Verifiering — rött → grönt:**
1. Nytt test `tests/core-facit.test.js`: känd station, 3 riktningar `hz_only`, d = 50/100/400 ⇒ **r_i = 2/3 ± 1e-9 för alla tre**. Går i dag till 0,2099/0,8025/0,9877.
2. Befintlig symmetrikontroll (lika d ⇒ r = 2/3) ska **fortsätta** vara grön — den är oförändrad av fixen.
3. `tests/calc.test.js:53–74, 155–181` kommer att brytas. Referensvärdena måste räknas om mot den korrigerade modellen och kommentaren "verifierade mot NumPy" ersättas med härledningen. **Uppdatera inte fixen efter testet — uppdatera testet efter facit.**

### Steg 2 — F2: orienteringsobekant bara för uppställningar med riktningar  🔴 KRITISK

**Ändras:** `src/core/simulation.js:55`
```js
- const stnIds = [...new Set(meas.map(m => m.from))];
+ const stnIds = [...new Set(meas.filter(m => (m.obsType || "both") !== "dist_only")
+                                .map(m => m.from))];
```
**Varför:** en obekant utan tillhörande observation är per definition en rangdefekt.
**Verifiering:** nytt test — ren trilateration, 3 `dist_only` mot 3 kända ⇒ n = 3, u = 2, f = 1, r = [0,4899, 0,0017, 0,5084], σ_E = 0,9325 mm, σ_N = 0,8702 mm. Går i dag till felmeddelande. Plus blandat nät (`both`, `both`, `dist_only`) ⇒ u = 4, f = 1.
**Följdändring:** `sim-report.js:115` bygger `stnIds` med samma (felaktiga) uttryck och måste hållas i synk. Bäst: exportera stationsindexeringen som en delad funktion ur `core/` så att de inte kan divergera igen.

### Steg 3 — F3: felfortplantning för simstationer  🟠 HÖG

**Ändras:** `src/core/stations.js:73–106` — ersätt `N_prop`-konstruktionen med varianspåslag på observationen:
```js
// per observationsrad, innan vikten bildas:
//   σ²_eff = σ²_obs + aᵀ Q_k a      (a = observationens partialderivata mot målpunkten)
//   P      = 1 / σ²_eff
// och stryk N_prop / N_tot helt.
```
**Varför:** normalmatrisaddition modellerar *tillförd* information; anslutningsosäkerhet är *förlorad* information.
**Verifiering:** monotonitetstest — σ_pos(SS1) ska växa strikt när anslutningspunkternas σ går 0,5 → 1 → 2 → 5 → 20 → 100 mm, och σ_pos → σ_pos_obs när σ → 0. I dag faller den och mättas vid ett värde *under* σ_pos_obs. Detta test går från rött till grönt.
**Notera:** även `aStn`-valet på `stations.js:91` (identifiering av radtyp genom `Math.abs(a[0] - ex) < 0.01`) är bräckligt — det jämför rekonstruerade värden i stället för att bära med sig radtypen. Bör städas i samma ändring.

### Steg 4 — F4: centreringsfelets kombination  🟠 HÖG

**Blockerad på beslut:** fastställ först om `centerErr` i UI är 1D-komponent eller 2D-punktosäkerhet enligt SIS-TS 21143:2016 Tabell A.9. Min bedömning: **2D-punktosäkerhet**, vilket gör `sim-report.js:148` rätt och kärnan √2 för pessimistisk.
**Ändras därefter (om bedömningen bekräftas):** `simulation.js:82` och `stations.js:49` till `Math.sqrt((e_from**2 + e_to**2) / 2)`.
**Verifiering:** samma nät genom `runSimulation()` och `exportCalcReport()` ⇒ identisk σ_D-kolumn. Nytt test som kör båda kodvägarna och kräver likhet till 1e−12 — detta test förhindrar återfall oavsett vilken tolkning som väljs.
**Konsekvens att kommunicera:** alla σ_pos sjunker något; nät som ligger nära `sigReq` kan byta godkänt/underkänt-status.

### Steg 5 — F5: σ_pos-definition  🟡 MEDEL

**Blockerad på beslut:** ska nätpunkternas σ_pos vara Helmerts punktmedelfel √(σ_E² + σ_N²) eller nuvarande √((σ_E² + σ_N²)/2)?
Uppdraget efterfrågar Helmert. En ändring flyttar alla värden med faktor √2 och därmed alla `sigReq`-gränser samt kartetiketterna. **Rekommendation:** behåll den nuvarande storheten men *döp om* den i UI/rapport till "medellägesfel per komponent", och lägg till Helmerts punktmedelfel som en **separat, tydligt märkt kolumn**. Då rubbas inga befintliga gränsvärden och uppdragets krav uppfylls.
**Verifiering:** test som kräver σ_Helmert = √2·σ_pos och att `stations.js:116` använder samma definition som nätpunkterna.

### Steg 6 — F6: Q_xx-indexering i rapporten + simstationers dubbelroll  🟡 MEDEL

**Ändras:** `sim-report.js:114` ska använda **samma** filtrering som `simulation.js:20`, eller — bättre — läsa `sr.freeIds` som kärnan redan exporterar (`simulation.js:226`).
**Varför:** rapporten ska aldrig återskapa kärnans indexering; den ska konsumera den.
**Verifiering:** test på nät med simstation — varje `Qxx[i][i]`-rad i rapportens avsnitt 4 ska matcha `sr.freeIds[Math.floor(i/2)]`.
**Separat designbeslut:** ska en `simstation` samtidigt vara fri obekant i huvudnätet *och* beräknas i `runSimStations()`? I dag ger det två olika σ_pos för samma punkt (1,090 mm respektive 0,780 mm i testfallet). Klargör avsikten innan F3 implementeras.

### Steg 7 — F8: YT-enheten  🟡 MEDEL

**Ändras:** `"gon"` → `"mgon"` på `sim-report.js:54`, `right-panel.js:394`, `report-studio.js:125`, `simulation-studio.js:67`.
**Bättre:** flytta hela YT-beräkningen till kärnan (den finns redan som `redund[].yt_m`) och exponera ett färdigformaterat värde med enhet, så att de fyra kopiorna försvinner.
**Verifiering:** test som kräver att YT-strängen för en `hz`-rad slutar på `mgon` och att värdet = `mdb.val·(1−r)`.

### Steg 8 — F9: 95 %-rubriken  🟡 MEDEL

**Ändras:** `sim-report.js:39` — antingen ändra rubriken till `(1σ)`, eller skala värdena med 2,4477. **Rekommendation:** ändra rubriken och lägg till en 95 %-kolumn, så att rapporten matchar kartans `ellipsMode`.
**Verifiering:** test som jämför rapportens σ-kolumn mot `sr.ptResults[].sigPos·1000` exakt.

### Steg 9 — F7, F10–F16: städning  🟢 LÅG

Kan göras i ett svep när stegen ovan är klara:
- **F7** — ta bort grenen `> 1.14` på sex ställen, eller ersätt med en korrekt tröskel om avsikten var n/u.
- **F10** — verifiera att `sim-report.js:179, 220` stämmer efter F1.
- **F11** — dokumentera θ:s konvention i `ellipses.js` och byt formatterare i rapport/paneler, eller konvertera till bäring vid utskrift.
- **F12** — `nObs` ska räkna faktiska observationsrader, inte `length/2`.
- **F13** — `redundTotal` som `number`.
- **F14** — avvisa d = 0 med felmeddelande i stället för `|| 1`.
- **F15** — använd samma avstånd för A och P, eller dokumentera avsikten.
- **F16** — `report-generator.js:123`: "redovisning" → "rapport".

### Steg 10 — F17, F18: bekräfta mot standardtext  📋

Kräver tillgång till HMK-Stommätning 2024 Bilaga F och §6.4:
- **F17** — kvadratisk vs linjär summering av σ_Dmm och σ_Dppm.
- **F18** — föreskriven signifikans-/styrkenivå för κ (2,80 vid α = 0,05 mot Baardas 4,13 vid α₀ = 0,001).

Ingen kodändring innan detta är avgjort. Båda skalar levererade MUF/YT-värden direkt.

### Steg 11 — F19: bygg om skyddsnätet  📋

Ersätt golden master-ansatsen i `tests/calc.test.js` med facitbaserade tester. Minimiuppsättningen som bör finnas innan någon fix landar:

| Test | Facit | Fångar |
|---|---|---|
| Känd station, 3 riktningar, **lika** d | r = 2/3 var, Σr = 2 | regression, ska aldrig gå sönder |
| Känd station, 3 riktningar, **olika** d (50/100/400) | r = 2/3 var, Σr = 2 | **F1** |
| Symmetrisk triangel, 3 kända → 1 ny, `both` | r_dist = 1/3 var, Σr = 1 | avståndsraderna |
| Ren trilateration, 3 `dist_only` | u = 2, f = 1, Σr = 1 | **F2** |
| Simstation, växande anslutnings-σ | σ_pos monotont växande, → σ_pos_obs vid σ→0 | **F3** |
| Samma nät, kärna mot `exportCalcReport()` | identisk σ_D | **F4** |
| Fackverk med reciproka sikter | Σr = n − u, alla r ∈ [0,1] | helhet |

Referensimplementationen och sonderingsskripten som producerat samtliga siffror i denna rapport ligger i sessionens scratchpad (`ref.mjs`, `probe.mjs`, `probe2.mjs`, `probe3.mjs`) och bör lyftas in som `tests/` eller `geo_testkit/` — de är oberoende av NätSims kod och utgör ett riktigt facit, inte en spegel.

---

## 5. Sammanfattning

> **Ursprunglig slutsats (före åtgärd), bevarad som historik.** Uppdaterad bedömning följer efter verifieringsstatusen.

**Beräkningskärnan har ett strukturellt fel, inte bara enstaka defekter — men felet är väl inneslutet och kirurgiskt åtgärdbart.**

Ramverket är riktigt byggt: A → P → N → Q → r → ellipser är korrekt sammansatt, datumhanteringen är ren (kända punkter elimineras helt), matrisinverteringen är numeriskt sund med explicit singularitetsdetektering, avståndsmodellen är felfri, enhetshanteringen mgon/gon/rad är konsekvent genom hela kärnan, och `numSatser` skalar exakt det den ska. Den symmetriska orienteringsmodellen — en obekant per uppställning, varje riktning som egen observationsrad — är korrekt implementerad och ger handverifierat r = 2/3 i det klassiska trepunktsfallet.

Det strukturella felet är **F1**: bågmeter-skalningen fullföljs inte i orienteringskolumnen (−1 i stället för −d). Det är en enda rad, men den sitter i den mest konsekvenstunga delen av pipelinen och förorenar r-tal, MUF, YT, punktosäkerheter och felellipser i **varje** nät där siktlängderna från en uppställning skiljer sig åt — alltså praktiskt taget varje verkligt nät. Effekten är systematisk och pekar åt fel håll: långa sikter framstår som mer kontrollerade än de är, korta som mindre. Felet döljs helt av symmetriska testnät, vilket förklarar varför det överlevt både originalimplementationen, NumPy-verifieringen och migreringen.

**F2** och **F3** är oberoende av F1 och var för sig allvarliga: NätSim kan i dag inte räkna trilaterationsnät alls, och simulerade uppställningar blir *bättre* av osäkrare anslutningspunkter.

### Verifieringsstatus efter åtgärd

**Åtgärdade och låsta med facittest** (handräknat facit eller HMK:s eget räkneexempel):
F1, F2, F3, F4, F5, F6, F8, F9, F17 — samt F18 som prövad och avförd.

**Prövad, men stoppad i avvaktan på beslut:**
F7. Hypotesen att 1,14 vore en feltolkad u₀-gräns ur HMK Tabell 53 är prövad och förkastad: storheten i koden är k-talet f/n, och något u₀ finns inte i kodbasen — NätSim beräknar inga residualer. Att införa Tabell 53:s gränser skulle kräva att u₀ först implementeras, vilket är en funktionell utvidgning, inte en buggfix.

**Kodläsning, ej numeriskt reproducerat — kvarstår öppna** (låg allvarlighetsgrad):
F10, F11, F13, F14, F15, F16.

**Processpunkt kvarstår:** F19. `tests/calc.test.js` är omskriven från golden master till facit, och `tests/facit.test.js` innehåller nu den oberoende facitsviten. Referensimplementationen (`ref.mjs`) ligger fortfarande i sessionens scratchpad och bör lyftas in i repot — men först efter de två rättningar som beskrivs ovan.

### Rekommenderad ordning (ursprunglig — genomförd)

F1 och F2 först — de är små, väl avgränsade och avgör riktigheten i det som faktiskt levereras. Men **bygg facittesterna i steg 11 innan fixarna landar**, annars finns inget som skiljer en korrekt rättning från en regression: dagens testsvit kommer att bli röd av en riktig fix, eftersom den mäter trohet mot originalet i stället för mot geodetisk felteori.

*Denna ordning följdes: facittester → F1 → F2 → F4 → F3, därefter F5 + rapportkonsistens, därefter F17 → F8 → F9 → F18.*

---

## 6. Uppdaterad bedömning efter åtgärd

**Beräkningskärnan är nu i grunden korrekt.** Det strukturella felet (F1) är åtgärdat, liksom samtliga poster med konsekvens för levererade koordinater, punktosäkerheter, r-tal, MUF och YT. Kärnan sammanfaller med en oberoende referensimplementation på samtliga storheter till < 5e-16, och Σr = n − u håller exakt.

**Kvarvarande poster är av låg allvarlighetsgrad** (F10–F16) eller väntar på ett verksamhetsbeslut (F7). Ingen av dem påverkar riktigheten i det som räknas ut.

### Ackumulerad tröskelförflyttning

Fyra fixar rörde levererade tal. De drar delvis åt olika håll, vilket är viktigt vid jämförelse mot äldre rapporter:

| Storhet | Ursprung | Nu | Netto |
|---|---|---|---|
| σ_pos (referensnätet) | 2,006 mm | 2,148 mm | **+7,1 %** |
| σ_E | 2,166 mm | 1,648 mm | −23,9 % |
| σ_N | 1,832 mm | 1,379 mm | −24,7 % |
| MUF (första längdobs) | 12,14 mm | 9,24 mm | **−23,9 %** |
| YT | 6,32 mm | 4,81 mm | −23,9 % |

σ_pos ser nästan oförändrad ut därför att **F4 sänkte med √2 och F5 höjde med √2** — de tar i stort ut varandra, och nettot är i praktiken F1:s och F17:s bidrag. **MUF och YT bar däremot bara F4 och F17 och har ingen sådan kompensation**; de ligger ~24 % under ursprungsläget. Den som jämför en ny körning mot en äldre rapport ser alltså en nästan oförändrad punktosäkerhet men tydligt sänkt MUF — det är väntat och korrekt, inte ett tecken på fel.

**Riktningen på förflyttningarna:** F4 (icke-konservativ, kärnan var för pessimistisk), F5 (icke-konservativ, kärnan underskattade), F17 (konservativ, kärnan underskattade längd-σ). Nät som ligger nära `sigReq` bör räknas om.
