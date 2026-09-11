# UI-inventering – språkbruk i NätSim

**Datum:** 2026-09-10
**Gren:** `fix/berakningskarna-f1-f2-f4-f3`
**Syfte:** Underlag för beslutslista inför Fas UI-2. Inventerar all text som möter användaren.
**Avgränsning:** Konsollogg (`console.warn` m.fl.) och kodkommentarer är inte inventerade. Interna
`state`-nycklar tas bara upp där de påverkar vad användaren ser.

En avvikelse från den föreslagna indelningen: NätSim har **två parallella UI-lager** för samma data –
högerpanelens flikar (kompaktvy) och **studioläget** (fullskärmsvy, Ctrl+E, egna tabeller). Dessutom
finns tre helt egna fönster: **koordinatlistvyn**, **mätboken** och **PM-modulen**. Rapporten följer
därför den föreslagna strukturen men delar upp mätnings- och simuleringsavsnitten i panel/studio, och
lägger till egna avsnitt för koordinatlistan, mätboken och PM.

---

## 1. Mätningsfliken – högerpanelen (kompakt)

Flikraden definieras i [right-panel.js:261-270](../../src/ui/right-panel.js#L261-L270):
`NÄT · MÄTNINGAR · POLÄR · SIMULERING · HINDER · INSTRUMENT · A PRIORI σ · RAPPORT`.

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `MÄTNINGAR (n)` | [right-panel.js:339](../../src/ui/right-panel.js#L339) | Panelrubrik med antal definierade mätningar (linjer, inte observationer). |
| `r_d=0.123` | [right-panel.js:350](../../src/ui/right-panel.js#L350) | Redundanstalet r_i för längdobservationen i mätningen; visas inline på mätkortet. |
| `r_h=0.123` | [right-panel.js:350](../../src/ui/right-panel.js#L350) | Redundanstalet r_i för riktningsobservationen; samma storhet som `r_d`, annat observationsslag. |
| `Avst:` | [right-panel.js:360](../../src/ui/right-panel.js#L360) | Kalkylerat eller inmatat avstånd i meter (4 decimaler). |
| `Riktn:` | [right-panel.js:360](../../src/ui/right-panel.js#L360) | Bäring från–till, formaterad enligt aktiv vinkelenhet (gon-hybrid eller DMS). |
| `⛔ Ta bort n blockerade mätningar` | [right-panel.js:110](../../src/ui/right-panel.js#L110) | Knapp; singular/plural växlas korrekt (`blockerad mätning` / `blockerade mätningar`). |
| `Inga hinder utplacerade – rita väggar i fliken HINDER.` | [right-panel.js:115](../../src/ui/right-panel.js#L115) | Förklaring under inaktiverad knapp. |
| `Alla mätningar har fri sikt.` | [right-panel.js:118](../../src/ui/right-panel.js#L118) | Dito, positivt utfall. |
| `🧮 Optimera nät` | [right-panel.js:135,140](../../src/ui/right-panel.js#L135) | Knapp som öppnar optimeringsdialogen. |
| `Optimering kräver minst 2 punkter och 1 mätning` | [right-panel.js:133](../../src/ui/right-panel.js#L133) | Tooltip på inaktiverad optimeringsknapp. |
| `OPTIMERAT FÖRSLAG` | [right-panel.js:157](../../src/ui/right-panel.js#L157) | Sektionsrubrik för förslagsvyn. |
| `Original` / `Optimerat (+n/−m)` | [right-panel.js:159-160](../../src/ui/right-panel.js#L159-L160) | Vy-växlare mellan aktivt nät och förslag. |
| `Storhet` / `Original` / `Optimerat` | [right-panel.js:164-166](../../src/ui/right-panel.js#L164-L166) | Kolumnrubriker i jämförelsetabellen. |
| `✓ Tillämpa förslag` / `✕ Förkasta` | [right-panel.js:177,180](../../src/ui/right-panel.js#L177) | Knappar. |
| `Inga mätningar ännu.` / `Välj 📏 och klicka på två punkter.` | [right-panel.js:344](../../src/ui/right-panel.js#L344) | Tomtillstånd. |

### Jämförelsetabellens radetiketter (delad med optimeringsdialogen)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Antal mätningar` | [optimizer-proposal.js:96](../../src/state/optimizer-proposal.js#L96) | Antal mätlinjer (`nMeas`), ej observationer. |
| `Minsta r-tal` | [optimizer-proposal.js:98](../../src/state/optimizer-proposal.js#L98) | min r_i över alla observationer. |
| `Obs. med r < 0.50` | [optimizer-proposal.js:102](../../src/state/optimizer-proposal.js#L102) | Antal observationer under det mjuka kravet. |
| `Största σ_pos` | [optimizer-proposal.js:105](../../src/state/optimizer-proposal.js#L105) | max punktstandardosäkerhet i mm. |
| `Kontrollerbarhet k` | [optimizer-proposal.js:109](../../src/state/optimizer-proposal.js#L109) | Globala kontrollerbarhetstalet k = f/n. |
| `Största MUF` / `Största YT` | [optimizer-proposal.js:111,115](../../src/state/optimizer-proposal.js#L111) | Uttryckta som `n,nn × σ` (faktor, inte absolutvärde). |

---

## 2. Mätningsfliken – studioläget

Kolumnuppsättning i [measurements-studio.js:141-151](../../src/ui/studio-views/measurements-studio.js#L141-L151).

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `ID` | [measurements-studio.js:142](../../src/ui/studio-views/measurements-studio.js#L142) | Mätnings-ID (`M1`, `M2`…). |
| `Från` / `Till` | [measurements-studio.js:143-144](../../src/ui/studio-views/measurements-studio.js#L143-L144) | Punkt-ID för uppställning respektive mål. |
| `Typ` | [measurements-studio.js:145](../../src/ui/studio-views/measurements-studio.js#L145) | Observationstyp. |
| `Hz+Dm` / `Hz` / `Dm` | [measurements-studio.js:6](../../src/ui/studio-views/measurements-studio.js#L6) | Kodning av `obsType`: riktning+längd / enbart riktning / enbart längd. |
| `Enbart Hz` / `Enbart Dm` | [measurements-studio.js:79,83](../../src/ui/studio-views/measurements-studio.js#L79) | Samma storhet, utskriven form i statistikkorten. |
| `Avst kalk (m)` | [measurements-studio.js:146](../../src/ui/studio-views/measurements-studio.js#L146) | Kalkylerat avstånd ur koordinaterna. |
| `σ-Hz (mgon)` | [measurements-studio.js:147](../../src/ui/studio-views/measurements-studio.js#L147) | Effektiv a priori riktningsosäkerhet, σ_Hz/√satser. |
| `σ-Dm (mm)` | [measurements-studio.js:148](../../src/ui/studio-views/measurements-studio.js#L148) | A priori längdosäkerhet, konstantdelen. |
| `Inmatat` | [measurements-studio.js:149](../../src/ui/studio-views/measurements-studio.js#L149) | ✓ om användaren matat in ett uppmätt värde. |
| `r_i` | [measurements-studio.js:150](../../src/ui/studio-views/measurements-studio.js#L150) | Redundanstalet – **samma storhet som `r_d`/`r_h` i högerpanelen**. |
| `Observationstyp` | [measurements-studio.js:88](../../src/ui/studio-views/measurements-studio.js#L88) | Filterrubrik. |
| `Från-station` | [measurements-studio.js:98](../../src/ui/studio-views/measurements-studio.js#L98) | Filterrubrik – **enda stället i UI där "station" används på svenska**. |
| `Medel σ (effektiv)` / `σ-Hz:` / `σ-Dm:` | [measurements-studio.js:113-115](../../src/ui/studio-views/measurements-studio.js#L113-L115) | Sidopanelens medelvärden. |
| `Filtrera på ID, Från, Till…` | [measurements-studio.js:107](../../src/ui/studio-views/measurements-studio.js#L107) | Sökfältets placeholder. |
| `n av m mätningar` | [measurements-studio.js:202](../../src/ui/studio-views/measurements-studio.js#L202) | Footer-statistik. |
| `Mätnings-ID` | [measurements-studio.js:214](../../src/ui/studio-views/measurements-studio.js#L214) | CSV-exportens kolumnrubrik för samma fält som skärmens `ID`. |

---

## 3. Simuleringsfliken – högerpanelen (metrics och rapportvärden)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `▶ BERÄKNA SIMULERING` | [right-panel.js:378](../../src/ui/right-panel.js#L378) | Körknapp. |
| `Tryck ▶ Beräkna för att starta simuleringen.` | [right-panel.js:383](../../src/ui/right-panel.js#L383) | Tomtillstånd – knappen heter "BERÄKNA SIMULERING", texten säger "Beräkna". |
| `NÄTSIMULERING` | [right-panel.js:418](../../src/ui/right-panel.js#L418) | Rapporthuvud. |
| `Absolut anslutning – minsta kvadratutjämning` | [right-panel.js:419](../../src/ui/right-panel.js#L419) | Underrubrik/metodbeskrivning. |
| `1. NÄTÖVERSIKT` | [right-panel.js:427](../../src/ui/right-panel.js#L427) | Sektionsrubrik. |
| `Kända punkter (fixerade)` | [right-panel.js:429](../../src/ui/right-panel.js#L429) | Antal punkter av typ `known`. |
| `Fria punkter` | [right-panel.js:430](../../src/ui/right-panel.js#L430) | Punkter vars koordinater skattas. |
| `Uppställningar (orienteringar)` | [right-panel.js:431](../../src/ui/right-panel.js#L431) | Antal orienteringsobekanta – en per uppställning. |
| `Mätningar (linjer)` | [right-panel.js:432](../../src/ui/right-panel.js#L432) | Antal mätlinjer. |
| `Observationer (riktningar+längder)` | [right-panel.js:433](../../src/ui/right-panel.js#L433) | n i k = f/n. |
| `Koordinatobekanta` | [right-panel.js:435](../../src/ui/right-panel.js#L435) | 2 × antal fria punkter. |
| `Orienteringskonstanter` | [right-panel.js:436](../../src/ui/right-panel.js#L436) | z_k, en per uppställning. |
| `Totalt obekanta` | [right-panel.js:437](../../src/ui/right-panel.js#L437) | u. |
| `Frihetsgrader f` | [right-panel.js:439](../../src/ui/right-panel.js#L439) | f = n − u. |
| `Σ redundansbidrag` | [right-panel.js:440](../../src/ui/right-panel.js#L440) | Σr_i, ska = f. |
| `κ (MUF-faktor)` | [right-panel.js:441](../../src/ui/right-panel.js#L441) | Baardas icke-centralitetsparameter, 2,80 (HMK F.16). |
| `2. KONTROLLERBARHETSTAL  k = f/n` | [right-panel.js:444](../../src/ui/right-panel.js#L444) | Sektionsrubrik med formel utskriven. |
| `k = 0.123` | [right-panel.js:447](../../src/ui/right-panel.js#L447) | Globala k-talet. |
| `Överbestämt` / `Starkt` / `Acceptabelt` / `Svagt` / `Otillräckligt` | [constants.js:188-197](../../src/core/constants.js#L188-L197) | k-talets klassetiketter. |
| `≥0.50 Starkt \| 0.30–0.50 Acceptabelt \| 0.10–0.30 Svagt \| <0.10 Otillräckligt` | [right-panel.js:450](../../src/ui/right-panel.js#L450) | Bandförklaring – **saknar den femte klassen "Överbestämt" (≥0,70)**. |
| `Medel r_i` | [right-panel.js:452](../../src/ui/right-panel.js#L452) | Medelredundanstal. |
| `Min r_i (avstånd)` / `Min r_i (vinkel)` | [right-panel.js:453-454](../../src/ui/right-panel.js#L453-L454) | Minsta r_i per observationsslag. |
| `3. PUNKTOSÄKERHETER` | [right-panel.js:458](../../src/ui/right-panel.js#L458) | Sektionsrubrik. |
| `Felellipsskala:` `1σ (Geo)` / `95% (k=2.45)` | [right-panel.js:460-462](../../src/ui/right-panel.js#L460-L462) | Skalfaktorväxlare för ellipser och σ-värden. |
| `σE mm` / `σN mm` / `σpos mm` | [right-panel.js:468-470](../../src/ui/right-panel.js#L468-L470) | Standardosäkerhet i öst, nord och läge. Skrivs **utan understreck** här. |
| `a mm` / `b mm` | [right-panel.js:471-472](../../src/ui/right-panel.js#L471-L472) | Felellipsens halvaxlar. |
| `θ` | [right-panel.js:473](../../src/ui/right-panel.js#L473) | Felellipsens riktningsvinkel; värdet formateras med `fG()`, alltså **gon-hybrid**. |
| `3b. SIMULERADE UPPSTÄLLNINGAR` | [right-panel.js:493](../../src/ui/right-panel.js#L493) | Sektionsrubrik. |
| `Uppst.` | [right-panel.js:500](../../src/ui/right-panel.js#L500) | Kolumnrubrik, förkortning av Uppställning. |
| `Obs mm` | [right-panel.js:504](../../src/ui/right-panel.js#L504) | σ_pos utan felfortplantning – **`Obs` betyder här "observerad/utan fortplantning", i sektion 5 betyder `Obs` "antal observationer"**. |
| `σ_pos inkl. anslutningspunkternas osäkerhet.` | [right-panel.js:495](../../src/ui/right-panel.js#L495) | Förklarande löptext – här **med** understreck. |
| `4. RELIABILITET PER MÄTNING` | [right-panel.js:523](../../src/ui/right-panel.js#L523) | Sektionsrubrik. |
| `r = redundansbidrag` | [right-panel.js:525](../../src/ui/right-panel.js#L525) | Legend – **tredje skrivsättet för samma storhet** (`r_d`, `r_i`, `r`). |
| `MUF = Minsta Urskiljbara Fel (κ=2.80)` | [right-panel.js:525](../../src/ui/right-panel.js#L525) | Legend, förkortning utskriven. |
| `YT = MUF×(1−r) i observationsdomänen` | [right-panel.js:526](../../src/ui/right-panel.js#L526) | Legend; YT = yttre tillförlitlighet. |
| `KP = Koordinatpåverkan (mm)` | [right-panel.js:527](../../src/ui/right-panel.js#L527) | Legend. |
| `Sträcka` / `Typ` / `r` / `MUF` / `YT` / `KP mm` / `Klass` | [right-panel.js:532-538](../../src/ui/right-panel.js#L532-L538) | Kolumnrubriker. Kolumnen heter `r`, sektion 2 kallar samma sak `r_i`. |
| `Minsta Urskiljbara Fel – minsta systematiskt fel som ger statistisk signifikans vid givet κ` | [right-panel.js:535](../../src/ui/right-panel.js#L535) | Tooltip på MUF-kolumnen. |
| `Yttre tillförlitlighet: MUF × (1 − r), påverkan i observationsdomänen` | [right-panel.js:536](../../src/ui/right-panel.js#L536) | Tooltip på YT-kolumnen. `KP` har **ingen** tooltip. |
| `Avst` / `Riktning` | [right-panel.js:552](../../src/ui/right-panel.js#L552) | Observationsslag i typkolumnen. |
| `5. PUNKTKVALITET  σ_pos  +  RELIABILITET` | [right-panel.js:562](../../src/ui/right-panel.js#L562) | Sektionsrubrik – här `σ_pos` med understreck. |
| `Reliabilitet = förmåga att detektera fel.` | [right-panel.js:564](../../src/ui/right-panel.js#L564) | Förklarande löptext. |
| `Krav σ_pos ≤ [ ] mm` | [right-panel.js:567-571](../../src/ui/right-panel.js#L567-L571) | Inmatningsfält för precisionskrav. |
| `σ_pos mm` | [right-panel.js:577](../../src/ui/right-panel.js#L577) | Kolumnrubrik – **med** understreck, till skillnad från sektion 3:s `σpos mm`. |
| `Precision` → `✓ OK` / `✗ Ej krav` | [right-panel.js:578,607](../../src/ui/right-panel.js#L578) | Uppfyller/uppfyller inte kravet. `Ej krav` är språkligt tveksamt (avser "uppfyller ej kravet"). |
| `Obs` | [right-panel.js:579](../../src/ui/right-panel.js#L579) | Antal mätningar som berör punkten (nObs/2). |
| `r̄` | [right-panel.js:580](../../src/ui/right-panel.js#L580) | Medelredundanstal för punktens observationer – **fjärde notationen för r**. |
| `Reliabilitet` → `⛔ Ingen mätning` / `⚠ Ej kontrollerbar` / `△ Svag` / `◇ Acceptabel` / `✓ God` | [right-panel.js:594-598](../../src/ui/right-panel.js#L594-L598) | Fyrgradig skala – **andra ord än k-talets `Starkt/Acceptabelt/Svagt/Otillräckligt`**. |
| `💾 Exportera simuleringsrapport (.txt)` | [right-panel.js:616](../../src/ui/right-panel.js#L616) | Exportknapp. |

### Felmeddelanden i simuleringsfliken

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Minst 2 punkter och 1 mätning krävs.` | [simulation.js:41](../../src/core/simulation.js#L41) | Blockerande fel. |
| `Minst 1 känd punkt (fixpunkt) krävs.` | [simulation.js:44](../../src/core/simulation.js#L44) | Använder **`fixpunkt`** – ordet förekommer inte någon annanstans i UI. |
| `Nätet har dolda datumdefekter (rotation/translation/skala kan inte bestämmas).` | [simulation.js:56](../../src/core/simulation.js#L56) | Datumfel. |
| `ORSAK:` / `ÅTGÄRD:` | [simulation.js:57-58](../../src/core/simulation.js#L57-L58) | Strukturerade felavsnitt (versaler). |
| `Underdeterminerat nät.` | [simulation.js:159](../../src/core/simulation.js#L159) | Med uppdelning `Obekanta: u (k koordinater + m orienteringskonstanter)`. |
| `Normalmatrisen är singulär.` | [simulation.js:174](../../src/core/simulation.js#L174) | Med tre punktsatta orsaker. |

---

## 4. Simuleringsfliken – studioläget

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `K-tal` | [simulation-studio.js:101](../../src/ui/studio-views/simulation-studio.js#L101) | Statistikkort för k = f/n – **`K-tal` här, `k` i högerpanelen, `Kontrollerbarhet k` i optimeringen**. |
| `Max YT mm` | [simulation-studio.js:104](../../src/ui/studio-views/simulation-studio.js#L104) | Största yttre tillförlitlighet i mm (koordinatdomän). |
| `Min r_i` | [simulation-studio.js:108](../../src/ui/studio-views/simulation-studio.js#L108) | Minsta redundanstal. |
| `Max σpos mm` | [simulation-studio.js:112](../../src/ui/studio-views/simulation-studio.js#L112) | Största punktosäkerhet – utan understreck. |
| `Problempunkter (n)` | [simulation-studio.js:117](../../src/ui/studio-views/simulation-studio.js#L117) | Sidopanelslista. |
| `Stor osäkerhet` / `Låg redundans` / `Låg redundans + stor osäkerhet` | [simulation-studio.js:122-125](../../src/ui/studio-views/simulation-studio.js#L122-L125) | Orsaksetiketter per problempunkt. |
| `✓ Alla punkter inom kvalitetskrav` | [simulation-studio.js:119](../../src/ui/studio-views/simulation-studio.js#L119) | Positivt tomtillstånd. |
| `Minikarta` / `Mini-karta (implementeras i fas D)` | [simulation-studio.js:141-143](../../src/ui/studio-views/simulation-studio.js#L141-L143) | **Platshållare synlig för användaren** – två stavningar i samma block. |
| `Punkter (n)` / `Mätningar (n)` | [simulation-studio.js:370](../../src/ui/studio-views/simulation-studio.js#L370) | Sub-flikar. |
| `Känd` / `Station` / `Ny` / `Detalj` / `SimStn` | [simulation-studio.js:9](../../src/ui/studio-views/simulation-studio.js#L9) | Punkttyps-etiketter, kortform. |
| `ID` / `Typ` / `N (m)` / `E (m)` / `r̄` / `a mm` / `b mm` / `σpos mm` / `Status` | [simulation-studio.js:161-171](../../src/ui/studio-views/simulation-studio.js#L161-L171) | Punkttabellens kolumner. |
| `Visa bara problem` | [simulation-studio.js:213](../../src/ui/studio-views/simulation-studio.js#L213) | Filter-checkbox. |
| `Sök punkt-ID…` / `Sök mätning…` | [simulation-studio.js:209,297](../../src/ui/studio-views/simulation-studio.js#L209) | Placeholders. |
| `ID` / `Från` / `Till` / `Typ` / `Avst (m)` / `σ-Hz` / `σ-Dm` / `r_i` / `MUF` / `YT` / `KP mm` | [simulation-studio.js:250-262](../../src/ui/studio-views/simulation-studio.js#L250-L262) | Mätningstabellens kolumner. Här `Avst (m)`, i mätningsstudion `Avst kalk (m)`, σ-kolumnerna **utan enhet** medan mätningsstudion har `(mgon)`/`(mm)`. |
| `Kör simuleringen först – gå till SIMULERING-fliken och tryck ▶` | [simulation-studio.js:351](../../src/ui/studio-views/simulation-studio.js#L351) | Tomtillstånd. |
| `Ingen simulering körts` | [simulation-studio.js:83](../../src/ui/studio-views/simulation-studio.js#L83) | Sidopanelens tomtillstånd – **grammatiskt fel** (saknar "har"). |
| `Visar n av m punkter/mätningar` | [simulation-studio.js:391](../../src/ui/studio-views/simulation-studio.js#L391) | Footer – mätningsstudion säger `n av m mätningar` utan "Visar". |
| `📥 Exportera CSV` | [simulation-studio.js:393](../../src/ui/studio-views/simulation-studio.js#L393) | Exportknapp – 📥 är annars nedladdnings-/import-ikonen i vänsterpanelen. |

---

## 5. Punktlistan och nätfliken

### Vänsterpanelens punktlista

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `PUNKTER (n)` | [left-panel.js:12](../../src/ui/left-panel.js#L12) | Listrubrik. |
| `Känd punkt` / `Uppställning` / `Detaljpunkt` / `Ny punkt` / `Simulerad uppställning` | [constants.js:24-30](../../src/core/constants.js#L24-L30) | Kanoniska punkttypsnamn (`PT[].l`). |
| `FP` / `S` / `D` / `NY` / `SS` | [constants.js:24-30](../../src/core/constants.js#L24-L30) | ID-prefix per punkttyp (`PT[].s`) – **egen förkortningsuppsättning**. |
| `+ uppst.` | [left-panel.js:20](../../src/ui/left-panel.js#L20) | Suffix på känd punkt som också är uppställning. |
| `n×` | [left-panel.js:21](../../src/ui/left-panel.js#L21) | Antal mätningar kopplade till punkten. |

### NÄT-fliken

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `NÄTÖVERSIKT` | [right-panel.js:301](../../src/ui/right-panel.js#L301) | Sektionsrubrik. |
| `Kända` / `Uppst.` / `Detalj` / `Nya` / `Mätningar` / `Inmatade` | [right-panel.js:308-313](../../src/ui/right-panel.js#L308-L313) | Räknekorten – **fjärde varianten av punkttypsnamnen**, alla i kortform/plural. |
| `varav n + uppst.` | [right-panel.js:306](../../src/ui/right-panel.js#L306) | Antal kombipunkter. |
| `MÄTKLASS (SIS-TS)` / `Ingen` / `G1`–`G4` | [right-panel.js:317-320](../../src/ui/right-panel.js#L317-L320) | Klassväljare. |
| `FÖRESLÅ MÄTNINGAR` / `Max avstånd` | [right-panel.js:323-325](../../src/ui/right-panel.js#L323-L325) | Sektionsrubrik + fältetikett. |
| `Obegränsat` / `∞` | [right-panel.js:65,71](../../src/ui/right-panel.js#L65) | Placeholder respektive nollställningsknapp. |
| `Mätförslag längre än detta avstånd genereras inte. Tomt fält = obegränsat.` | [right-panel.js:67](../../src/ui/right-panel.js#L67) | Tooltip. |
| `⚡ Analysera och föreslå mätningar` | [right-panel.js:328](../../src/ui/right-panel.js#L328) | Knapp. |
| `✓ Importera alla n förslag som mätningar` | [right-panel.js:84](../../src/ui/right-panel.js#L84) | Knapp. |
| `⛔ n förslag blockerade av hinder` + `visa`/`dölj` | [right-panel.js:90-93](../../src/ui/right-panel.js#L90-L93) | Statusrad med toggle. |
| `VALIDERING` / `🔍 Validera nät` | [right-panel.js:330-331](../../src/ui/right-panel.js#L330-L331) | Sektionsrubrik + knapp. |
| `Bakåtsikt till känd punkt (n/3 min. rekommenderat)` | [right-panel.js:218](../../src/ui/right-panel.js#L218) | Motivering per mätförslag. |
| `Mätning till obekant punkt` | [right-panel.js:228](../../src/ui/right-panel.js#L228) | Motivering – **`obekant punkt` här, `fri punkt` i simuleringsrapporten**. |
| `Kompletterande dubbelmätning (geodetisk felteori)` | [right-panel.js:251](../../src/ui/right-panel.js#L251) | Motivering. |
| `Korsförbindelse mellan uppställningar (stärker geometrin)` | [right-panel.js:252](../../src/ui/right-panel.js#L252) | Motivering. |

### Mätklassrutan (SIS-TS-info)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `MÄTKRAV (SIS-TS 21143:2016 A.9)` | [sis-ts-info.js:20](../../src/ui/sis-ts-info.js#L20) | Sektionsrubrik. |
| `Totalstation` → `T1`/`T2`/`T3` | [sis-ts-info.js:21](../../src/ui/sis-ts-info.js#L21) | Instrumentklass. |
| `Spridning Hv/Vv` | [sis-ts-info.js:22](../../src/ui/sis-ts-info.js#L22) | Tillåten spridning mellan halvsatser, mgon. **`Hv/Vv` förklaras ingenstans i UI.** |
| `Spridning längd` | [sis-ts-info.js:23](../../src/ui/sis-ts-info.js#L23) | Tillåten spridning mellan dubbelmätta längder, mm. |
| `Antal helsatser` | [sis-ts-info.js:24](../../src/ui/sis-ts-info.js#L24) | Krav ≥ n. |
| `Dubbelmätta läng.` | [sis-ts-info.js:25](../../src/ui/sis-ts-info.js#L25) | **Avhugget ord** ("längder"). |
| `Centrering` | [sis-ts-info.js:26](../../src/ui/sis-ts-info.js#L26) | Centreringsmedelfel i mm. |
| `GENERELLA KRAV (ALLA KLASSER)` | [sis-ts-info.js:29](../../src/ui/sis-ts-info.js#L29) | Sektionsrubrik. |
| `k-tal nätet` / `k-tal enskild` | [sis-ts-info.js:30-31](../../src/ui/sis-ts-info.js#L30-L31) | **`k-tal enskild` avser r_i per observation, men kallas här k-tal.** |
| `MUF ≤ 4 × σ_mät` / `YT ≤ 2 × σ_mät` | [sis-ts-info.js:32-33](../../src/ui/sis-ts-info.js#L32-L33) | Generella krav. `σ_mät` används bara här. |

### NÄT – studioläget

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `ID` / `Typ` / `N (m)` / `E (m)` / `H (m)` / `Mätningar` | [net-studio.js:10-17](../../src/ui/studio-views/net-studio.js#L10-L17) | Kolumnrubriker. |
| `Känd` / `Station` / `Ny` / `Detalj` / `SimStn` | [net-studio.js:8](../../src/ui/studio-views/net-studio.js#L8) | Punkttyper, kortform (**`Station`, inte `Uppst.`**). |
| `Visa typer` / `Sök` / `Filtrera på Punkt-ID…` | [net-studio.js:60,71,73](../../src/ui/studio-views/net-studio.js#L60) | Filterrubriker. |
| `➕ Ny punkt` | [net-studio.js:79](../../src/ui/studio-views/net-studio.js#L79) | Knapp – skapar en **känd punkt** (`setTool('known')`), inte en punkt av typ "Ny". |
| `Visar n av m punkter` | [net-studio.js:196](../../src/ui/studio-views/net-studio.js#L196) | Footer. |
| `Punkt-ID` | [net-studio.js:202](../../src/ui/studio-views/net-studio.js#L202) | CSV-rubrik för samma fält som skärmens `ID`. |

### POLÄR-fliken

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `POLÄR BERÄKNING` / `POLÄR FRÅN: <id>` | [right-panel.js:669,687](../../src/ui/right-panel.js#L669) | Panelrubriker. |
| `Välj en punkt i kartan` | [right-panel.js:670](../../src/ui/right-panel.js#L670) | Tomtillstånd. |
| `Till` / `Dist (m)` / `Riktning` / `M` | [right-panel.js:694-697](../../src/ui/right-panel.js#L694-L697) | Kolumnrubriker. **`Dist` här, `Avst` i alla andra tabeller.** `M` är oförklarad (= mätning finns). |
| `Känd punkt` / `Uppställning` / `Ny punkt` / `Detaljpunkt` | [right-panel.js:690](../../src/ui/right-panel.js#L690) | Lokalt duplicerad typtabell – **saknar `simstation`**, som då faller tillbaka på råvärdet `simstation`. |

### Koordinatlistvyn (egen fullskärmsvy)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `KOORDINATLISTA` | [index.html:207](../../index.html#L207) | Vyrubrik. |
| `#` / `Punkt-ID` / `Typ` / `N (m)` / `E (m)` / `H (m)` / `Mätningar` / `Markering` / `Prisma/Instrument` | [index.html:217-225](../../index.html#L217-L225) | Kolumnrubriker. |
| `Känd punkt` / `Uppställning` / `Ny punkt` / `Detalj` | [index.html:234](../../index.html#L234) | Typväljare i nyradsformuläret – **`Detalj`, medan tabellen renderar `Detaljpunkt`** ([main.js:164](../../src/main.js#L164)). |
| `Befästning/markering` | [index.html:240](../../index.html#L240) | Placeholder; kolumnen heter bara `Markering`. |
| `Totalt: n punkter` / `Kända: n` / `Uppst: n` / `Nya/Detalj: n` | [main.js:192-195](../../src/main.js#L192-L195) | Footer-statistik – **femte varianten av punkttypsnamnen**; `Uppst` utan punkt här, `Uppst.` med punkt i NÄT-fliken. |
| `Dubbelklicka cell för att redigera · Enter = spara · Esc = avbryt` | [index.html:259](../../index.html#L259) | Hjälptext. |
| `Ange ett Punkt-ID.` / `E och N måste vara tal.` / `Punkt X finns redan.` | [main.js:214-218](../../src/main.js#L214-L218) | Valideringstoaster. |

---

## 6. Grafiskt renderingsfönster (canvas)

Kartan ritas på en `<canvas>` ovanpå Leaflet. Ingen SVG används.
Huvudrutinen är [`draw()` i leaflet-setup.js:251-460](../../src/map/leaflet-setup.js#L251-L460).

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| Punkt-ID (t.ex. `S1`) | [leaflet-setup.js:243-245](../../src/map/leaflet-setup.js#L243-L245) | Etikett bredvid varje punktsymbol, med kollisionsundvikande placering i fyra lägen. |
| `123.456m` | [leaflet-setup.js:357-358](../../src/map/leaflet-setup.js#L357-L358) | Avståndsetikett på mätlinjen, roterad längs linjen, **3 decimaler och inget mellanslag före `m`**. |
| `123g45'67.8"` | [leaflet-setup.js:365-366](../../src/map/leaflet-setup.js#L365-L366) via [`fG()`](../../src/core/designmatrix.js#L23-L26) | Bäringsvärde. **Två stycken per mätlinje** – en vid varje ändpunkt, placerade 28 % in längs linjen med 16 px vinkelrät förskjutning. |
| `123°45'67.8"` | [designmatrix.js:27-30](../../src/core/designmatrix.js#L27-L30) | Alternativ formatering när vinkelenheten står på DMS. |
| `[M1]` | [leaflet-setup.js:369-370](../../src/map/leaflet-setup.js#L369-L370) | Mätnings-ID, visas **endast** för den markerade mätningen, under mittpunkten. |
| `σ=1.2mm` | [leaflet-setup.js:391-392](../../src/map/leaflet-setup.js#L391-L392) | Punktosäkerhet vid felellipsen – **`σ` utan index, inget mellanslag före `mm`, 1 decimal** (tabellerna använder `σpos`/`σ_pos` och 2 decimaler). |
| `σ=1.2mm` (rosa, fet) | [leaflet-setup.js:411-412](../../src/map/leaflet-setup.js#L411-L412) | Samma för simulerade uppställningar. |
| `⚡` | [leaflet-setup.js:300-301](../../src/map/leaflet-setup.js#L300-L301) | Symbol i mitten av en föreslagen mätning (gul streckad linje). |
| `✕` | [leaflet-setup.js:319-320](../../src/map/leaflet-setup.js#L319-L320) | Markerar en mätning som optimeringsförslaget tar bort. |
| `N` | [leaflet-setup.js:448](../../src/map/leaflet-setup.js#L448) | Nordpilens etikett, uppe till höger. |
| `250 m` / `1.5 km` | [leaflet-setup.js:453-455](../../src/map/leaflet-setup.js#L453-L455) | Skalstångens etikett – **här med mellanslag före enheten**, till skillnad från avstånds- och σ-etiketterna. |
| `z16` | [leaflet-setup.js:496-497](../../src/map/leaflet-setup.js#L496-L497) | Zoomnivåbadge. Bara `z` + siffra, ingen förklaring. |
| `E: 123.45  N: 678.90` | [leaflet-setup.js:490-491](../../src/map/leaflet-setup.js#L490-L491) | Muspekarens koordinat i vänsterpanelen. |

**Vinkelbeteckningar och pilar – exakt beteende.** Det ritas **inga vinkelbågar** och inga
vinkelmarkörer mellan riktningar. Vad som ritas per mätlinje är:

1. **En riktningspil** – en ifylld triangel i linjens mittpunkt, roterad längs linjen
   ([leaflet-setup.js:345-350](../../src/map/leaflet-setup.js#L345-L350)). **Pilen bär inget värde**;
   den visar bara från→till-riktningen. Färgen kodar tillstånd (vald = vit, tillagd av optimeringen =
   lila, inmatad = orange, annars blå).
2. **Två bäringstexter** – `fmt(brgEN(p1,p2))` och `fmt(brgEN(p2,p1))`, alltså bäringen i vardera
   riktningen, ritade som fristående text nära respektive ändpunkt
   ([leaflet-setup.js:361-367](../../src/map/leaflet-setup.js#L361-L367)). De styrs av kryssrutan
   **Vinklar** ([index.html:58](../../index.html#L58)) trots att det är **bäringar**, inte vinklar.
3. **Linjestilen** kodar observationstyp: heldragen = riktning+längd, `[8,4]` = enbart riktning,
   `[2,4]` = enbart längd ([leaflet-setup.js:338](../../src/map/leaflet-setup.js#L338)).
   **Denna kodning förklaras inte någonstans i UI** – det finns ingen teckenförklaring i kartan.

### Kartkontroller och vänsterpanel

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Vinkel: Gon (grad)` / `Vinkel: DMS` | [index.html:72](../../index.html#L72), [toolbar.js:144](../../src/ui/toolbar.js#L144) | Enhetsväxlare. **Etiketten "Gon (grad)" blandar två enhetsnamn**; internt heter läget `"grad"` men ger gon-formatering ([leaflet-setup.js:289](../../src/map/leaflet-setup.js#L289)). |
| `Rutnät` / `Mätningar` / `Vinklar` / `Avstånd` / `Etiketter` / `Felellipser` / `Föreslagna mätningar` / `Blockerade förslag` / `Visuella objekt` | [index.html:56-64](../../index.html#L56-L64) | Lagertogglar. `Vinklar` styr bäringstexter (se ovan). |
| `Kända punkter` / `Uppställningar` / `Nya punkter` / `Detaljpunkter` / `Sim. uppst.` | [index.html:67-71](../../index.html#L67-L71) | Punkttypsfilter – **sjätte varianten av samma namn**, plural. |
| `SYMBOLSTORLEK` / `Lås storlek (ignorera zoom)` | [index.html:35,40](../../index.html#L35) | Reglage. |
| `FELELLIPSSKALA` / `50×` | [index.html:41,44](../../index.html#L41) | Reglage för ellipsförstoring – **samma ord som simuleringsflikens `Felellipsskala:`, som i stället avser 1σ/95 %**. |
| `KOORDINATSYSTEM` / `Välj CRS i kartkontrollerna ovan.` | [index.html:49-50](../../index.html#L49-L50) | **`CRS` oförklarat** i annars svensk text. |
| `🗺 Bakgrund: PÅ` / `AV` | [leaflet-setup.js:100](../../src/map/leaflet-setup.js#L100) | Kartlagertoggle. |
| `Ortofoto (Lantmäteriet)` / `Topografisk (Lantmäteriet)` / `OpenStreetMap` / `Esri Satellit` | [leaflet-setup.js:26-29](../../src/map/leaflet-setup.js#L26-L29) | Kartlager. |
| `📍 Visa mig` / `⌂ Hem` / `⌖` / `Anpassa vy` / `Återställ vy` | [index.html:116-117,164](../../index.html#L116-L117) | **Tre knappar för i praktiken två funktioner**: `⌂ Hem` och `⌖` anropar båda `resetView()` men har tooltiparna `Återställ vy` respektive `Anpassa vy`. |
| `➕ Klicka: lägg Känd punkt \| Dra: flytta` m.fl. | [toolbar.js:65-72](../../src/ui/toolbar.js#L65-L72) | Kontextuell hjälprad (`#hint`) per aktivt verktyg. |
| `📏 Klicka FRÅN-punkt → klicka TILL-punkt` | [toolbar.js:68](../../src/ui/toolbar.js#L68) | Hjälprad för mätverktyget. |
| `📏 Från: S1 — klicka TILL-punkt` | [toolbar.js:78](../../src/ui/toolbar.js#L78) | Statusruta under pågående mätning. |
| `Visuella objekt ingår inte i simuleringen` | [index.html:30-31](../../index.html#L30-L31) | Tooltip på verktygsknapparna. |

### Kvalitetspanelen (flytande, över kartan)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Nätkvalitet` / `auto` | [index.html:144,146](../../index.html#L144) | Panelrubrik + autosimuleringstoggle. |
| `k` | [index.html:150](../../index.html#L150) | Globala kontrollerbarhetstalet. Tooltip: `K-tal: global redundanskvot. ≥1.14 utmärkt, ≥0.5 bra, ≥0.3 godkänt.` – **tooltipen är föråldrad**: gränsen 1,14 togs bort ur koden ([constants.js:133-139](../../src/core/constants.js#L133-L139)) och etiketterna `utmärkt/bra/godkänt` finns inte i någon annan klassificering. |
| `n/u` | [index.html:151](../../index.html#L151) | Observationer / obekanta. Tooltip: `Antal mätningar (n) / antal okända (u).` – **`n` kallas här "mätningar" men är observationer**, och `u` kallas `okända` i stället för `obekanta`. |
| `f` | [index.html:152](../../index.html#L152) | Frihetsgrader. Tooltip: `Frihetsgrader f = n − u.` |
| `min r_i` | [index.html:153](../../index.html#L153) | Minsta redundanstal. Tooltip: `Minsta enskilda redundanstal r_i. ≥0.5 bra, <0.1 risk.` – **band `bra/risk` stämmer inte med `Starkt/Acceptabelt/Svagt/Otillräckligt`**. |
| `max σ_pos` | [index.html:154](../../index.html#L154) | Största punktosäkerhet bland nya punkter. |
| `Utan sikt` | [index.html:155](../../index.html#L155) | Antal befintliga mätningar utan fri siktlinje. |

---

## 7. Simuleringsrapporten – studioläget och exportformaten

### RAPPORT-studion (skärm)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `1. Nätöversikt` / `2. Kontrollerbarhetstal` / `3. Punktosäkerheter` / `4. Reliabilitet per mätning` / `5. Punktkvalitet` | [report-studio.js:16-22](../../src/ui/studio-views/report-studio.js#L16-L22) | Sektionsnavigering – **gemener**, medan högerpanelen använder VERSALER för samma rubriker. |
| `2. Kontrollerbarhetstal  k = f/n` | [report-studio.js:179](../../src/ui/studio-views/report-studio.js#L179) | Rubriken i innehållet, **längre än samma post i sidonavigeringen**. |
| `5. Punktkvalitet  σ_pos + Reliabilitet` | [report-studio.js:182](../../src/ui/studio-views/report-studio.js#L182) | Dito. |
| `Uppställningar` | [report-studio.js:76](../../src/ui/studio-views/report-studio.js#L76) | Motsvarar högerpanelens `Uppställningar (orienteringar)`. |
| `Observationer (n)` | [report-studio.js:78](../../src/ui/studio-views/report-studio.js#L78) | Motsvarar högerpanelens `Observationer (riktningar+längder)`. |
| `Starkt` / `Acceptabelt` / `Svagt` / `Otillräckligt` | [report-studio.js:9](../../src/ui/studio-views/report-studio.js#L9) | **Lokal kopia av `rLabel`** – duplicerar [redundancy.js:4](../../src/core/redundancy.js#L4). |
| `r_i` (kolumn) | [report-studio.js:121](../../src/ui/studio-views/report-studio.js#L121) | **Här `r_i`, medan högerpanelens motsvarande kolumn heter `r`.** |
| `Felellipsskala: 1σ (Geo Professional)` | [report-studio.js:118](../../src/ui/studio-views/report-studio.js#L118) | **Utskriven produktnamnsvariant** – högerpanelens knapp säger bara `1σ (Geo)`. |
| `📋 Kopiera` | [report-studio.js:48](../../src/ui/studio-views/report-studio.js#L48) | Kopiera sektion till urklipp. |
| `Simuleringsrapport` / `📄 Exportera .txt` / `🖨 Exportera PDF` | [report-studio.js:271-274](../../src/ui/studio-views/report-studio.js#L271-L274) | Footer. |

### Textexport – simuleringsrapport (.txt)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `NÄTSIMULERING` | [sim-report.js:22](../../src/reports/sim-report.js#L22) | Filhuvud. |
| `Metod: Absolut anslutning (MK-utjämning)` | [sim-report.js:22](../../src/reports/sim-report.js#L22) | **`MK-utjämning`** – förkortning som bara finns här; skärmen skriver `minsta kvadratutjämning`. |
| `Obekanta (u):` | [sim-report.js:29](../../src/reports/sim-report.js#L29) | Motsvarar skärmens `Totalt obekanta`. |
| `3. PUNKTOSÄKERHETER – standardosäkerhet 1σ (k=1)` | [sim-report.js:45](../../src/reports/sim-report.js#L45) | **Enda stället där skalfaktorn står i rubriken.** |
| `Min r_i (avst):` / `Min r_i (vink):` | [sim-report.js:36-37](../../src/reports/sim-report.js#L36-L37) | **Avhuggna former** av skärmens `Min r_i (avstånd)` / `Min r_i (vinkel)`. |
| `MUF = κ×σ/√r,  YT = MUF×(1-r) i observationsdomänen` | [sim-report.js:54](../../src/reports/sim-report.js#L54) | Formellegend – **formeln för MUF visas bara här**, skärmen ger bara namnet. |
| `Enheter: mm för längder, mgon för riktningar (HMK F.4.1)` | [sim-report.js:54](../../src/reports/sim-report.js#L54) | Enhetsnot – **saknas på skärmen**. |
| `Prec` → `OK` / `Ej krav` | [sim-report.js:70,73](../../src/reports/sim-report.js#L70) | **Förkortat** där skärmen skriver `Precision`. |
| `⚠ Ej kontrollerbar – okänt fel möjligt` | [sim-report.js:80](../../src/reports/sim-report.js#L80) | **Längre formulering** än skärmens `Ej kontrollerbar`. |
| `nätsim_ÅÅÅÅ-MM-DD.txt` | [sim-report.js:90](../../src/reports/sim-report.js#L90) | Filnamn. |

### Textexport – beräkningsrapport (.txt)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `DETALJERED BERÄKNINGSRAPPORT – NÄTSIMULERING` | [sim-report.js:108](../../src/reports/sim-report.js#L108) | **Stavfel i rubriken** – ska vara `DETALJERAD`. |
| `κ (MUF-faktor): 2.8 (α=0.05, β=0.80, Baarda)` | [sim-report.js:112](../../src/reports/sim-report.js#L112) | Statistiska parametrar – enda stället de visas. |
| `e_c (mm)` | [sim-report.js:115](../../src/reports/sim-report.js#L115) | Centreringsfel per punkt. **`e_c` används bara här och i PM-steget**; UI säger annars `Centreringsfel`. |
| `2. OBEKANTA (totalt n st)` / `E_<id>` / `N_<id>` / `z_<id> (orienteringskonstant)` | [sim-report.js:127-137](../../src/reports/sim-report.js#L127-L137) | Obekantförteckning med indexering. |
| `σ_D` / `σ_H` / `σ_arc` / `P` / `a[]` | [sim-report.js:141](../../src/reports/sim-report.js#L141) | Symbolförklaring för designmatrisavsnittet. `σ_H` här, `σ_Hz` på rad 184 – **två skrivsätt i samma fil**. |
| `4. NORMALMATRIS N och QXX` | [sim-report.js:197](../../src/reports/sim-report.js#L197) | Sektionsrubrik – **`QXX` i versaler i rubriken, `Qxx` i brödtexten** ([sim-report.js:201](../../src/reports/sim-report.js#L201)) och `Qee/Qnn/Qen` i kovariansblocket ([sim-report.js:213](../../src/reports/sim-report.js#L213)). Storheten visas aldrig i skärm-UI. |
| `5. REDUNDANSBIDRAG  r_i = 1 − H_ii` | [sim-report.js:219](../../src/reports/sim-report.js#L219) | **Enda stället där r_i:s definition skrivs ut.** |
| `Kontrollsumma: Σr_i = … (ska = f)` | [sim-report.js:220](../../src/reports/sim-report.js#L220) | Kontrollrad. |
| `θ=12.3456°` | [sim-report.js:215](../../src/reports/sim-report.js#L215) | Felellipsens riktning **i decimalgrader med `°`** – på skärmen visas samma storhet i gon-hybrid. |
| `α=123.456789°` | [sim-report.js:171](../../src/reports/sim-report.js#L171) | Bäring i decimalgrader – **tredje formatet för en riktning**. |
| `FORMELFÖRTECKNING` / `REFERENSER` | [sim-report.js:229,233](../../src/reports/sim-report.js#L229) | Avslutande sektioner. |

### PDF-export – simuleringsrapport (utskriftsfönster)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `NÄTSIMULERING – Simuleringsrapport` | [export-pdf.js:68](../../src/io/export-pdf.js#L68) | Sidrubrik. |
| `Genererar simuleringsrapport...` | [export-pdf.js:15](../../src/io/export-pdf.js#L15) | Laddningstext – **tre punkter, inte `…`**, till skillnad från övriga laddningstexter. |
| `k-tal:` | [export-pdf.js:77](../../src/io/export-pdf.js#L77) | Metadatarad – **`k-tal` med bindestreck**, skärmen skriver `k` och studion `K-tal`. |
| `Frihetsgrader f:` / `Observationer n:` / `Obekanta u:` | [export-pdf.js:78-80](../../src/io/export-pdf.js#L78-L80) | Metadatarader. |
| `PUNKTOSÄKERHETER` | [export-pdf.js:83](../../src/io/export-pdf.js#L83) | Sektionsrubrik. |
| `Punkt` / `σN mm` / `σE mm` / `σpos mm` / `a mm` / `b mm` | [export-pdf.js:85](../../src/io/export-pdf.js#L85) | Kolumnrubriker – **N före E**, motsatt ordning mot skärmens `σE, σN`. |
| `RELIABILITET` | [export-pdf.js:88](../../src/io/export-pdf.js#L88) | Sektionsrubrik – **kortare** än skärmens `RELIABILITET PER MÄTNING`. |
| `Sträcka` / `Typ` / `r_i` / `MUF` | [export-pdf.js:90](../../src/io/export-pdf.js#L90) | Kolumnrubriker – **`r_i` här, `r` på skärmen**; ingen YT- eller KP-kolumn i PDF:en. |
| `🖨 Skriv ut / Spara PDF` / `✕ Stäng` | [export-pdf.js:65-66](../../src/io/export-pdf.js#L65-L66) | Knappar i utskriftsfönstret. |
| `Popup blockerades – tillåt popups.` | [export-pdf.js:13](../../src/io/export-pdf.js#L13) | Felmeddelande – **kortare variant** än [main.js:257](../../src/main.js#L257) och [meas-book.js:199](../../src/reports/meas-book.js#L199). |

---

## 8. Mätboken och mätschemat (fältdokumentation)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `MÄTBOK` / `Stomnätsmätning` | [meas-book.js:121-122](../../src/reports/meas-book.js#L121-L122) | Omslagsrubriker. |
| `STOMNÄTSMÄTNING – MÄTBOK` | [meas-book.js:81](../../src/reports/meas-book.js#L81) | Sidhuvud på stationssidorna – **omvänd ordning mot omslaget**. |
| `Nr` / `Målpunkt` / `Kalk. dist (m)` / `Kalk. riktning` / `Sat.` | [meas-book.js:102-104](../../src/reports/meas-book.js#L102-L104) | Kolumnrubriker. **`Målpunkt` finns bara här** (annars `Till`); **`dist`** finns annars bara i POLÄR. |
| `Hz 1 (sats 1)` / `Hz 2 (sats 2)` / `Dist. (m)` / `Anmärkning` | [meas-book.js:105-106](../../src/reports/meas-book.js#L105-L106) | Ifyllnadskolumner. **`Dist.` med punkt**, tredje skrivsättet i samma tabellrad. |
| `KP` / `UPS` / `DET` / `NY` | [meas-book.js:61](../../src/reports/meas-book.js#L61) | Punkttypsbadges – **helt egen förkortningsuppsättning**, skiljer sig från `PT[].s` (`FP/S/D/NY/SS`). |
| `UPPSTÄLLNING <id>` | [meas-book.js:91-92](../../src/reports/meas-book.js#L91-L92) | Stationsrubrik. |
| `Lufttryck (hPa)` / `Temperatur (°C)` / `Instrumenthöjd (m)` | [meas-book.js:97-99](../../src/reports/meas-book.js#L97-L99) | Fältdatarutor. |
| `Orienteringsriktning (bakåtsikt)` | [meas-book.js:109](../../src/reports/meas-book.js#L109) | Ifyllnadsrad. |
| `Antal kända punkter mätta: n` | [meas-book.js:110](../../src/reports/meas-book.js#L110) | Räknare. |
| `Kontroll – signatur` / `Anteckningar / Avvikelser` | [meas-book.js:111,114](../../src/reports/meas-book.js#L111) | Ifyllnadsrutor. |
| `Mätare:` | [meas-book.js:86,131](../../src/reports/meas-book.js#L86) | Ifyllnadsfält – **PM-modulen kallar samma roll `Fältpersonal`**. |
| `n. Uppst. <id> (<typ>)` | [meas-book.js:138](../../src/reports/meas-book.js#L138) | Innehållsförteckning. |
| `MÄTSCHEMA` | [meas-book.js:13](../../src/reports/meas-book.js#L13) | Textexportens rubrik. |
| `Nr` / `Till` / `Dist(m)` / `Riktning` / `Satser` | [meas-book.js:20](../../src/reports/meas-book.js#L20) | Mätschemats kolumner – **`Till` här men `Målpunkt` i mätboken; `Dist(m)` utan mellanslag; `Satser` i stället för `Sat.`** – samma data, tre olika rubriksättningar. |
| `n sat` | [meas-book.js:24](../../src/reports/meas-book.js#L24) | Värdesuffix. |
| `Totalt: n mätning(ar)` | [meas-book.js:26](../../src/reports/meas-book.js#L26) | Summering – **parentesplural**. |
| `Inga mätningar definierade.` | [meas-book.js:10,43](../../src/reports/meas-book.js#L10) | Tomtillstånd/alert. |

---

## 9. Optimeringens dialog och beslutsspårningslogg

### Dialogen

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `🧮 Optimera nät` | [optimizer-modal.js:185](../../src/ui/optimizer-modal.js#L185) | Dialogrubrik. |
| `Second-order design: mätningskonfigurationen optimeras mot projektets acceptanskriterier med girig iterativ sökning (Cross 1994, Kuang 1996).` | [optimizer-modal.js:187-188](../../src/ui/optimizer-modal.js#L187-L188) | Metodbeskrivning – **`Second-order design` och `girig` är oöversatta/oförklarade facktermer**. |
| `1. KONFIGURATION` / `2. KÖRNING` / `3. RESULTAT` | [optimizer-modal.js:32,95,138](../../src/ui/optimizer-modal.js#L32) | Sektionsrubriker. |
| `Mätklass (styr kraven)` | [optimizer-modal.js:35](../../src/ui/optimizer-modal.js#L35) | Fältetikett. |
| `Ingen mätklass vald i projektet – G2:s krav används som utgångspunkt.` | [optimizer-modal.js:40](../../src/ui/optimizer-modal.js#L40) | Varning vid antagen klass. |
| `Acceptanskriterier` | [optimizer-modal.js:43](../../src/ui/optimizer-modal.js#L43) | Listrubrik. |
| `Minsta r-tal per observation: r ≥ 0.35 (hårt krav, SIS-TS §6.2.2)` | [optimizer-criteria.js:169](../../src/core/optimizer-criteria.js#L169) | Kriterietext – **`r-tal` i löptext, `r` i formeln, `r_i` i tabellerna**. |
| `Observationer med r < 0.50 rapporteras men blockerar inte (HMK Bilaga F.6)` | [optimizer-criteria.js:170-171](../../src/core/optimizer-criteria.js#L170-L171) | Mjukt krav. |
| `Största punktosäkerhet: σ_pos ≤ 3.0 mm (1σ efter utjämning, produktval)` | [optimizer-criteria.js:172-173](../../src/core/optimizer-criteria.js#L172-L173) | Produktvalsmarkering. |
| `Kontrollerbarhet: k ≥ 0.50` | [optimizer-criteria.js:174](../../src/core/optimizer-criteria.js#L174) | Normkrav. |
| `MUF ≤ 4 × σ, YT ≤ 2 × σ (redovisas, spärrar ej)` | [optimizer-criteria.js:175-176](../../src/core/optimizer-criteria.js#L175-L176) | Informativa kriterier. |
| `Största σ_pos` (fält) | [optimizer-modal.js:48](../../src/ui/optimizer-modal.js#L48) | Inmatning av σ_max. |
| `Punktstandardosäkerhet σ_pos (1σ) efter utjämning. Tomt fält = klassens default.` | [optimizer-modal.js:52](../../src/ui/optimizer-modal.js#L52) | Tooltip – **`Punktstandardosäkerhet` används bara här**; `default` är oöversatt. |
| `3 (klassens default)` | [optimizer-modal.js:51](../../src/ui/optimizer-modal.js#L51) | Placeholder. |
| `Produktval, inte normcitat: σ_pos efter utjämning är en annan storhet än Tabell A.9:s spridning mellan dubbelmätta längder.` | [optimizer-modal.js:57-58](../../src/ui/optimizer-modal.js#L57-L58) | Förklaringstext. |
| `Maxavstånd för nya mätningar` | [optimizer-modal.js:64](../../src/ui/optimizer-modal.js#L64) | Fältetikett – **`Maxavstånd` sammanskrivet här, `Max avstånd` isär i NÄT-fliken**. |
| `Obegränsat – alla siktlinjer får föreslås.` | [optimizer-modal.js:66](../../src/ui/optimizer-modal.js#L66) | Tillståndstext. |
| `Viktning` → `σ_pos 50 / r-tal 50` | [optimizer-modal.js:78-80](../../src/ui/optimizer-modal.js#L78-L80) | Reglage. **Talen saknar enhet/procenttecken** trots att de är procent. |
| `Styr vad optimeringen premierar: sänkt punktosäkerhet eller höjda redundanstal.` | [optimizer-modal.js:86](../../src/ui/optimizer-modal.js#L86) | Hjälptext – **`punktosäkerhet`/`redundanstal` utskrivet, medan reglaget bredvid säger `σ_pos`/`r-tal`**. |
| `▶ Kör optimering` / `⏳ Optimerar…` | [optimizer-modal.js:100](../../src/ui/optimizer-modal.js#L100) | Körknapp. |
| `Nätet har n mätningar – körs i bakgrundstråd.` | [optimizer-modal.js:104](../../src/ui/optimizer-modal.js#L104) | Statusrad. |
| `Iteration n: <text>` / `Iteration n – <meddelande>` / `Iteration n – kandidat i/m` | [optimizer-modal.js:247-249](../../src/ui/optimizer-modal.js#L247-L249) | Progresstexter – **kolon i den ena, tankstreck i de andra**. |
| `Fas 1: +n mätningar` / `Fas 2: −n mätningar` / `n iterationer` | [optimizer-modal.js:162-164](../../src/ui/optimizer-modal.js#L162-L164) | Resultatsammanfattning. `Fas 1`/`Fas 2` **förklaras inte i dialogen** (additiv respektive subtraktiv fas). |
| `Storhet` / `Original` / `Optimerat` / `Krav` | [optimizer-modal.js:122-125](../../src/ui/optimizer-modal.js#L122-L125) | Jämförelsetabellens kolumner. |
| `Beslutsspårning` | [optimizer-modal.js:167](../../src/ui/optimizer-modal.js#L167) | Loggrubrik. |
| `Inga operationer.` | [optimizer-modal.js:108](../../src/ui/optimizer-modal.js#L108) | Tom logg. |
| `Nätet är redan optimalt för kravnivån – ingen mätning behövde läggas till eller tas bort.` | [optimizer-modal.js:170](../../src/ui/optimizer-modal.js#L170) | Utfallstext. |
| `✓ Tillämpa` / `👁 Behåll som förslag` / `✕ Avbryt` | [optimizer-modal.js:172-176](../../src/ui/optimizer-modal.js#L172-L176) | De tre utgångarna – **högerpanelens motsvarigheter heter `✓ Tillämpa förslag` och `✕ Förkasta`**. |
| `Kriterier som inte kunde uppfyllas:` / `Föreslagna åtgärder:` | [optimizer-modal.js:148,150](../../src/ui/optimizer-modal.js#L148) | Rubriker i felutfallet. |
| `Nätet är oförändrat.` | [optimizer-modal.js:153](../../src/ui/optimizer-modal.js#L153) | Bekräftelse vid avbrott. |
| `👁 Sparat som förslag – växla vy i fliken MÄTNINGAR` | [optimizer-modal.js:286](../../src/ui/optimizer-modal.js#L286) | Toast. |

### Beslutsspårningsloggens radtexter

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Iteration n (Fas p): ` | [optimizer.js:186](../../src/core/optimizer.js#L186) | Radprefix. |
| `Lade till mätning A→B.` | [optimizer.js:195,199](../../src/core/optimizer.js#L195) | Additiv operation. |
| `Lade till dubbelmätning A→B (motriktad ommätning av sträckan A–B).` | [optimizer.js:192](../../src/core/optimizer.js#L192) | Motriktad dubbelmätning. |
| `Lade till dubbelmätning A→B (ytterligare mätning av sträckan A–B).` | [optimizer.js:194](../../src/core/optimizer.js#L194) | Upprepad riktning. |
| `Störst förbättring av nätet: σ_pos-effekt +0.12 mm, r-tal-effekt +0.034.` | [optimizer.js:188,199](../../src/core/optimizer.js#L188) | Effektredovisning. **`σ_pos-effekt` och `r-tal-effekt` blandar symbol och utskriven term i samma mening.** |
| `Höjer r-tal för sträckan A–B från 0.22 till 0.56.` | [optimizer.js:197](../../src/core/optimizer.js#L197) | Sträckans kontrollerbarhet. |
| `Alla acceptanskriterier hålls nu.` / `Kvarstår: …` | [optimizer.js:200-201](../../src/core/optimizer.js#L200-L201) | Statusklausul. |
| `Inga observationer under r 0.50.` / `n observation(er) under r 0.50 (rapporteras).` | [optimizer.js:175-177](../../src/core/optimizer.js#L175-L177) | Mjuka kravets redovisning. **`observation`/`observationer` böjs korrekt här** till skillnad från `mätning(ar)` på andra ställen. |
| `Inget värde under det hårda kravet r 0.35.` / `⚠ n observationer UNDER det hårda kravet r 0.35.` | [optimizer.js:178-180](../../src/core/optimizer.js#L178-L180) | Hårda kravets redovisning – **`värde` i den ena grenen, `observationer` i den andra**; VERSALER för betoning. |
| `Tog bort mätning A→B. Bidrog minst till nätet: …` | [optimizer.js:206](../../src/core/optimizer.js#L206) | Subtraktiv operation. |
| `Alla acceptanskriterier hålls redan – ingen mätning behövde läggas till.` | [optimizer.js:357](../../src/core/optimizer.js#L357) | Fas 1 hoppades över. |
| `Ingen ytterligare mätning kan tas bort utan att bryta acceptanskriterierna – det optimerade nätet är hittat.` | [optimizer.js:479-480](../../src/core/optimizer.js#L479-L480) | Fas 2 avslutad. |
| `Iterationsgränsen n nåddes – bantningen avbröts här.` | [optimizer.js:443](../../src/core/optimizer.js#L443) | Avbrott – **`bantningen` är vardagligt** och används bara här. |
| `Minsta r-tal 0.123 < hårt krav 0.350` | [optimizer-criteria.js:152](../../src/core/optimizer-criteria.js#L152) | Kriterieöverträdelse. |
| `Största σ_pos 4.20 mm > krav 3.00 mm` | [optimizer-criteria.js:154](../../src/core/optimizer-criteria.js#L154) | Kriterieöverträdelse. |
| `Kontrollerbarhet k 0.412 < krav 0.500` | [optimizer-criteria.js:156](../../src/core/optimizer-criteria.js#L156) | Kriterieöverträdelse. |
| `Nätet kan inte beräknas: <orsak>` | [optimizer-criteria.js:146](../../src/core/optimizer-criteria.js#L146) | Beräkningsfel. |
| `Öka maxavståndet från X m till Y m – n möjliga mätningar filtrerades bort av avståndsgränsen.` | [optimizer.js:277-278](../../src/core/optimizer.js#L277-L278) | Åtgärdsförslag. |
| `n möjliga mätningar blockeras av hinder – flytta uppställningar eller kontrollera att hindren är rätt inritade.` | [optimizer.js:281-282](../../src/core/optimizer.js#L281-L282) | Åtgärdsförslag. |
| `Sänk kraven på σ_max (3 mm gäller för mätklass G2) eller använd ett instrument med lägre a priori-osäkerhet.` | [optimizer.js:292-293](../../src/core/optimizer.js#L292-L293) | Åtgärdsförslag – **`σ_max` här, medan fältet i dialogen heter `Största σ_pos`**. |
| `Fler uppställningar ger fler oberoende kontroller – nätet saknar överbestämning, inte precision.` | [optimizer.js:296-297](../../src/core/optimizer.js#L296-L297) | Åtgärdsförslag. |
| `Optimeringen avbröts: säkerhetsgränsen n tillagda mätningar nåddes… Nätet är fundamentalt otillräckligt för kravnivån.` | [optimizer.js:362-363](../../src/core/optimizer.js#L362-L363) | Avbrottsmeddelande. |

---

## 10. Mätningstekniskt PM (egen popup, exporteras till PDF)

### Guidens steg

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `📐 Mätningstekniskt PM` | [pm.html:12](../../src/pm/pm.html#L12) | Fönsterrubrik. |
| `SIS-TS 21143:2016 · HMK Stommätning 2024 · TDOK 2014:0571` | [pm.html:13](../../src/pm/pm.html#L13) | Normrad. |
| `Projekt & Personal` / `Referenssystem` / `Instrument & Metod` / `Bilder` / `Rapport (PDF)` | [pm.js:23-29](../../src/pm/pm.js#L23-L29) | Stegnavigering. |
| `💾 Spara utkast` → `✓ Sparat` | [pm.html:16](../../src/pm/pm.html#L16), [pm.js:118](../../src/pm/pm.js#L118) | Utkastknapp. |
| `Väntar på data från NätSim…` | [pm.html:24](../../src/pm/pm.html#L24) | Tomtillstånd. |
| `Hämtat från NätSim: KRS: <crs> \| k=… \| Mätklass: … \| Punkter: …` | [step1-project.js:41](../../src/pm/steps/step1-project.js#L41) | Sammanfattningsrad. **`KRS` är ett stavfel för `CRS`** – och `CRS` är i sin tur oförklarat i övriga UI. |
| `Uppdragstyp` → `Bruksnät i plan (§6.4)` m.fl. | [step1-project.js:15-22](../../src/pm/steps/step1-project.js#L15-L22) | Nätkategori med paragrafhänvisning. |
| `R2 – Personal` | [step1-project.js:31](../../src/pm/steps/step1-project.js#L31) | Sektionsrubrik – **`R`-koderna används genomgående utan förklaring**. |
| `Fältpersonal (en per rad)` / `Beräkning / rapportering` / `Kompetenskrav` | [step1-project.js:33-36](../../src/pm/steps/step1-project.js#L33-L36) | Fältetiketter. |
| `Koordinatsystem (R1.3)` / `Konfigurerat i NätSim: <crs>` | [step2-reference.js:27,31](../../src/pm/steps/step2-reference.js#L27) | Fältetikett + härledd information. |
| `Höjdsystem` / `Geoidmodell` | [step2-reference.js:33,36](../../src/pm/steps/step2-reference.js#L33) | Fältetiketter. |
| `Kända anslutningspunkter` | [step2-reference.js:40](../../src/pm/steps/step2-reference.js#L40) | Tabellrubrik. |
| `Punkt` / `N` / `E` / `H` / `Mark.` | [step2-reference.js:44-48](../../src/pm/steps/step2-reference.js#L44-L48) | Kolumnrubriker – **enhet `(m)` saknas här** till skillnad från alla andra koordinattabeller; `Mark.` är avhugget. |
| `Koordinatkälla (R3.4)` / `Bedömning koordinatkvalitet` | [step2-reference.js:53-54](../../src/pm/steps/step2-reference.js#L53-L54) | Fältetiketter. |
| `Hämtat från NätSim: <instr> \| σ_Hz=… mgon \| σ_D=… mm+… ppm \| n satser \| e_c=… mm` | [step3-instruments.js:8-10](../../src/pm/steps/step3-instruments.js#L8-L10) | Sammanfattningsrad – **`σ_Hz`/`σ_D`/`e_c` utan förklaring**; `σ_D` motsvarar UI:ns `σ-Dm`. |
| `Totalstation` / `Serienummer` / `Kalibrering / verifikat` / `Tvångscentriering` / `Fältprogramvara` / `Beräkningsprogramvara` | [step3-instruments.js:13-18](../../src/pm/steps/step3-instruments.js#L13-L18) | Fältetiketter. |
| `Toleranskrav (R3.9)` / `Krav σ_pos (mm)` | [step3-instruments.js:22-24](../../src/pm/steps/step3-instruments.js#L22-L24) | Kravsektion – **samma storhet som huvudfönstrets `Krav σ_pos ≤`, men utan `≤`**. |
| `Omdöme / noteringar` | [step3-instruments.js:27](../../src/pm/steps/step3-instruments.js#L27) | Fritextfält. |
| `Bakgrund:` → `Satellit/karta` / `Vit (utskriftsvänlig)` / `Koordinatrutnät` | [step4-images.js:24-29](../../src/pm/steps/step4-images.js#L24-L29) | Bakgrundsval för autogenererade bilder. |
| `R3.2 Översiktskarta` / `R3.3 Nätkarta` / `R3.4 Anslutningspunkter` / `R3.12 Punktbeskrivningar` | [step4-images.js:60-65](../../src/pm/steps/step4-images.js#L60-L65) | Bildslot-etiketter. **Tre av fyra stämmer inte med vad sloten faktiskt innehåller** – se presetnamnen nedan. |
| `Översikt` / `Kända punkter` / `Mätgeometri` / `Felellipser` | [image-presets.js:6,16,26,36](../../src/pm/image-presets.js#L6) | Presetnamn för samma fyra slots. |
| `Översikt av nätet` / `Kända anslutningspunkter` / `Mätgeometri` / `Lägesosäkerheter (1σ felellipser)` | [image-presets.js:12,22,32,42](../../src/pm/image-presets.js#L12) | Bildtitlar som ritas in i bilden. |
| `📁 Välj bild` / `🎨 Auto-generera` / `🎨 Auto-genererad` / `⟲ Återskapa` / `🗑 Rensa` / `× Ta bort` / `Ej vald` / `✓ Uppladdad` | [step4-images.js:163-232](../../src/pm/steps/step4-images.js#L163-L232), [step1-project.js:78-101](../../src/pm/steps/step1-project.js#L78-L101) | Bildhanteringsknappar – **`🗑 Rensa` och `× Ta bort` gör samma sak i två olika slots**. |
| `⏳ Genererar med satellit...` | [step4-images.js:116](../../src/pm/steps/step4-images.js#L116) | Statustext. |
| `← Tillbaka` / `Nästa: … →` / `Generera rapport →` / `← Ändra` | [step2-reference.js:56-57](../../src/pm/steps/step2-reference.js#L56), [step5-report.js:7](../../src/pm/steps/step5-report.js#L7) | Navigeringsknappar – **steg 5 säger `← Ändra` där övriga säger `← Tillbaka`**. |
| `🖨️ Skriv ut / Spara PDF` | [step5-report.js:8](../../src/pm/steps/step5-report.js#L8) | Utskriftsknapp. |
| `PM-modulen kräver tablet eller dator.` | [main.js:244](../../src/main.js#L244) | Blockerande toast på telefon. |

### Den genererade PM-rapporten

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Mätningsteknisk redovisning – Planering` | [report-generator.js:123](../../src/pm/report-generator.js#L123) | Försättsbladets bandrubrik. |
| `Stomnät i plan – Mätningstekniskt PM` | [report-generator.js:125](../../src/pm/report-generator.js#L125) | Underrubrik. |
| `Nätbedömning:` → `✓ STABILT OCH KONTROLLERBART` / `⚠ ACCEPTABELT` / `✗ EJ GODKÄNT` | [report-generator.js:134](../../src/pm/report-generator.js#L134) | Sammanfattande omdöme – **tregradig skala i VERSALER, ytterligare en skala vid sidan av k-talets fem klasser**. |
| `1. Uppdragsbeskrivning` … `10. Leverans (R4)` | [report-generator.js:141-308](../../src/pm/report-generator.js#L141-L308) | Tio numrerade sektioner. |
| `Min k_i (avst.)` / `Min k_i (riktning)` | [report-generator.js:264-265](../../src/pm/report-generator.js#L264-L265) | **Redundanstalet r_i kallas här `k_i`.** Samma tal som `Min r_i (avstånd)` i simuleringsfliken. |
| `7.2 Mätningars k_i, MUF och YT` | [report-generator.js:267](../../src/pm/report-generator.js#L267) | Sektionsrubrik med samma omdöpning. |
| `k_i = individuellt k-tal (HMK F.2). MUF = Minsta Urskiljbara Fel (HMK F.13). YT = Yttre Tillförlitlighet.` | [report-generator.js:268](../../src/pm/report-generator.js#L268) | Legend. **`HMK F.13` här, `HMK F.16` i beräkningsrapporten och simuleringsfliken för κ.** |
| `Grön = k_i ≥ 0,50 (SIS-TS), röd = under gräns.` | [report-generator.js:273](../../src/pm/report-generator.js#L273) | Färglegend – **decimalkomma här, decimalpunkt i alla beräknade värden**. |
| `Från → Till` / `Typ` / `k_i` / `MUF` / `YT` | [report-generator.js:270](../../src/pm/report-generator.js#L270) | Kolumnrubriker. |
| `Längd` / `Riktning` | [report-generator.js:103](../../src/pm/report-generator.js#L103) | Observationsslag – **`Längd` här, `Avst` i allt annat UI**. |
| `Starkt kontrollerbart` / `Acceptabelt kontrollerbart` / `Otillräcklig kontrollerbarhet` | [report-generator.js:56-57](../../src/pm/report-generator.js#L56-L57) | k-talsomdöme – **fjärde skalan för k-talet**, adjektivböjd. |
| `Homogent` / `Acceptabelt homogent` / `Inhomogent` | [report-generator.js:58](../../src/pm/report-generator.js#L58) | Homogenitetsomdöme baserat på σ(k_i). |
| `Stabilitetsbedömning:` | [report-generator.js:275](../../src/pm/report-generator.js#L275) | Rubrik i bedömningsrutan. |
| `Inre tillförlitlighet (MUF):` | [report-generator.js:276](../../src/pm/report-generator.js#L276) | **Enda stället i UI där MUF kopplas till "inre tillförlitlighet"** – motparten YT förklaras som "yttre" bara här och i högerpanelens tooltip. |
| `Homogenitet: … (σ(k_i)=0.031)` | [report-generator.js:278](../../src/pm/report-generator.js#L278) | Spridningsmått. |
| `7.4 Förväntade punktmedelfel` | [report-generator.js:280](../../src/pm/report-generator.js#L280) | Sektionsrubrik – **`punktmedelfel` är förlegad terminologi**; resten av UI säger `punktosäkerhet`/`standardosäkerhet`. |
| `σ_N mm` / `σ_E mm` / `σ_pos mm` / `σ_a mm` / `σ_b mm` | [report-generator.js:283](../../src/pm/report-generator.js#L283) | Kolumnrubriker. **N före E** (som PDF-exporten, motsatt skärmen), och **halvaxlarna heter här `σ_a`/`σ_b`** där allt annat UI skriver `a mm`/`b mm`. |
| `Medel σ_pos` / `Max σ_pos` | [report-generator.js:287-288](../../src/pm/report-generator.js#L287-L288) | Summeringsrader. |
| `✓ Alla nypunkter uppfyller kravet` / `✗ En eller flera uppfyller ej kravet` | [report-generator.js:281](../../src/pm/report-generator.js#L281) | Kravutfall. **`nypunkter` sammanskrivet – förekommer bara här.** |
| `Känd punkt` / `Uppställning` / `Ny punkt` / `Detaljpunkt` / `Sim. uppst.` | [report-generator.js:73](../../src/pm/report-generator.js#L73) | Punkttyper – **lokal kopia av tabellen i [main.js:164](../../src/main.js#L164)**. |
| `Figur. Nätets utbredning.` / `Figur. Kända anslutningspunkter.` / `Figur. Planerad mätgeometri och observationer.` / `Figur. Lägesosäkerheter (1σ felellipser).` | [report-generator.js:210-224](../../src/pm/report-generator.js#L210-L224) | Bildtexter – **onumrerade, "Figur." med punkt i stället för nummer**. |
| `σ riktning` / `σ avstånd` | [report-generator.js:188-189](../../src/pm/report-generator.js#L188-L189) | Mätklasstabellens rader – **utskrivet här, `σ_Hz`/`σ_D` i steg 3, `σ-Hz`/`σ-Dm` i studion**. |
| `A priori standardavvikelse` | [report-generator.js:242](../../src/pm/report-generator.js#L242) | Sektionsrubrik – **`standardavvikelse` medan panelen säger `A PRIORI OSÄKERHET`**. |
| `Specificeras vid leverans.` | [report-generator.js:311](../../src/pm/report-generator.js#L311) | Platshållartext i sektion 10. |

---

## 11. Övriga dialoger och modaler

### Mätningsmodalen

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `📏 Mätning [M1]` / `A → B` | [modals.js:22-23](../../src/ui/modals.js#L22-L23) | Dialogrubrik. |
| `Observationstyp` → `📐 Vinkel + Avstånd` / `📐 Endast vinkel` / `📏 Endast avstånd` | [modals.js:25-29](../../src/ui/modals.js#L25-L29) | Val av `obsType`. **`Vinkel`/`Avstånd` här, `Hz+Dm`/`Hz`/`Dm` i studion, `Riktning`/`Avst` i simuleringstabellerna – tre uppsättningar för tre värden.** |
| `Instrument / Osäkerhet` | [modals.js:33](../../src/ui/modals.js#L33) | Sektionsrubrik. |
| `σ vinkel (mgon)` | [modals.js:38](../../src/ui/modals.js#L38) | A priori riktningsosäkerhet – **`σ vinkel` här, `σ-Hz` i studion, `σ_Hz` i PM, `σ riktning` i PM-rapporten**. |
| `σ avst mm` / `σ avst ppm` | [modals.js:39-40](../../src/ui/modals.js#L39-L40) | A priori längdosäkerhet, konstant- respektive avståndsberoende del. |
| `Satser` | [modals.js:41](../../src/ui/modals.js#L41) | Antal helsatser – **`Satser` här, `Sat.` i mätboken, `Helsatser` i PM, `Antal helsatser` i mätklassrutan**. |
| `σ vinkel effektiv: 0.1732 mgon (0.3/1.73)` | [modals.js:85](../../src/ui/modals.js#L85) | Härlett värde, uppdateras live. |
| `Uppmätt avstånd (m) — kalk: 123.4567 m` | [modals.js:46](../../src/ui/modals.js#L46) | Inmatningsfält med kalkylerat referensvärde. |
| `Uppmätt riktningsvinkel (°) — kalk: 123.4567°` | [modals.js:50](../../src/ui/modals.js#L50) | **Inmatning i decimalgrader med `°`** – enda inmatningsfältet för en vinkel i hela UI, och det tar en enhet som ingen visningsyta använder. |
| `Lämna tomt = beräknat` / `Lämna tomt = beräknad` | [modals.js:47,51](../../src/ui/modals.js#L47) | Placeholders – korrekt genusböjda men olika. |
| `FRÅN:` / `TILL:` | [modals.js:54,56](../../src/ui/modals.js#L54) | Punktväljare. |
| `✓ Spara` / `🗑 Ta bort` / `✕` | [modals.js:60-62](../../src/ui/modals.js#L60-L62) | Knappar. |

### Punktmodalen

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `Redigera: <id>` | [modals.js:115](../../src/ui/modals.js#L115) | Dialogrubrik. |
| `⚠ n mätning(ar) kopplade` | [modals.js:116](../../src/ui/modals.js#L116) | Varning – **parentesplural följt av bestämd pluralform `kopplade`**. |
| `Ändra E/N-koordinater för att flytta punkten på kartan.` | [modals.js:117](../../src/ui/modals.js#L117) | Hjälptext. |
| `Punkt-ID` / `E-koordinat (m)` / `N-koordinat (m)` / `Höjd (m ö.h.)` | [modals.js:118-119](../../src/ui/modals.js#L118-L119) | Fältetiketter – **`Höjd (m ö.h.)` här, `H (m)` i alla tabeller**. |
| `Befästning / markering` / `ex. Rördubb i asfalt...` | [modals.js:122-123](../../src/ui/modals.js#L122-L123) | Fältetikett + placeholder. |
| `Prisma / instrument` | [modals.js:126](../../src/ui/modals.js#L126) | Fältetikett – **`Prisma/Instrument` utan mellanslag i koordinatlistan**. |
| `Centreringsfel (mm) — lämna tomt = globalt (1 mm)` | [modals.js:130](../../src/ui/modals.js#L130) | Fältetikett. |
| `Etablerad över känd punkt (även uppställning)` | [modals.js:143](../../src/ui/modals.js#L143) | Kombipunktsval. |
| `Punkten används som mätstation och bakåtsiktsfix.` | [modals.js:145](../../src/ui/modals.js#L145) | Hjälptext – **`mätstation` och `bakåtsiktsfix` förekommer bara här**. |
| `ID finns redan!` | [modals.js:165](../../src/ui/modals.js#L165) | Alert – **enda felmeddelandet med utropstecken**. |
| `Ta bort punkt och alla dess mätningar?` | [modals.js:198](../../src/ui/modals.js#L198) | Bekräftelsedialog. |

### Hinder-fliken och hindermodalen

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `🏢 Byggnad` / `━ Vägg` / `📡 OSM` | [obstacle-panel.js:17-22](../../src/ui/obstacle-panel.js#L17-L22) | Verktygsknappar – **`OSM` oförklarat i knappen, utskrivet i tooltipen**. |
| `Inga hinder ännu. Rita en byggnad (polygon) eller vägg (linje) med knapparna ovan.` | [obstacle-panel.js:26-27](../../src/ui/obstacle-panel.js#L26-L27) | Tomtillstånd. |
| `n pt` | [obstacle-panel.js:42](../../src/ui/obstacle-panel.js#L42) | Antal hörn – **`pt` som förkortning, medan modalen säger `hörn`** ([obstacle-modal.js:56](../../src/ui/obstacle-modal.js#L56)). |
| `Hinder bryter siktlinjer i mätförslag och validering, och sparas i projektfilen.` | [obstacle-panel.js:53](../../src/ui/obstacle-panel.js#L53) | Fotnot. |
| `🏢 Redigera byggnad` / `━ Redigera vägg` | [obstacle-modal.js:53](../../src/ui/obstacle-modal.js#L53) | Dialogrubrik. |
| `<id> · n hörn · från OSM` | [obstacle-modal.js:56](../../src/ui/obstacle-modal.js#L56) | Metadatarad. |
| `Namn` / `ex. Bergvägg norr, Betongvägg...` | [obstacle-modal.js:59-61](../../src/ui/obstacle-modal.js#L59-L61) | Fältetikett + placeholder. |
| `Färg — ✕ ger standardfärg` | [obstacle-modal.js:65](../../src/ui/obstacle-modal.js#L65) | Fältetikett. |
| `Standard` / `Bergvägg` / `Betongvägg` / `Byggnad` / `Planerad struktur` / `Övrigt` | [obstacles.js:15-20](../../src/state/obstacles.js#L15-L20) | Färgpalettens tooltips. |

### Visuella objekt

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `⤺ Visuell linje <id>` / `○ Visuell punkt <id>` | [visual-modal.js:71](../../src/ui/visual-modal.js#L71) | Kontextmenyns rubrik. |
| `✎ Redigera` / `🗑 Ta bort` | [visual-modal.js:73-74](../../src/ui/visual-modal.js#L73-L74) | Menyval. |
| `━ Använd som vägg` / `⛔ Använd som blockeringslinje` / `⛓ Koppla loss från hindret` | [visual-modal.js:78-79](../../src/ui/visual-modal.js#L78-L79) | Menyval. |
| `Vägg` / `Blockeringslinje` | [visual-modal.js:23-24](../../src/ui/visual-modal.js#L23-L24) | Hinderroller – **`Blockeringslinje` finns bara här; hinderpanelen känner bara `byggnad`/`vägg`**. |
| `<id> · ingår inte i simuleringen` | [visual-modal.js:189](../../src/ui/visual-modal.js#L189) | Metadatarad. |
| `<id> (nätpunkt)` / `<id> (visuell)` | [visual-modal.js:182](../../src/ui/visual-modal.js#L182) | Ändpunktsbeskrivning – **`nätpunkt` förekommer bara här**. |
| `▨ Styr hindret <id>` | [visual-modal.js:194](../../src/ui/visual-modal.js#L194) | Kopplingsstatus. |
| `Standard` / `Vägkant` / `Ritningskontur` / `Planerat objekt` / `Terräng` / `Övrigt` | [visual.js:25-30](../../src/state/visual.js#L25-L30) | Färgpalettens tooltips. |

### Valideringsdialogen (`alert`)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `✓ Nätet uppfyller alla SIS-TS-krav och har inga varningar.` | [validation.js:57](../../src/ui/validation.js#L57) | Positivt utfall. |
| `✗ FEL (n):` / `⚠ VARNINGAR (n):` | [validation.js:59-60](../../src/ui/validation.js#L59-L60) | Grupprubriker. |
| `Simulering har inte körts ännu – tryck på "Kör simulering" eller aktivera auto-sim.` | [validation.js:13](../../src/ui/validation.js#L13) | **Hänvisar till en knapp som inte finns** – knappen heter `▶ BERÄKNA SIMULERING`. |
| `Kontrollerbarhet k=0.412 < 0,50 – nätet uppfyller inte SIS-TS-kravet.` | [validation.js:22](../../src/ui/validation.js#L22) | Felmeddelande – **decimalpunkt i det beräknade värdet, decimalkomma i gränsvärdet, i samma mening**. |
| `k=0.812 ≥ 0,70 – överbestämt nät, kontrollera att mätinsatsen ger mervärde.` | [validation.js:24](../../src/ui/validation.js#L24) | Varning. |
| `n mätning(ar) har r_i < 0,30: A→B (hz, r=0.22) m.fl.` | [validation.js:27-29](../../src/ui/validation.js#L27-L29) | Felmeddelande – **exponerar det interna värdet `hz`/`dist` i klartext**. |
| `n mätning(ar) har 0,30 ≤ r_i < 0,50.` | [validation.js:31-33](../../src/ui/validation.js#L31-L33) | Varning. |
| `Inga kända punkter – nätet saknar absolut anslutning.` | [validation.js:36](../../src/ui/validation.js#L36) | Fel. |
| `Endast n känd(a) punkt(er) – ≥3 rekommenderas.` | [validation.js:37](../../src/ui/validation.js#L37) | Varning – **dubbel parentesplural**. |
| `n mätning(ar) saknar siktlinje: …` | [validation.js:44](../../src/ui/validation.js#L44) | Fel. |
| `Valideringen avser det OPTIMERADE FÖRSLAGET, inte det aktiva nätet.` | [validation.js:18](../../src/ui/validation.js#L18) | Varning i förslagsvyn. |
| `Inga blockerande fel – PM kan genereras med försiktighet.` / `Åtgärda felen innan PM genereras.` | [validation.js:61](../../src/ui/validation.js#L61) | Slutsatsrad. |

### Import/export-dialoger

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `📋 EXCEL-MALL` + hela malltexten | [import-csv.js:95-140](../../src/io/import-csv.js#L95-L140) | Hjälpdialog. Innehåller **den enda förklaringen av punkttypernas alias** (`känd / kp / fp / known`). |
| `känd / kp / fp / known → Känd punkt (grön)` | [import-csv.js:113](../../src/io/import-csv.js#L113) | **Tre acceptabla förkortningar för en punkttyp**, varav `kp` bara annars syns i mätbokens badges. |
| `Import klar! ✅ Nya punkter: n 🔄 Uppdaterade: m ⚠️ Hoppade över (ogiltiga): k` | [import-csv.js:91](../../src/io/import-csv.js#L91) | Resultatalert. |
| `Hoppade (ogiltiga)` | [import-geo.js:78](../../src/io/import-geo.js#L78) | **Kortare formulering** för samma sak i .geo-importen. |
| `OBS: Punkttyp sätts automatiskt baserat på ID-prefix.` | [import-geo.js:78](../../src/io/import-geo.js#L78) | Varning i .geo-importen. |
| `Filen anger koordinatsystem: "…" Vill du byta aktivt CRS till …?` | [import-geo.js:33](../../src/io/import-geo.js#L33) | Bekräftelsedialog. |
| `Kunde inte hitta kolumnerna ID, E och N.` | [import-csv.js:59](../../src/io/import-csv.js#L59) | Felmeddelande. |
| `💾 Spara projekt` / `Filnamn (utan .json)` | [export-project.js:167-168](../../src/io/export-project.js#L167-L168) | Spardialog. |
| `Felaktig JSON-fil: <orsak>` | [export-project.js:210](../../src/io/export-project.js#L210) | Felmeddelande. |
| `Kunde inte läsa projektfilen – fel format eller version. Filen måste vara skapad av NätSim v1, v2 eller v3.` | [export-project.js:212](../../src/io/export-project.js#L212) | Felmeddelande – **versionsangivelserna `v1/v2/v3` syns ingen annanstans i UI**. |
| `📡 OSM-import` / `Hittade n byggnader i aktuell kartvy.` | [osm-import.js:250-252](../../src/io/osm-import.js#L250-L252) | Bekräftelsedialog. |
| `Importerade hinder märks med source "osm" och visas i HINDER-fliken.` | [osm-import.js:254](../../src/io/osm-import.js#L254) | Förklaring – **exponerar det interna fältnamnet `source`**. |
| `✓ Importera n st` / `Avbryt` | [osm-import.js:258-259](../../src/io/osm-import.js#L258-L259) | Knappar. |
| `Hämtar byggnader från OSM…` / `(kan ta 5–15 sek beroende på vy)` | [osm-import.js:229-230](../../src/io/osm-import.js#L229-L230) | Laddningsöverlägg. |
| `❌ OSM-import misslyckades` / `🔄 Försök igen` / `Stäng` | [osm-import.js:285-289](../../src/io/osm-import.js#L285-L289) | Felmodal. |

### Onboarding, studioläge och verktygsfält

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `📐 Välkommen till NätSim Beta 2` / `Snabbstart:` / `Förstått` | [onboarding.js:51-60](../../src/ui/onboarding.js#L51-L60) | Introoverlay, tre varianter (telefon/pekplatta/dator). |
| `Aktivera mätklass G1–G4 i högerpanelen om SIS-TS-krav ska gälla.` | [onboarding.js:38](../../src/ui/onboarding.js#L38) | Steg 4 – **visas bara i desktopvarianten**. |
| `NätSim` / `Skandimech Industries – Planering & Nätanalys v4.0` | [index.html:18-19](../../index.html#L18-L19) | Panelhuvud – **`v4.0` motsäger fönstertiteln `NätSim Beta 2`** ([index.html:10](../../index.html#L10)) och `package.json` `0.3.0`. |
| `Studioläge` / `Studioläge — NÄT` | [index.html:179](../../index.html#L179), [studio.js:40](../../src/ui/studio.js#L40) | Överläggsrubrik. |
| `← Tillbaka till kartvy` / `Ctrl+E` | [index.html:178,180](../../index.html#L178) | Navigering. |
| `Vy laddas i Etapp B/C` | [studio.js:52](../../src/ui/studio.js#L52) | **Utvecklingsplatshållare synlig för användaren.** |
| `Ritning avbruten – studioläge aktiverat` | [studio.js:28](../../src/ui/studio.js#L28) | Toast. |
| `LÄGG TILL PUNKT` / `🖐 Panorera / Flytta` / `📏 Lägg till mätning` / `🔴 Simulerad uppställning` / `🏢 Rita byggnad` / `━ Rita vägg` / `○ Rita visuell punkt` / `⤺ Rita visuell linje` | [index.html:23-31](../../index.html#L23-L31) | Verktygsknappar. |
| `🗑 Rensa allt` / `↩ Ångra` / `📥 Importera punkter (Excel/CSV)` / `📥 Importera punkter (.geo)` / `📤 Exportera punkter (.geo)` / `📋 Visa Excel-mall` / `💾 Spara projekt` / `📂 Ladda projekt` | [index.html:78-88](../../index.html#L78-L88) | IO-knappar. |
| `Rensa alla punkter, mätningar, hinder och visuella objekt?` | [toolbar.js:125](../../src/ui/toolbar.js#L125) | Bekräftelse. |
| `RAPPORTER` / `📄 Simuleringsrapport (.txt)` / `📊 Beräkningsrapport (.txt)` / `🖨 Simuleringsrapport (PDF)` | [right-panel.js:706-709](../../src/ui/right-panel.js#L706-L709) | RAPPORT-flikens knappar – **två knappar heter `Simuleringsrapport` och skiljs bara på format**. |
| `FÄLTDOKUMENTATION` / `📋 Mätbok A4 (utskrift/PDF)` / `📝 Mätschema (.txt)` / `📐 Generera Mätningstekniskt PM` | [right-panel.js:711-715](../../src/ui/right-panel.js#L711-L715) | Fältdokumentationsknappar. |
| `STANDARDINSTRUMENT` / `Tillämpa på alla mätningar` / `CENTRERINGSFEL` / `mm (globalt)` / `MAXAVSTÅND FÖRESLAGNA MÄTNINGAR` | [right-panel.js:623-634](../../src/ui/right-panel.js#L623-L634) | INSTRUMENT-flikens etiketter. |
| `σ vinkel: 0.3 mgon   σ avst: 1 mm + 1.5 ppm` | [right-panel.js:734](../../src/ui/right-panel.js#L734) | Instrumentets a priori-värden. |
| `A PRIORI OSÄKERHET` / `Ange kraven för nätnoggrannheten (SIS-TS 21143:2016).` / `Krav σ_pos ≤ [ ] mm` | [right-panel.js:651-656](../../src/ui/right-panel.js#L651-L656) | A PRIORI σ-flikens innehåll – **fliken heter `A PRIORI σ` men innehåller ett kravfält, inte a priori-osäkerheter**. `nätnoggrannhet` förekommer bara här. |

---

## 12. Statusmeddelanden och felmeddelanden (toaster)

| Termen som visas | Var i koden | Kort beskrivning |
|---|---|---|
| `✓ Mätklass G1 tillämpad på alla mätningar` | [right-panel.js:746](../../src/ui/right-panel.js#L746) | Bekräftelse. |
| `⛔ n blockerade mätningar borttagna` | [right-panel.js:817](../../src/ui/right-panel.js#L817) | Bekräftelse – **alltid plural, även vid n=1**, medan knappen som utlöste den böjer korrekt. |
| `✓ n mätningar importerade` | [right-panel.js:842](../../src/ui/right-panel.js#L842) | Bekräftelse – dito. |
| `✓ Optimerat nät tillämpat` / `✓ Optimerat nät tillämpat (+3 / −1)` | [right-panel.js:855](../../src/ui/right-panel.js#L855), [optimizer-modal.js:278](../../src/ui/optimizer-modal.js#L278) | **Samma händelse, två olika texter** beroende på vilken knapp som användes. |
| `↩ Ångrade: <åtgärd>` / `Inget att ångra` | [undo.js:78,55](../../src/state/undo.js#L78) | Ångra-status. |
| `⚠ Flyttar S1 – n mätning(ar) kopplad(e). Simuleringen nollställs.` | [interactions.js:160](../../src/map/interactions.js#L160) | Dragvarning – **dubbel parentesplural**. |
| `⚠ Klick nära S1 (n mätningar). Valde punkten istället.` | [interactions.js:297](../../src/map/interactions.js#L297) | Snapp-varning. |
| `⚠ Kör simuleringen först innan du lägger till en simulerad uppställning.` | [interactions.js:308](../../src/map/interactions.js#L308) | Blockerande varning. |
| `🔴 SS1 tillagd – öppna punkten och lägg till mätningar mot byggnätspunkter` | [interactions.js:315](../../src/map/interactions.js#L315) | Instruktion – **`byggnätspunkter` förekommer bara här** och saknar motsvarighet i punkttypsnamnen. |
| `Mätning A→B finns redan.` | [interactions.js:231](../../src/map/interactions.js#L231) | Alert. |
| `Kör simuleringen först.` | [sim-report.js:13,97](../../src/reports/sim-report.js#L13), [export-pdf.js:9](../../src/io/export-pdf.js#L9), [main.js:250](../../src/main.js#L250) | Blockerande alert på fyra ställen – **samma text, men valideringsdialogen säger `Kör simulering` i citattecken**. |
| `Autosparat HH:MM:SS` | [persistence.js:27](../../src/state/persistence.js#L27) | Autospar-status i vänsterpanelens fot. |
| `Sparad som <filnamn>` / `Projekt laddat` | [export-project.js:193,244](../../src/io/export-project.js#L193) | Statusrad – **`Sparad`/`Autosparat` böjs olika i samma element**. |
| `✓ .geo importerad: n nya, m uppdaterade` / `✓ Exporterade n punkter som <fil>` | [import-geo.js:77,116](../../src/io/import-geo.js#L77) | Bekräftelser. |
| `📡 Inga byggnader hittades i aktuell kartvy` / `✓ n byggnader importerade från OSM` | [osm-import.js:191,201](../../src/io/osm-import.js#L191) | OSM-status. |
| `○ <id> borttagen · n linje(r) togs bort med den` | [visual-modal.js:117](../../src/ui/visual-modal.js#L117) | Bekräftelse. |
| `⚠ Linjen saknar giltiga ändpunkter` | [visual-modal.js:127](../../src/ui/visual-modal.js#L127) | Fel. |
| `Vägg skapad från <id> – följer linjen` / `<id> styr inte längre <obsId>` | [visual-modal.js:139,150](../../src/ui/visual-modal.js#L139) | Kopplingsstatus. |
| `Platsåtkomst ej tillgänglig.` / `Kunde inte hämta plats.` | [leaflet-setup.js:141,144](../../src/map/leaflet-setup.js#L141) | Geolokaliseringsfel. |
| `Popup blockerades – tillåt popups för denna sida.` / `Popup blockerades – tillåt popups.` / `Popup blockerades. Tillåt popups för den här sidan.` | [main.js:257](../../src/main.js#L257), [export-pdf.js:13](../../src/io/export-pdf.js#L13), [meas-book.js:199](../../src/reports/meas-book.js#L199) | **Samma felsituation, tre olika formuleringar och tre olika skiljetecken.** |

---

# Sammanställande observationer

## A. Genomgående språkbruksval

**Språk.** UI:t är konsekvent svenskt i all löptext, alla rubriker och alla knappar. Engelska
förekommer bara som (a) etablerade fackförkortningar (`Hz`, `MUF`, `YT`, `CRS`, `OSM`, `ppm`),
(b) tekniska ord i förklarande text (`default`, `Second-order design`, `source "osm"`), och
(c) enums som läcker igenom i felmeddelanden (`hz`, `dist`, `both`). **Ordet "measurement" eller
"station" på engelska förekommer inte** – men det svenska **`Station`** används som punkttypsetikett i
båda studiovyerna ([net-studio.js:8](../../src/ui/studio-views/net-studio.js#L8),
[simulation-studio.js:9](../../src/ui/studio-views/simulation-studio.js#L9)) och som filterrubrik
`Från-station`, medan hela resten av produkten säger **`Uppställning`**.

**Vinkelenhet.** Gon är primärenhet överallt i visningen, i hybridformatet `123g45'67.8"`
([designmatrix.js:23-26](../../src/core/designmatrix.js#L23-L26)) – aldrig som gon-decimaler.
Användaren kan växla till DMS `123°45'67.8"` med en global toggle, men växlingen når **bara** kartans
bäringstexter, mätkortets `Riktn:`, POLÄR-tabellen och mätboken/mätschemat. Den når **inte**
felellipsvinkeln θ (alltid gon), inte beräkningsrapportens `θ` och `α` (alltid decimalgrader), och inte
mätningsmodalens inmatningsfält (alltid decimalgrader). Ingen yta visar båda enheterna parallellt.
Riktningsosäkerheter anges alltid i **mgon**, aldrig i den valda visningsenheten.

**Decimaltecken.** Beräknade värden använder genomgående **decimalpunkt** (`toFixed`). Normcitat och
gränsvärden i löptext använder **decimalkomma** – ibland i samma mening som ett beräknat värde
([validation.js:22](../../src/ui/validation.js#L22): `k=0.412 < 0,50`).

**Sannolikheter och konfidensnivåer.** Redundanstal och k-tal visas alltid som **decimaler** med tre
decimaler, aldrig som procent. Konfidensnivån för felellipser anges däremot i **procent** (`95%`), och
alternativet uttrycks som en **sigmanivå** (`1σ`) – två olika mått i samma knapppar. Optimeringens
viktningsreglage visar `50 / 50` som **rena tal utan procenttecken**.

**Enheter.** Millimeter för osäkerheter, meter för koordinater och avstånd, mgon för
riktningsosäkerheter, ppm för avståndsberoende del. Enhetens placering är dock inte enhetlig:
tabellrubriker skriver enheten i rubriken (`σpos mm`, `N (m)`), kartan klistrar den direkt på värdet
(`1.2mm`, `123.456m`), och skalstången separerar med mellanslag (`250 m`).

**Symbol kontra utskriven term.** Systematiskt mönster: **kompakta ytor visar symbolen, förklarande
ytor skriver ut den** – t.ex. kolumnen `r` med legenden `r = redundansbidrag`, eller `MUF` med
tooltipen `Minsta Urskiljbara Fel`. Mönstret bryts där det räknas mest: `KP` har ingen tooltip, `r_d`
och `r_h` på mätkortet har ingen förklaring alls, och `Hv/Vv` i mätklassrutan förklaras ingenstans.

**Versalisering.** Sektionsrubriker i högerpanelen och textexporterna är VERSALER; samma rubriker i
studioläget och PM-rapporten är gemener med versal begynnelsebokstav.

**Ikonografi.** Emoji används genomgående som prefix på knappar. `✓`/`✗`/`⚠`/`⛔` är stabilt kodade
(bekräftelse/fel/varning/blockerat), men `📥` betyder både "importera" (vänsterpanelen) och
"exportera CSV" (studiofooters).

## B. Inkonsistenser mellan UI-ytor

**1. Redundanstalet r_i har sex notationer, varav en är en annan bokstav.**

| Notation | Yta | Källa |
|---|---|---|
| `r_d` / `r_h` | Mätkortet i MÄTNINGAR | [right-panel.js:350](../../src/ui/right-panel.js#L350) |
| `r_i` | Mätklasstabell, studiovyer, PDF, rapportstudion | [right-panel.js:452](../../src/ui/right-panel.js#L452), [measurements-studio.js:150](../../src/ui/studio-views/measurements-studio.js#L150) |
| `r` | Kolumnrubrik i reliabilitetstabellen | [right-panel.js:534](../../src/ui/right-panel.js#L534) |
| `r̄` | Medelvärde per punkt | [right-panel.js:580](../../src/ui/right-panel.js#L580) |
| `r-tal` | Optimeringsdialog och beslutslogg | [optimizer-proposal.js:98](../../src/state/optimizer-proposal.js#L98), [optimizer.js:188](../../src/core/optimizer.js#L188) |
| `redundansbidrag` / `redundanstal` | Legender och hjälptexter | [right-panel.js:525](../../src/ui/right-panel.js#L525), [optimizer-modal.js:86](../../src/ui/optimizer-modal.js#L86) |
| **`k_i`** | **PM-rapporten** | [report-generator.js:264-273](../../src/pm/report-generator.js#L264-L273) |

`k_i` är det allvarliga fallet: i PM-rapporten – produktens formella leverabel – heter r_i genomgående
`k_i` och beskrivs som "individuellt k-tal", vilket kolliderar med det **globala k-talet k = f/n** som
står två rader ovanför i samma tabell. Mätklassrutan förstärker förväxlingen genom att kalla kravet på
r_i för `k-tal enskild` ([sis-ts-info.js:31](../../src/ui/sis-ts-info.js#L31)).

**2. Kvalitetsomdömen finns i fyra oförenliga skalor.**

| Skala | Steg | Yta |
|---|---|---|
| k-talets klassificering | `Överbestämt` / `Starkt` / `Acceptabelt` / `Svagt` / `Otillräckligt` | [constants.js:188-197](../../src/core/constants.js#L188-L197) |
| Punktreliabilitet | `Ingen mätning` / `Ej kontrollerbar` / `Svag` / `Acceptabel` / `God` | [right-panel.js:594-598](../../src/ui/right-panel.js#L594-L598) |
| PM:s k-talsomdöme | `Starkt kontrollerbart` / `Acceptabelt kontrollerbart` / `Otillräcklig kontrollerbarhet` | [report-generator.js:56-57](../../src/pm/report-generator.js#L56-L57) |
| PM:s nätbedömning | `✓ STABILT OCH KONTROLLERBART` / `⚠ ACCEPTABELT` / `✗ EJ GODKÄNT` | [report-generator.js:134](../../src/pm/report-generator.js#L134) |
| Kvalitetspanelens tooltips | `utmärkt` / `bra` / `godkänt`, `bra` / `risk` | [index.html:150,153](../../index.html#L150) |

Kvalitetspanelens tooltip är dessutom **faktiskt föråldrad**: den citerar gränsen `≥1.14` som togs bort
ur beräkningskärnan ([constants.js:133-139](../../src/core/constants.js#L133-L139)). Och
högerpanelens bandförklaring ([right-panel.js:450](../../src/ui/right-panel.js#L450)) listar fyra
klasser medan klassificeringen returnerar fem – `Överbestämt` saknas i förklaringen.

**3. Punkttyperna har sju uppsättningar etiketter.**

`Känd punkt / Uppställning / Detaljpunkt / Ny punkt / Simulerad uppställning`
([constants.js:24-30](../../src/core/constants.js#L24-L30)) · `Känd / Station / Ny / Detalj / SimStn`
(båda studiovyerna) · `Kända / Uppst. / Detalj / Nya` (NÄT-fliken) ·
`Kända punkter / Uppställningar / Nya punkter / Detaljpunkter / Sim. uppst.` (kartfiltret) ·
`Kända / Uppst / Nya-Detalj` (koordinatlistans fot) · `KP / UPS / DET / NY` (mätbokens badges) ·
`FP / S / D / NY / SS` (ID-prefix). Typtabellen är dessutom **kopierad ordagrant på fyra ställen**
([main.js:164](../../src/main.js#L164), [report-generator.js:73](../../src/pm/report-generator.js#L73),
[right-panel.js:690](../../src/ui/right-panel.js#L690),
[net-studio.js:8](../../src/ui/studio-views/net-studio.js#L8)) i stället för att läsa `PT`, och
kopian i POLÄR-fliken har tappat bort `simstation` helt.

**4. Observationsslagen har tre uppsättningar termer.**

`📐 Vinkel + Avstånd / 📐 Endast vinkel / 📏 Endast avstånd` i mätningsmodalen
([modals.js:27-29](../../src/ui/modals.js#L27-L29)) · `Hz+Dm / Hz / Dm` i mätningsstudion
([measurements-studio.js:6](../../src/ui/studio-views/measurements-studio.js#L6)) ·
`Avst / Riktning` i simuleringstabellerna ([right-panel.js:552](../../src/ui/right-panel.js#L552)) ·
`Längd / Riktning` i PM-rapporten
([report-generator.js:103](../../src/pm/report-generator.js#L103)). Modalen kallar alltså samma sak
`Vinkel` som tabellerna kallar `Riktning` – och riktningsmätning och vinkelmätning är **inte samma sak
geodetiskt**, vilket gör detta till mer än en stilfråga. Samtidigt heter samma storhet `Avst`,
`Avstånd`, `Dist`, `Dist.`, `Dist(m)` och `Längd` beroende på yta.

**5. Standardosäkerhetens skrivsätt, kolumnordning och beteckningar skiftar mellan rapportformaten.**

| Yta | Skrivsätt | Kolumnordning | Halvaxlar |
|---|---|---|---|
| Simuleringsfliken sekt. 3 | `σpos mm` | σE, σN | `a mm` / `b mm` |
| Simuleringsfliken sekt. 5 | `σ_pos mm` | – | – |
| Kartan | `σ=1.2mm` | – | – |
| PDF-export | `σpos mm` | **σN, σE** | `a mm` / `b mm` |
| PM-rapporten | `σ_pos mm` | **σ_N, σ_E** | **`σ_a` / `σ_b`** |
| Kvalitetspanelen | `max σ_pos` | – | – |

Att N och E byter plats mellan skärmen och de två PDF-formaten är den mest verifierbart förvirrande
biten – en läsare som jämför skärm och rapport läser fel kolumn.

**6. Sikt- och referenstexter pekar på UI som inte finns, eller på fel innehåll.**

Valideringsdialogen ber användaren `tryck på "Kör simulering"`
([validation.js:13](../../src/ui/validation.js#L13)) – knappen heter `▶ BERÄKNA SIMULERING`.
PM-guidens bildslots heter `R3.3 Nätkarta`, `R3.4 Anslutningspunkter` och `R3.12 Punktbeskrivningar`
([step4-images.js:60-65](../../src/pm/steps/step4-images.js#L60-L65)) medan de faktiskt genererar
`Kända anslutningspunkter`, `Mätgeometri` respektive `Lägesosäkerheter (1σ felellipser)`
([image-presets.js](../../src/pm/image-presets.js)) – två av tre etiketter beskriver **fel bild**.
Två utvecklingsplatshållare är synliga för slutanvändaren: `Mini-karta (implementeras i fas D)`
([simulation-studio.js:143](../../src/ui/studio-views/simulation-studio.js#L143)) och
`Vy laddas i Etapp B/C` ([studio.js:52](../../src/ui/studio.js#L52)).

**Övrigt värt att notera för beslutslistan.** Två stavfel i rapportrubriker: `DETALJERED`
([sim-report.js:108](../../src/reports/sim-report.js#L108)) och `KRS:` för CRS
([step1-project.js:41](../../src/pm/steps/step1-project.js#L41)). Versionsangivelsen
`Planering & Nätanalys v4.0` ([index.html:19](../../index.html#L19)) motsäger både fönstertiteln
`Beta 2` och `package.json` (`0.3.0`). Parentesplural (`mätning(ar)`, `känd(a) punkt(er)`,
`kopplad(e)`) används i ungefär hälften av meddelandena medan andra hälften böjer korrekt, och några
toaster ([right-panel.js:817,842](../../src/ui/right-panel.js#L817)) skriver alltid plural även vid
n=1 trots att knappen som utlöste dem böjer rätt.

## C. Tre högst prioriterade städningsobjekt

Detta är min egen bedömning, inte en åtgärdsrekommendation – valet av åtgärd är beslutslistans jobb.

**1. `k_i` i PM-rapporten för redundanstalet r_i.**
Detta är det enda fallet i inventeringen där en storhet inte bara stavas olika utan **byter bokstav
till en bokstav som redan är upptagen av en annan storhet i samma tabell**. PM-rapporten är dessutom
produktens formella leverabel – den läses av beställare och granskare som inte har resten av UI:t
framför sig, och som därför inte kan härleda att `Min k_i (avst.)` är samma tal som appen kallar
`Min r_i (avstånd)`. Att mätklassrutan självständigt kallar samma krav `k-tal enskild` gör att
förväxlingen finns på båda sidor och inte kan lösas genom att bara läsa noggrannare. Risken är konkret
felläsning av ett kvalitetstal i ett dokument som ska styra fältarbete.

**2. Kvalitetspanelens tooltip som citerar den borttagna 1,14-gränsen.**
`K-tal: global redundanskvot. ≥1.14 utmärkt, ≥0.5 bra, ≥0.3 godkänt`
([index.html:150](../../index.html#L150)) beskriver en klassificering som **inte längre finns i
koden** – gränsen ströks medvetet ur beräkningskärnan med motiveringen att 1,14 var fel storhet och
matematiskt onåbar ([constants.js:133-139](../../src/core/constants.js#L133-L139)). Tooltipen är
alltså inte en inkonsekvens utan en **osann uppgift som visas för användaren**, och den är den enda
förklaringen av k-talet som finns tillgänglig direkt i kartvyn. Den ger dessutom tre klassnamn
(`utmärkt/bra/godkänt`) som inte matchar någon av de fyra andra skalorna. Att den ligger i statisk
HTML gör den också lätt att missa vid framtida ändringar i klassificeringen.

**3. `Vinkel` kontra `Riktning` för observationstypen.**
Mätningsmodalen – den yta där användaren faktiskt *väljer* vad som ska mätas – kallar riktningsmätning
för `📐 Vinkel + Avstånd` / `📐 Endast vinkel`
([modals.js:27-28](../../src/ui/modals.js#L27-L28)), medan hela beräknings- och rapportkedjan kallar
samma observation `Riktning`. Detta är inte bara ordval: NätSim utjämnar **riktningar med
orienteringskonstanter**, inte vinklar, och skillnaden är själva anledningen till att
`Orienteringskonstanter` finns som obekantslag i rapporten. En användare som väljer "Endast vinkel" och
sedan läser "Orienteringskonstanter: 3" i nätöversikten har inget i UI:t som förbinder de två. Att
kartfiltret `Vinklar` ([index.html:58](../../index.html#L58)) i själva verket styr **bäringstexter**
lägger ett tredje betydelselager på samma ord. Jag skulle prioritera detta över de rent kosmetiska
punkttyps- och pluralfrågorna eftersom det är det enda återstående fallet där språkbruket kan ge
användaren en felaktig modell av vad programmet räknar.

---

*Inventeringen omfattar 24 UI-producerande filer under `src/` plus `index.html` och `src/pm/pm.html`.
Konsollogg och kodkommentarer är inte inventerade.*
