# NätSim Beta 2 → Vite + Claude Code Migration Guide

Den här guiden går igenom hur du flyttar NätSim från en monolitisk HTML-fil
till en modulär kodbas. Tidsåtgång: 1–2 timmar för steg 1–6, längre om du vill
göra steg 7 (UI-omarbete).

## Förkrävda program

- **Node.js 20+** – ladda från https://nodejs.org (välj LTS)
- **Git** – https://git-scm.com (på Windows: välj "Git for Windows")
- **VS Code** – https://code.visualstudio.com
- **Claude Code** – installera via VS Code-tilläggen (sök "Claude")

Kontrollera installationer i terminalen:
```
node --version    # ska visa v20.x.x eller högre
git --version     # ska visa git version 2.x
```

---

## Steg 1 – Skapa projekt-mapp och initiera Git

Öppna terminalen (PowerShell på Windows, Terminal på Mac).

```bash
cd ~/Documents              # eller dit du vill ha projektet
mkdir natsim
cd natsim
git init
git branch -M main
```

Kopiera in följande filer från denna guide-mapp (jag har förberett dem åt dig)
till din nya `natsim`-mapp:

- `package.json`
- `vite.config.js`
- `.gitignore`
- `index.html` (skeleton)
- `tsconfig.json` (om du vill ha TypeScript senare)
- `tests/calc.test.js` (testfall för beräkningskärnan)
- `STRUCTURE.md` (riktlinjer för modulär struktur)

Lägg också din `NätSim_Beta_2.html` i mappen tills vidare som referenskälla.

---

## Steg 2 – Installera beroenden

```bash
npm install
```

Detta installerar Vite (dev-server), Vitest (testramverk) och Leaflet (karta).
Tar 1–2 minuter.

Kör en första gång för att se att allt fungerar:
```bash
npm run dev
```

Du borde få en URL som `http://localhost:5173`. Öppna den – du ska se ett tomt
skeleton (det här är meningen, vi har inte migrerat in kod än).

Stäng dev-servern med Ctrl+C.

---

## Steg 3 – Första Git-commit

```bash
git add .
git commit -m "Initial scaffold: Vite + Vitest + Leaflet"
```

Skapa ett GitHub-repo (på github.com → New repository → privat) och pusha:
```bash
git remote add origin https://github.com/DITT_NAMN/natsim.git
git push -u origin main
```

---

## Steg 4 – Öppna i VS Code och starta Claude Code

```bash
code .
```

Inne i VS Code: öppna Claude Code-panelen (Cmd/Ctrl+L eller via tilläggsikonen).
Du ska se en chatt-vy där du kan ge instruktioner.

---

## Steg 5 – Modulär migration (Claude Code gör jobbet)

Klistra in denna prompt till Claude Code:

> "Jag har en monolitisk HTML-fil `NätSim_Beta_2.html` i projekt-roten.
> Migrera den till en modulär struktur enligt `STRUCTURE.md`. Behåll all
> beräkningslogik i `src/core/` exakt – inga matematiska ändringar.
> Splitta upp UI i `src/ui/`. Sätt upp Leaflet-kartan i `src/map/`.
> PM-popupen ska bli en separat HTML-fil i `src/pm/` som öppnas via
> `window.open()` med data via `postMessage`. Skapa enhetstester i
> `tests/` som verifierar att simResultatet är identiskt med originalfilens
> resultat för de testfall som finns i `tests/calc.test.js`."

Claude Code kommer:
1. Läsa `NätSim_Beta_2.html` och `STRUCTURE.md`
2. Skapa filerna under `src/`
3. Köra tester och iterera tills allt fungerar
4. Visa en diff för granskning innan filer skapas

Detta tar ungefär 10–30 minuter med Claude Code arbetande autonomt.

---

## Steg 6 – Verifiera och commit

Kör tester:
```bash
npm test
```

Alla testfall i `tests/calc.test.js` ska passera. Kör sedan dev-servern:
```bash
npm run dev
```

Öppna i webbläsaren och testa: lägg punkter, kör simulering, generera PM.
Resultaten ska vara identiska med originalfilen.

Commit:
```bash
git add .
git commit -m "Migrate to modular structure with Vite, tests pass"
git push
```

---

## Steg 7 – (Valfritt) UI-omdesign med Claude Design

När kodbasen är modulär kan du experimentera med ny UI utan att riskera
beräkningskärnan. I Claude.ai (denna chatt eller en ny):

1. Öppna en ny chatt eller skapa Project
2. Aktivera Claude Design (via verktygsknappen)
3. Be om: "Designa om vänsterpanelen i NätSim till en kollapserbar sidopanel
   med tre tabbar: Punkter | Mätningar | Mätklass. Visa dashboard-stil med
   stora siffror för k-tal, σ_pos_max och rᵢ_min överst."
4. När du har en design du gillar – gå tillbaka till Claude Code och be den
   implementera designen i `src/ui/`.

---

## Steg 8 – Bygg för produktion

När du är klar:
```bash
npm run build
```

Detta skapar en `dist/` mapp med en optimerad bundle (ofta 70–80% mindre än
originalfilen). Du kan distribuera den eller hosta på t.ex. Cloudflare Pages,
Netlify eller GitHub Pages.

---

## Vanliga problem

**"npm install" misslyckas på Windows:**
Kör PowerShell som administratör första gången, eller använd Git Bash.

**"node är inte installerat":**
Logga ut och in igen efter Node-installation så miljövariabler uppdateras.

**Claude Code säger "för stor kontext":**
Be Claude Code att börja med bara `src/core/simulation.js` först, sen göra
resten i mindre delar. Du kan också splitta NätSim_Beta_2.html först manuellt:
spara CSS som `legacy/styles.css`, JS som `legacy/script.js` och HTML separat.

**Tester misslyckas efter migration:**
Det är därför vi har dem. Be Claude Code: "Test `xxx` misslyckas, här är
output: [klistra in]. Hitta avvikelsen från originalformeln."

---

## Hjälp

I den här chatten (Claude Projects) har jag full kunskap om NätSims kod och
beräkningar. Använd mig för:
- Designbeslut innan implementation
- Verifiera matematiska formler
- Felsöka vid avvikelser från originalbeteendet
- Granska diff:ar Claude Code producerar
