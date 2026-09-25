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

Punkter, linjer, ytor och cirklar enbart för dokumentation: vägkanter,
ritningskontur, planerade objekt, byggnadsverk. De ligger i egna state-fält
(`visualPts`, `visualLines`, `visualAreas`, `visualCircles`, `visualLayers`)
helt skilda från `pts` och `meas`, och simuleringen läser dem aldrig. Den enda vägen in i beräkningen är
ett hinder som projiceras ur en linje eller yta (se *Koppling till hinder*).
Visuella objekt ritas med ihåliga cirklar och streckade linjer så att de inte
förväxlas med nätpunkter och mätningar.

Varje visuellt objekt tillhör ett **namngivet lager** med egen färg och
synlighet. Objektets egen färg vinner över lagrets; lagrets vinner över
standardfärgen. Ett dolt lager varken ritas, går att träffa, snappar eller
markeras.

Projektfiler sparade före lagren laddas som förut; objekt utan lager samlas i
ett lager som heter **Handritat**.

### Lager-menyn

**Lager ▾** i toppraden (efter Rapport) ersatte vänsterpanelens LAGER-sektion.

- **BERÄKNING**: *Nät* och *Hinder*, med öga och grön bock. Ögat döljer dem bara
  på kartan; beräkningen och siktlinjerna rör sig inte.
- **VISUELLA · INGÅR EJ I BERÄKNING**: en rad per lager med öga, färgruta, namn,
  antal (punkter · linjer · ytor, och cirklar när det finns några; hörn räknas
  inte som punkter), knappen **Aa** och ⋮-menyn (byt namn, byt färg, *Namn på
  punkter och ytor*, gör aktivt, zooma till, *Exportera lager (.geo)*, radera). Klick på raden gör lagret aktivt.
- **+ Nytt visuellt lager** och **Importera till lager…** (öppnar .geo- eller
  .dxf-dialogen efter filändelse).

**Nålen** i menyhuvudet låser menyn öppen. En låst meny har en accentfärgad kant
och stängs inte av klick utanför eller Escape. Andra menyer går att öppna
bredvid den. Nålen igen gör den till en vanlig öppen meny; **×** stänger den och
släpper låset. Låset sparas per användare i webbläsaren, inte i projektet, och
används inte på telefon (under 768 px).

**Etiketten för aktivt lager** står direkt till höger om menyknappen
("aktivt · Utsättning_bro" med lagrets färg, eller "inget aktivt lager") och
öppnar menyn. På telefon visar den bara färgrutan.

**Punktnamn per lager.** *Aa* på lagerraden tänder namnen på hörn i linjer och
ytor (`vertexLabels`, förval av – en importerad kontur med hundratals "01"/"02"
är oläsbar). ⋮ → *Namn på punkter och ytor* styr fria punkters namn och ytornas
namn och area (`labels`, förval på). Båda sparas i projektet; äldre lager laddas
med `labels = true`, `vertexLabels = false`, alltså som de ritades förut.
**Visa → Etiketter (nätpunkter)** gäller bara nätets punkter och är oberoende av
lagrens val.

### Verktygsraden på kartan

Uppe till höger i kartytan, bara symboler; varje knapp har `title` och
`aria-label` med kortkommandot.

| Knapp | Tangent | |
|---|---|---|
| Markera område | **M** | se *Markera område* |
| Mät avstånd | **D** | se *Mätverktyget* |
| Visuell punkt | **P** | varje klick placerar en punkt (ett ångra-steg per punkt) |
| Visuell linje | **L** | se *Polylinjer* |
| Yta | **Y** | se *Ytor* |
| Cirkel | **C** | se *Cirklar* |
| Offset | **O** | se *Offset* |
| Snappning av/på | **S** | se *Snappning* |

Valt verktyg markeras. Samma verktyg igen, med knapp eller tangent, återgår till
Panorera. Tangenterna gäller utan Ctrl/Alt/Cmd/Skift och inte i fält, dialoger,
studioläget eller koordinatlistan. Hjälptexten för aktivt verktyg står direkt
under raden. Kartans överkant är en flexrad: kartkontrollerna (CRS, kartlager,
Hem, Koordinatlista) står till vänster och bryter rad när kartan är smal; zoom-
etiketten och nordpilen har egen plats längst till höger.

