# Geldzicht

Persoonlijk dashboard voor je inkomsten, uitgaven en vermogen. Je importeert je bankbestand van ABN AMRO, de app deelt alles automatisch in categorieën in en laat zien waar je geld naartoe gaat.

## Wat de app doet

- Importeert ABN AMRO TXT- en XLS-bestanden (en de meeste CSV-bestanden met kopregel). Dubbele transacties worden overgeslagen, dus overlappende periodes zijn geen probleem.
- Deelt transacties automatisch in, over ruim 70 categorieën in 16 hoofdgroepen (bijvoorbeeld Zalando naar Kleding, Shell naar Brandstof).
- Leert van je: deel je iets zelf in met "Onthoud" aan, dan gaat dat voortaan automatisch.
- Sparen en BUX tellen niet als uitgave, maar als verschuiving binnen je vermogen.
- Boodschappen voor je ouders: stel hun IBAN in bij Terugbetalers. Een terugbetaling met exact hetzelfde bedrag (of de som van twee of drie boodschappen) wordt automatisch gekoppeld en telt dan niet mee als uitgave of inkomen. Je kunt een uitgave ook vooraf als "Voorgeschoten" markeren.
- Overzicht, transacties met zoeken, filteren en sorteren, analyse (categorieën, trend, winkels, weekdagen) en vermogen.
- Werkt op je telefoon als app, ook offline. Exporteren naar CSV en back-up maken kan via Meer.

## Stap 1: op GitHub Pages zetten

1. Maak op GitHub een nieuwe repository, bijvoorbeeld `geldzicht`. Kies **Public**: gratis GitHub Pages werkt alleen met een openbare repository. Je financiële gegevens komen niet in de repository, die staan in Firebase.
2. Upload alle bestanden en mappen uit deze map (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `firestore.rules`, `.gitignore` en de mappen `js`, `lib` en `icons`). Behoud de mappenstructuur.
3. Ga naar **Settings > Pages**, kies bij Source **Deploy from a branch**, branch `main`, map `/ (root)` en sla op.
4. Na een minuut staat de app op `https://<jouw-gebruikersnaam>.github.io/geldzicht/`.

Zolang `js/config.js` op `null` staat, werkt de app lokaal: gegevens blijven dan alleen in die ene browser. Handig om eerst met **Voorbeeld bekijken** rond te kijken.

## Stap 2: Firebase koppelen (opslag en inloggen)

Maak een nieuw project aan, los van je LeCoins-project.

1. Ga naar [console.firebase.google.com](https://console.firebase.google.com) en kies **Project toevoegen**, bijvoorbeeld `geldzicht`. Google Analytics mag uit.
2. **Authentication**: klik op Aan de slag, zet **E-mail/wachtwoord** aan. Ga daarna naar het tabblad Users, kies **Add user** en maak je eigen account aan met een sterk wachtwoord. Er is in de app geen registratieknop, dus alleen jij kunt inloggen.
3. **Firestore Database**: kies Database maken, locatie in Europa (bijvoorbeeld `eur3` of `europe-west4`), start in **productiemodus**.
4. Open in Firestore het tabblad **Regels** (Rules), vervang alles door de inhoud van `firestore.rules` en klik op Publiceren. Hierdoor kan alleen de ingelogde eigenaar zijn eigen gegevens lezen en schrijven.
5. Ga naar **Projectinstellingen** (tandwiel) > Algemeen > Je apps en klik op het webicoon `</>`. Registreer de app (Hosting hoeft niet aan).
6. Kopieer het `firebaseConfig`-blok en plak het in `js/config.js` in plaats van `null`. Upload het aangepaste bestand naar GitHub.
7. Voeg bij Authentication > Settings > **Authorized domains** je GitHub-domein toe (`<jouw-gebruikersnaam>.github.io`).

Open de app opnieuw: je ziet nu een inlogscherm. Na het inloggen worden je gegevens in Firestore bewaard en zijn ze op elk apparaat hetzelfde.

Wijzigingen worden live gesynchroniseerd: pas je iets aan op je telefoon, dan zie je het binnen een paar seconden op je laptop als de app daar open staat. Per wijziging wordt alleen die ene transactie opgeslagen, dus twee apparaten overschrijven elkaar niet. Offline werkt de app ook; wijzigingen worden verstuurd zodra je weer verbinding hebt (het stipje rechtsboven is dan oranje).

Het gratis Firebase-abonnement (Spark) is ruim voldoende: transacties worden per maand gebundeld in één document, dus een jaar data is ongeveer twaalf documenten om te lezen.

## Stap 3: op je telefoon zetten

- **iPhone**: open de link in Safari, tik op Delen en kies **Zet op beginscherm**.
- **Android**: open de link in Chrome, tik op het menu en kies **App installeren** of **Toevoegen aan startscherm**.

## Transacties downloaden bij ABN AMRO

1. Log in op internetbankieren (abnamro.nl).
2. Ga naar Zelf regelen en kies **Bij- en afschrijvingen downloaden**.
3. Kies de periode (tot 18 maanden terug) en formaat **TXT** (XLS werkt ook).
4. Vink je betaalrekening aan, en bij voorkeur ook je spaarrekening. Dan herkent de app de overboekingen tussen beide en gebruikt hij het echte spaarsaldo.
5. Importeer het bestand via de knop rechtsboven in de app. Op je telefoon kies je het bestand uit Bestanden of Downloads.

## Eerste keer instellen in de app

1. Importeer je bestand.
2. Tik op **Indelen** bij de melding "nog niet ingedeeld" en deel de onbekende transacties in. Laat "Onthoud" aan.
3. Meer > **Terugbetalers**: voeg het IBAN van je ouders toe (de app stelt personen voor die je geld overmaakten).
4. Meer > **Rekeningen**: controleer welke rekening je betaalrekening is. Download je je spaarrekening niet mee, vul dan het IBAN ervan in bij "Andere eigen rekeningen".
5. Meer > **Sparen en beleggen**: vul in wat er al op BUX stond. Via Vermogen kun je af en toe de actuele waarde van je portefeuille invullen.

## Bijwerken

Na een aanpassing aan de code: verhoog `VERSION` in `sw.js` (bijvoorbeeld naar `geldzicht-v1.0.1`), zodat telefoons de nieuwe versie ophalen. Sluit de app daarna een keer helemaal af en open hem opnieuw.

## Bestanden

| Bestand | Inhoud |
| --- | --- |
| `index.html`, `styles.css` | Pagina en vormgeving |
| `js/app.js` | Schermen en interactie |
| `js/parser.js` | Inlezen van ABN AMRO TXT/XLS en CSV |
| `js/categories.js` | Categorieën en trefwoorden, hier kun je zelf trefwoorden toevoegen |
| `js/logic.js` | Indelen, terugbetalingen koppelen, berekeningen |
| `js/store.js` | Opslag in Firebase of lokaal |
| `js/config.js` | Je Firebase-configuratie |
| `js/demo.js` | Verzonnen voorbeeldgegevens |
| `lib/` | Chart.js, SheetJS en een gebundelde versie van Firebase 13.2 |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installeerbaar maken en offline werken |
| `firestore.rules` | Beveiligingsregels voor Firestore |

## Privacy

- De Firebase-configuratie in `config.js` is niet geheim; dat is normaal bij Firebase. De beveiliging zit in de Firestore-regels en het inloggen.
- Zet nooit bankbestanden of back-ups in de repository. `.gitignore` houdt `.TAB`, `.xls`, `.csv` en `.json` tegen als je met Git werkt.
- Je gegevens staan in je eigen Firebase-project bij Google.
