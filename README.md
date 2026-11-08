# Ježek Nindža

Mobilní hra pro iPhone (hraje se na šířku). Bodlík, nindža ježek s červenou šálou, chytá do košíku předměty, které se kutálejí ze čtyř skluzavek. Hra je inspirovaná klasickými LCD hrami s „chytáním ze čtyř stran“, ale postava, svět i grafika jsou vlastní.

## Jak hrát
- Ťukni do **levého horního / levého dolního / pravého horního / pravého dolního** rohu obrazovky a Bodlík nastaví košík k té skluzavce.
- Když předmět spadne mimo košík, přijdeš o život. Tři chyby znamenají konec hry.
- **Kombo 15** spustí *Sílu bodlin*: 10 sekund dvojnásobných bodů a výraznější hudby.
- Zlatá hvězda = 5 bodů. **Bomby nechytej.**
- Na počítači: klávesy Q / A / P / L nebo šipky, mezerník = pauza.

## Světy
| # | Svět | Novinka |
|---|------|---------|
| 1 | Ovocný sad | základy |
| 2 | Bambusový les | zlaté hvězdy |
| 3 | Chrám v mlze | mlha zakrývá skluzavky |
| 4 | Noční střechy | bomby |
| 5 | Sopka | dvojice za sebou, rychlé tempo |
| 6 | Zasněžený vrchol | souboj s Havranem |

Po poražení Havrana se odemkne **nekonečný režim**.

## Hudba
Hudba se generuje přímo ve hře (Web Audio). Každý posun předmětů je jedna doba, takže hraješ do rytmu. S rostoucím kombem přibývají nástroje. Po chybě hudba ztichne a při posledním životě se přidá tep.

## Hraní na iPhonu
1. Otevři adresu hry v **Safari**.
2. **Sdílet → Přidat na plochu**.
3. Spusť hru z ikony na ploše: poběží přes celou obrazovku a funguje i offline.

## Zveřejnění (GitHub Pages)
Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save.
Hra pak poběží na `https://<uživatel>.github.io/jezek-nindza/`.

## Struktura
- `index.html`, `css/style.css` – stránka a menu
- `js/game.js` – herní logika, vykreslování, ovládání
- `js/worlds.js` – světy, pozadí, předměty, nastavení obtížnosti a hudby
- `js/hero.js` – Bodlík a Havran
- `js/audio.js` – syntezátor zvuků a hudební sekvencer
- `sw.js`, `manifest.webmanifest` – instalace na plochu a offline režim
