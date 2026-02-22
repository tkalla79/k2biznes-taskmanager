# Konfiguracja Azure AD (Entra ID) - Task Manager

## Krok 1: Rejestracja aplikacji w Azure Portal

1. Wejdz na https://portal.azure.com
2. Przejdz do **Microsoft Entra ID** > **App registrations** > **New registration**
3. Wypelnij:
   - **Name**: `Task Manager K2`
   - **Supported account types**: `Accounts in this organizational directory only (k2biznes.onmicrosoft.pl)`
   - **Redirect URI**:
     - Platform: `Single-page application (SPA)`
     - URI: `http://localhost:5173` (dev)
     - Dodaj tez: `https://TWOJA-DOMENA.azurewebsites.net` (produkcja)
4. Kliknij **Register**

## Krok 2: Zapisz dane

Po rejestracji zapisz:
- **Application (client) ID** - np. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Directory (tenant) ID** - np. `yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy`

## Krok 3: Client Secret (dla backendu)

1. W zarejestrowanej aplikacji > **Certificates & secrets** > **New client secret**
2. Opis: `Task Manager Backend`
3. Waznosc: `24 months`
4. **ZAPISZ wartosc secret** (pokaze sie tylko raz!)

## Krok 4: Uprawnienia API (API Permissions)

1. Przejdz do **API permissions** > **Add a permission** > **Microsoft Graph**
2. Wybierz **Delegated permissions** i dodaj:
   - `User.Read` (domyslnie jest)
   - `Sites.ReadWrite.All` (SharePoint Lists)
   - `Mail.Send` (wysylanie email)
3. Kliknij **Add a permission** > **Microsoft Graph** > **Application permissions**:
   - `Sites.ReadWrite.All` (backend SharePoint)
   - `Mail.Send` (backend email)
4. Kliknij **Grant admin consent for k2biznes** (wymagane!)

## Krok 5: Utworz SharePoint List

1. Wejdz na SharePoint swojego tenanta (np. https://k2biznes.sharepoint.com)
2. Utworz nowa **Site** (jezeli nie masz): np. `Task Manager`
3. Na stronie utworz **List** o nazwie `Zadania` z kolumnami:

   | Kolumna         | Typ                 | Uwagi                    |
   |-----------------|---------------------|--------------------------|
   | Title           | Single line (domyslna) | = Nazwa zadania (name) |
   | TaskId          | Single line         | np. ZAD-001              |
   | Description     | Multiple lines      |                          |
   | Assignee        | Single line         |                          |
   | Status          | Choice              | Do zrobienia, W trakcie, Do weryfikacji, Zakonczone, Zablokowane |
   | Priority        | Choice              | Krytyczny, Wysoki, Sredni, Niski |
   | TaskType        | Choice              | DEADLINE, DEKLAROWANY    |
   | Category        | Choice              | FENG, KPO, Horyzont Europa, Konsulting, Marketing, Administracja, Doradztwo, Wewnetrzne |
   | StartDate       | Date                |                          |
   | DueDate         | Date                |                          |
   | CompletedDate   | Date                |                          |
   | EstHours        | Number              |                          |
   | ActualHours     | Number              |                          |
   | Progress        | Number              | 0-100                    |
   | Tags            | Single line         | rozdzielone przecinkami   |
   | Mode            | Choice              | Rozlozone, Ciagle        |
   | Dependency      | Single line         | ID zadania blokujacego   |

4. Utworz druga liste **Zespol** z kolumnami:

   | Kolumna    | Typ           |
   |------------|---------------|
   | Title      | Single line   | = Imie i nazwisko
   | MemberId   | Single line   | np. M01
   | Role       | Single line   |
   | Hours      | Number        |

5. Zapisz:
   - **Site ID** (znajdziesz w API: GET https://graph.microsoft.com/v1.0/sites/k2biznes.sharepoint.com:/sites/NazwaSite)
   - **List ID** dla "Zadania"
   - **List ID** dla "Zespol"

## Krok 6: Plik .env

Skopiuj `server/.env.example` do `server/.env` i uzupelnij danymi z krokow powyzej.

## Krok 7: Uruchom

```bash
npm run dev:full
```

Aplikacja automatycznie wykryje czy plik .env jest skonfigurowany.
Jesli tak - uzyje SharePoint + Graph API.
Jesli nie - dziala na lokalnym data.json (tryb offline).
