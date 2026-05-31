# Prompt till Claude Code för migrationen

Använd denna prompt steg-för-steg. Klistra in en sektion i taget för att hålla
kontexten hanterbar och kunna granska resultatet emellan.

---

## Prompt 1: Initial analys (kör först)

```
Jag har migrerat NätSim Beta 2 från en monolitisk HTML-fil till denna mapp.
Filen `NätSim_Beta_2.html` (4664 rader) ligger i projekt-roten.

Innan du börjar migrera:

1. Läs `STRUCTURE.md` för målstrukturen
2. Läs `MIGRATION_GUIDE.md` för helhetsbilden
3. Skanna `NätSim_Beta_2.html` och gör en INVENTERING:
   - Lista alla funktioner med radnummer
   - Identifiera globala state-variabler
   - Identifiera UI-element och deras DOM-IDs
   - Identifiera externa beroenden (Leaflet, proj4, jsPDF)
4. Presentera en migrations-plan i 7 faser (en per huvudmapp i STRUCTURE.md)

Gör INGA ändringar ännu. Vänta på mitt godkännande av planen.
```

---

## Prompt 2: Constants och matrix (efter godkännande av plan)

```
Börja med fas 1: Constants.

Extrahera CRS_DEFS, INSTRUMENTS och MATKLASSER ur `NätSim_Beta_2.html` och
lägg dem i `src/core/constants.js` som ES-module exports. Behåll exakta
värden – inga numeriska ändringar.

Sedan fas 2: Matrix.

Extrahera `invertMatrix` till `src/core/matrix.js`. Lägg också till en
hjälpfunktion `multiplyMatrices(A, B)` om sådan saknas men behövs senare.

Skriv ett unit test `tests/matrix.test.js` som verifierar:
- 2x2 inversion
- 3x3 inversion  
- Singulär matris returnerar null

Kör `npm test` och visa att testerna passerar.
```

---

## Prompt 3: Beräkningskärnan (KRITISK)

```
Fas 3: Migrera beräkningskärnan.

Detta är det viktigaste steget. Beräkningarna får INTE förändras matematiskt.
Följ STRUCTURE.md sektion "Designprinciper > 1. Beräkningskärnan är helig".

1. Extrahera `calcM` till `src/core/designmatrix.js`
2. Extrahera `runSimulation` till `src/core/simulation.js`
3. Extrahera `runSimStations` till `src/core/stations.js`
4. Datumdefekt-detekteringen som finns efter `invertMatrix(Nmat)`-anropet
   ska flyttas till `src/core/datum-check.js` som en separat funktion
   `checkDatumDefect(Qxx, knownPts, meas)` som returnerar `{ok, message}`
5. Använd state-modulen från `src/state/store.js` för att läsa pts/meas och
   skriva simResult

KRITISKT: 
- Behåll `const kappa = 2.80` exakt
- Behåll `rowH[nFree*2+stnIdx[p1.id]] = -1` exakt (orienteringskolumn)
- Behåll `e_c = √(e_from² + e_to²)` exakt (ej dividerat med √2)
- Behåll `lam1 = max(0, mean+disc), lam2 = max(0, mean-disc)` för ellipser

Kör `npm test` efter migrationen. Alla tester i `tests/calc.test.js` MÅSTE
passera. Om något misslyckas: visa diff:en och avvikelsen, fixa innan vi går
vidare.
```

---

## Prompt 4: State och UI (efter att kärntester passerar)

```
Fas 4: State management.

Skapa `src/state/store.js` med:
- En state-objekt med pts, meas, simResult, undoStack, selId, selMId, etc.
- Funktionerna getState(), setState(partial), subscribe(callback)
- Använd en enkel pub/sub – ingen extern dependency

Skapa `src/state/undo.js` med saveUndo, undo, redo enligt originalfilens
beteende. Lägg till autoSim-trigger när state ändras.

Skapa `src/state/persistence.js` med loadAutosave och saveAutosave mot
localStorage.

Fas 5: UI-paneler.

Splitta UI-koden från originalfilen i:
- `src/ui/toolbar.js` (övre toolbar)
- `src/ui/left-panel.js` (punktlista, mätlista)
- `src/ui/right-panel.js` (mätklass, instrument)
- `src/ui/quality-panel.js` (realtids-kvalitet)
- `src/ui/onboarding.js` (första-besök-overlay)
- `src/ui/modals.js` (redigeringsdialoger)
- `src/ui/toast.js`
- `src/ui/validation.js`

CSS i `src/styles/` enligt strukturen i STRUCTURE.md.
```

---

## Prompt 5: Map och IO

```
Fas 6: Karta.

Flytta Leaflet-koden till `src/map/`:
- `leaflet-setup.js` – initierar karta, CRS, tile-providers
- `markers.js` – punktrendering
- `lines.js` – mätlinjer med rColor()
- `ellipses-canvas.js` – felellips-overlay
- `interactions.js` – click/dblclick/contextmenu

Fas 7: IO.

Flytta import/export till `src/io/`:
- `import-geo.js` – .geo-fil-läsning
- `import-csv.js` – CSV/Excel-import
- `export-project.js` – JSON-projektfil
- `export-pdf.js` – simuleringsrapport
```

---

## Prompt 6: PM-modulen (sist!)

```
Fas 8: PM-modulen – den viktigaste och svåraste delen.

Den befintliga pmPopupHTML() är en 358-rader monolit-funktion som genererar
en HTML-sträng med inbäddat script. Detta har orsakat upprepade buggar pga
escape-helvete. Bygg om det HELT:

1. Skapa `src/pm/pm.html` som en RIKTIG HTML-fil (egen Vite-entry, redan
   konfigurerad i vite.config.js)
2. PM-sidan har sin egen entry-point `src/pm/pm.js` som laddas via 
   <script type="module"> i pm.html
3. När huvudfönstret öppnar PM via window.open(), skickar det data via
   postMessage istället för att injicera in i HTML-strängen
4. Steg 1-5 (Projekt, Referens, Instrument, Bilder, Rapport) blir separata
   moduler i `src/pm/steps/`
5. Rapportgeneratorn till `src/pm/report-generator.js`

Resultatet ska vara att pmPopupHTML() är BORTA helt. Inga genererade scripts.
Inga `<scr'+'ipt>`-knep. Bara riktig HTML/JS-arkitektur.

Testa hela PM-flödet manuellt efter migrationen.
```

---

## Prompt 7: Slutkontroll

```
Slutfas: Verifiera helheten.

1. Kör `npm test` – alla tester ska passera
2. Kör `npm run build` – bygget ska lyckas utan varningar
3. Öppna dist/index.html i webbläsaren och gör en regressionstest:
   - Lägg punkter
   - Kör simulering
   - Verifiera att Q-värden och felellipser ser identiska ut med originalfilen
   - Generera PM
   - Exportera PDF

4. Mät: hur stor är dist/-mappen vs originalfilens 4664 rader?
5. Skapa en commit per fas så historiken är granskbar
```

---

## Tips för granskning under migrationen

- **Acceptera aldrig stora ändringar utan att se diff:en.** Be Claude Code
  visa diff:en innan filer skrivs.
- **Tester först.** Om Claude Code säger "tester misslyckas men det är ok"
  – nej, det är inte ok. Felet måste utredas.
- **Pausa vid avvikelser.** Om värdena börjar avvika med ens 0.001 mm,
  stoppa och fråga. Beräkningarna är numeriskt verifierade och får inte
  glida.
- **Commit per fas.** `git add . && git commit -m "fas 3: simulation"` så
  att du kan rulla tillbaka enskilda steg.
