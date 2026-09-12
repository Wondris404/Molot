# MOLOT

**MOLOT — Made by WONDRIS dev** is open-source, local-first software for personal
progress and achievement. It began as a school-focused application and currently
offers its most complete experience for school; local goals and progress establish
the shared foundation for personal and work use. It stores data locally and has no
required account or cloud service.

Source code is available under the [MIT License](LICENSE). See
[third-party notices](THIRD_PARTY_NOTICES.md) before redistributing bundled runtimes.

Current working version: **3.5.0 — AI Improvement Version**. The product name remains
**MOLOT**. Stable installers are kept in versioned release directories.

## Desktopová verzia Windows 11

The preserved stable installer is `release/0.3.0/Molot-Setup-0.3.0.exe` (NSIS).
The 3.5 build is written to `release/3.5.0/Molot-Setup-3.5.0.exe`. It installs the app
for the current Windows user, creates Start Menu and optional Desktop shortcuts, and
does not ship a development database. Node, npm, Rust, Cargo and Python are not
required by people using the installed application. The installer is currently not
code-signed, so a new-app SmartScreen warning can occur.

Produkčné dáta sú v Tauri application-data priečinku **`%APPDATA%/sk.molot.desktop/`**:

```text
molot.sqlite       SQLite záznamy, model metadata a aktívny prenosný model
uploads/           Školské materiály
teacher-tests/     Historické testy a učivo
models/            Verziované student modely, voliteľný Mini AI a lokálny feedback
backups/           SQLite snímky a ZIP zálohy
cache/             WebView2, OCR a dočasná obnova
logs/              Prevádzkové udalosti bez obsahu dokumentov
```

Aktívna cesta je vždy viditeľná v Nastaveniach. Development naďalej používa `data/`
v projekte. **Existujúce dáta sa automaticky nepresúvajú ani nemažú.** Na prenos z webovej
verzie vyexportuj ZIP zálohu v jej Nastaveniach a importuj ju v desktopovej aplikácii.
Pred obnovou sa vytvorí záloha súčasného stavu. Import kontroluje integritu SQLite,
schému, súbory a vzťahy; databázové záznamy mení v jednej transakcii.
Počas tréningu modelu je obnova dočasne zablokovaná. Zápis materiálov, modelov
a obnovovacej kópie musí uspieť pred zmenou záznamov. Zlyhanie obnovy tak ponechá
pôvodnú databázu; už vytvorené obnovovacie súbory môžu zostať na disku.
ZIP verzia má limit 100 MB. Väčší dátový priečinok zálohuj celý pri zatvorenej aplikácii.

```sh
npm run dev              # rýchly vývoj webového rozhrania
npm run desktop:prepare  # produkčný Next build a pribalenie runtime súborov
npm run desktop:dev      # Tauri okno nad pripraveným balíkom, projektové data/
npm run desktop:build    # Windows release do desktop/release/
npm run test:desktop     # skutočné WebView2 okno a reštart, izolované testovacie dáta
```

Desktopové buildy používajú Rust/MSVC, Node 24 a projektové runtime súbory
`.cache/node/node.exe`, `.cache/python/` a `.cache/tessdata/{slk,eng}.traineddata`.
Python závislosti sú pripnuté v `ml/python/requirements.txt`. Tieto runtime súbory sú
pripravené v tomto workspace; na čistom checkoute ešte treba doplniť automatický bootstrap.
Cargo cache aj build artefakty zostávajú v projekte. Tauri automaticky spustí server
na náhodnom loopback porte a Windows Job Object ukončí jeho pomocné procesy pri zatvorení.

## Student Performance a Teacher Pattern

Student logika je v `ml/student/`, učiteľská v `ml/teacher/`, spoločné priority
v `ml/priority/`. Predikcia vždy označuje Baseline alebo Personalizovaný model.
Zobrazený rozsah výsledku je orientačný, nie kalibrovaný interval spoľahlivosti.

