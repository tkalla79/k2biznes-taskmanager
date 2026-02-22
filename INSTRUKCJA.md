# Task Manager K2 — Instrukcja uzytkowania

## Spis tresci

1. [Pierwsze logowanie](#1-pierwsze-logowanie)
2. [Interfejs — przeglad](#2-interfejs--przeglad)
3. [Role uzytkownikow](#3-role-uzytkownikow)
4. [Widok PM — Dashboard](#4-widok-pm--dashboard)
5. [Widok PM — Kanban](#5-widok-pm--kanban)
6. [Widok PM — Timeline](#6-widok-pm--timeline)
7. [Widok PM — Obciazenie zespolu](#7-widok-pm--obciazenie-zespolu)
8. [Widok PM — Alerty](#8-widok-pm--alerty)
9. [Widok PM — Ustawienia](#9-widok-pm--ustawienia)
10. [Widok Specjalisty — Moje zadania](#10-widok-specjalisty--moje-zadania)
11. [Widok Kierownika — Portfolio](#11-widok-kierownika--portfolio)
12. [Zarzadzanie zadaniami](#12-zarzadzanie-zadaniami)
13. [Zarzadzanie zespolem](#13-zarzadzanie-zespolem)
14. [Filtry i wyszukiwanie](#14-filtry-i-wyszukiwanie)
15. [Import i eksport danych](#15-import-i-eksport-danych)
16. [Powiadomienia e-mail](#16-powiadomienia-e-mail)

---

## 1. Pierwsze logowanie

Po uruchomieniu aplikacji otworz w przegladarce adres podany przez administratora
(np. `https://task-manager-k2.azurewebsites.net` lub `http://localhost:5173`).

Jesli aplikacja dziala w trybie produkcyjnym, zobaczysz ekran logowania Microsoft.
Zaloguj sie swoim kontem sluzbowym (np. `jan.kowalski@k2biznes.pl`).

Po zalogowaniu zobaczysz glowny interfejs aplikacji. W prawym gornym rogu
wyswietla sie Twoje imie i nazwisko.

> W trybie deweloperskim logowanie jest pominiete — zobaczysz oznaczenie
> "Dev (SharePoint)" w prawym gornym rogu.

---

## 2. Interfejs — przeglad

Interfejs aplikacji sklada sie z trzech glownych czesci:

**Naglowek (gora strony):**
- Logo i nazwa aplikacji
- Zakladki nawigacyjne (zaleznie od wybranej roli)
- Przycisk **+ Zadanie** — tworzenie nowego zadania
- Przyciski eksportu/importu Excel
- Informacja o zalogowanym uzytkowniku

**Pasek filtrow (ponizej naglowka):**
- Przelacznik ról (PM / Specjalista / Kierownik)
- Filtry: przypisana osoba, kategoria, priorytet
- Przelacznik wyswietlania zadan zakonczonych
- Licznik widocznych zadan

**Obszar glowny (srodek strony):**
- Tresc aktualnie wybranego widoku (Dashboard, Kanban, Timeline itd.)

---

## 3. Role uzytkownikow

Aplikacja oferuje trzy role, ktore mozna przelaczac w pasku filtrow.
Kazda rola udostepnia inny zestaw widokow:

### PM (Project Manager)
Pelny dostep do wszystkich narzedzi zarzadzania:
- **Dashboard** — przegladowe statystyki i wykresy
- **Kanban** — tablica z kolumnami statusow
- **Timeline** — os czasu z wykresem Gantta
- **Obciazenie** — obciazenie zespolu i zarzadzanie czlonkami
- **Alerty** — lista ostrzezen i eskalacji
- **Ustawienia** — konfiguracja list (kategorie, statusy, role itd.)

### Specjalista
Widok skoncentrowany na wlasnych zadaniach:
- **Moje zadania** — lista zadan przypisanych do wybranej osoby
- **Alerty** — ostrzezenia dotyczace wybranych zadan

Aby zobaczyc swoje zadania, po wybraniu roli "Specjalista" wybierz swoje
imie i nazwisko z rozwijanej listy "Wybierz osobe" w pasku filtrow.

### Kierownik
Widok strategiczny dla kadry zarzadzajacej:
- **Portfolio** — KPI, wykorzystanie zespolu, tabela przegladu
- **Obciazenie** — obciazenie kazdego czlonka zespolu
- **Alerty** — krytyczne ostrzezenia

---

## 4. Widok PM — Dashboard

Dashboard prezentuje przegladowe metryki calego projektu w postaci kart KPI
i szesciu wykresow.

**Karty KPI (gora widoku):**

| Karta             | Opis                                              |
|--------------------|----------------------------------------------------|
| Aktywne            | Liczba zadan w toku (nieze zakonczonych)            |
| Zakonczone         | Liczba zadan ze statusem "Zakonczone" + % realizacji|
| Przeterminowane    | Zadania po terminie — wymaga uwagi!                |
| Zblizajace sie     | Zadania z deadline w ciagu 2 dni                   |
| Zablokowane        | Zadania ze statusem "Zablokowane"                  |
| Sr. czas realizacji| Srednia liczba dni od poczatku do zakonczenia      |

**Wykresy:**

1. **Zadania: plan vs realizacja** — porownanie szacowanych i faktycznych godzin
   w rozbiciu na kategorie projektow (FENG, KPO, Marketing itd.)

2. **Obciazenie zespolu** — poziomy wykres slupkowy pokazujacy wykorzystanie
   godzin tygodniowych kazdego czlonka zespolu (zielony = dostepny,
   zolty = optymalnie, czerwony = przeciazony)

3. **Przeterminowane zadania** — liczba zadan po terminie z rozbiciem na osoby

4. **Wykres spalania (burndown)** — linia idealna vs faktyczna —
   pozwala ocenic tempo realizacji

5. **Rozklad statusow** — wykres kolowy udzialu zadan w poszczegolnych statusach

6. **Sredni czas realizacji** — wizualizacja sredniego czasu zakonczenia
   z podsumowaniem zakonczonych/aktywnych zadan i pozostalych godzin

---

## 5. Widok PM — Kanban

Tablica Kanban wyswietla zadania w kolumnach odpowiadajacych statusom.
Domyslne kolumny: Do zrobienia, W trakcie, Do weryfikacji, Zakonczone, Zablokowane.

**Przenoszenie zadan:**
Aby zmienic status zadania, uchwyc karteczke (drag & drop) i przeniesc ja
do innej kolumny. Status zostanie automatycznie zaktualizowany.

**Limity WIP:**
Kazda kolumna moze miec ustawiony limit WIP (Work In Progress).
Jesli liczba zadan przekroczy limit, naglowek kolumny podswietli sie
na czerwono — sygnalizujac przeciazenie.

**Grupowanie:**
Nad tablica znajduja sie przyciski grupowania:
- **Brak** — wszystkie zadania w jednej tablicy
- **Osoba** — oddzielna tablica dla kazdego czlonka zespolu
- **Priorytet** — grupowanie wg priorytetu (Krytyczny, Wysoki, Sredni, Niski)
- **Kategoria** — grupowanie wg kategorii projektu

**Karteczki zadan:**
Kazda karteczka wyswietla:
- Nazwe zadania
- Kategorie (kolorowa etykieta)
- Termin wykonania
- Pasek postepu
- Avatar przypisanej osoby
- Kolorowa lewa krawedz wg priorytetu (czerwona = krytyczny, pomaranczowa = wysoki)

Klikniecie karteczki otwiera szczegolowy widok zadania.

---

## 6. Widok PM — Timeline

Os czasu wyswietla zadania na wykresie Gantta z mozliwoscia edycji terminow.

**Skala czasowa:**
W prawym gornym rogu mozna przelaczac skale:
- **Dzien** — najdokladniejszy widok
- **Tydzien** — domyslny, optymalny widok
- **Miesiac** — szersza perspektywa
- **Kwartal** — przeglad strategiczny

**Paski zadan:**
Kazde zadanie jest przedstawione jako kolorowy pasek:
- Kolor odpowiada statusowi (niebieski = w trakcie, zolty = do weryfikacji itd.)
- Wewnetrzne wypelnienie pokazuje postep
- Na pasku widoczny jest procentowy postep

**Edycja terminow (drag & drop):**
- **Przesuwanie calego paska** — uchwyc srodek paska i przeciagnij w lewo/prawo,
  aby przesunac cale zadanie (data poczatku i termin)
- **Zmiana daty poczatku** — uchwyc lewa krawedz paska
- **Zmiana terminu** — uchwyc prawa krawedz paska

**Zaleznosci:**
Jesli zadanie ma ustawiona zaleznosc (blokujace zadanie), na wykresie
pojawi sie strzalka laczaca oba zadania. Czerwona przerywana linia
oznacza zadanie zablokowane.

**Linia "dzis":**
Niebieska pionowa linia oznacza biezacy dzien.

---

## 7. Widok PM — Obciazenie zespolu

Ten widok pozwala zarzadzac zespolem i monitorowac obciazenie pracownikow.

**Wykres obciazenia (gora widoku):**
Poziomy wykres slupkowy pokazuje procentowe wykorzystanie godzin
tygodniowych kazdego czlonka zespolu:
- **0-70% (zielony)** — Dostepny, moze przyjac nowe zadania
- **70-90% (zolty)** — Optymalnie obciazony
- **90-100% (pomaranczowy)** — Na granicy wydajnosci
- **>100% (czerwony)** — Przeciazony! Wymaga odciazenia

**Karty czlonkow zespolu:**
Pod wykresem wyswietlane sa karty poszczegolnych czlonkow zawierajace:
- Imie, nazwisko, rola i godziny tygodniowe
- Adres e-mail (jesli ustawiony)
- Procentowe wykorzystanie z kolorowym wskaznikiem
- Pasek obciazenia
- Liste najblizszych zadan z pozostalymi godzinami
- Przyciski edycji i usuwania czlonka (ikony po prawej)

**Dodawanie nowego czlonka:**
Kliknij przycisk **+ Czlonek zespolu** w prawym gornym rogu wykresu.
Wypelnij formularz: imie i nazwisko, e-mail, rola (z listy stanowisk)
i godziny tygodniowe.

**Edycja czlonka:**
Kliknij ikone olowka na karcie osoby. Mozesz zmienic wszystkie dane
wlacznie z rola i adresem e-mail.

**Usuwanie czlonka:**
Kliknij ikone kosza na karcie osoby. Pojawi sie potwierdzenie —
zadania przypisane do tej osoby nie zostana usuniete, ale stracą
przypisanie.

---

## 8. Widok PM — Alerty

Widok alertow zbiera i kategoryzuje wszystkie ostrzezenia dotyczace zadan.

**Kategorie alertow:**

| Kategoria          | Ikona | Opis                                         |
|--------------------|-------|----------------------------------------------|
| Przeterminowane    | Czerw.| Zadania po terminie — wymaga uwagi           |
| Zablokowane        | Pom.  | Zadania oczekujace na odblokowanie            |
| Zblizajace sie     | Zolty | Deadline w ciagu 2 dni                        |
| Brak postepu       | Pom.  | Zadania "W trakcie" bez aktywnosci >3 dni     |
| Zagrozone          | Zolty | Postep znacznie ponizej oczekiwanego          |

**Karty podsumowujace (gora widoku):**
Piec kart z liczbami zadan w kazdej kategorii alertow.

**Listy zadan:**
Pod kartami znajduja sie rozwiniete listy zadan pogrupowane wg kategorii.
Kazdy wiersz zawiera:
- Nazwe zadania i przypisana osobe
- Znaczniki eskalacji (dla przeterminowanych):
  - Znaczek — powiadomienie w systemie
  - Koperta — wyslano e-mail
  - Flaga — eskalacja do PM
  - Czerwone kolo — eskalacja do kierownika
- Termin z informacja ile dni po/do terminu
- Pasek postepu

**Klikniecie wiersza** otwiera szczegoly zadania.

**Logika eskalacji (dla zadan przeterminowanych):**

| Dni po terminie | Poziom | Dzialania                         |
|-----------------|--------|-----------------------------------|
| 0 (dzis)        | 1      | Znaczek w systemie                |
| 1-2 dni         | 2      | + e-mail do osoby                 |
| 3-6 dni         | 3      | + eskalacja do PM                 |
| 7+ dni          | 4      | + eskalacja do Kierownika         |

---

## 9. Widok PM — Ustawienia

Panel ustawien pozwala administratorowi dostosowac konfigurowalne listy
wykorzystywane w calej aplikacji. Zmiany sa zapisywane natychmiast
i dotycza calego zespolu.

**Edytowalne listy:**

### Kategorie
Typy projektow wyswietlane w formularzach zadan i na tablicy Kanban.
Domyslne: FENG, KPO, Horyzont Europa, Konsulting, Marketing,
Administracja, Doradztwo, Wewnetrzne.

Kazda kategoria ma przypisany kolor (kliknij kwadracik koloru, aby zmienic).

### Statusy
Etapy zadania widoczne jako kolumny na tablicy Kanban.
Domyslne: Do zrobienia, W trakcie, Do weryfikacji, Zakonczone, Zablokowane.

Status **"Zakonczone" nie moze byc usuniety** — jest wymagany przez logike
automatycznego zamykania zadan.

Przy kazdym statusie mozna ustawic **limit WIP** — maksymalna liczbe zadan
ktore moga jednoczesnie znajdowac sie w danej kolumnie Kanban.

### Priorytety
Poziomy pilnosci zadan. Domyslne: Krytyczny, Wysoki, Sredni, Niski.
Kolejnosc na liscie okresla sortowanie na tablicy Kanban (pierwszy = najwazniejszy).

### Role
Stanowiska dostepne przy edycji czlonkow zespolu.
Domyslne: PM, Kierownik, Specjalista ds. FENG, Specjalista ds. KPO,
Analityk, Marketing, Doradca, Administracja, Konsultant.

**Operacje na kazdej liscie:**
- **Dodawanie** — wpisz nazwe w pole na dole i kliknij "+ Dodaj" (lub Enter)
- **Usuwanie** — kliknij przycisk X po prawej stronie pozycji
- **Zmiana kolejnosci** — kliknij strzalki gora/dol po lewej stronie
- **Zmiana koloru** — kliknij kolorowy kwadracik (dostepne dla kategorii,
  statusow i priorytetow)

**Zapisywanie:**
Po dokonaniu zmian kliknij przycisk **"Zapisz zmiany"** w prawym gornym
rogu widoku. Pojawi sie potwierdzenie zapisu.

---

## 10. Widok Specjalisty — Moje zadania

Ten widok jest przeznaczony dla czlonkow zespolu do przegladania wlasnych zadan.

**Jak uzywac:**
1. W pasku filtrow wybierz role **Specjalista**
2. Z rozwijanej listy "Wybierz osobe" wybierz swoje imie i nazwisko
3. Zobaczysz liste wylacznie swoich zadan posortowanych wg terminu

**Kazda karta zadania zawiera:**
- Identyfikator zadania (np. ZAD-001)
- Status (kolorowa etykieta)
- Kategorie projektu
- Ewentualne ostrzezenie (np. "Przeterminowane 3d")
- Nazwe zadania
- Pasek postepu z procentem i pozostalymi godzinami
- Termin z informacja ile dni pozostalo

**Klikniecie karty** otwiera szczegoly zadania, gdzie mozna:
- Zaktualizowac postep (suwak 0-100%)
- Zmienic status
- Zobaczyc pelny opis, tagi i zaleznosci

---

## 11. Widok Kierownika — Portfolio

Widok strategiczny przedstawiajacy kondycje calego portfela projektow.

**Karty KPI (gora widoku):**
Szesc kart z kluczowymi metrykami: aktywne zadania, zakonczone,
przeterminowane, zablokowane, sredni czas realizacji, pozostale godziny.

**Wykresy:**
- **Wykorzystanie zespolu** — wykres slupkowy obciazenia kazdej osoby
- **Wykres spalania** — trend realizacji w czasie

**Tabela przegladu zespolu:**
Tabela z kolumnami: Osoba, Liczba zadan, Wykorzystanie (%),
Przeterminowane, Pozostalo (h). Kolorowe wskazniki ulatwiaja
identyfikacje osob wymagajacych uwagi.

---

## 12. Zarzadzanie zadaniami

### Tworzenie nowego zadania

1. Kliknij przycisk **+ Zadanie** w naglowku
2. Wypelnij formularz:
   - **Nazwa zadania** (wymagane)
   - **Opis** (opcjonalny)
   - **Przypisany** — wybierz osobe z listy zespolu
   - **Kategoria** — typ projektu (FENG, KPO, Marketing...)
   - **Status** — poczatkowy status (domyslnie "Do zrobienia")
   - **Priorytet** — poziom pilnosci
   - **Typ terminu** — DEADLINE (twardy termin) lub DEKLAROWANY (orientacyjny)
   - **Tryb** — Rozlozone (praca na przestrzeni czasu) lub Ciagle (praca blokowa)
   - **Data poczatkowa i termin**
   - **Szacowane godziny** — planowany naklad pracy
   - **Postep** — poczatkowy postep (suwak 0-100%)
   - **Tagi** — etykiety oddzielone przecinkami (np. #pilne, #klient)
   - **Zaleznosc** — jesli zadanie jest blokowane przez inne, wybierz je z listy
3. Kliknij **Utworz zadanie**

### Edycja zadania

1. Kliknij karteczke zadania (na Kanban, Timeline lub w liscie)
2. W oknie szczegolow kliknij **Edytuj**
3. Zmodyfikuj dowolne pola
4. Kliknij **Zapisz zmiany**

### Aktualizacja postepu

1. Kliknij karteczke zadania
2. Uzyj suwaka postepu (0-100%)
3. Kliknij **Zapisz postep**

Mozesz tez szybko zakonczyc zadanie klikajac przycisk **Zakoncz**.

### Zmiana statusu

Sposoby zmiany statusu zadania:
- **Drag & drop** na tablicy Kanban — przeniesc karteczke do innej kolumny
- **Szczegoly zadania** — kliknij karteczke, a na dole znajdziesz przyciski
  do szybkiej zmiany statusu
- **Edycja** — otworz formularz edycji i zmien pole Status

### Usuwanie zadania

1. Otworz formularz edycji zadania (kliknij karteczke > Edytuj)
2. Na dole formularza kliknij **Usun zadanie**
3. Potwierdz usuniecie w oknie dialogowym

---

## 13. Zarzadzanie zespolem

Zarzadzanie czlonkami zespolu odbywa sie w widoku **Obciazenie** (rola PM lub Kierownik).

### Dodawanie czlonka

1. Kliknij **+ Czlonek zespolu**
2. Wypelnij:
   - **Imie i nazwisko** (wymagane)
   - **Email** — adres e-mail do powiadomien (np. `jan.kowalski@k2biznes.pl`)
   - **Rola** — wybierz stanowisko z listy
   - **Godziny / tydzien** — dostepny limit godzin tygodniowych (domyslnie 40)
3. Kliknij **Dodaj do zespolu**

### Edycja czlonka

1. Na karcie czlonka kliknij ikone olowka
2. Zmodyfikuj dane
3. Kliknij **Zapisz**

### Usuwanie czlonka

1. Na karcie czlonka kliknij ikone kosza
2. Potwierdz operacje
3. Zadania przypisane do osoby nie zostana usuniete — straca przypisanie

> **Wazne:** Upewnij sie, ze kazdy czlonek zespolu ma ustawiony adres e-mail.
> Bez niego nie otrzyma powiadomien o swoich zadaniach.

---

## 14. Filtry i wyszukiwanie

Pasek filtrow nad obszarem glownym pozwala zawezic wyswietlane zadania:

| Filtr          | Opis                                           |
|----------------|-------------------------------------------------|
| Rola           | Przelacza widoki (PM / Specjalista / Kierownik)|
| Wszyscy        | Filtr osoby — wybierz konkretna osobe           |
| Kategorie      | Filtr kategorii projektu                        |
| Priorytet      | Filtr priorytetu                                |
| Zakonczone     | Checkbox — pokazuje/ukrywa zakonczone zadania   |

Filtry dzialaja na widokach: Kanban, Timeline, Moje zadania.
Widoki Dashboard i Portfolio zawsze pokazuja pelne dane.

Po prawej stronie paska filtrow wyswietla sie licznik: ile zadan
spelnia aktualne kryteria filtrowania.

---

## 15. Import i eksport danych

### Eksport do Excel

1. Kliknij przycisk **Eksport Excel** w naglowku
2. Plik `.xlsx` zostanie pobrany automatycznie
3. Plik zawiera dwa arkusze:
   - **Zadania** — wszystkie zadania ze wszystkimi polami
   - **Zespol** — lista czlonkow zespolu z rolami, godzinami i e-mailami

### Import z Excel

1. Kliknij przycisk **Import** w naglowku
2. Wybierz plik `.xlsx` lub `.xls`
3. Aplikacja przetworzy plik i wyswietli podsumowanie:
   - Ile zadan zostalo zaimportowanych (nowych)
   - Ile zadan zostalo zaktualizowanych (istniejace ID)
   - Ewentualne bledy

> **Format pliku importu:** Plik musi zawierac arkusz z naglowkami
> odpowiadajacymi polom zadan (Nazwa, Status, Priorytet itd.).
> Najlatwiej — wyeksportuj najpierw aktualny plik, zmodyfikuj go
> i zaimportuj z powrotem.

---

## 16. Powiadomienia e-mail

Aplikacja automatycznie wysyla powiadomienia e-mail w nastepujacych sytuacjach:

**Harmonogram:** Poniedzialek - Piatek, godz. 8:00 rano (automatycznie)

**Rodzaje powiadomien:**

| Sytuacja                | Odbiorca                    |
|-------------------------|-----------------------------|
| Zadanie przeterminowane | Przypisana osoba + PM       |
| Zadanie zablokowane     | PM                          |
| Deadline jutro/dzis     | Przypisana osoba + PM       |

**Warunki dzialania:**
- Aplikacja musi dzialac (serwer aktywny)
- Czlonek zespolu musi miec ustawiony adres e-mail
- Konto nadawcy (`NOTIFICATION_SENDER_EMAIL` w konfiguracji) musi miec
  uprawnienia do wysylania poczty

**Reczne wyslanie alertow:**
Administrator moze wymusic wyslanie alertow klikajac endpoint:
```
POST /api/alerts/send
```

---

## Skroty i porady

- **Szybkie zakonczenie zadania:** Kliknij karteczke > przycisk "Zakoncz"
  (ustawia postep 100% i status "Zakonczone")
- **Przenoszenie na Kanban:** Uzyj drag & drop — najszybszy sposob zmiany statusu
- **Edycja terminow na Timeline:** Przeciagnij krawedzie paska zadania
- **Nowe stanowisko:** Ustawienia > Role > wpisz nazwe > "+ Dodaj"
- **Nowa kategoria:** Ustawienia > Kategorie > wpisz nazwe > "+ Dodaj"
- **Dane odsuwieezaja sie co 10 sekund** — nie trzeba reczne odswierzac strony

---

## Kontakt i wsparcie

W razie pytan dotyczacych uzytkowania aplikacji skontaktuj sie z:
**t.kala@k2biznes.pl**
