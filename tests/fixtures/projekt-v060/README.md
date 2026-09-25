# Projekt sparat med v0.6.0

`projekt.json`, `autosave.json` och `facit.json` är skapade med v0.6.0:s egen
kod (worktree på `main`, 98d5e2b) av `skapa-fixtur.v060.js`: kopiera skriptet
till `tests/` i en worktree på v0.6.0 och kör det med vitest. Facit innehåller
simuleringsresultat, sikt, hinder, ritade segment, etiketter och lägen per
lager. `tests/polylinjer-migrering.test.js` laddar filerna med dagens kod och
jämför mot facit.