- Baseline odhaduje výsledok z pripravenosti, náročnosti, času, starších výsledkov
  a označených odpovedí. Pôvodný historický časový algoritmus zostáva zachovaný.
  Pracovný list priradený k testu sa započíta, ak materiál aj označenie odpovede
  vznikli pred skúškou. Výsledné odpovede z danej skúšky sa do jej vstupov nezaradia.
  Pri historickom tréningu sa ranné učenie započíta, ak poznáme začiatok učenia
  aj čas skúšky a učenie sa skončilo najneskôr pri jej začiatku.
- Python porovnáva Ridge s regularizáciou 10 a 100 a Random Forest so stromami
  obmedzenými na hĺbku 4. Potrebuje aspoň 30 výsledkov z 12 rôznych dátumov.
- Kategórie sa kódujú cez DictVectorizer, číselné vstupy normalizuje StandardScaler.
  Pipeline sa fituje osobitne v každom validačnom rozdelení. Používa 3 postupné
  časové foldy a posledných 20 % dátumov vyhradí na záverečné overenie.
- Hodnotí MAE a RMSE. Kandidát musí mať MAE najviac 15 percentuálnych bodov,
  prekonať baseline aspoň o 5 % a pri retrainingu nezhoršiť obe metriky oproti
  aktuálnemu typu modelu pretrénovanému na rovnakom časovom rozdelení.
- Tréning je manuálny v Nastaveniach alebo automatický po 5 nových výsledkoch.
  Verzie a aj neúspešné tréningy zostávajú zaznamenané. Bez vhodného modelu funguje baseline.
- Model je uložený ako JSON koeficientov alebo stromov; TypeScript robí lokálnu
  inferenciu aj bez bežiaceho Python procesu. Solver skúša čas v krokoch 15 minút,
  ostatné vstupy drží rovnaké a upozorní, ak cieľ nedosiahne.
- Učiteľské skóre používa frekvenciu, aktuálnosť, označené body, opakovanie otázok
  a dôležitosť v učive. Váhy možno meniť. Nejde o kalibrovanú pravdepodobnosť.
  Podobnosť otázok najprv používa lokálny kosínus množín slov. Ak je voliteľný Mini AI
  pripravený, nejasné kandidátne dvojice môže navyše sémanticky skontrolovať.
- Priorita učenia spája relevanciu témy, vlastnú úspešnosť, náročnosť, termín,
  pripravenosť a cieľ. Čas rozdeľuje po 5 minútach a necháva čas na opakovanie.
  Ak vyberieš učivo alebo zadáš témy testu, predikcia a rozdelenie času používajú
  ich spoločný zoznam tém. Celý profil učiteľa si ponecháva kompletnú históriu.
  Téma bez historického výskytu zostáva v pláne s nulovým historickým skóre.
  Vybrané poznámky bez označených tém treba najprv doplniť; aplikácia ich nenahradí
  nesúvisiacimi témami z minulých testov.
- Predikciu možno uložiť pred testom. Po teste ručne označíš skutočné témy a štýly;
  vypočíta sa precision/recall a potvrdený obsah doplní učiteľovu históriu.

Učitelia majú stránky `/teachers` a `/teachers/[id]`; sekcia MOLOT PREDICTION je
v `/tests/[id]`. Nastavenia obsahujú tréning, metriky, váhy a zálohovanie.
Pribudlo 6 učiteľských grafov: výskyt tém, pokrytie v čase, štýly otázok,
body podľa tém, opakovanie a predikované/skutočné témy.

Nové SQLite tabuľky (migrácia v2, bez resetu pôvodných deviatich tabuliek):
`Teacher`, `TeacherDocument`, `TeacherQuestion`, `MaterialTopic`, `TestIntelligence`,
`TeacherPrediction`, `StudentModelMetadata`, `ModelTrainingRun`, `IntelligenceSettings`.
Pred migráciou vznikne lokálna SQLite snímka.

