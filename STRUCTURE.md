# Modulär struktur för NätSim

Detta dokument beskriver hur den monolitiska `NätSim_Beta_2.html` ska
splittas upp i moduler. Claude Code följer denna struktur vid migration.

Mapp-layouten nedan är migrationens plan och inte en fullständig lista över
alla filer. Moduler som tillkommit i v0.6.0 är inlagda i trädet och beskrivna
i avsnittet [Tillkommet i v0.6.0](#tillkommet-i-v060); polylinjearbetet i
[Polylinjer, mätning, export, offset och cirklar](#polylinjer-mätning-export-offset-och-cirklar).

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
│   │   ├── persistence.js        # localStorage autosave
│   │   ├── visual.js             # Visuella lager, punkter, linjer, ytor
│   │   ├── area-geometry.js      # v0.6.0: area, omkrets, självkorsning (plan)
│   │   ├── visual-selection.js   # v0.6.0: urvalsregler för Markera område
│   │   ├── line-geometry.js      # polylinjer: längd, riktning i gon, mätvärden (plan)
│   │   ├── offset-geometry.js    # polylinjer: offset, gering/avfasning, bågar
│   │   ├── offset.js             # polylinjer: offset som nya linjer/ytor
│   │   ├── arc-tolerance.js      # polylinjer: gemensam bågtolerans (1/5/10 mm)
│   │   └── divide.js             # polylinjer: Dela in i punkter
│   ├── data/
│   │   └── tdok-apriori.js       # v0.6.0: a priori-förval ur TDOK 2014:0571 v6.0
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
│   │   ├── interactions.js       # Klick, dubbelklick, högerklick
│   │   ├── visual-canvas.js      # Ritning och träfftest för visuella lager
│   │   ├── visual-drawing.js     # Ritlägen: visuell punkt, linje, yta
│   │   ├── select-area.js        # v0.6.0: Markera område (dragning, klick)
│   │   ├── snap.js               # v0.6.0: snappning vid ritning
│   │   ├── measure-tool.js       # polylinjer: mätverktyget D
│   │   ├── offset-tool.js        # polylinjer: verktyget O och förhandsvisningen
│   │   ├── circle-tool.js        # polylinjer: cirkelverktyget C
│   │   └── pan-gestures.js       # v0.6.0: mittenknapp och mellanslag panorerar
│   ├── ui/
│   │   ├── toolbar.js            # Verktygsval, hjälptext, mobil verktygsrad
│   │   ├── topbar.js             # Toppmenyerna Data, Visa, Rapport, Lager
│   │   ├── layer-panel.js        # Innehållet i Lager-menyn
│   │   ├── map-tools.js          # v0.6.0: verktygsraden på kartan, kortkommandon
│   │   ├── area-card.js          # v0.6.0: egenskapskort för en yta
│   │   ├── line-card.js          # polylinjer: egenskapskort för en linje
│   │   ├── circle-card.js        # polylinjer: cirkelns kort och verktygsruta
│   │   ├── measure-box.js        # polylinjer: mätverktygets ruta
│   │   ├── offset-panel.js       # polylinjer: offsetkontrollerna
│   │   ├── divide-dialog.js      # polylinjer: dialogen Dela in i punkter
│   │   ├── geo-export.js         # polylinjer: export av visuella lager (.geo)
│   │   ├── select-bar.js         # v0.6.0: åtgärdsrad för markerade objekt
│   │   ├── antal.js              # v0.6.0: böjning av antal ("1 yta", "2 ytor")
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
│   │   ├── tdok-v6.js            # v0.6.0: datamodell för TDOK 2014:0571 v6.0
│   │   ├── steps/
│   │   │   ├── step1-project.js
│   │   │   ├── step2-reference.js
│   │   │   ├── step3-instruments.js
│   │   │   ├── step3-points.js   # v0.6.0: markering, tillstånd, gemensamma punkter
│   │   │   ├── step4-images.js
│   │   │   └── step5-report.js
│   │   ├── report/               # v0.6.0: rapportens delar, rena funktioner
│   │   │   ├── mallar.js         #   de fyra dokumenttyperna A–D
│   │   │   ├── blocks.js         #   delade byggstenar med källhänvisning
│   │   │   ├── kontroller.js     #   automatiska kontroller per nättyp
│   │   │   └── simulering.js     #   standard- och utökad osäkerhet, kravjämförelse
│   │   └── report-generator.js   # Bygger A4-rapporten
│   ├── io/
│   │   ├── import-geo.js         # Läs in .geo-filer, exportera nätpunkter
│   │   ├── write-geo.js          # polylinjer: skrivare för SBG Object Text v2.01
│   │   ├── export-visual-geo.js  # polylinjer: urval och modell för .geo-exporten
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

## Tillkommet i v0.6.0

Beskrivning av modulerna som tillkom i de två arbetena som ingår i v0.6.0.
De nya modulerna ligger utanför `src/core/`. PM-arbetet ändrade i `src/core/`
bara normgränserna – k-tal och r-tal prövas nu med strikt "större än" enligt
TDOK 2014:0571 v6.0 §2.8 K3 och SIS-TS 21143:2016 §6.2.2 – samt kommentarer
med felaktiga källhänvisningar. Formlerna är orörda. Lagerarbetet rör inte
`src/core/`.

### PM enligt TDOK 2014:0571 v6.0 och Rapport-menyn

| Modul | Innehåll |
|---|---|
| `src/pm/tdok-v6.js` | Datamodellen för TDOK 2014:0571 v6.0: verksamhet och nättyp → dokumenttyp, normens uppräkningar, migrering av äldre PM-utkast. Ren data, varje post med sin paragraf. |
| `src/data/tdok-apriori.js` | A priori-förval ur §2.8 K25 Tabell 3 (järnväg). Ligger i `data/` och inte i `core/constants.js`: det är ett normkrav på viktsättningen, inte ett instruments prestanda. |
| `src/pm/steps/step3-points.js` | Guidens steg för punkter: markeringstyp (§2.4.1 K3), tillståndsbedömning (järnväg) och gemensamma markeringar (§2.11.2 K4). Lagras i PM:ets egna värden, inte i nätets punkter. |
| `src/pm/report/mallar.js` | De fyra rapportmallarna A–D (väg bruksnät, järnväg bruksnät, bro/tunnel, ej Trafikverket), var och en en ren funktion ctx → HTML. |
| `src/pm/report/blocks.js` | Delade byggstenar för mallarna. Varje rubrik och gräns bär sin källa; NätSims egna val märks som produktval. |
| `src/pm/report/kontroller.js` | Automatiska kontroller per nättyp, med status uppfyllt / ej uppfyllt / manuell och källa per rad. |
| `src/pm/report/simulering.js` | Simuleringsdelen av rapporten: GUM-terminologi (standardosäkerhet), utökad osäkerhet U = 2·u och jämförelse mot projektets krav. |

Rapport-menyn i toppraden bor i `src/ui/topbar.js` (menyn och dess regler för
när en post är inaktiv) och `index.html`.

### Lager och verktyg

| Modul | Innehåll |
|---|---|
| `src/ui/layer-panel.js` | Innehållet i Lager-menyn (flyttat från vänsterpanelen): beräkningslagren, de visuella lagren, punktnamn per lager, etiketten för aktivt lager. Menyns öppna/stäng/lås-beteende bor i `topbar.js`. |
| `src/ui/map-tools.js` | Verktygsraden på kartan: klick och kortkommandon (M, D, P, L, Y, C, O, S), Alt för tillfälligt avstängd snappning. Markeringen av valt verktyg sätts av `buildTools()` i `toolbar.js`. |
| `src/state/area-geometry.js` | Plangeometri för ytor: skosnöresformeln, omkrets, självkorsning, tyngdpunkt och formatering ("1 214 m² (plan)"). Rena funktioner. |
| `src/ui/area-card.js` | Egenskapskortet för en markerad yta: namn, area, omkrets, färg, mönster och *Blockerar sikt*; sedan polylinjerna också Dela in, Exportera och Offset. |
| `src/state/visual-selection.js` | Urvalsreglerna för Markera område: helt inuti / inuti eller korsade, Skift/Ctrl, antal per typ. Rena funktioner. |
| `src/map/select-area.js` | Verktyget Markera område: dragning, klick och rektangelns utseende, för mus och finger. |
| `src/ui/select-bar.js` | Åtgärdsraden för markerade objekt: flytta till lager, dölj/visa namn, zooma till, ta bort, och pekskärmens växlare. |
| `src/map/snap.js` | Snappning vid ritning: mål och prioritet, radie i skärmpixlar, inställningen och markören. |
| `src/map/pan-gestures.js` | Panorering i alla verktyg med mittenknappen och mellanslag + drag. |
| `src/ui/antal.js` | Böjning av antal i UI-texter. |

Ytor, markering och snappning bygger på den befintliga modellen i
`src/state/visual.js` (lager, punkter, linjer och nu ytor) och når
beräkningen bara via hinder som projiceras med `linkedObsId` och
`syncLinkedObstacles()`.

## Polylinjer, mätning, export, offset och cirklar

Arbetet rör inte `src/core/`. Visuella objekt når siktberäkningen bara via
hinder, genom den befintliga mekanismen (`syncLinkedObstacles()` i
`src/state/visual.js`). Den enda ändringen i hinderkoden är
`nextObstacleId()` i `src/state/obstacles.js`, för segmenthinder som läggs in
utan att ändra markeringen.

### Datamodellen (`src/state/visual.js`)

- **Polylinjer** i `visualLines`: `{ id, layerId, name?, vertices:[{ref,id}, …],
  closed, color, hideLabel?, linkedObsIds:[] }` – samma hörnmodell som ytorna.
  `core/visibility.js` läser två punkter per linjehinder, så polylinjen
  projiceras på ett linjehinder per segment (`linkedObsIds`, i ordning).
- **Cirklar** i `visualCircles`: `{ id, layerId, name?, center, radius, color,
  hideLabel? }`, där `center` är `{ref,id}` eller `{E,N}`. Lagras exakt; polygonen
  räknas med `visualCircleCoords()` enligt bågtoleransen.
- **Höjd**: `H: null` betyder saknad höjd för visuella punkter.
- **Laddning**: `_loadVisual()` sanerar, migrerar lager och – för filer utan
  `visualVer` (före polylinjerna) – slår ihop segment (`_mergeLegacyLines()`)
  och gör H = 0 till null. Projektfil och autosparning skriver `visualVer: 2`.
  `tests/fixtures/projekt-v060/` är ett projekt skapat med v0.6.0:s egen kod,
  med facit, och `tests/polylinjer-migrering.test.js` prövar migreringen mot det.

### Moduler

| Modul | Innehåll |
|---|---|
| `src/state/line-geometry.js` | Längd och riktning i plan (gon, medurs från norr), mätvärden S/ΔN/ΔE/ΔH och formatering. Rena funktioner. |
| `src/state/offset-geometry.js` | Offset av en polylinje: inre hörn skärs, yttre hörn med gering (högst 4 × avståndet, annars avfasning) eller bågar; kontroll av segment som vänder och av självkorsning. Rena funktioner. |
| `src/state/offset.js` | Offset av en linje eller yta som nya objekt i aktivt lager, med namn `<original> +2,000 H`. |
| `src/state/arc-tolerance.js` | Bågtoleransen 1/5/10 mm, sparad per användare; vinkelsteg och antal hörn för en cirkel. |
| `src/state/divide.js` | Dela in i punkter: lägen längs polylinje, sluten linje, yta och cirkel, och skapandet. |
| `src/io/write-geo.js` | Ren skrivare för SBG Object Text v2.01, verifierad mot Geo och GeoPad. Koordinatsystemets sträng, filnamn och nedladdning. |
| `src/io/export-visual-geo.js` | Urvalet (lager, markerade objekt, typer) som skrivarens modell; nätpunkternas fil. |
| `src/map/measure-tool.js` | Mätverktyget D: två punkter med snappning, höjdreglerna. |
| `src/map/offset-tool.js` | Verktyget O och förhandsvisningen av offset (också för korten). |
| `src/map/circle-tool.js` | Cirkelverktyget C: centrum, radie ur ett klick eller inskriven. |
| `src/ui/line-card.js` | Linjens egenskapskort: segmenttabell, längd, vägg, slut till yta, export, offset. |
| `src/ui/circle-card.js` | Cirkelns kort och verktygsruta. |
| `src/ui/measure-box.js`, `src/ui/offset-panel.js`, `src/ui/divide-dialog.js`, `src/ui/geo-export.js` | Rutorna och dialogerna för mätning, offset, indelning och export. |

Ritningen av polylinjer bor i `src/map/visual-drawing.js` (hörnen samlas i
minnet och sparas när linjen avslutas), rendering och träfftest i
`src/map/visual-canvas.js`, markering i `src/state/visual-selection.js` och
snappning i `src/map/snap.js`.