Ritlägena står kvar tills du lämnar dem med **Escape** eller **högerklick**.
**Backspace** – på pekskärm **↶ Hörn** i den mobila raden – tar bort senaste
hörnet i en linje eller yta under ritning; ingenting sparas förrän objektet är
klart, så snappade punkter och nätpunkter rörs aldrig. Allt ritas i det aktiva
lagret. Dubbelklick på ett visuellt objekt öppnar dess dialog (för linjer, ytor
och cirklar egenskapskortet).

På telefon döljs raden och verktygen ligger sist i den mobila verktygsraden, som
rullar i sidled.

### Panorering i alla verktyg

**Mittenknappen + drag** panorerar alltid. **Mellanslag + drag** panorerar
tillfälligt, till exempel när Markera område är valt och ett vänsterdrag annars
ritar en rektangel. Mellanslag gäller inte när fokus är i ett fält, en lista
eller en vanlig knapp. På pekskärm panorerar och zoomar två fingrar.

### Polylinjer

En visuell linje är en **polylinje**: hörn i ordning, öppen eller sluten
(`closed`), med samma hörnmodell som ytorna (`{ref:'visual'|'net', id}`).

**Rita** med **L**: klicka hörnen. **Dubbelklick**, **Enter**, högerklick eller
klick på **sista hörnet igen** avslutar linjen – ett dubbelklick ger aldrig ett
extra hörn. Klick på **första hörnet** (minst tre hörn) sluter linjen; den blir
en sluten linje, inte en yta. **Escape** kastar en påbörjad linje, nästa Escape
lämnar verktyget. Byte av verktyg avbryter. En färdig linje är ett ångra-steg,
och dess nya hörn får `role:'vertex'` (namnen styrs av lagrets *Aa*). På
pekskärm avslutar **✓ Klar** i den mobila raden, eller ett tryck på sista
hörnet (22 px).

**Markering, snappning och radering** gäller hela polylinjen: ett klick på
ett segment markerar linjen, snappning mot linje tar närmaste segment. Tas en
nätpunkt eller fri punkt bort som är mitthörn tappar linjen hörnet och sluter
gapet; under två hörn tas linjen bort, och en sluten linje med två hörn kvar
blir öppen. Bekräftelsen säger vilka linjer som ändras och vilka som
försvinner.

**Egenskapskortet** (samma plats som ytans) visas när linjen markeras: namn,
lager, antal hörn, öppen/sluten, **total längd (plan)** och en tabell per
segment – `FP1–2`, längd (plan) och riktning (plan). Hörnen heter som punkten
när den har ett namn, annars efter löpnummer. Knappar: *Dela in i punkter…*,
*Exportera (.geo)*, *Använd som vägg / Koppla loss hindren*, *Slut linjen →
yta* (en yta med samma hörn ersätter linjen, ett ångra-steg), *Ta bort*, och
delen *⇉ Offset*.

**Segmentlängder** ritas längs den markerade linjen, alltid läsbara oavsett
riktning. Bara för den markerade linjen, så att kartan inte fylls; *Dölj namn*
döljer också längderna.

Längder, riktningar och areor räknas i koordinatsystemets **projektionsplan**
och märks "(plan)". Riktning i gon, medurs från norr, fyra decimaler; längder
i meter med tre decimaler.

### Mätverktyget

**D**, klicka två punkter (med snappning). Rutan nere i mitten visar **S
(plan)**, **riktning (plan)**, **ΔN**, **ΔE** och **ΔH**. Punkterna visas med
namn när snappningen träffat en punkt; ett hörn utan eget namn visas som
"hörn 3 i Kantbalk N". Nytt klick, **Escape** eller högerklick börjar om;
Escape utan påbörjad mätning lämnar verktyget. Ingenting sparas.

### Höjder

En visuell punkt utan höjd har **H = null**. En nätpunkt med **H = 0** räknas
som att den saknar höjd (så har nätets punkter alltid lagrats). ΔH i
mätverktyget visas bara när båda punkterna har höjd, annars "–". I .geo-exporten
skrivs saknad höjd som ett tomt fält. Projekt sparade före polylinjerna hade 0
för "ingen höjd" på visuella punkter; de får null när projektet laddas.
Nätpunkternas höjder ändras inte.

### Offset

Parallella linjer på ett givet avstånd. Två vägar: verktyget **O** (klicka en
linje eller yta – eller markera den och tryck O – ange avstånd, sida och hörn i
rutan, **Enter** eller *Skapa*), eller delen *⇉ Offset* i linjens och ytans
kort. Förhandsvisningen är streckad och följer värdet.

- **Sida**: höger, vänster eller båda – höger om linjens riktning från första
  till sista hörnet. Sluten linje och yta: utåt, inåt eller båda.
