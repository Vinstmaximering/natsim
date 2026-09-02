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

## Optimera nät

Knappen **🧮 Optimera nät** i fliken **MÄTNINGAR** föreslår en optimal
mätningsuppsättning för nätets geometri: den lägger till de mätningar som
behövs för att projektets acceptanskriterier ska hållas, och tar bort de som
inte längre behövs.

### Metod och referenser

Området heter *second-order design* (SOD) i den geodetiska litteraturen och
handlar om att välja mätningskonfiguration till en GIVEN punktgeometri.
NätSim använder **greedy iterative optimization**, den etablerade numeriska
ansatsen i produktionsprogram:

- Cross, P. A. (1994) *Advanced Least Squares Applied to Position-Fixing*,
  University of East London, Working Paper No. 6.
- Kuang, S. (1996) *Geodetic Network Analysis and Optimal Design: Concepts and
  Applications*, Ann Arbor Press.

Analytiska SOD-lösningar (vikttilldelning via pseudoinvers) ger negativa vikter
som saknar fysikalisk tolkning – en observation kan inte utföras "minus en
gång". Den giriga sökningen ger alltid en utförbar mätplan, är reproducerbar
och kan motiveras rad för rad i beslutsloggen. Det är den egenskapen som gör
metoden användbar i planeringsrapporter enligt SIS-TS 21143:2016 §6.2.5 och vid
granskning enligt TDOK 2014:0571.

### Acceptanskriterier

Kriterierna ställs inte in i dialogen – de FÖLJER av projektets mätklass och
visas där som läsvärden:

| Storhet | Krav | Källa |
|---|---|---|
| Minsta r-tal per observation | r ≥ 0,50 | `R_OBS_GOD` – samma nivå som nätvalideringen kallar godkänd |
| Största punktosäkerhet σ_pos (1σ) | G1 2 mm · G2 3 mm · G3 5 mm · G4 8 mm | SIS-TS 21143:2016 Tabell A.9, spridning längd |
| Kontrollerbarhet k = f/n | k ≥ 0,50 | SIS-TS 21143:2016 §6.2.2 |
| MUF / YT | ≤ 4 × σ respektive ≤ 2 × σ | SIS-TS 21143:2016 §6.2.2 |

Saknar projektet mätklass används G2:s krav, och dialogen säger att kravnivån
är antagen.

**r-kravet ligger på 0,50, inte på felgränsen 0,30.** Fas 2 bantar per
konstruktion tills kriterierna precis håller. Med kravet på 0,30 hamnade därför
huvuddelen av observationerna i valideringens varningsband 0,30 ≤ r_i < 0,50 –
produkten varnade alltså för sitt eget optimeringsresultat. Trösklarna
`R_OBS_GOLV` (0,30, felgräns) och `R_OBS_GOD` (0,50, godkänd nivå) bor i
`src/core/constants.js` och används av både optimeringen och
`validateNetwork()`, så de kan inte divergera igen.

MUF och YT prövas också, men de kan aldrig binda hårdare än r-kravet: i
simuleringen är MUF_i = κ·σ_i/√r_i och YT_i = (1−r_i)·MUF_i med κ = 2,80, så
MUF ≤ 4σ svarar mot r_i ≥ 0,490 och YT ≤ 2σ mot r_i ≥ 0,497. Vid r_i ≥ 0,50
gäller alltså MUF ≤ 3,96σ och YT ≤ 1,98σ automatiskt.

### Algoritmen

**Fas 1 – additiv.** Håller kriterierna inte, byggs en pool av alla möjliga
mätningar mellan befintliga punkter: från varje **uppställd** punkt till varje
annan punkt som inte redan mäts. Varje kandidat simuleras, och den som ger högst
poäng läggs till permanent. Sedan räknas allt om. Taket är 50 tillägg.

*Uppställd punkt* betyder här "förekommer som `from` i minst en riktnings-
observation" – samma definition som utjämningskärnan använder när den delar ut
orienteringsobekanta. Punkttypen (`known`, `new`, `station`) styr alltså inte
vad optimeringen får föreslå: den säger inget om huruvida instrumentet stått på
punkten i fält, medan mätningarna gör det. Nät som importerats från Excel eller
extern datakälla har normalt inga `station`-typade punkter alls.

**Fas 2 – subtraktiv.** När kriterierna håller prövas varje aktiv mätning genom
att simulera att den tas bort. Mätningarna sorteras efter minst bidrag, och den
som bidrar minst tas bort – men bara om alla kriterier fortfarande håller efter
borttagningen. Annars prövas nästa. När ingen mätning längre kan tas bort är
det optimerade nätet hittat. Faserna delar ett tak på 200 iterationer.

Poängformeln är densamma i båda faserna:

```
poäng = w_σ · Δσ_pos/σ_max  +  w_r · Δr_min/r_min
```

Båda leden relativiseras mot kravnivån så att millimeter och dimensionslösa
r-tal blir jämförbara – annars skulle 50/50 betyda olika saker i ett
millimeternät och ett centimeternät. I Fas 2 kastas argumenten om, så att
poängen blir mätningens *bidrag*: hur mycket sämre nätet blir utan den.
Vikterna ställs med reglaget i dialogen (default 50/50) och sparas i
projektfilen som `optimizerConfig`. Projektfiler utan sektionen laddas med
50/50.

