# NätSim

Stomnätssimulator enligt SIS-TS 21143:2016, HMK – Stommätning 2024 och
TDOK 2014:0571 version 6.0.

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

Kraven följer av projektets mätklass och visas i dialogen. Alla utom σ_max är
läsvärden – σ_max är ett produktval och kan sättas per projekt:

| Storhet | Krav | Status | Källa |
|---|---|---|---|
| Minsta r-tal per observation | r **> 0,35** | **Hårt** – blockerar leverans | SIS-TS 21143:2016 §6.2.2 · TDOK 2014:0571 v6.0 §2.8 K3 |
| r-tal per observation | r ≥ 0,50 | **Mjukt** – räknas och rapporteras | HMK – Stommätning 2024 Bilaga F.2 |
| Största punktosäkerhet σ_pos (1σ efter utjämning) | G1 2 · G2 **3 mm** · G3 5 · G4 8 | Hårt | **Produktval**, konfigurerbart |
| Kontrollerbarhet k = f/n | k **> 0,50** | Hårt | SIS-TS 21143:2016 §6.2.2 · TDOK 2014:0571 v6.0 §2.8 K3 |
| MUF / YT | ≤ 4 × σ respektive ≤ 2 × σ | Redovisas, spärrar ej | SIS-TS 21143:2016 §6.2.2 |

**Gränserna är strikta.** TDOK 2014:0571 v6.0 §2.8 K3 lyder: *"Bruksnät i plan
ska utformas så att k-tal för nätet är större än 0,5 och enskilda mätningar
större än 0,35."* Samma ordalydelse i SIS-TS §6.2.2. Ett nät med k = 0,50 exakt
uppfyller alltså **inte** kravet, och en observation med r = 0,35 exakt gör det
inte heller. HMK:s nivå 0,50 för r-tal är en rekommendation, inte v6-kravet, och
jämförs därför med ≥.

Saknar projektet mätklass används G2:s krav, och dialogen säger att kravnivån
är antagen.

**r-kravet har två nivåer.** Det hårda kravet, r > 0,35, är gränsen vid och under
vilken en observation är så okontrollerad att ett grovt fel inte kan upptäckas
med normal data-snooping – felet går i stället rakt in i koordinaterna. Nät som
bryter mot det levereras inte. Det mjuka kravet, r ≥ 0,50, blockerar inte:
observationer däremellan tas med, men **räknas och redovisas efter varje
iteration i beslutsspårningen** så att de kan motiveras i planeringsrapporten.

Följden är att "Validera nät" kan ge **varningar** på ett optimerat nät
(varningsbandet är 0,35 < r_i < 0,50) men aldrig **fel**: valideringens felgräns
är samma normtal som det hårda kravet, `R_OBS_NORM` = 0,35. Antalet valideringen
varnar för är exakt det antal optimeringen redan har redovisat.

**σ_max är ett produktval, inte ett normcitat.** Det avser punktens
standardosäkerhet σ_pos (1σ) *efter utjämning* – en annan storhet än SIS-TS
Tabell A.9:s kolumn "spridning längd", som anger tillåten spridning mellan
dubbelmätta längder i fält och som kriteriet tidigare felaktigt hämtades ur.
Default för G2 är 3 mm, grundat på svensk praxis för bruksnät i plan. Värdet
kan sättas per projekt i optimeringsdialogen och sparas som
`optimizerConfig.sigma_max_mm`; tomt fält betyder mätklassens default.
Projektfiler utan fältet laddas med klassens default (3 mm för G2).

MUF och YT beräknas och redovisas men spärrar inte. Skälet är matematiskt: i
simuleringen är MUF_i = κ·σ_i/√r_i och YT_i = (1−r_i)·MUF_i med κ = 2,80, så
MUF ≤ 4σ svarar mot r_i ≥ 0,490 och YT ≤ 2σ mot r_i ≥ 0,497. Båda ligger över
det hårda kravet 0,35 – att grinda på dem skulle sätta det hårda kravet till
0,497 i praktiken och göra tvånivåmodellen verkningslös.

### Algoritmen

**Fas 1 – additiv.** Håller kriterierna inte, byggs en pool av alla möjliga
mätningar mellan befintliga punkter: från varje **uppställd** punkt till varje
annan punkt – både sträckor som aldrig mätts och ommätningar av befintliga
(se *Dubbelmätning* nedan). Varje kandidat simuleras, och den som ger högst
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
projektfilen som `optimizerConfig` tillsammans med `sigma_max_mm`.
Projektfiler utan sektionen laddas med 50/50 och mätklassens σ_max.

Varje beräkning går genom `computeSimulation()` – exakt samma kärna som den
vanliga simuleringen, ingen förenklad modell.