- **Hörn**: *skarpa* förlänger kanterna till skärningen. Vid spetsiga vinklar
  begränsas förlängningen till **4 × avståndet** – spetsigare än 28,96° mellan
  kanterna fasas hörnet av med två punkter. *Rundade* ger bågar enligt
  bågtoleransen.
- Om offsetlinjen **korsar sig själv**, eller avståndet är större än en krök
  eller ett kort segment rymmer på insidan, ritas förhandsvisningen **röd**,
  rutan säger varför, och **ingenting skapas**.
- Resultatet är en ny polylinje (en ny yta för en yta) i **aktivt lager** med
  egna hörn, lagrets färg och namnet **`<original> +2,000 H`** (V, ut, in). Den
  är inte kopplad till originalet. Ett ångra-steg.

### Cirklar

**C**: klicka **centrum** (med snappning), sedan en **punkt på cirkeln**, eller
skriv **radien** i rutan och tryck Enter. Rutan visar omkrets och antal hörn.
Cirkeln lagras exakt – centrum och radie – och ritas och exporteras som en
polygon enligt bågtoleransen. Ett centrum som snappat mot en nätpunkt eller
visuell punkt följer punkten; tas punkten bort stannar cirkeln kvar där den var.

**Egenskapskortet**: namn, lager, centrum, radie (går att ändra), omkrets
(plan), antal hörn med vald tolerans, *Dela in i punkter…*, *Exportera (.geo)*,
*Gör om till polylinje* och *Ta bort*.

**Vägg och offset för en cirkel** görs genom att först göra om den till
polylinje (en sluten linje med cirkelns hörn); sedan finns *Använd som vägg*
och *⇉ Offset* i linjens kort.

### Dela in i punkter

Från linjens, ytans och cirkelns kort. Välj **antal punkter** eller **fast
avstånd** längs linjen, **startvinkel** i gon för en cirkel (från centrum,
medurs från norr), för en öppen linje om **start- och slutpunkt** ska tas med,
och ett **namnprefix** (P1–P8). Dialogen visar den faktiska delningen innan du
skapar – i meter, för en cirkel också i gon, och resten vid fast avstånd.
Punkterna blir fria punkter i aktivt lager (inte hörn), ett ångra-steg. På en
sluten linje, yta och cirkel går punkterna runt från starten, och start och
slut är samma punkt.

### Bågtolerans

En gemensam inställning för hur tätt bågar delas i hörn: kordan mellan två hörn
avviker högst toleransen från den verkliga bågen. **1 mm** är förval; **5** och
**10 mm** går att välja i offsetrutan, cirkelrutan och cirkelns kort, och valet
sparas per användare. Toleransen styr **rundade offsethörn** och **cirklar** –
hur de ritas, hur många hörn en cirkel får när den görs om till polylinje, och
hur de exporteras. Antalet hörn växer ungefär som √(radie / tolerans): en
cirkel med radien 500 m får 1 571 hörn vid 1 mm, 703 vid 5 mm och 497 vid
10 mm. För stora cirklar och stora offsetavstånd ger **5–10 mm betydligt färre
hörn**.

### Ytor

Ritas med **Y**: klicka hörn; **dubbelklick** eller klick på **första hörnet**
sluter ytan (minst tre hörn; med finger är träffytan 22 px). **Backspace**
(**↶ Hörn** på pekskärm) tar bort senaste hörnet, **Escape** eller högerklick kastar en påbörjad yta. En yta
sparas först när den sluts, som ett ångra-steg.

Hörnen följer samma modell som linjernas ändpunkter: `{ref:'visual'|'net', id}`.
Ett hörn som snappar mot en nätpunkt fäster i den och följer med när punkten
flyttas eller byter namn.

**Area och omkrets räknas i plan**, i koordinatsystemets projektionsplan, med
skosnöresformeln – "1 214 m² (plan)", "142,35 m (plan)". En **självkorsande**
yta varnas för och visar ingen area.

**Egenskapskortet** visas när en yta är markerad (klick i Panorera): lager,
namn, area, omkrets, antal hörn, fyllnadsfärg och opacitet, mönster (inget,
snedstreck, rutnät) och **Blockerar sikt (hinder)**. Varje ändring är ett
ångra-steg. Namn och area visas i ytans tyngdpunkt när lagrets *Namn på punkter
och ytor* är på.

Tas en nätpunkt bort som är hörn i en yta tappar ytan hörnet; har den färre än
tre kvar tas den bort. Bekräftelsen säger vilka ytor och linjer som påverkas
och vilka som försvinner helt.

