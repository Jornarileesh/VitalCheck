VitalCheck
==========

Uruchamianie
------------
Otworz index.html w przegladarce. Serwer i dostep do internetu nie sa
potrzebne. Obok index.html musza znajdowac sie styles.css oraz app.js.
Node.js jest potrzebny tylko do rozwijania i kompilacji aplikacji.

Nie zmieniono klucza ani formatu danych localStorage. Dotychczasowe pomiary
pozostaja dostepne pod ta sama lokalizacja index.html w tej samej przegladarce.
Przed przeniesieniem aplikacji wyeksportuj kopie danych.

Pliki
-----
index.html       - struktura widokow i formularza
styles.css       - wyglad i responsywnosc
src\app.ts       - stan aplikacji, widoki, wykresy, zdarzenia i zapis lokalny
src\model.ts     - typy pomiarow, walidacja, daty, srednie i format kopii
src\dom.ts       - typowane odwolania do elementow HTML i SVG
app.js           - wygenerowany skrypt przegladarki; nie edytuj go recznie
tests\app.test.cjs - testy dzialania w przegladarce

Rozwijanie (polecenia wykonuj w folderze VitalCheck)
-------------------------------------------------
1. Zainstaluj Node.js 22 lub nowszy.
2. npm ci
3. Edytuj HTML, CSS lub pliki w src.
4. npm run build
5. Odswiez index.html.

TypeScript dziala w trybie strict. Kompilacja najpierw sprawdza typy,
a potem laczy moduly w zwykly skrypt app.js. Pozwala to zachowac otwieranie
przez file:// bez ograniczen lokalnych modulow ES.

npm run typecheck - sama kontrola typow
npm run watch     - automatyczne generowanie app.js po zmianie TypeScript;
                    nie sprawdza typow, przed publikacja uruchom build

Zmiana HTML lub CSS nie wymaga kompilacji. Zmiana TypeScript wymaga
aktualizacji app.js. Do dystrybucji potrzebne sa tylko index.html,
styles.css i wygenerowany app.js. Zachowuj app.js razem ze zrodlami.

Testy
-----
npx playwright install chromium
npm test

Testy dzialaja na odizolowanych danych przegladarki i nie zmieniaja
pomiarow uzytkownika. Sprawdzaja m.in. zapis, edycje, import i eksport,
przedzialy kohort, bledy pamieci i widoki mobilne.

Mozna uzyc zainstalowanego Edge zamiast pobierania Chromium (PowerShell):
$env:VITALCHECK_BROWSER = "msedge"
npm test

Opcjonalna kontrola wizualna przed refaktorem:
ustaw VITALCHECK_BASELINE na pelna sciezke do poprzedniego samodzielnego
pliku HTML. Test porowna zrzuty obu wersji na tych samych danych.