### Dubbelmätning

Ett nät där alla möjliga sträckor redan är mätta hade tidigare ingen väg framåt:
poolen uteslöt varje par som redan hade en mätning, så optimeringen avbröt med
"inga fler möjliga mätningar" även när kraven inte var uppfyllda. Att mäta om en
sträcka från oberoende uppställning är den enda åtgärd som höjer redundansen i
ett mättat nät, och den finns nu i poolen.

Reglerna:

- **Aldrig mätt sträcka** – kandidat så snart `from` är uppställd. Målet behöver
  inte vara uppställbart; en bakåtsikt mot en fixpunkt kräver inte att man
  ställer upp på fixpunkten.
- **Redan mätt sträcka** – kandidat bara om **båda** ändarna är uppställda. En
  verklig ommätning innebär att instrumentet flyttas till andra änden, och en
  bergdubb utan uppställningsmärke kan inte bära den.
- **Motriktad före upprepad** – finns sträckan bara som A→B föreslås B→A. Det är
  den fysikaliska innebörden av dubbelmätning i svenskt fältarbete. Finns båda
  riktningarna redan är en tredje observation den enda kvarvarande vägen och
  tillåts då.

Beslutsspårningen märker ut vad som föreslås och vad det gör med sträckan:

```
Iteration 1 (Fas 1): Lade till dubbelmätning A→N1 (ytterligare mätning av
sträckan A–N1). Störst förbättring av nätet: σ_pos-effekt +0.09 mm,
r-tal-effekt +0.021. Höjer r-tal för sträckan A–N1 från 0.43 till 0.63. …
```

**Vad som faktiskt händer med r-talen** är värt att känna till, eftersom de två
formerna av dubbelmätning inte är utbytbara. Mätt på facitnätet i testfall F20
(A och B kända, N1 ny):

| Åtgärd | r(A→B) | r(B→A) |
|---|---|---|
| Utgångsläge | 0,2237 | 0,2237 |
| En andra mätning **A→B** | **0,5630** | 0,2241 |
| En andra mätning **B→A** | 0,2241 | **0,5630** |

Två *identiska* observationer kontrollerar varandra fullt ut, så hela effekten
hamnar i den riktning som mäts om. Motriktningen rör sig knappt: den hänger på
den andra uppställningens orienteringsobekant, som den själv måste hjälpa till
att bestämma. Det betyder att den motriktade mätningen – den som Fix 3.3 låter
optimeringen välja först – ger *mindre* r-effekt än en upprepning, men motsvarar
en verklig oberoende uppställning i fält. Underlaget finns i
`docs/troubleshooting/dubbelmatning_arkitektur_20260902.md`.

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

## Visuella lager

Punkter och linjer enbart för dokumentation — vägkanter, ritningskontur,
planerade objekt. De ligger i egna state-fält (`visualPts`, `visualLines`,
`visualLayers`) helt skilda från `pts` och `meas`, och simuleringen läser dem
aldrig. De ritas med ihåliga cirklar och streckade linjer så att de inte
förväxlas med nätpunkter och mätningar.

Varje visuellt objekt tillhör ett **namngivet lager** med egen färg och
synlighet. Objektets egen färg vinner över lagrets; lagrets vinner över
standardfärgen. Ett dolt lager varken ritas eller går att träffa på kartan.
Lagren styrs i **LAGER**-sektionen i vänsterpanelen, som också visar raderna
*Nät* och *Hinder* under rubriken BERÄKNING — ögat där döljer dem bara på
kartan, beräkningen och siktlinjerna rör sig inte.

Projektfiler sparade före lagren laddas som förut; objekt utan lager samlas i
ett lager som heter **Handritat**.

### Rita

Två knappar i LAGER-sektionen, som ritar i det aktiva lagret:

- **○ Visuell punkt** — varje klick placerar en punkt.
- **⤺ Visuell linje** — klick efter klick kedjar ihop linjesegment.

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

## Import av ritningsunderlag

Båda importerna når man från **Data**-menyn i toppraden, och båda kan ångras
som en enda åtgärd.

### Punkter och linjer (.geo)

Läser SBG Object Text (Geo Professional). Utöver punktlistan läses nu även
`LineList`, där varje linje bär sina egna hörnkoordinater. Filens
koordinatsystem matchas mot alla tretton SWEREF 99-zonerna, och avviker det
från projektets erbjuds ett byte i dialogen.

I dialogen väljs:

- **Punkterna** till ett nytt visuellt lager (förval) eller till nätet. Går de
  till nätet väljs punkttyp uttryckligen, och vid ID-krock *Hoppa över*,
  *Uppdatera koordinater* eller *Byt namn* med suffix `_2`.
