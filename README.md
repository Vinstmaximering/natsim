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

## Inställningar i UI:t

### Maxavstånd för föreslagna mätningar

Funktionen "Analysera och föreslå mätningar" genererar bara förslag mellan
punkter som ligger inom ett maxavstånd som skrivs in fritt i meter. Standard är
**500 m**. Tomt fält – eller ∞-knappen – betyder obegränsat. Långa par filtreras
bort helt och räknas alltså varken som förslag eller som blockerade av hinder.

Kontrollen finns på två ställen och styr samma inställning (`maxSuggestDist`):

- fliken **NÄT** → *Föreslå mätningar*
- fliken **INSTRUMENT** → *Maxavstånd föreslagna mätningar*

Förslagen räknas om direkt när värdet ändras, i båda riktningarna: en höjning
lägger till förslag, en sänkning tar bort de som hamnar utanför tröskeln.

Inställningen sparas i projektfilen. Projektfiler skapade före funktionen
saknar fältet och laddas med 500 m.

### Färg på väggar och byggnader

Varje hinder kan ges en egen färg för att skilja strukturtyper åt (bergvägg,
betongvägg, planerad struktur och så vidare). Öppna dialogen med **✎** på raden
i fliken **HINDER**; där sätts även hindrets namn.

Dialogen har sex förval — Standard, Bergvägg, Betongvägg, Byggnad, Planerad
struktur, Övrigt. **✕** återställer till standardfärgen.

Färgen sparas per hinder-objekt (`obstacles[].color`) i projektfilen och slår
igenom både i kartan och i nätbilden i rapporterna. Hinder utan färg — inklusive
alla i projektfiler skapade före funktionen — ritas med den tidigare
standardfärgen.

### Rensa blockerade mätningar

Fliken **MÄTNINGAR** har en knapp som tar bort alla mätningar vars siktlinje
skärs av ett hinder. Knappen visar antalet innan bekräftelse — "Ta bort 14
blockerade mätningar" — och kräver ett OK i dialogen. Borttagningen läggs på
ångra-stacken.

Finns inget att rensa är knappen inaktiverad med en förklaring till varför:
inga hinder utplacerade, inga mätningar att kontrollera, eller att allt har
fri sikt.

Underlaget kommer från `findBlockedMeasurements()` i `src/core/visibility.js`,
som också används av kvalitetspanelens sikt-räknare och nätvalideringen — de tre
kan därmed inte räkna olika. Mätningar vars punkter saknas hoppas över och
rensas alltså inte bort som blockerade.

## Struktur

Se `STRUCTURE.md` för modul-layout och designprinciper.

## Migration

Detta projekt migreras från en monolitisk HTML-fil. Se `MIGRATION_GUIDE.md`.
