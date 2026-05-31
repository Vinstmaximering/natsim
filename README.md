# NätSim

Stomnätssimulator enligt SIS-TS 21143:2016 och HMK Stommätning 2024.

Beräknar punkt­osäkerheter, felellipser, redundanstal, MUF och YT för geodetiska
nät innan mätning utförs. Genererar mätningstekniskt PM och simuleringsrapporter.

## Snabbstart

```bash
npm install        # första gången
npm run dev        # starta utvecklingsserver
npm test           # kör beräkningstester
npm run build      # bygg för produktion
```

## Beräkningsstandarder

| Storhet | Formel | Källa |
|---|---|---|
| Centreringsfel | `√(e_from² + e_to²)` | HMK |
| Kontrollerbarhet | `k = f / n` | HMK F.2 |
| Redundans | `Σ r_i = f = n − u` | HMK F.9 |
| Baarda κ | `2.80` (α=0.05, β=0.80) | HMK F.16 |
| MUF | `κ · σ / √r_i` | HMK F.13 |
| YT | `(1 − r_i) · MUF` | HMK F.14 |
| σ_pos | `√((Q_EE + Q_NN) / 2)` | Geo Professional |

Alla formler är numeriskt verifierade mot NumPy-referens, se `tests/calc.test.js`.

## Struktur

Se `STRUCTURE.md` för modul-layout och designprinciper.

## Migration

Detta projekt migreras från en monolitisk HTML-fil. Se `MIGRATION_GUIDE.md`.
