# Modulär struktur för NätSim

Detta dokument beskriver hur den monolitiska `NätSim_Beta_2.html` ska
splittas upp i moduler. Claude Code följer denna struktur vid migration.

## Mapp-layout

```
natsim/
├── index.html                    # Skeleton, laddar src/main.js
├── package.json
├── vite.config.js
├── tests/
│   ├── calc.test.js              # Beräkningskärna mot kända testfall
│   ├── datum-defect.test.js      # Singulär matris / datumdefekt-detektering
│   └── pm.test.js                # PM-rapportgenerering
├── src/
│   ├── main.js                   # Entry point – initierar app, karta, UI
│   ├── state/
│   │   ├── store.js              # Global state (pts, meas, simResult)
│   │   ├── undo.js               # Undo/redo-stack
│   │   └── persistence.js        # localStorage autosave
│   ├── core/                     # ⚠️ Beräkningskärnan – BACKAS UPP MED TESTER
│   │   ├── constants.js          # CRS_DEFS, INSTRUMENTS, MATKLASSER
│   │   ├── matrix.js             # invertMatrix med pivotering
│   │   ├── designmatrix.js       # calcM – avstånd/riktning partiella derivator
│   │   ├── simulation.js         # runSimulation – huvudalgoritm
│   │   ├── stations.js           # runSimStations – fristation
│   │   ├── ellipses.js           # Felellipser ur kovariansmatris
│   │   ├── redundancy.js         # r_i, MUF, YT enligt HMK
│   │   └── datum-check.js        # Detektera dolda datumdefekter
│   ├── map/
│   │   ├── leaflet-setup.js      # Initierar karta, CRS, tile-providers
│   │   ├── markers.js            # Punktmarkers, ikoner, drag
│   │   ├── lines.js              # Mätlinjer med rColor()
│   │   ├── ellipses-canvas.js    # Felellips-overlay
│   │   └── interactions.js       # Klick, dubbelklick, högerklick
│   ├── ui/
│   │   ├── toolbar.js            # Övre toolbar
│   │   ├── left-panel.js         # Punktlista, mätlista
│   │   ├── right-panel.js        # Mätklass, instrument, kvalitet
│   │   ├── quality-panel.js      # Realtids-kvalitetspanel (D6)
│   │   ├── onboarding.js         # Första-besök-overlay (D4)
│   │   ├── modals.js             # openEditPt, redigeringsdialog
│   │   ├── toast.js              # showToast notiser
│   │   └── validation.js         # validateNetwork + dialog (D7)
│   ├── pm/
│   │   ├── pm.html               # Separat HTML-fil för PM-popup
│   │   ├── pm.js                 # PM-popup logik (inte längre genererad)
│   │   ├── pm-styles.css
│   │   ├── steps/
│   │   │   ├── step1-project.js
│   │   │   ├── step2-reference.js
│   │   │   ├── step3-instruments.js
│   │   │   ├── step4-images.js
│   │   │   └── step5-report.js
│   │   └── report-generator.js   # Bygger A4-rapporten
│   ├── io/
│   │   ├── import-geo.js         # Läs in .geo-filer
│   │   ├── import-csv.js         # Läs in punktlistor från CSV
│   │   ├── export-project.js     # Sparar .json med pts, meas, settings
│   │   └── export-pdf.js         # Simuleringsrapport PDF
│   ├── reports/
│   │   ├── sim-report.js         # Textbaserad simuleringsrapport
│   │   ├── meas-book.js          # Mätbok A4
│   │   └── pdf-helpers.js        # Gemensam PDF-renderingslogik
│   └── styles/
│       ├── main.css
│       ├── panels.css
│       ├── map.css
│       └── theme.css             # Färgvariabler, dark mode
```

## Designprinciper

### 1. Beräkningskärnan är helig

`src/core/` får INTE ändras matematiskt under migrationen. Endast strukturella
ändringar tillåts: funktioner får flyttas till andra filer och imports/exports
tilläggs, men **formler, koefficienter och ordning på operationer måste vara
identiska med originalfilen**.

Kärnformler som måste bevaras (verifierade mot NumPy):
- **Orienteringskolumn**: `rowH[nFree*2+stnIdx[p1.id]] = -1` (ej `-dist_m`)
- **κ (Baarda)**: `const kappa = 2.80` (HMK F.16, α=0.05, β=0.80)
- **Centreringsfel**: `e_c = √(e_from² + e_to²)` (ej dividerat med √2)
- **MUF**: `kappa * obs.sig / Math.sqrt(ri)` (HMK F.13)
- **YT**: `(1 - ri) * mdbVal` (HMK F.14)
- **σ_pos**: `Math.sqrt((Qee + Qnn) / 2)` (Geo Professional)
- **Felellips lambda**: `Math.max(0, mean ± disc)` för båda

### 2. State-isolering

Global state får bara muteras via funktioner i `src/state/store.js`. Detta
gör det möjligt att ersätta med en riktig state manager (Zustand/Pinia/Redux)
senare utan att röra resten av koden.

### 3. PM-modulen som riktig komponent

Den 358-rader-monolit-funktion `pmPopupHTML()` ska INTE överleva migrationen.
Istället:
- `src/pm/pm.html` är en fristående HTML-fil med egen Vite-entry
- Datat skickas via `postMessage` från huvudfönstret
- Steg-vis logik är separata JS-moduler i `src/pm/steps/`
- Inga `<scr'+'ipt>`-knep, inga escape-helveten

### 4. Tester först

Vid varje migration av en `src/core/`-modul:
1. Skriv eller utöka test i `tests/`
2. Kör test mot originalfilens beteende
3. Migrera koden
4. Test ska fortsatt passera

### 5. CSS-strategi

Behåll utvecklingsflödet enkelt: vanlig CSS i `src/styles/`. Ingen Tailwind,
ingen CSS-in-JS, ingen preprocessor. Färgvariabler i `theme.css` så att
dark/light mode kan läggas till senare.

## Migrations-ordning (rekommendation)

1. **Constants**: Flytta CRS_DEFS, INSTRUMENTS, MATKLASSER till `core/constants.js`
2. **Matrix**: Flytta invertMatrix till `core/matrix.js` + test
3. **Simulation**: Flytta runSimulation + calcM till `core/` + test (KRITISKT)
4. **Map**: Flytta Leaflet-koden till `map/`
5. **UI-paneler**: Flytta panel-rendering till `ui/`
6. **IO**: Flytta export/import till `io/`
7. **PM**: Bygg om PM-modulen som riktig sub-app (sist!)

Steg 1–3 är där värdet finns. Om du bara hinner med dem är migrationen ändå
lyckad.