Historické dokumenty podporujú PDF, PNG, JPG, TXT a DOCX. PDF parser a Tesseract OCR
bežia lokálne. OCR skenovaného PDF je obmedzené na prvých 5 strán a veľkostný limit;
čiastočný výsledok je označený. Text môžeš opraviť. Navrhnuté otázky a témy sa nestanú
uloženými faktmi, kým ich nepotvrdíš. OCR neurčuje správnosť odpovedí.

```sh
npm run lint
npm run build
npm test          # SQLite, backup, algoritmy, skutočný DEMO tréning a OCR
npm run test:e2e  # školský aj učiteľský workflow, desktop a mobil
npm run test:ml   # iba izolovaný DEMO tréning
npm run test:clean # po ukončení testov odstráni iba izolované testovacie priečinky
```

DEMO model nikdy nevstupuje do osobnej databázy. Testy zapisujú do vlastných
`data/test-...` alebo `data/e2e-...` priečinkov. Dobré skóre na syntetických DEMO dátach
nie je dôkaz presnosti na tvojich reálnych testoch.

## Voliteľný Mini AI 3.5

Mini AI používa lokálny llama.cpp runtime a samostatne sťahovaný Qwen3 0.6B Q8_0
model. Model nie je súčasťou inštalátora a MOLOT bez neho normálne funguje. Každá
úloha má krátky prompt, Zod validáciu a constrained JSON schému. Presný kód naďalej
počíta body, známky, dátumy, štatistiky a predikcie; model rieši iba jazyk a význam.

30-prípadový syntetický benchmark je v `ml/mini-ai/`: surový model dosiahol 60.0 %
presnosť polí, celý validovaný 3.5 pipeline 100.0 % a 100 % platnosť JSON/schémy.
Je to malý release benchmark, nie tvrdenie o všeobecnej presnosti. Podrobnosti,
failure corpus a rozhodnutie netrénovať na malom datasete sú v priečinku Mini AI.
OneDrive má iba integračné rozhranie; cloudový konektor nie je aktívny.

---

Súkromný školský dashboard pre jedného používateľa. Aplikácia beží lokálne,
začína prázdna a školské dáta ani nahrané súbory nikam neposiela.

## Spustenie

Potrebuješ **Node.js 24 alebo novší** a npm. V priečinku Molot:

```sh
npm install
npm run dev
```

Otvor **http://localhost:3000**. SQLite aj priečinok na súbory sa vytvoria automaticky
pri prvom načítaní údajov. Samostatný databázový server ani účet nepotrebuješ.

Ak PowerShell blokuje súbor `npm.ps1`, použi `npm.cmd run dev` (rovnako pri ostatných
npm príkazoch). Netreba meniť nastavenia Windows ani profil PowerShellu.

Produkčné lokálne spustenie:

```sh
npm run build
npm start
```

Dev aj produkčný server počúvajú iba na `127.0.0.1`. Telemetria Next.js je vypnutá
v spúšťacom skripte. Fonty sú systémové; aplikácia nepoužíva externé fonty, AI API,
cloudové úložisko ani analytické služby.

## Prvé použitie

1. V **Nastaveniach** pridaj vlastné predmety a ich farby.
2. V **Známkach** pridaj známku, váhu, dátum a typ hodnotenia.
3. V **Testoch** vytvor termín, cieľ a plán prípravy.
4. V detaile testu zaznamenaj učenie a priebežnú pripravenosť.
5. Nahraj lokálny materiál a manuálne označ jednotlivé odpovede.
6. Po teste pridaj získané/maximálne body alebo priamo percentá a skutočný čas prípravy.
7. Dashboard, analýza aj grafy sa po uložení prepočítajú.

Známka uložená pri výsledku testu sa **automaticky nekopíruje** do denníka známok.
Tlačidlo v detaile testu otvorí formulár na samostatné pridanie známky s vlastnou váhou.
Tým sa vyhneš nechcenému dvojitému započítaniu už existujúcej známky.

## Čo je implementované