### Markera område

**M**, sedan dra en rektangel:

- **vänster → höger** markerar det som ligger **helt inuti** (streckad i
  accentfärg),
- **höger → vänster** markerar det som ligger **inuti eller korsas** (tätt
  streckad i grönt).

Klick utan drag markerar ett objekt (klick på ett hörn markerar dess linje eller
yta). **Skift** lägger till, **Ctrl/Cmd** tar bort, **Escape** avmarkerar.
Markerbart är visuella punkter, linjer och ytor i tända lager; hörn markeras med
sin linje eller yta, och nätpunkter, mätningar och hinder markeras inte.

**Åtgärdsraden** nere på kartan: "3 objekt markerade · 1 pkt · 1 linj. · 1 yta",
**Flytta till lager ▾** (objektens egna hörn följer med), **Dölj namn / Visa
namn**, **Zooma till**, **Ta bort** (med bekräftelse) och **× Avmarkera**. Varje
åtgärd är ett ångra-steg. Linjehörn som är nätpunkter tas aldrig bort.

På pekskärm ritar **ett finger** rektangeln och **två fingrar** zoomar och
flyttar kartan; ett tryck markerar ett objekt. I stället för Skift och Ctrl
finns växlaren **Ny / Lägg till / Dra ifrån** i åtgärdsraden.

### Snappning

Gäller när du ritar visuell punkt, linje och yta – inte när du drar i något.

- **Mål**: nätpunkter, visuella punkter, hörn i linjer och ytor, och därefter
  närmaste punkt på en linje eller ytkant. En punkt vinner alltid över en linje;
  bland punkter vinner den närmaste, och ligger en nätpunkt och en visuell punkt
  inom 1 px från varandra vinner nätpunkten.
- **Radien** är i skärmpixlar – 10 px med mus, 22 px med finger – så att den
  känns likadan på alla zoomnivåer.
- Snapp mot en **nätpunkt ger `ref:'net'`**: linjen eller ytan fäster i nätet.
  Snapp mot en linje lägger den nya punkten exakt på linjen.
- **Markören** är en grön ring (punkt) eller romb (linje/kant) med en kort text,
  t.ex. "hörn U101", "nätpunkt FP1", "på linje VL3". På pekskärm, där det inte
  finns någon hovring, visas målet en kort stund efter trycket.
- **S** eller knappen slår av och på (förval på, sparas per användare). **Alt**
  nedtryckt stänger av tillfälligt; medan ett ritverktyg är valt stoppas Alt så
  att webbläsarens meny inte tar fokus.

### Koppling till hinder

Högerklick på en visuell linje ger **Använd som vägg** och **Använd som
blockeringslinje** (också i linjens kort); för en yta finns **Blockerar sikt
(hinder)** i kortet och i högerklicksmenyn. Alla skapar riktiga hinder i
hinder-systemet – en linje blir väggar, en yta ett byggnadshinder (polygon).