Varje beräkning går genom `computeSimulation()` – exakt samma kärna som den
vanliga simuleringen, ingen förenklad modell.

### Maxavstånd och hinder

Maxavståndet från fliken NÄT/INSTRUMENT (`maxSuggestDist`) är en **hård
gräns**: en mätning längre än så föreslås aldrig, även om den skulle förbättra
nätet. Gränsen finns för att utesluta fysikaliskt omöjliga sikten, exempelvis
genom en tunnelvägg. Siktlinjer som skärs av ett hinder utesluts på samma sätt.
Kan kriterierna inte nås inom gränserna avbryts optimeringen med ett
felmeddelande som säger vilka krav som brister och föreslår åtgärder – till
exempel att höja maxavståndet eller lägga till fler anslutningspunkter. Nätet
lämnas då orört.

### Resultatet: tre utgångar

Dialogen visar en beslutsspårningslogg med varje operation i ordning:

```
Iteration 1 (Fas 2): Tog bort mätning S2→FP2. Bidrog minst till nätet:
σ_pos-effekt +0.14 mm, r-tal-effekt -0.022. Alla kriterier hålls fortfarande.
```

- **Tillämpa** – ändrar nätet direkt. Går bara att ta tillbaka med ↩ Ångra.
- **Behåll som förslag** – lägger det optimerade nätet i ett eget visningslager.
  Fliken MÄTNINGAR får då en växlare mellan *Original* och *Optimerat förslag*
  med en jämförelsetabell (minsta r-tal, största σ_pos, k, MUF, YT). I kartan
  ritas tillagda mätningar lila och borttagna som blek röd streckad linje, och
  felellipserna hör till den vy som visas. Även kvalitetspanelen och *Validera
  nät* följer växlaren – de beskriver alltid det nät du tittar på, och
  valideringen säger uttryckligen när den avser förslaget. Nätet i projektet är
  orört tills du trycker *Tillämpa förslag*.
- **Avbryt** – stänger utan att ändra något.

Förslaget lever bara i sessionen och sparas inte i projektfilen: ett förslag är
inte ett projekttillstånd.

### Prestanda

Optimeringen räknar om Q_xx efter varje operation: O(n·u²) för normalmatrisen
plus O(u³) för inversen, gånger antalet kandidater. Körtiden styrs därför av
**antalet mätningar**, inte antalet punkter — 8 punkter/28 mätningar tar 0,15 s
medan 16 punkter/120 mätningar tar 6,9 s.

Från **50 mätningar** flyttas körningen till en Web Worker
(`src/core/optimizer.worker.js`) så att UI:t inte fryser; misslyckas workern
körs samma generator på huvudtråden i tidsskivor. Mindre nät körs direkt i
webbläsaren. Progress visas i dialogen i båda fallen.

## Visuellt lager

Punkter och linjer som ritas för hand enbart för dokumentation — vägkanter,
ritningskontur, planerade objekt. De ligger i egna state-fält (`visualPts`,
`visualLines`) helt skilda från `pts` och `meas`, och simuleringen läser dem
aldrig. De ritas med ihåliga cirklar och streckade linjer så att de inte
förväxlas med nätpunkter och mätningar, och kan döljas med **Visuella objekt**
i VISA-listan.

### Rita

Två knappar i verktygsfältet:

- **○ Rita visuell punkt** — varje klick placerar en punkt.
- **⤺ Rita visuell linje** — klick efter klick kedjar ihop linjesegment.

Båda lägena står kvar tills du avslutar med **Escape** eller **högerklick**. I
linjeläget bryter det första högerklicket kedjan, det andra lämnar läget.

Ritningen snappar mot både befintliga visuella punkter och vanliga NätSim-punkter
(grön ring). Snappar en ändpunkt mot en nätpunkt fästs linjen i den: flyttas
nätpunkten följer linjen med. Dubbelklick på ett visuellt objekt öppnar
redigeringsdialogen med färgval, och för punkter även E/N/H.

### Kontextmeny och koppling till hinder

Högerklick på ett visuellt objekt ger en meny med *Redigera* och *Ta bort*. För
linjer tillkommer **Använd som vägg** och **Använd som blockeringslinje**, som
skapar ett riktigt hinder i hinder-systemet — det blockerar alltså sikt i
mätförslag och validering på samma sätt som en handritad vägg. De två skiljer
sig bara i namn och färg; siktlinjeberäkningen behandlar dem lika.

Hindret är en **projektion** av den visuella linjen, inte en kopia: dess
koordinater räknas om ur linjen vid varje ändring via `syncLinkedObstacles()`.
Ändrar du linjen följer väggen med. Tas linjen bort försvinner väggen med den,
och raderas hindret separat nollställs linjens koppling. *Koppla loss från
hindret* i menyn bryter bandet och lämnar hindret fristående.

### Export

PXY-export av visuella punkter är inte implementerad ännu — den väntar på en
exempelfil från SBG Geo för att formatet ska bli rätt.

## Struktur

Se `STRUCTURE.md` för modul-layout och designprinciper.

## Migration

Detta projekt migreras från en monolitisk HTML-fil. Se `MIGRATION_GUIDE.md`.