- CRUD predmetov, známok, testov, učenia, pripravenosti, výsledkov a označených odpovedí.
- Potvrdenie mazania s vysvetlením súvisiacich záznamov.
- Celkový a predmetový vážený priemer, posledné známky a výsledky.
- Prehľad termínov zoradený podľa dátumu, stavy testu a počet zostávajúcich dní.
- Denný, týždenný a celkový čas učenia; súčty podľa predmetu a testu.
- História pripravenosti a graf v detaile testu.
- Vysvetliteľné odporúčanie celkového času prípravy s rozsahom a úrovňou istoty.
- Ručné priradenie otázky k súboru, testu, téme a typu chyby.
- Analýza správnych aj nesprávnych odpovedí, úspešnosť tém a vývoj úspešnosti.
- Lokálny upload, náhľad, stiahnutie, premenovanie a odstránenie materiálov.
- Dark dashboard, responzívne mobilné menu, prázdne stavy a chybové hlásenia.
- Nastavenia denných cieľov, základného odhadu a predvoleného cieľa testov.
- Export databázových záznamov do JSON bez obsahu nahraných súborov.

## Technológie a architektúra

Next.js 16, App Router, React 19, TypeScript, Tailwind CSS 4, Recharts 3,
Zod 4, lokálny PDF.js prehliadač, ESLint a npm. SQLite používa vstavaný modul Node.js `node:sqlite`;
netreba ORM, generovanie klienta ani kompiláciu natívnej databázovej závislosti.

```text
app/                         Stránky App Routera a lokálne API
  api/data/                  Načítanie celého lokálneho prehľadu
  api/data/[entity]/         Validované vytvorenie, úprava a mazanie
  api/materials/             Upload súborov
  api/materials/[id]/        Náhľad, stiahnutie, názov a odstránenie
components/
  app-provider.tsx           Načítanie dát, mutácie a obnovenie prehľadov
  app-shell.tsx              Sidebar, mobilné menu a hlavička
  ui.tsx                    Spoločné karty, dialógy, prázdne stavy a ovládacie prvky
  editor-config.ts          Polia, predvolené hodnoty a prevod formulárov
  record-editor.tsx         Funkčné formuláre a potvrdenie mazania
  data-tables.tsx           Tabuľky záznamov
  materials-panel.tsx       Nahrávanie a správa materiálov
  pdf-viewer.tsx            Lokálne vykreslenie PDF, strany a textová vrstva
  charts/chart-panel.tsx    Zdieľané responzívne grafy s tooltipmi a legendou
  pages/                   Jednotlivé stránky dashboardu
lib/
  db.ts                    SQLite schéma, migrácia v1, transakcie a vzťahy
  validation.ts            Serverová validácia vstupov
  types.ts                 Doménové TypeScript modely
  analytics.ts             Priemery, súčty, pripravenosť, témy a priority
  chart-data.ts            Zostavenie skutočných dátových radov
  recommendationEngine.ts  Deterministický časový odhad
  analyzer.ts              Rozhranie pre budúci analyzer; ručný režim
  format.ts                Slovenské formátovanie a lokálne dátumy
  http.ts                  Lokálny prístup a API chybové odpovede
tests/                     Izolované databázové a prehliadačové testy
```

Rozhranie po mutácii znova načíta databázový prehľad. Výpočty používajú tento prehľad;
žiadny školský záznam nie je uložený iba v React state alebo localStorage.
Pre osobnú aplikáciu sa načítava celý prehľad naraz. Stránkovanie a veľkoobjemové
serverové agregácie možno doplniť neskôr.

## Databázové modely