Siktberäkningen i `src/core/` läser två punkter per linjehinder, så en polylinje
blir **ett linjehinder per segment** (`linkedObsIds`, etiketten "Vägg (VL3)
2/5"). Ändras antalet segment läggs hinder till eller tas bort; raderas ett av
dem i hinder-panelen kopplas linjen loss och de övriga tas bort. Ett byggnadshinder blockerar
även sikter **från punkter inuti ytan**, vilket en vägg längs kanterna inte gör.

Hindret är en **projektion**, inte en kopia: dess koordinater räknas om ur
linjen eller ytan vid varje ändring via `syncLinkedObstacles()`. Tas källan bort
försvinner hindret med den, och raderas hindret separat nollställs kopplingen
(för en yta slocknar *Blockerar sikt*). Ett klick på en ytas hinder markerar
ytan. Ingenting av detta rör `src/core/`.

Autosparningen tar med hindren, så att kopplingarna överlever en omladdning.
Blir webbläsarens lagring full meddelas det i statusfältet.

### Export till .geo

SBG Object Text v2.01, samma format som Geo skriver, via `src/io/write-geo.js`.
Tre vägar: **Exportera (.geo)** i linjens, ytans och cirkelns kort (det
objektet), lagrets ⋮-meny (**Exportera lager**) och **Data → Visuella lager
(.geo)…**, där man väljer lager eller *endast markerade objekt* och vad som tas
med (punkter, linjer, ytor, cirklar).

- UTF-8 utan BOM, CRLF, tabbar, `PointList ` / `LineList ` / `AttributeList `
  med blanksteg; en tom lista skrivs utan begin/end.
- Punkter: `Point "id",N,E,H,,,` med fyra decimaler; saknad höjd är ett tomt
  fält. Fria punkter hamnar i `PointList` med sitt namn (annars id).
- Linjer: `Line "namn",,,` med egna hörn 01, 02, … En **sluten linje, en yta
  och en cirkel** skrivs med **första hörnet upprepat sist** med nästa löpnummer
  (01–05 i en fyrhörning, 05 = 01) och tomt flaggfält – som Geo Professional
  2026 gör.
- Koordinatsystem `Sweref 99 <zon> / RH2000 (SWEN17)`. Strängen är provad mot
  Geo för zonerna 15 45 och 20 15; för TM och övriga zoner skrivs samma mönster
  med en varning i dialogen.
- Ett namn med `"` eller radbrytning stoppar exporten med ett felmeddelande.

**Provat i GeoPad:** exporterade filer läses in rätt – slutna linjer med
upprepat första hörn, ytor, tomma höjder och koordinatsystemet.

**Nätpunkter (.geo)** i Data-menyn använder samma skrivare sedan polylinjerna:
fyra decimaler i stället för tre, koordinatsystemet som ovan, och H = 0 som
tomt fält.

### Projekt från före polylinjerna

Projektfiler och autosparningar från v0.6.0 och tidigare migreras när de laddas
(`visualVer` saknas i filen):

- **Linjesegment slås ihop till polylinjer** när de hänger ihop ände mot ände –
  samma punkt, i samma lager, med samma färg. Där tre eller fler segment möts
  bryts kedjan. En kedja som sluter sig blir en sluten polylinje, inte en yta.
  Kartan ser likadan ut och simuleringen ger samma resultat.
- **Väggsegment från äldre importer** har vart sitt hinder och slås därför inte
  ihop; de ligger kvar som korta polylinjer med två hörn. (Att foga ihop linjer
  är en möjlig senare funktion.) Angränsande `Line`/`LINE` ur samma importfil
  utan hinder slås däremot ihop, eftersom migreringen inte vet var filens
  objekt gick.
- **Visuella punkter med H = 0 får H = null** – före polylinjerna betydde 0
  "ingen höjd". Nätpunkter ändras inte.

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
  som blockerar sikt) eller *Hoppa över*. Varje `Line` blir en polylinje med
  linjens namn, sluten om flaggan är satt eller första hörnet upprepas sist.
  Hörnen dedupliceras på koordinat, så att linjer som möts delar hörn.
- **Slutna linjer som linjer / ytor** (visas när filen har slutna linjer –
  flagga 1 eller första hörnet upprepat sist). Förval *linjer*, som förut. Med
  *ytor* blir de visuella ytor med area; tillsammans med *Hinder* blir de
  byggnadshinder i stället för väggar längs kanterna.

Dubbletter av punkt-ID slås aldrig ihop tyst — båda punkterna returneras med en
varning i dialogen.

### DXF (.dxf)

Endast ASCII-DXF; binär DXF avvisas med besked. Stödda objekt är `LINE`,
`LWPOLYLINE`, `POLYLINE`/`VERTEX` och `POINT`; varje `LINE` och polylinje blir
en polylinje. Övriga typer räknas per lager
och hoppas över med varning. Bågsegment (bulge) ritas som raka linjer.

En DXF bär ingen information om koordinatsystem, och ofta inte heller om enhet
eller axelordning, så georefereringen är ett val i dialogen: enhet (ur
`$INSUNITS` när den finns), axelordning *X → E* eller *X → N*, och projektets
aktiva CRS. Dialogen räknar avståndet från ritningens utbredning till nätets
tyngdpunkt för **båda** axelordningarna och varnar om den valda är orimlig men
den andra rimlig. Av samma skäl blir en DXF alltid visuella lager, aldrig
nätpunkter.

Slutna `LWPOLYLINE`/`POLYLINE` kan importeras som ytor: *Slutna polylinjer som
linjer / ytor*, förval *linjer*.

## Toppmeny

- **Data** — import (.geo, .dxf, Excel/CSV, byggnader från OSM), export av
  nätpunkter och visuella lager (.geo), och projekthantering: Spara (Ctrl+S),
  Ladda, Excel-mall.
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
- **Lager** — lagren, med nål för att låsa menyn öppen och etiketten för aktivt
  lager bredvid knappen. Se *Visuella lager*.

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
