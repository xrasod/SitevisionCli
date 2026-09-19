# Sitevision CLI – Användarguide

> English: [user-guide.md](user-guide.md)

Den här guiden beskriver hur `svc` fungerar i vardagen: hur den hittar dina
appar, var konfigurationen ligger, hur det interaktiva skalet styrs och i detalj
hur autentiseringen fungerar.

- [1. Begrepp](#1-begrepp)
- [2. Installera och starta](#2-installera-och-starta)
- [3. Skalet](#3-skalet)
- [4. Konfiguration](#4-konfiguration)
- [5. Autentisering](#5-autentisering)
- [6. Miljöer och produktion](#6-miljöer-och-produktion)
- [7. Bygga, signera, driftsätta](#7-bygga-signera-driftsätta)
- [8. Direktkommandon och CI](#8-direktkommandon-och-ci)
- [9. Felsökning](#9-felsökning)
- [Referens](#referens)

---

## 1. Begrepp

| Begrepp                             | Betydelse                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App**                             | En katalog med `manifest.json` (i roten, `static/` eller `src/`) och `package.json`. WebApp, Widget, RESTApp och MCPServer stöds.                                     |
| **Arbetsyta**                       | Ett repo som innehåller flera appar i undermappar, t.ex. `webapps/*`, `restapps/*`, `widgets/*`.                                                                      |
| **`.dev_properties.json`**          | Din lokala konfiguration och huvudkällan: domän, webbplats, tillägg, användarnamn, auth-metod, signeringsanvändare, miljöer. Checka inte in den.                      |
| **Standardvärden i `package.json`** | Gemensamma, incheckade värden som ligger under `.dev_properties.json`: allt utom användarspecifika fält.                                                              |
| **Nyckelringen**                    | Operativsystemets lagring för hemligheter (macOS-nyckelringen, Autentiseringshanteraren i Windows, libsecret på Linux). Alla lösenord, tokens och cookies sparas där. |
| **Miljö**                           | En namngiven målwebbplats, t.ex. `dev`, `test`, `prod`. Konfigurationen på toppnivå är en miljö; övriga skriver bara över det som skiljer.                            |
| **Tillägg**                         | Den anpassade modulen (addon) i webbplatsens tilläggsarkiv (Addon Repository) som appen laddas upp till.                                                              |

## 2. Installera och starta

Kräver Node.js 22 eller senare.

```bash
npm install --global sitevision-cli
```

Kör `svc` utan argument:

- **I en app** → skalet öppnas i enappsläge.
- **I roten av ett repo** → skalet letar i undermappar (upp till tre nivåer,
  hoppar över `node_modules`, `dist`, `build` och punktmappar) och öppnas i
  arbetsyteläge med alla appar i en navigator till vänster.
- Någon annanstans → ett fel om att inga appar hittades.

Första gången `svc` körs i en app visas en kort välkomstskärm. Efter en
uppgradering visas en rad "updated to vX", och när en nyare version finns på npm
talar `svc` om det.

Om en arbetsyta har appar men ingen användbar konfiguration (ingen domän eller
webbplats någonstans) öppnas skalet direkt på **Arbetsyteinställningar**, så att
den gemensamma konfigurationen kan fyllas i en gång. `Esc` hoppar över.

## 3. Skalet

```
┌ toppfält: kontext · domän · inloggningsstatus · miljöbricka · version ┐
│ navigator  │  Översikt · Konfig · Versioner · Logg                     │
│ (arbetsyta)│                                                           │
└ bottenfält: tangenterna som gäller just nu · pågående uppgift/meddelande ┘
```

**Toppfältet** visar vilken app och flik du är på, webbplatsens domän,
inloggningsstatus (t.ex. `basic me@acme.se`, `oauth2 · ej inloggad`,
`sso · ej inloggad`) och en bricka för aktiv miljö: grön för basmiljön, gul
för andra, röd för produktion.

**Bottenfältet** listar alltid tangenterna som fungerar i det aktuella läget, så
tabellen nedan behövs sällan. När en uppgift körs visas förloppet till höger.

Språket i gränssnittet väljs under **Inställningar** (`,`).

### Fokus: navigator och innehåll

I arbetsyteläge finns två paneler. `Tab` växlar mellan dem.

- I **navigatorn** filtrerar det du skriver applistan (ungefärlig matchning).
  `↑`/`↓` flyttar, `Enter` väljer appen **och flyttar fokus till
  innehållspanelen**, `Esc` rensar filtret.
- Åtgärdstangenter som `d` eller `p` fungerar bara i **innehållspanelen**. Skriver
  du `d` i navigatorn söker du efter "d".
- Sista raden i navigatorn är **Arbetsyteinställningar**: rotens
  `.dev_properties.json`, med standardvärdena i rotens `package.json` under. Se
  [4](#gemensam-konfiguration-i-en-arbetsyta).

### Flikar

| Flik          | Innehåll                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Översikt**  | Appinfo och status: beroenden installerade, konfiguration komplett, `package.json` i synk, signering konfigurerad, senaste uppgifter. |
| **Konfig**    | Hela `.dev_properties.json` som ett formulär, plus hemligheterna i nyckelringen. Se [4](#4-konfiguration).                            |
| **Versioner** | Versionerna som laddats upp till tillägget på aktiv miljös webbplats. `a` aktiverar vald version, `r` uppdaterar.                     |
| **Logg**      | Löpande utdata från bygge, signering, driftsättning, dev och watch för vald app.                                                      |

`1`–`4` eller `←`/`→` byter flik.

### Tangenter

Globala (innehållspanelen):

| Tangent   | Åtgärd                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| `d`       | Dev: bygg vid varje ändring, signera om det är konfigurerat, driftsätt          |
| `w`       | Watch: bygg vid varje ändring, signera om det är konfigurerat, driftsätt aldrig |
| `b`       | Bygg en gång                                                                    |
| `s`       | Signera den byggda zip-filen                                                    |
| `p` / `P` | Driftsätt / driftsätt med tvång till aktiv miljö                                |
| `a`       | Öppna Versioner (och aktivera, när du redan är där)                             |
| `v`       | Växla aktiv miljö                                                               |
| `K`       | Stoppa pågående uppgifter för vald app                                          |
| `e`       | Öppna fliken Konfig                                                             |
| `y`       | Kopiera gemensamma värden från `.dev_properties.json` till `package.json`       |
| `i`       | `npm install`                                                                   |
| `l`       | Logga in igen (glömmer inloggningen som hålls för sessionen)                    |
| `,`       | Inställningar: språk (engelska/svenska) och introanimation                      |
| `/`       | Kommandopalett: alla åtgärder, sökbara                                          |
| `?`       | Hjälp: alla tangenter, och de som fungerar där du är                            |
| `Tab`     | Växla mellan navigator och innehåll                                             |
| `Esc`     | Tillbaka / avbryt                                                               |
| `q`       | Avsluta (stoppar pågående uppgifter)                                            |

Per flik:

| Flik      | Tangenter                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Konfig    | `↑`/`↓` eller `Tab` fält · `Enter` redigera / spara · `Esc` avbryt · `←`/`→`/mellanslag byter val · `Ctrl+O` välj tillägg |
| Versioner | `↑`/`↓` välj · `a` aktivera · `r` uppdatera                                                                               |
| Logg      | `↑`/`↓` scrolla · `PgUp`/`PgDn` sida · `f` hoppa till slutet · `x` radbrytning av/på                                      |

Bara via kommandopaletten (`/`): **Lägg till miljö**, **Arbetsyteinställningar**,
**Logga ut** och **Flytta lösenord till nyckelringen** (visas när ett gammalt
lösenord i klartext hittas).

Dev och watch fortsätter köra i bakgrunden medan du byter app. Flera appar kan
köra samtidigt.

### Skapa en ny app

**Ny app** i kommandopaletten (`/`) skapar en app med Sitevisions eget verktyg,
`npx @sitevision/create-sitevision-app <namn>`. `svc` frågar efter namnet och
mappen den ska skapas i, kör verktyget som en uppgift (utdata finns i fliken
**Logg**) och visar verktygets frågor allteftersom. Det verktyget frågar är det
du får svara på; två saker skiljer sig från att köra det för hand:

- Domän, webbplatsnamn, användarnamn och HTTP-inställningen besvaras från
  arbetsytans konfiguration när de finns där.
- Lösenordsfrågan hoppas över. Lösenord hör hemma i nyckelringen, inte i appens
  `.dev_properties.json`.

När verktyget är klart byter `svc` ut mallens platshållare i `manifest.json`:
namnet blir appens namn, och `author` och `helpUrl` hämtas från `author` och
`homepage` i `package.json` i arbetsytans rot när de är satta. I en arbetsyta
krymps appens `.dev_properties.json` till det som skiljer sig från den
gemensamma konfigurationen (oftast ingenting, så den tas bort) och
tilläggsnamnet flyttas till appens `package.json`. Den nya appen väljs och `svc`
erbjuder sig att skapa dess tillägg på webbplatsen.

Går verktyget inte att styra så här (en framtida version kan ställa sina frågor
på ett annat sätt, och Node äldre än 22.15 kan inte haka i det) kliver `svc` åt
sidan och kör samma kommando i den vanliga terminalen, kommer sedan tillbaka och
fyller i manifestet på samma sätt.

### Kompakt layout

`svc --minimal`, eller en terminal smalare än 100 kolumner, ger en kompakt
layout: ingen sidopanel (applistan blir en rad) och korta fliknamn. Praktiskt i
en delad terminalpanel.

## 4. Konfiguration

Konfigurationen ligger i två filer:

| Fil                    | Innehåller                                                                                   | Checka in? |
| ---------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| `.dev_properties.json` | Din konfiguration. Huvudkällan; vanliga sitevision-scripts läser den också.                  | Nej        |
| `package.json`         | Gemensamma standardvärden för alla som jobbar med appen: allt utom användarspecifika värden. | Ja         |

`username`, `signingUsername` och `certificateName` är **användarspecifika**.
De finns bara i `.dev_properties.json`. Lägg `.dev_properties.json` i
`.gitignore`: `svc` skriver aldrig hemligheter dit, men vanliga
sitevision-scripts sparar driftsättningslösenordet där.

### `.dev_properties.json`

```json
{
	"domain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"username": "me@acme.se",
	"authMethod": "basic",
	"signingUsername": "me@acme.se",
	"certificateName": "",
	"useHTTPForDevDeploy": false
}
```

| Fält                  | Betydelse                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `domain`              | Webbplatsens värdnamn, utan `https://`. En inklistrad URL kortas till värdnamnet när den sparas.                                     |
| `siteName`            | Namnet på webbplatsens rotnod som det står i webbplatsträdet. Ingår i REST-API:ets sökväg.                                           |
| `addonName`           | Tillägget i tilläggsarkivet. `Ctrl+O` på fältet listar befintliga tillägg.                                                           |
| `username`            | Sitevision-konto för driftsättning. Behöver DEVELOPER eller MANAGE_ADDONS på webbplatsen. Krävs för `basic`, annars bara en etikett. |
| `authMethod`          | `basic` (standard), `oauth2` eller `cookie`. Se [5](#5-autentisering).                                                               |
| `oauth2`              | `{clientId, authorizationEndpoint, tokenEndpoint, scopes, redirectPort}` för `oauth2`.                                               |
| `sessionLoginUrl`     | Sidan som öppnas vid `cookie`-inloggning. Standard är webbplatsens rot.                                                              |
| `useHTTPForDevDeploy` | HTTP i stället för HTTPS. Bara för lokala servrar utan TLS.                                                                          |
| `signingUsername`     | Ditt konto på developer.sitevision.se.                                                                                               |
| `certificateName`     | Vilket certifikat som ska användas om kontot har flera.                                                                              |
| `baseEnvironment`     | Namnet på miljön på toppnivå. Standard är `dev`.                                                                                     |
| `production`          | Gör basmiljön till en produktionsmiljö.                                                                                              |
| `environments`        | Övriga miljöer. Se [6](#6-miljöer-och-produktion).                                                                                   |

Filen får också heta `.dev-properties.json`.

### Standardvärden i `package.json`

Gemensamma värden checkas in i `package.json`. `svc` läser dem under
`.dev_properties.json`, så ett värde i `.dev_properties.json` vinner alltid.

```json
{
	"developmentDomain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"svc": {
		"authMethod": "oauth2",
		"oauth2": {
			"clientId": "svc-cli",
			"authorizationEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/authorize",
			"tokenEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/token"
		},
		"environments": {"prod": {"domain": "acme.sitevision-cloud.se"}}
	}
}
```

`developmentDomain` (domänen), `siteName` och `addonName` ligger på toppnivå.
Övriga gemensamma fält (`authMethod`, `oauth2`, `sessionLoginUrl`,
`useHTTPForDevDeploy`, `baseEnvironment`, `production`, `environments`) ligger
under `"svc"`. Användarspecifika fält ignoreras där.

En ny utvecklare öppnar appen med `svc` och anger sitt användarnamn. I
enappsläge skriver första sparningen en komplett `.dev_properties.json` med
standardvärdena ifyllda, så att vanliga sitevision-scripts också fungerar.

### Redigera i fliken Konfig

Varje fält sparas direkt när du trycker `Enter` på det; det finns inget separat
sparasteg. Hemliga rader (lösenord, klienthemlighet, signeringslösenord) skrivs
till nyckelringen, aldrig till filen. Lämnar du en hemlighet tom och trycker
`Enter` tas den bort ur nyckelringen.

Kolumnen **KÄLLA** visar var varje värde kommer ifrån:

- `lokal` – satt i appens egen fil
- `↑ rot` – ärvt från en `.dev_properties.json` längre upp
- `package.json` – ett standardvärde från `package.json`
- `↑ dev` / `<miljö>` – i en annan miljö än basmiljön: ärvt från basen, eller
  överskrivet här
- `manifest.json` – ett fält i appens manifest
- `nyckelring` – en hemlighet är sparad
- `✗ krävs` – saknas

Sektionen **MANIFEST** redigerar själva `manifest.json`: id, version, namn,
beskrivning, författare och hjälp-URL. Ett flerspråkigt namn eller en
flerspråkig beskrivning får en rad per språk. Värden byts ut på plats, så
kommentarer och formatering i filen finns kvar; att lägga till eller ta bort ett
fält i ett manifest med kommentarer får göras för hand.

Under formuläret listar **PACKAGE.JSON-SYNK** de gemensamma värden i katalogens
`.dev_properties.json` som `package.json` ännu inte har, varken här eller i en
`package.json` längre upp. `y` kopierar in dem i `package.json` så att de kan
checkas in. Användarspecifika fält kopieras aldrig, inte heller inifrån
`environments`. För en app listas också manifestets `version`, `description`
och `author` när appens `package.json` skiljer sig; manifestet vinner, och ett
`author`-objekt i `package.json` lämnas orört. Samma sektion och `y` fungerar i **Arbetsyteinställningar**, mot
rotens `package.json`. Saknar arbetsytans rot en `package.json` säger sektionen
det, och `y` skapar en. Kan `package.json` inte läsas eller skrivas visar `svc`
en varning i stället för att spara.

### Gemensam konfiguration i en arbetsyta

Arv mellan kataloger är en funktion i `svc`. För en app slås varje värde upp i
den här ordningen, och första träffen vinner:

1. Appens egen `.dev_properties.json`, om den har en
2. `.dev_properties.json` i överliggande kataloger, upp till repots rot
   (katalogen som innehåller `.git`)
3. Appens `package.json`
4. `package.json` i överliggande kataloger, upp till repots rot

Rekommenderad struktur:

```
repo/
  package.json              ← gemensamt: developmentDomain, siteName, "svc": {authMethod, oauth2, environments}   incheckad
  .dev_properties.json      ← ditt: username, signingUsername                                                  ignorerad
  webapps/
    news/package.json       ← "addonName": "news"                                                              incheckad
    search/package.json     ← "addonName": "search"                                                            incheckad
```

I arbetsyteläge skapar `svc` aldrig en `.dev_properties.json` i en app. Sparar
du i en apps flik Konfig skrivs det till rotens `.dev_properties.json`, utom
tilläggsnamnet som hamnar i appens `package.json`. En app som redan har en egen
`.dev_properties.json` fortsätter använda den. Gemensamma värden som ändrats på
det sättet kopieras sedan till rotens `package.json` med `y` i
**Arbetsyteinställningar** (sista raden i navigatorn, eller paletten).

Vanliga sitevision-scripts läser bara appens egen `.dev_properties.json`, så i
en arbetsyta ser de inte ärvda värden.

Eftersom nyckelringsposterna nycklas på domän och användarnamn räcker en
inloggning för alla appar på samma webbplats.

### `.svcconfig`

En liten fil med CLI-inställningar, i appens eller arbetsytans rot. Inga
hemligheter.

```json
{
	"environment": "test"
}
```

- `environment` – senast valda miljö med `v`

### Globala inställningar

Språk och introanimation ligger i `~/.config/sitevision-cli/config.json` (eller
`$XDG_CONFIG_HOME/sitevision-cli/`). Ändra dem med `,` i skalet.

## 5. Autentisering

### Två separata inloggningar

`svc` pratar med **två olika tjänster**, med var sitt konto:

| Inloggning        | Används till                                            | Värd                      | Auth                             | Konfigureras med         |
| ----------------- | ------------------------------------------------------- | ------------------------- | -------------------------------- | ------------------------ |
| **Driftsättning** | Driftsätta, lista och aktivera versioner, lista tillägg | Din webbplats (`domain`)  | `basic`, `oauth2` eller `cookie` | `username`, `authMethod` |
| **Signering**     | Signera zip-filen                                       | `developer.sitevision.se` | Alltid användarnamn + lösenord   | `signingUsername`        |

De har inget med varandra att göra. Att logga in på webbplatsen med SSO hjälper
inte för signeringen, och signeringslösenordet skickas aldrig till webbplatsen.

### Var hemligheter sparas

Inget hemligt skrivs någonsin till `.dev_properties.json`, `.svcconfig` eller
någon annan fil. Allt ligger i operativsystemets nyckelring under tjänstenamnet
`sitevision-cli`:

| Konto i nyckelringen                 | Innehåll                         | Skapas när                                                               |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `deploy:<username>@<domain>`         | Driftsättningslösenord (`basic`) | Du anger det i Konfig, eller kryssar i "Spara i nyckelringen" vid frågan |
| `signing:<signingUsername>`          | Signeringslösenord               | Samma, för signering                                                     |
| `oauth2-refresh:<clientId>@<domain>` | OAuth2 refresh-token             | Efter lyckad OAuth2-inloggning (om leverantören ger ut en)               |
| `oauth2-secret:<clientId>@<domain>`  | OAuth2 klienthemlighet           | Du anger den i Konfig                                                    |
| `session:<username>@<domain>`        | Sessionscookies från webbläsaren | Efter lyckad cookie-inloggning                                           |

OAuth2-åtkomsttokens sparas aldrig. De hålls i minnet så länge skalet (eller det
enskilda kommandot) körs och hämtas på nytt nästa gång med hjälp av
refresh-token.

Under en session i skalet frågas du högst en gång per webbplats, sedan
återanvänds inloggningen av alla åtgärder och alla appar på den webbplatsen.

**Logga ut** (paletten) tar bort driftsättningslösenordet, sessionscookien och
refresh-token för aktiv webbplats. Signeringslösenordet och OAuth2-klienthemligheten
ligger kvar; ta bort dem genom att tömma fälten i Konfig.

### Uppslagsordning

**Driftsättningslösenord (`basic`)**

1. `SITEVISION_DEPLOY_PASSWORD`
2. Nyckelringen `deploy:<username>@<domain>`
3. Fråga, med val att spara i nyckelringen

**Signeringslösenord**

1. `SITEVISION_SIGNING_PASSWORD`
2. Nyckelringen `signing:<signingUsername>`
3. Fråga, med val att spara i nyckelringen

**OAuth2-åtkomsttoken**

1. `--token` eller `SITEVISION_ACCESS_TOKEN`
2. Tyst förnyelse med refresh-token från nyckelringen
3. Inloggning i webbläsaren

**Sessionscookie**

1. `--cookie` eller `SITEVISION_SESSION_COOKIE`
2. Nyckelringen `session:<username>@<domain>`
3. Inloggning i webbläsaren

Om en förfrågan har flera sorters inloggningsuppgifter vinner cookie över
bearer-token, som vinner över basic.

### Metod: `basic`

Användarnamn och lösenord skickas som HTTP Basic-auth i varje förfrågan.

Använd den när kontot är ett lokalt Sitevision-konto (inte federerad SSO).

Inställning: ange `username`, låt `authMethod` vara `basic` och ange antingen
lösenordet i fliken Konfig eller vänta på frågan vid första driftsättningen.

### Metod: `oauth2`

En bearer-token från webbplatsens egen OAuth2-leverantör, hämtad med
authorization code-flödet och PKCE i din vanliga webbläsare. Fungerar med
SSO-konton.

**Vad som händer vid inloggning**

1. `svc` startar en liten server på `http://127.0.0.1:8137`.
2. Webbläsaren öppnar webbplatsens auktoriseringssida. Du loggar in (SSO
   inkluderat) och godkänner.
3. Webbläsaren skickas tillbaka till `http://127.0.0.1:8137/callback`; sidan
   säger att du kan stänga den.
4. `svc` byter koden mot en åtkomsttoken och, om leverantören ger ut en, en
   refresh-token som sparas i nyckelringen.
5. Nästa gång använder `svc` refresh-token i tysthet och ingen webbläsare
   öppnas. Har refresh-token gått ut eller återkallats tas den bort och
   inloggningen i webbläsaren körs igen.

Öppnas inte webbläsaren skriver inloggningsskärmen ut adressen så att du kan
öppna den själv. `Esc` avbryter och frigör porten. Inloggningen avbryts efter fem
minuter.

**På webbplatsen (Sitevision-administratör)**

Görs en gång per webbplats av någon med administratörsrättigheter:

1. Aktivera **OAuth2-leverantören** på webbplatsen och **spara**
   konfigurationen. Discovery-dokumentet på
   `https://<domain>/.well-known/openid-configuration` publiceras först när den
   har sparats.
2. Skapa en **klient**:
   - Redirect-URI: `http://127.0.0.1:8137/callback` (exakt)
   - Grant types: `authorization_code` och `refresh_token`
   - Scopes: ta med `ALL` och `offline_access`
   - Klienthemlighet är valfri. Har klienten en måste varje utvecklare ange den i
     `svc` (se nedan).
3. Ge utvecklarna **klient-id** (och eventuell hemlighet).

**I CLI:t**

1. Sätt **Auth-metod** till `oauth2` i fliken Konfig.
2. Ange **OAuth2 klient-id**.
3. **Auktoriserings-** och **token-endpoint** fylls i automatiskt från
   webbplatsens discovery-dokument. Misslyckas det, ange dem för hand:
   `https://<domain>/oauth2-provider/authorize` och
   `https://<domain>/oauth2-provider/token`.
4. **Scopes** är som standard `ALL offline_access`.
5. **Klienthemlighet**: ange den bara om klienten har en.
6. Tryck `l`, eller driftsätt direkt; inloggningen startar när den behövs.

Resulterande konfiguration (hemligheten finns inte i den):

```json
{
	"domain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"username": "me@acme.se",
	"authMethod": "oauth2",
	"oauth2": {
		"clientId": "svc-cli",
		"authorizationEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/authorize",
		"tokenEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/token",
		"scopes": ["ALL", "offline_access"]
	}
}
```

**Fallgropar**

| Symptom                                                 | Orsak och åtgärd                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Kunde inte hitta OAuth2-endpoints"                     | Leverantören är inte aktiverad, eller konfigurationen har aldrig sparats. Spara den på webbplatsen, eller ange endpoints för hand.                                  |
| `invalid_scope` … "not present in client configuration" | Scopes måste ha exakt samma skiftläge som i klienten. Discovery-dokumentet kan lista `all` medan klienten har `ALL`. Använd det klienten har.                       |
| `401 invalid_client` "Client authentication failed"     | Klienten har en hemlighet som `svc` inte skickade. Ange **Klienthemlighet** i Konfig. `svc` behandlar klienten som publik när ingen hemlighet är sparad.            |
| Redirect-fel i webbläsaren                              | Klientens redirect-URI är inte exakt `http://127.0.0.1:8137/callback`.                                                                                              |
| Inloggning i webbläsaren varje gång                     | Ingen refresh-token: lägg till `offline_access` bland scopes och tillåt grant-typen `refresh_token` i klienten.                                                     |
| "Local login server error … EADDRINUSE"                 | Något annat använder port 8137. Frigör den, eller sätt `"redirectPort"` under `oauth2` i `.dev_properties.json` och registrera motsvarande redirect-URI i klienten. |

Leverantören har ingen client credentials-grant, så det finns ingen helt
obevakad inloggning: den första inloggningen går alltid via en webbläsare. För
CI, se [8](#8-direktkommandon-och-ci).

### Metod: `cookie`

Återanvänder en riktig webbläsarsession. För webbplatser där SSO/SAML är enda
vägen in och ingen OAuth2-klient finns.

**Vad som händer vid inloggning**

1. `svc` öppnar ett separat Google Chrome-fönster på webbplatsens rot (eller
   `sessionLoginUrl`). Chrome måste vara installerat.
2. Du loggar in där, SSO inkluderat, och väntar tills själva webbplatsen har
   laddats.
3. Du går tillbaka till terminalen och trycker `Enter`.
4. `svc` läser webbläsarens cookies, väljer `JSESSIONID`-sessionen för din
   webbplats och alla cookies på den värden, sparar dem i nyckelringen och
   stänger fönstret.

Hittas ingen session listar meddelandet vilka cookie-domäner som syntes, och
fönstret förblir öppet så att du kan gå till en sida på webbplatsen och trycka
`Enter` igen. `Esc` avbryter.

Sessioner går ut. En utgången session svarar sällan med en ren 401; `svc`
tolkar en omdirigering eller en inloggningssida i HTML som utgången, tar bort den
sparade cookien och ber dig logga in igen.

**Inställning:** sätt **Auth-metod** till `cookie`, eventuellt en
**Inloggnings-URL**, och tryck sedan `l` eller driftsätt.

**Fallgropar**

- "Could not open a login browser (is Chrome installed?)" – installera Chrome,
  eller använd den manuella vägen nedan.
- Vissa identitetsleverantörer (villkorsstyrd åtkomst, enhetskrav) nekar en
  webbläsare som startats på det här sättet. Logga då in i din vanliga
  webbläsare, kopiera cookie-headern från utvecklarverktygen och skicka den med
  `--cookie` eller `SITEVISION_SESSION_COOKIE`.

### Vilken metod fungerar var

|                                                        | `basic`                           | `oauth2`                                       | `cookie`                                                                                          |
| ------------------------------------------------------ | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Skalet (`svc`): driftsätt, dev, versioner, tilläggsval | fråga                             | inloggning i webbläsaren                       | inloggning i webbläsaren                                                                          |
| `svc deploy`                                           | fråga                             | refresh-token, annars inloggning i webbläsaren | cookie i nyckelringen, annars inloggning i webbläsaren                                            |
| `svc dev`                                              | fråga                             | bara med `--token` / `SITEVISION_ACCESS_TOKEN` | cookie i nyckelringen från en tidigare inloggning, eller `--cookie` / `SITEVISION_SESSION_COOKIE` |
| `svc watch`                                            | behövs inte (ingen driftsättning) | behövs inte                                    | behövs inte                                                                                       |
| Signering (`s`, `svc sign`, `--signed`)                | separat signeringslösenord        | separat signeringslösenord                     | separat signeringslösenord                                                                        |

I praktiken: med `oauth2` eller `cookie`, kör dev från skalet.

En OAuth2-åtkomsttoken lever så länge leverantören tillåter. Börjar en långvarig
dev-session misslyckas med "Unauthorized", tryck `l` för att logga in igen.

### Gamla lösenord i klartext

Tidigare versioner sparade `password` i `.dev_properties.json`. Hittas ett
sådant erbjuder `svc` att flytta det till nyckelringen och ta bort det ur filen:
som en fråga före ett direktkommando, eller som **Flytta lösenord till
nyckelringen** i paletten. Tills det är flyttat används klartextvärdet.

## 6. Miljöer och produktion

Fälten på toppnivå är en miljö, som heter `dev` om inte `baseEnvironment` säger
något annat. Lägg till fler under `environments` med bara de fält som skiljer:

```json
{
	"domain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"username": "me@acme.se",
	"signingUsername": "me@acme.se",
	"environments": {
		"test": {"domain": "acme-tse.sitevision-cloud.se"},
		"prod": {
			"domain": "acme.sitevision-cloud.se",
			"authMethod": "oauth2",
			"oauth2": {
				"clientId": "svc-cli",
				"authorizationEndpoint": "…",
				"tokenEndpoint": "…"
			}
		}
	}
}
```

En miljö kan skriva över `domain`, `siteName`, `addonName`, `username`,
`authMethod`, `oauth2`, `sessionLoginUrl`, `useHTTPForDevDeploy` och
`production`. Signeringsinställningarna delas av alla miljöer.

I skalet:

- `v` växlar miljö; **Lägg till miljö** i paletten skapar en ny. Valet sparas i
  `.svcconfig`.
- Driftsättning, Versioner, inloggningsstatus och fliken Konfig följer alla aktiv
  miljö. I en annan miljö än basmiljön redigerar fliken Konfig den miljöns
  överskrivningar.
- Inloggningsuppgifter slås upp för miljöns egen domän och användarnamn, så
  varje miljö har sin egen inloggning.

**Produktionsmiljöer**

En miljö är produktion när:

- den ligger under `environments` och namnet innehåller `prod`, om den inte
  anger `"production": false`; eller
- den har `"production": true`.

Basmiljön är bara produktion med `"production": true`, aldrig på grund av
namnet. Ett repo vars enda webbplats är produktion kan alltså sätta
`"baseEnvironment": "prod"` och ändå använda dev.

I en produktionsmiljö:

- `p` driftsätter den **signerade** zip-filen (`dist/<id>-signed.zip`), ber om
  bekräftelse och **aktiverar** den nya versionen.
- `d` (dev) vägrar köra.

Direktkommandon (`svc deploy` m.fl.) använder alltid basmiljön; att byta miljö
går bara i skalet.

## 7. Bygga, signera, driftsätta

### Bygga

| App                                        | Hur den byggs                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `bundled: true`, ingen `webpack.config.js` | Lämnas över till `@sitevision/sitevision-scripts build` (8.x) i projektets `node_modules`. |
| `bundled: true`, egen `webpack.config.js`  | Kompileras med projektets webpack.                                                         |
| Inte bundlad                               | `src/` och `static/` kopieras som de är.                                                   |

Resultatet är `dist/<manifest-id>.zip`. Kör `i` (`npm install`) först om
beroenden saknas; fliken Översikt visar det.

### Signera

Laddar upp `dist/<id>.zip` till developer.sitevision.se och skriver
`dist/<id>-signed.zip`. Kräver `signingUsername` och signeringslösenordet.
Nätverksfel och serverfel görs om, upp till tre försök.

### Driftsätta

Laddar upp zip-filen till tilläggets import-endpoint på aktiv miljös
webbplats. `P` (tvinga) skriver över en befintlig version med samma nummer. För
produktion, se [6](#6-miljöer-och-produktion).

### Dev och watch

Båda bygger en gång, bevakar sedan `src`, `static`, `i18n`, `resource`, `config`
och `manifest.json` och bygger om vid ändring.

- Är `signingUsername` satt signeras varje bygge.
- Dev driftsätter sedan (med tvång) varje bygge. Watch gör det inte.
- Utdata hamnar i fliken Logg. `K` stoppar.

## 8. Direktkommandon och CI

Alla kommandon körs i aktuell appkatalog och använder basmiljön.

```bash
svc build
svc sign
svc deploy [--force] [--production [--activate]] [--token <t>] [--cookie <c>]
svc dev [--signed] [--token <t>] [--cookie <c>]
svc watch [--signed]
svc info
```

- `svc deploy --production` laddar upp den signerade zip-filen. Den aktiveras
  bara med `--activate` (skalet aktiverar alltid i produktion).
- `svc sign` frågar om signeringslösenordet i nyckelringen ska användas.

**Miljövariabler**

| Variabel                               | Effekt                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `SITEVISION_DEPLOY_PASSWORD`           | Driftsättningslösenord; hoppar över nyckelring och fråga                |
| `SITEVISION_SIGNING_PASSWORD`          | Signeringslösenord; hoppar över nyckelring och fråga                    |
| `SITEVISION_ACCESS_TOKEN`              | OAuth2 bearer-token (när `authMethod` är `oauth2`); samma som `--token` |
| `SITEVISION_SESSION_COOKIE`            | Cookie-header (när `authMethod` är `cookie`); samma som `--cookie`      |
| `SITEVISION_APP_ID_PREFIX` / `_SUFFIX` | Läggs runt manifest-id i zip-namnet vid byggen som körs i CLI:t         |
| `APP_ID_PREFIX` / `APP_ID_SUFFIX`      | Samma sak för byggen som lämnas över till sitevision-scripts            |
| `XDG_CONFIG_HOME`                      | Plats för de globala inställningarna                                    |

Miljövariabler skrivs aldrig någonstans.

**CI-exempel (basic-auth)**

```bash
export SITEVISION_DEPLOY_PASSWORD=…     # från CI-systemets hemlighetslager
export SITEVISION_SIGNING_PASSWORD=…
svc build && svc sign && svc deploy --production --activate
```

För `oauth2` finns ingen obevakad inloggning; skaffa en token på annat sätt och
skicka den med `SITEVISION_ACCESS_TOKEN`. Ett lokalt, icke-federerat tjänstekonto
med `basic` är oftast det enklaste för CI.

## 9. Felsökning

| Meddelande                                                     | Gör så här                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "No Sitevision apps found here."                               | Kör i en app, eller i roten av ett repo med appar högst tre nivåer ner.                                  |
| "Unauthorized. Check username and password."                   | Fel driftsättningslösenord. **Logga ut** i paletten och driftsätt igen för att få frågan.                |
| "Unauthorized. The access token was rejected or has expired."  | Tryck `l` för att logga in igen.                                                                         |
| "Unauthorized. The session cookie was rejected or has expired" | Tryck `l`; en ny inloggning i webbläsaren startar.                                                       |
| "Zip not found … Run build first."                             | `b` först. För produktion: `b` och sedan `s`.                                                            |
| "Conflict. Addon already exists."                              | Driftsätt med tvång (`P` / `--force`).                                                                   |
| "Dev driftsätter aldrig till en produktionsmiljö"              | Byt miljö med `v`, eller använd `w` (watch).                                                             |
| Tangenterna gör ingenting                                      | Fokus är i navigatorn, där det du skriver filtrerar. Tryck `Enter` eller `Tab`.                          |
| Lösenordsfråga varje gång                                      | Kryssa i **Spara i nyckelringen** vid frågan, eller ange lösenordet i fliken Konfig.                     |
| "No token/cookie available" från `svc dev`                     | Kör dev från skalet i stället, eller skicka `--token` / `--cookie`. Se tabellen i [5](#5-autentisering). |

Felmeddelanden från servern och direktkommandona är på engelska även när
gränssnittet är på svenska.

## Referens

**Filer**

| Fil                                     | Innehåller                                           | Checka in? |
| --------------------------------------- | ---------------------------------------------------- | ---------- |
| `.dev_properties.json`                  | Din konfiguration, med användarspecifika värden      | Nej        |
| `package.json`                          | Gemensamma standardvärden (toppnivåfält och `"svc"`) | Ja         |
| `.svcconfig`                            | Aktiv miljö                                          | Nej        |
| `~/.config/sitevision-cli/config.json`  | Språk, introanimation                                | –          |
| `dist/<id>.zip`, `dist/<id>-signed.zip` | Byggresultat                                         | Nej        |
| Nyckelringen, tjänst `sitevision-cli`   | Alla hemligheter                                     | –          |