| Tabuľka            | Účel a hlavné vzťahy                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `Subject`          | Vlastný názov, farba; rodič známok, testov, učenia, materiálov a odpovedí                    |
| `Grade`            | Predmet, známka 1–5, kladná váha, dátum, popis, typ hodnotenia                               |
| `Test`             | Predmet, názov, dátum/čas, témy, poznámky, náročnosť, cieľ, plán, stav                       |
| `TestResult`       | Jeden výsledok na test; body, percentá, známka, čas, pripravenosť, náročnosť, pôvodný odhad  |
| `StudySession`     | Predmet, voliteľný test, dátum/čas, minúty, téma, poznámka                                   |
| `ReadinessEntry`   | Test, percentá, čas záznamu a poznámka; celá história                                        |
| `UploadedMaterial` | Predmet, voliteľný test, názov, bezpečný názov na disku, typ a veľkosť                       |
| `ErrorEntry`       | Predmet, voliteľný test/materiál, otázka, téma/podtéma, odpoveď, správnosť, typ chyby, dátum |
| `Settings`         | Jeden lokálny záznam cieľov a základného časového koeficientu                                |
| `Profile`          | Jeden lokálny profil, zapnuté oblasti a stav krátkeho onboardingu                             |
| `Goal`             | Školský, pracovný alebo osobný cieľ, termín, metrika a stav                                   |
| `ProgressEntry`    | Hodnota alebo aktivita priradená k cieľu                                                      |
| `Milestone`        | Trvalý medzikrok cieľa                                                                         |
| `GoalAttachment`   | Lokálna príloha cieľa uložená v rovnakom bezpečnom úložisku ako školské materiály             |

Schéma používa cudzie kľúče, databázové obmedzenia a transakcie. Verziu sleduje
`PRAGMA user_version`; prvá migrácia je v `lib/db.ts`.

Odstránenie predmetu odstráni jeho súvisiace údaje aj materiály. Odstránenie testu
odstráni výsledok a pripravenosť, no zachová učenie, odpovede a materiály pri predmete
bez priradenia k testu. Odstránenie súboru zachová označené odpovede. Odstránenie
výsledku vráti stav testu na **Napísaný**. Výsledok automaticky nastaví **Vyhodnotený**.

## Ako funguje odporúčanie

Implementácia: `lib/recommendationEngine.ts`. Nie je to AI ani trénovaný model.

1. Základ = nastavený čas × `(0.55 + náročnosť × 0.15)` × `(0.5 + cieľ / 100)`.
2. Vyberú sa historické výsledky s kladným skutočným časom prípravy. Samotný nový test
   a testy s neskorším dátumom sa nepoužijú.
3. Ak existuje história rovnakého predmetu, používa sa ona. Inak sa s nízkou istotou
   použijú iné predmety. Vyberie sa najviac 12 najpodobnejších výsledkov.
4. Váhy zohľadňujú rozdiel náročnosti, zhodu tém a podobnosť cieľového výsledku.
   Témy sa porovnávajú ako normalizované frázy oddelené čiarkou, bodkočiarkou či riadkom.
5. Historický čas sa upraví podľa rozdielu nového cieľa a minulého výsledku
   a podľa rozdielu náročnosti. Úpravy sú ohraničené.
6. Nízka pripravenosť + nízky výsledok pridáva 10 % k času daného vzoru.
   Nízka pripravenosť + vysoký výsledok odoberá 10 %. Vysoká pripravenosť + nízky
   výsledok vyvolá upozornenie na témy a spôsob učenia, nie slepé navyšovanie času.
   Vysoká pripravenosť + dobrý výsledok sa vysvetlí ako fungujúca príprava.
7. Vážený historický odhad sa zmieša so základom. Podiel histórie je
   `n / (n + 2)`, najviac 90 %. Pri nule záznamov sa používa len základ.
8. Výsledok je zaokrúhlený na 15 minút. Rozsah má šírku ±45 %, ±30 % alebo ±20 %
   podľa istoty. **Stredná** potrebuje aspoň 3 podobné testy rovnakého predmetu
   a primeraný rozptyl; **Vysoká** aspoň 8 a nižší rozptyl. Inak je **Nízka**.
9. Zostávajúci čas = stred odhadu mínus zapísané učenie, najmenej nula.

Istota je heuristický štítok kvality podkladov, nie štatistická pravdepodobnosť.
Pripravenosť nového testu a problematické témy ovplyvnia slovné odporúčanie.
Odhad negarantuje výsledok a dosiahnutý počet minút neznamená automatickú pripravenosť.
Pri uložení výsledku sa stred odhadu uchová pre neskoršie porovnanie. Úpravy výsledku
ani zmena nastavení tento historický údaj nemenia.