- **Linjerna**, oberoende av punktvalet: *Visuella linjer*, *Hinder* (väggar
  som blockerar sikt) eller *Hoppa över*. Hörnen dedupliceras på koordinat, så
  att en kontur blir en sammanhängande kedja i stället för lösa segment.

Dubbletter av punkt-ID slås aldrig ihop tyst — båda punkterna returneras med en
varning i dialogen.

### DXF (.dxf)

Endast ASCII-DXF; binär DXF avvisas med besked. Stödda objekt är `LINE`,
`LWPOLYLINE`, `POLYLINE`/`VERTEX` och `POINT`. Övriga typer räknas per lager
och hoppas över med varning. Bågsegment (bulge) ritas som raka linjer.

En DXF bär ingen information om koordinatsystem, och ofta inte heller om enhet
eller axelordning, så georefereringen är ett val i dialogen: enhet (ur
`$INSUNITS` när den finns), axelordning *X → E* eller *X → N*, och projektets
aktiva CRS. Dialogen räknar avståndet från ritningens utbredning till nätets
tyngdpunkt för **båda** axelordningarna och varnar om den valda är orimlig men
den andra rimlig. Av samma skäl blir en DXF alltid visuella lager, aldrig
nätpunkter.

## Toppmeny

- **Data** — import (.geo, .dxf, Excel/CSV, byggnader från OSM), export av
  nätpunkter (.geo), och projekthantering: Spara (Ctrl+S), Ladda, Excel-mall.
- **Visa** — kartinnehåll och punkttyper i två kolumner, samt symbolstorlek och
  felellipsskala.
- **Rapport** — alla dokument och exporter, i tre grupper:
  - *Dokument*: Mätningstekniskt PM…
  - *Simulering*: Simuleringsrapport (PDF och .txt), Beräkningsrapport (.txt),
    Granska resultat i studioläge
  - *Fältdokumentation*: Mätbok A4, Mätschema (.txt)

  Menyn ersatte högerpanelens RAPPORT-flik. Val vars förutsättning saknas visas
  inaktiva med skälet i `title` – "Kör simuleringen först", "Lägg till minst en
  mätning först" eller "Kräver bredare skärm (minst 768 px)" – i stället för att
  möta användaren med en dialogruta efter klicket. Rapportstudion nås via
  *Granska resultat i studioläge*.

## Mätningstekniskt PM

PM-modulen följer **TDOK 2014:0571 version 6.0** (fastställd 2026-06-17).
Verksamhet och nättyp väljs i guidens första steg och avgör vilken dokumenttyp
rapporten får:

| Verksamhet | Nättyp | Dokumenttyp | Källa |
|---|---|---|---|
| Väg | Bruksnät i plan | Redovisning av planerat stomnät | §2.5 K2 |
| Järnväg | Bruksnät i plan | Åtgärdsförslag | §2.5 K1 |
| Väg / Järnväg | Nät i plan för bro och broliknande konstruktion | Mätningsprogram | §1.7 K1 · §2.11.2 K6 |
| Väg / Järnväg | Nät i plan för tunnelbyggnad | Mätningsprogram | §1.7 K1 · §2.10.2 K1 |
| Ej Trafikverket | SIS-TS-nättyperna | Planering av stomnät | SIS-TS 21143:2016 Bilaga B kolumn P |

Varje rubrik, gränsvärde och automatisk kontroll i rapporten bär sin källa.
Avsnitt utan normstöd – som koordinatförteckningen i TDOK-mallarna och valet av
Bilaga B-struktur för uppdrag utanför Trafikverket – är märkta som information,
inte som krav.

Rapporten redovisar punktosäkerheter både som standardosäkerhet u (1σ) och som
utökad osäkerhet U = 2·u, med täckningsfaktor 2 enligt §1 K2. Vilken av dem
toleranskravet jämförs mot väljs i guiden och skrivs ut i rapporten.

En kontrolltabell per nättyp prövar de krav som går att pröva automatiskt
(k-tal, r-tal, punktantal, byggnadsverkets läge, viktsättning mot Tabell 3) och
säger uttryckligen när ett svar bygger enbart på en angivelse i formuläret eller
måste kontrolleras manuellt.

NätSim simulerar terrestra nät **i plan**. Anslutningsnät (§2.6, GNSS/VRS) och
nät i höjd (§2.7, §2.9, §2.10.3, §2.11.3) erbjuds därför inte som nättyper för
Trafikverksuppdrag.

## Struktur

Se `STRUCTURE.md` för modul-layout och designprinciper.

## Migration

Detta projekt migreras från en monolitisk HTML-fil. Se `MIGRATION_GUIDE.md`.
