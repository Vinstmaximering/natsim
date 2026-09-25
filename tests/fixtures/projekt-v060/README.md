# Projekt sparat med v0.6.0

`projekt.json`, `autosave.json` och `facit.json` är skapade med v0.6.0:s egen
kod (worktree på `main`, 98d5e2b) av `skapa-fixtur.v060.js`: kopiera skriptet
till `tests/` i en worktree på v0.6.0, kör det med vitest och kopiera de tre
filerna från worktreens `tests/fixtures/projekt-v060/` hit. Facit innehåller
simuleringsresultat, sikt, hinder, ritade segment, etiketter och lägen per
lager. `tests/polylinjer-migrering.test.js` laddar filerna med dagens kod och
jämför mot facit.

Allt innehåll är påhittat: nätet, de handritade objekten och DXF-ritningen
ligger på lokala koordinater (E 0–1 210, N −50–400), och de tre .geo-filerna
byggs av skriptet självt med jämna koordinater kring E 150 000, N 6 600 000
(E 150 000–150 120, N 6 600 000–6 600 040). Punkt- och lagernamnen (FP1, T1,
01, test_vaggar, Kant …) är testnamn. mapCenter är appens förval.