Reálny čas vo výsledku je samostatný potvrdený údaj, predvyplnený zo zapísaného učenia.
Neskoršia úprava study session ho spätne nemení; podľa potreby uprav aj výsledok.

## Stránky a grafy

Stránky: `/`, `/grades`, `/tests`, `/tests/[id]`, `/study`, `/errors`,
`/charts`, `/subjects/[id]`, `/settings`.

V Grafoch sú predmetové a časové filtre a týchto 14 grafov:

1. Vývoj váženého priemeru známok.
2. Vážené priemery podľa predmetu.
3. Výsledky testov v čase.
4. Priemerné výsledky testov podľa predmetu.
5. Čas učenia v čase.
6. Čas učenia podľa predmetu.
7. Scatter: pripravenosť pred testom vs. výsledok.
8. Scatter: reálny čas učenia vs. výsledok.
9. História pripravenosti vybraného testu.
10. Chyby podľa predmetu.
11. Chyby podľa témy.
12. Typy chýb.
13. Pôvodný odporúčaný čas vs. skutočný čas.
14. Vývoj úspešnosti ručne označených odpovedí.

Grafy majú tooltipy, legendy, responzívnu veľkosť a tmavý vzhľad. Pri chýbajúcich
dátach je prázdny stav. Úspešnosť tém vychádza iba z označených odpovedí: ak zaznamenáš
len chyby, vypočítaná úspešnosť bude 0 %. Preto pridávaj aj správne odpovede.

## Súbory a záloha

- Databáza: `data/molot.sqlite`.
- Pomocné SQLite súbory počas behu: `data/molot.sqlite-wal` a `data/molot.sqlite-shm`.
- Materiály: `data/uploads/<uuid>.pdf|png|jpg|txt`.
- Upload kontroluje limit 20 MB, príponu a základnú signatúru typu. TXT sa zobrazuje ako text.
- Súbory sa načítavajú iba cez lokálnu API route. Dodaný názov sa nepoužíva ako cesta na disku.
- Pre úplnú zálohu **zastav server a skopíruj celý priečinok `data`**.
- Pre obnovu zastav server a obnov celý priečinok zo zálohy.
- JSON export v Nastaveniach je čitateľný export záznamov; neobsahuje súbory ani automatický import.
- `data`, testovacie výstupy a cache sú v `.gitignore`. Žiadne demo dáta sa nesieťujú ani nevkladajú.

## Overenie

```sh
npm run db:init
npm test
npm run lint
npm run build
npm run test:e2e
```

Prvá inštalácia prehliadača pre E2E testy v PowerShelli:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache\playwright'
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Databázové testy používajú `data/test-core-*`; prehliadačové testy `data/e2e-*`
a server na porte 3100. Produkčné údaje nemenia. Jednorazové testovacie údaje sú
označené `TEST`. Prehliadačový test odstráni svoj predmet po úspešnom priebehu.
Výstupy a screenshoty sú v `test-results`.

## Ďalšia fáza

- Voliteľný OCR/AI analyzer cez `MaterialAnalyzer` s povinným overením výsledkov používateľom.
- Automatické zálohy a validovaný import/export vrátane materiálov.
- Pokročilý plán učenia a týždenný/mesačný kalendár.
- Lepšie vyhodnocovanie kvality časových odhadov z dlhšej vlastnej histórie.
- Školské roky, polroky a prípadné vlastné hodnotiace stupnice.

Zámerne tu nie sú cloudové účty, verejné prihlasovanie, marketingové stránky,
predplatné ani automaticky vymyslené výsledky analýzy.

Technické referencie: [Next.js App Router](https://nextjs.org/docs/app),
[Node.js SQLite](https://nodejs.org/api/sqlite.html),
[Recharts](https://recharts.github.io/en-US/).
