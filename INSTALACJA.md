# Task Manager K2 — Instrukcja instalacji

## Spis tresci

1. [Wymagania](#1-wymagania)
2. [Szybki start (tryb lokalny)](#2-szybki-start-tryb-lokalny)
3. [Konfiguracja z SharePoint Online](#3-konfiguracja-z-sharepoint-online)
4. [Rejestracja aplikacji w Azure AD](#4-rejestracja-aplikacji-w-azure-ad)
5. [Konfiguracja list SharePoint](#5-konfiguracja-list-sharepoint)
6. [Uruchomienie serwera deweloperskiego](#6-uruchomienie-serwera-deweloperskiego)
7. [Wdrozenie na Azure App Service](#7-wdrozenie-na-azure-app-service)
8. [Rozwiazywanie problemow](#8-rozwiazywanie-problemow)

---

## 1. Wymagania

| Narzedzie | Wersja  | Cel                          |
|-----------|---------|------------------------------|
| Node.js   | >= 18   | Serwer backend + build       |
| npm       | >= 9    | Menedzer pakietow            |
| Git       | dowolna | Pobranie repozytorium        |
| Azure CLI | >= 2.50 | Tylko do wdrozenia na Azure  |

Sprawdzenie wersji:

```bash
node -v    # powinno wyswietlic v18.x lub nowsze
npm -v     # powinno wyswietlic 9.x lub nowsze
git --version
```

---

## 2. Szybki start (tryb lokalny)

Ten tryb nie wymaga konta Microsoft ani dostepu do SharePoint.
Dane sa przechowywane lokalnie w pliku `server/data.json`.

```bash
# 1. Sklonuj repozytorium
git clone <adres-repozytorium>
cd task-dashboard

# 2. Zainstaluj zależnosci frontendowe
npm install

# 3. Zainstaluj zaleznosci serwerowe
cd server && npm install && cd ..

# 4. Uruchom aplikacje (frontend + backend)
npm run dev:full
```

Aplikacja otworzy sie pod adresem: **http://localhost:5173**

> W trybie lokalnym nie sa dostepne: alerty e-mail, synchronizacja z SharePoint,
> logowanie Microsoft. Dane sa zapisywane w pliku `server/data.json`.

---

## 3. Konfiguracja z SharePoint Online

Aby polaczycz aplikacje z Microsoft 365 (SharePoint + Outlook), wykonaj ponizsze kroki.

### 3.1. Skopiuj plik konfiguracyjny

```bash
cp server/.env.example server/.env
```

### 3.2. Uzupelnij plik `server/.env`

```env
# Azure AD (z kroku 4)
AZURE_TENANT_ID=86c26d8a-...
AZURE_CLIENT_ID=e64ca72a-...
AZURE_CLIENT_SECRET=jOc8Q~...

# SharePoint (z kroku 5)
SHAREPOINT_SITE_ID=k2biznes.sharepoint.com,...
SHAREPOINT_TASKS_LIST_ID=f5668417-...
SHAREPOINT_TEAM_LIST_ID=7bfacd1f-...

# E-mail
NOTIFICATION_SENDER_EMAIL=t.kala@k2biznes.pl
PM_EMAIL=t.kala@k2biznes.pl
MANAGER_EMAIL=

# Tryb
DATA_MODE=sharepoint
FRONTEND_AUTH=false
```

---

## 4. Rejestracja aplikacji w Azure AD

### 4.1. Utworz rejestracje aplikacji

1. Otworz: https://portal.azure.com
2. Przejdz do: **Microsoft Entra ID** > **App registrations** > **New registration**
3. Wypelnij:
   - **Name**: `Task Manager K2`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: wybierz **Single-page application (SPA)** i wpisz `http://localhost:5173`
4. Kliknij **Register**

### 4.2. Zapisz identyfikatory

Na stronie przegladu aplikacji skopiuj:

| Pole                     | Zmienna w .env          |
|--------------------------|-------------------------|
| Application (client) ID  | `AZURE_CLIENT_ID`       |
| Directory (tenant) ID    | `AZURE_TENANT_ID`       |

### 4.3. Utworz klucz tajny (Client Secret)

1. W menu bocznym kliknij **Certificates & secrets**
2. Kliknij **New client secret**
3. Opis: `Task Manager Backend`, Waznosc: `24 miesiace`
4. Kliknij **Add**
5. **Natychmiast skopiuj** wartosc klucza (wyswietla sie tylko raz!) do `AZURE_CLIENT_SECRET`

### 4.4. Nadaj uprawnienia API

1. W menu bocznym kliknij **API permissions**
2. Kliknij **Add a permission** > **Microsoft Graph**
3. Dodaj uprawnienia **Application permissions**:

| Uprawnienie            | Cel                                |
|------------------------|------------------------------------|
| `Sites.ReadWrite.All`  | Odczyt/zapis list SharePoint       |
| `Sites.Manage.All`     | Zarzadzanie kolumnami list         |
| `Mail.Send`            | Wysylanie powiadomien e-mail       |

4. Kliknij **Grant admin consent for [nazwa organizacji]**
5. Upewnij sie, ze przy kazdym uprawnieniu jest zielony znaczek "Granted"

---

## 5. Konfiguracja list SharePoint

### 5.1. Utworz witryne SharePoint (jesli nie istnieje)

1. Otworz: https://admin.microsoft.com > **SharePoint** > **Active sites**
2. Utworz nowa witryne zespolu, np. `TaskManager`

### 5.2. Znajdz ID witryny

Pobierz identyfikator witryny — najlatwiej za pomoca Graph Explorer:

1. Otworz: https://developer.microsoft.com/graph/graph-explorer
2. Zaloguj sie kontem organizacyjnym
3. Wykonaj zapytanie:
   ```
   GET https://graph.microsoft.com/v1.0/sites/{domena}.sharepoint.com:/sites/{nazwa-witryny}
   ```
4. Z odpowiedzi skopiuj pole `id` — to jest `SHAREPOINT_SITE_ID`

### 5.3. Uruchom skrypt konfiguracyjny

Skrypt automatycznie utworzy listy `Zadania` i `Zespol` z wymaganymi kolumnami:

```bash
cd server
node setup-full.js
```

Skrypt wyswietli ID utworzonych list — wpisz je do `.env`:
- `SHAREPOINT_TASKS_LIST_ID`
- `SHAREPOINT_TEAM_LIST_ID`

### 5.4. Kolumny listy Zadania

| Kolumna SharePoint | Typ         | Opis                        |
|--------------------|-------------|-----------------------------|
| Title              | Text        | Nazwa zadania               |
| TaskId             | Text        | Unikalny identyfikator      |
| Description1       | Text (multi)| Opis zadania                |
| Assignee           | Text        | Przypisana osoba            |
| Status             | Choice      | Status zadania              |
| Priority           | Choice      | Priorytet                   |
| TaskType           | Choice      | DEADLINE / DEKLAROWANY      |
| Category           | Choice      | Kategoria projektu          |
| StartDate          | DateTime    | Data poczatku               |
| DueDate            | DateTime    | Termin wykonania            |
| CompletedDate      | DateTime    | Data zakonczenia            |
| EstHours           | Number      | Szacowane godziny           |
| ActualHours        | Number      | Faktyczne godziny           |
| Progress           | Number      | Postep (0-100%)             |
| Tags               | Text        | Tagi oddzielone przecinkami  |
| Mode               | Choice      | Rozlozone / Ciagle          |
| Dependency         | Text        | ID zadania blokujacego      |

### 5.5. Kolumny listy Zespol

| Kolumna SharePoint | Typ    | Opis                    |
|--------------------|--------|-------------------------|
| Title              | Text   | Imie i nazwisko         |
| MemberId           | Text   | Unikalny identyfikator  |
| Role               | Choice | Rola/stanowisko         |
| Hours              | Number | Godziny tygodniowo      |
| Email              | Text   | Adres e-mail            |

---

## 6. Uruchomienie serwera deweloperskiego

### Tryb z SharePoint (bez logowania w przegladarce)

```bash
# Upewnij sie, ze server/.env jest poprawnie skonfigurowany
# FRONTEND_AUTH=false oznacza brak ekranu logowania

npm run dev:full
```

Otwieraj: **http://localhost:5173**

### Tryb z SharePoint (z logowaniem Microsoft)

Zmien w `server/.env`:
```env
FRONTEND_AUTH=true
```

Przy otwarciu aplikacji pojawi sie ekran logowania Microsoft.

### Architektura portow

| Usluga            | Port | Opis                              |
|--------------------|------|-----------------------------------|
| Frontend (Vite)    | 5173 | Serwer deweloperski React         |
| Backend (Express)  | 3001 | API serwer (proxy z Vite)         |

Vite automatycznie przekierowuje zapytania `/api/*` do portu 3001.

---

## 7. Wdrozenie na Azure App Service

### 7.1. Zainstaluj Azure CLI

```bash
# macOS
brew install azure-cli

# Windows
winget install -e --id Microsoft.AzureCLI

# Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

### 7.2. Zaloguj sie

```bash
az login
```

Otworzy sie przegladarka — zaloguj sie kontem z uprawnieniami do subskrypcji Azure.

### 7.3. Uruchom deployment

```bash
chmod +x deploy.sh
./deploy.sh
```

Skrypt automatycznie:
- Zbuduje frontend (`npm run build`)
- Zainstaluje zaleznosci serwera
- Utworzy zasoby Azure (Resource Group, App Service Plan B1, Web App)
- Skonfiguruje zmienne srodowiskowe z `server/.env`
- Ustawi `FRONTEND_AUTH=true` i `PORT=8080`
- Wdrozy aplikacje

### 7.4. Dodaj Redirect URI w Azure Portal (wymagane!)

Po wdrozeniu:

1. Otworz: https://portal.azure.com
2. Przejdz do: **Entra ID** > **App registrations** > **Task Manager K2**
3. Kliknij: **Authentication**
4. W sekcji **Single-page application** dodaj:
   ```
   https://task-manager-k2.azurewebsites.net
   ```
5. Kliknij **Save**

### 7.5. Gotowe!

Aplikacja jest dostepna pod adresem:

```
https://task-manager-k2.azurewebsites.net
```

Kazdy czlonek zespolu moze sie zalogowac kontem `@k2biznes.pl`.

---

## 8. Rozwiazywanie problemow

### Blad `block_nested_popups`

**Przyczyna**: Frontend probuje otworzyc popup logowania MSAL.
**Rozwiazanie**: Ustaw `FRONTEND_AUTH=false` w `server/.env` i zrestartuj serwer.

### Blad `AADSTS50011: The redirect URI does not match`

**Przyczyna**: Brak Redirect URI w rejestracji aplikacji Azure.
**Rozwiazanie**: Dodaj `http://localhost:5173` (dev) lub `https://task-manager-k2.azurewebsites.net` (prod) w Azure Portal > App registrations > Authentication.

### Blad `Insufficient privileges` przy operacjach SharePoint

**Przyczyna**: Brak uprawnien aplikacyjnych lub niezatwierdzone przez admina.
**Rozwiazanie**: W Azure Portal > App registrations > API permissions sprawdz, czy `Sites.ReadWrite.All` i `Mail.Send` maja status "Granted".

### E-maile nie dochodza

**Przyczyna**: Czlonek zespolu nie ma ustawionego adresu e-mail.
**Rozwiazanie**: W aplikacji przejdz do widoku **Obciazenie**, kliknij ikone edycji przy osobie i uzupelnij pole e-mail.

### Port 3001 jest zajety

```bash
# Znajdz proces zajmujacy port
lsof -i :3001
# Zakoncz proces
kill <PID>
```

### Aplikacja nie laczy sie z SharePoint

1. Sprawdz czy `DATA_MODE=sharepoint` w `.env`
2. Sprawdz czy `AZURE_CLIENT_SECRET` nie wygasl (waznosc 24 msc)
3. Przetestuj polaczenie: `curl http://localhost:5173/api/tasks`

---

## Struktura projektu

```
task-dashboard/
  src/
    App.jsx              # Punkt wejscia — tryby autoryzacji
    TaskDashboard.jsx     # Glowny komponent aplikacji
    authConfig.js         # Konfiguracja MSAL
  server/
    server.js             # Express API
    graph.js              # Microsoft Graph API client
    settings.json         # Konfigurowalne listy (kategorie, statusy, role...)
    setup-full.js         # Skrypt tworzacy listy SharePoint
    .env                  # Konfiguracja (NIE COMMITOWAC!)
    .env.example          # Szablon konfiguracji
  deploy.sh               # Skrypt wdrozenia na Azure
  vite.config.js          # Konfiguracja Vite + proxy
  package.json            # Zaleznosci frontendowe
```

---

## Kontakt

W razie problemow z instalacja skontaktuj sie z administratorem:
**t.kala@k2biznes.pl**
