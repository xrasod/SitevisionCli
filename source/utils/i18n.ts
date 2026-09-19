/**
 * UI language. English strings are the keys; `t()` returns them untouched in
 * English and looks them up in the Swedish table otherwise, falling back to
 * English for anything untranslated. `{name}` placeholders are filled from
 * the vars argument.
 */
export type Language = 'en' | 'sv';
export const LANGUAGES: Language[] = ['en', 'sv'];
export const LANGUAGE_NAMES: Record<Language, string> = {
	en: 'English',
	sv: 'Svenska',
};

let current: Language = 'en';

export function getLanguage(): Language {
	return current;
}

export function setLanguage(language: Language): void {
	current = language;
}

export function t(
	text: string,
	vars?: Record<string, string | number>,
): string {
	let out = current === 'sv' ? (sv[text] ?? text) : text;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			out = out.split(`{${name}}`).join(String(value));
		}
	}

	return out;
}

const sv: Record<string, string> = {
	// Frame
	APP: 'APP',
	'WORKSPACE {n} apps': 'ARBETSYTA {n} appar',
	'WORKSPACE 1 app': 'ARBETSYTA 1 app',
	'{arrow} {n} more': '{arrow} {n} till',
	'deps·config·sync·signing': 'beroenden·konfig·synk·sign',
	'Workspace settings': 'Arbetsyteinställningar',
	TASKS: 'UPPGIFTER',
	// Tabs
	Overview: 'Översikt',
	Config: 'Konfig',
	Versions: 'Versioner',
	Log: 'Logg',
	Ovw: 'Övs',
	Cfg: 'Kfg',
	Ver: 'Ver',
	id: 'id',
	version: 'version',
	type: 'typ',
	addon: 'tillägg',
	site: 'webbplats',
	domain: 'domän',
	auth: 'auth',
	'signing user': 'signeringsanv.',
	'not set': 'ej satt',
	'↑ root': '↑ rot',
	' · bundled': ' · paketerad',
	deps: 'beroenden',
	config: 'konfig',
	sync: 'synk',
	signing: 'signering',
	scripts: 'scripts',
	'missing · i to install': 'saknas · i för att installera',
	'not installed · i to install': 'ej installerat · i för att installera',
	'dev properties': 'dev-egenskaper',
	'missing · e to edit': 'saknas · e för att redigera',
	'{n} diffs · y to apply': '{n} skillnader · y för att tillämpa',
	'1 diff · y to apply': '1 skillnad · y för att tillämpa',
	'missing · / set up signing': 'saknas · / konfigurera signering',
	'not installed': 'ej installerat',
	'⚠ plaintext password in .dev_properties.json · / migrate':
		'⚠ lösenord i klartext i .dev_properties.json · / migrera',
	RECENT: 'SENASTE',
	'⚠ Configure dev properties first (e).':
		'⚠ Konfigurera dev-egenskaper först (e).',
	'Press R to fetch versions from {domain}.':
		'Tryck R för att hämta versioner från {domain}.',
	'APP IDENTIFIER': 'APP-ID',
	VERSION: 'VERSION',
	ACTIVE: 'AKTIV',
	'No versions uploaded to {addon}.': 'Inga versioner uppladdade till {addon}.',
	'{n} versions · a activate selected · r refresh':
		'{n} versioner · a aktivera vald · r uppdatera',
	'1 version · a activate selected · r refresh':
		'1 version · a aktivera vald · r uppdatera',
	' · fetched {time}': ' · hämtad {time}',
	'No task yet. d dev · w watch · b build · s sign · p deploy':
		'Ingen uppgift ännu. d dev · w watch · b build · s sign · p deploy',
	' · following': ' · följer',
	// Palette
	SETUP: 'INSTÄLLNINGAR',
	AUTH: 'AUTH',
	Commands: 'Kommandon',
	'{n} actions': '{n} åtgärder',
	'type to filter · ↑↓ move · Enter run · Esc close':
		'skriv för att filtrera · ↑↓ flytta · Enter kör · Esc stäng',
	// Addon picker
	'Addon Repository': 'Tilläggsförråd',
	'{n} of {m}': '{n} av {m}',
	'fetching addons': 'hämtar tillägg',
	'↑↓ move · Enter select · Esc cancel': '↑↓ flytta · Enter välj · Esc avbryt',
	// Actions
	Dev: 'Dev',
	Watch: 'Watch',
	Build: 'Build',
	Sign: 'Sign',
	Deploy: 'Driftsätt',
	'Deploy (force)': 'Driftsätt (tvinga)',
	'to {env}': 'till {env}',
	'Switch environment': 'Byt miljö',
	'Add environment': 'Lägg till miljö',
	Help: 'Hjälp',
	'every key in one place': 'alla tangenter på ett ställe',
	Keys: 'Tangenter',
	'Esc close': 'Esc stäng',
	Here: 'Här',
	'Move around': 'Förflytta dig',
	'switch pane': 'byt panel',
	tabs: 'flikar',
	help: 'hjälp',
	// Help guide
	'Typing filters the app list. ↑↓ move, Enter selects the app and moves focus to the content pane. Action keys such as d or p only work there; in the navigator they search.':
		'Skriv för att filtrera applistan. ↑↓ flyttar, Enter väljer appen och flyttar fokus till innehållspanelen. Åtgärdstangenter som d eller p fungerar bara där; i navigatorn söker de.',
	'The last row is Workspace settings: the shared root config that every app inherits.':
		'Sista raden är Arbetsytans inställningar: den delade rotkonfigurationen som alla appar ärver.',
	"The root .dev_properties.json shared by every app, with the root package.json defaults underneath. Fill in site, auth and environments once; an app's own config overrides only what differs.":
		'Rotens .dev_properties.json som delas av alla appar, med rotens package.json som standardvärden under. Fyll i webbplats, autentisering och miljöer en gång; en apps egen konfig skriver bara över det som skiljer.',
	'Same keys as the Config tab: Enter edits and saves, Esc cancels, ←→ or space cycles choices.':
		'Samma tangenter som Konfig-fliken: Enter redigerar och sparar, Esc avbryter, ←→ eller mellanslag bläddrar bland val.',
	'Each status line names the key that fixes it: i installs dependencies, e opens Config, y syncs package.json, / sets up signing.':
		'Varje statusrad anger tangenten som åtgärdar den: i installerar beroenden, e öppnar Konfig, y synkar package.json, / sätter upp signering.',
	'The badge in the top bar is the active environment: green for the base, yellow for others, red for production. v cycles it.':
		'Märket i toppraden är den aktiva miljön: grönt för basen, gult för övriga, rött för produktion. v växlar.',
	'Values come in layers and the source is shown next to each: your local .dev_properties.json wins, shared package.json values sit underneath, and in a workspace the root config underneath that. Environments add on top of the base and override only what differs.':
		'Värden kommer i lager och källan visas bredvid varje: din lokala .dev_properties.json vinner, delade värden i package.json ligger under, och i en arbetsyta rotkonfigurationen under det. Miljöer läggs ovanpå basen och skriver bara över det som skiljer.',
	'Enter edits and saves a field, Esc cancels, ←→ or space cycles choices, Ctrl+O lists the addons on the site. y copies shared values into package.json for the team.':
		'Enter redigerar och sparar ett fält, Esc avbryter, ←→ eller mellanslag bläddrar bland val, Ctrl+O listar webbplatsens tillägg. y kopierar delade värden till package.json för teamet.',
	'Passwords and secrets go to the OS keychain, never to a file. Leave them empty to be asked on each run.':
		'Lösenord och hemligheter sparas i nyckelringen, aldrig i en fil. Lämna dem tomma för att bli tillfrågad varje gång.',
	"The versions uploaded to the addon on the active environment's site, the domain in the top bar. v switches environment.":
		'Versionerna som laddats upp till tillägget på den aktiva miljöns webbplats, domänen i toppraden. v byter miljö.',
	'↑↓ select, a activates the selected version, r refreshes. Production deploys activate on their own.':
		'↑↓ väljer, a aktiverar vald version, r uppdaterar. Produktionsdriftsättningar aktiverar själva.',
	'Output from build, sign, deploy, dev and watch for the selected app. Dev and watch keep running while you switch apps; K stops them.':
		'Utdata från build, sign, deploy, dev och watch för vald app. Dev och watch fortsätter köra medan du byter app; K stoppar dem.',
	'↑↓ scroll, PgUp/PgDn page, f jumps to the end, x toggles line wrap.':
		'↑↓ scrollar, PgUp/PgDn bläddrar sida, f hoppar till slutet, x växlar radbrytning.',
	"What's new": 'Nyheter',
	'changelog for every release': 'ändringslogg för varje version',
	Changelog: 'Ändringslogg',
	"What's new since {version}": 'Nyheter sedan {version}',
	'↑↓ scroll · Esc close': '↑↓ scrolla · Esc stäng',
	'No changelog found.': 'Ingen ändringslogg hittades.',
	'Create addon': 'Skapa tillägg',
	'Create addon failed': 'Kunde inte skapa tillägget',
	'addon {addon} created': 'tillägget {addon} skapat',
	'Addon {addon} does not exist on {domain}. Create it and deploy again?':
		'Tillägget {addon} finns inte på {domain}. Skapa det och driftsätt igen?',
	'e.g. test or prod, overriding domain and auth':
		't.ex. test eller prod, med egen domän och auth',
	'Environment name (e.g. test, prod)': 'Miljönamn (t.ex. test, prod)',
	'Deploy the signed {id} to {env} and activate it?':
		'Driftsätt signerade {id} till {env} och aktivera?',
	'Dev never deploys to a production environment ({env}). Switch with v.':
		'Dev driftsätter aldrig till en produktionsmiljö ({env}). Byt med v.',
	'switched to {env}': 'bytte till {env}',
	'environment {env} added': 'miljön {env} tillagd',
	environment: 'miljö',
	production: 'produktion',
	env: 'miljö',
	'↑ dev': '↑ dev',
	'Activate a remote version': 'Aktivera en fjärrversion',
	'Stop running task': 'Stoppa pågående uppgift',
	'Edit config': 'Redigera konfig',
	'Sync package.json': 'Synka package.json',
	'Migrate password to OS keychain': 'Flytta lösenord till nyckelringen',
	'Install dependencies': 'Installera beroenden',
	'Log in': 'Logga in',
	'Log out': 'Logga ut',
	Quit: 'Avsluta',
	Settings: 'Inställningar',
	'build, sign and deploy on change': 'bygg, signera och driftsätt vid ändring',
	'build and deploy on change': 'bygg och driftsätt vid ändring',
	'rebuild and sign only': 'bara bygg om och signera',
	'rebuild only': 'bara bygg om',
	'credentials missing': 'uppgifter saknas',
	'signed zip · confirms first': 'signerad zip · bekräftar först',
	'shared auth and site config for every app':
		'delad auth och webbplatskonfig för alla appar',
	'dev properties, auth method, signing':
		'dev-egenskaper, auth-metod, signering',
	'{n} diffs': '{n} skillnader',
	'1 diff': '1 skillnad',
	'in sync': 'synkad',
	'forget stored credentials for this site':
		'glöm sparade uppgifter för webbplatsen',
	'language, intro animation, workspace config':
		'språk, introanimation, arbetsytans konfig',
	'Workspace config': 'Arbetsytans konfig',
	'not configured': 'ej konfigurerad',
	'basic · password needed': 'basic · lösenord krävs',
	'oauth2 · not logged in': 'oauth2 · ej inloggad',
	'sso · not logged in': 'sso · ej inloggad',
	'Dev properties not configured. Edit config first.':
		'Dev-egenskaper ej konfigurerade. Redigera konfig först.',
	'Deploy password for {user}@{domain}':
		'Driftsättningslösenord för {user}@{domain}',
	'Save to OS keychain': 'Spara i nyckelringen',
	'Signing credentials not configured.':
		'Signeringsuppgifter ej konfigurerade.',
	'Signing password for {user} (developer.sitevision.se)':
		'Signeringslösenord för {user} (developer.sitevision.se)',
	'A dev/watch task is already running for this app (K stops it).':
		'En dev/watch-uppgift körs redan för appen (K stoppar den).',
	'stopped {n} task(s)': 'stoppade {n} uppgift(er)',
	'nothing running': 'inget körs',
	'Not in a workspace: run svc at the repo root.':
		'Ingen arbetsyta: kör svc i repots rot.',
	'package.json updated': 'package.json uppdaterad',
	'password moved to keychain': 'lösenord flyttat till nyckelringen',
	'could not access keychain': 'kunde inte nå nyckelringen',
	'logged in': 'inloggad',
	'credentials removed': 'uppgifter borttagna',
	// Config form
	Domain: 'Domän',
	'Site name': 'Webbplatsnamn',
	'Addon name': 'Tilläggsnamn',
	Username: 'Användarnamn',
	'Auth method': 'Auth-metod',
	Password: 'Lösenord',
	'OAuth2 client id': 'OAuth2 klient-id',
	'Authorization endpoint': 'Auktoriseringsendpoint',
	'Token endpoint': 'Token-endpoint',
	Scopes: 'Scopes',
	'Client secret': 'Klienthemlighet',
	'Login URL': 'Inloggnings-URL',
	'Use HTTP': 'Använd HTTP',
	'Signing user': 'Signeringsanvändare',
	Certificate: 'Certifikat',
	'Signing password': 'Signeringslösenord',
	'^O pick from repo': '^O välj från förråd',
	'Space-separated scopes to request. ALL grants the Sitevision API and offline_access adds a refresh token so later runs log in silently. Match the casing your client expects.':
		'Scopes att begära, separerade med mellanslag. ALL ger Sitevision-API:et och offline_access ger en refresh-token så att senare körningar loggar in tyst. Använd det skiftläge klienten förväntar sig.',
	'blank = site root': 'tomt = webbplatsens rot',
	'required for signed deploys': 'krävs för signerad driftsättning',
	'blank = prompt each run': 'tomt = fråga varje gång',
	SIGNING: 'SIGNERING',
	MANIFEST: 'MANIFEST',
	// New app
	'Name of the new app': 'Namn på den nya appen',
	'Create it in folder': 'Skapa den i mappen',
	'Other folder…': 'Annan mapp…',
	'Type a name for the app, for example my-new-app.':
		'Skriv ett namn på appen, till exempel min-nya-app.',
	'Try "{suggestion}".': 'Prova "{suggestion}".',
	"An app name can't have spaces.":
		'Ett appnamn kan inte innehålla mellanslag.',
	"An app name can't contain {chars}: it becomes the folder, the package name and the app id.":
		'Ett appnamn kan inte innehålla {chars}: det blir mappen, paketnamnet och appens id.',
	'Lowercase is safer: npm expects it, and "{name}" and "{lower}" are one folder on macOS and Windows but two on Linux. Try "{suggestion}", or press Enter again to keep "{name}".':
		'Gemener är säkrare: npm förväntar sig det, och "{name}" och "{lower}" är samma mapp på macOS och Windows men två på Linux. Prova "{suggestion}", eller tryck Enter igen för att behålla "{name}".',
	'Start the name with a letter or a digit.':
		'Börja namnet med en bokstav eller en siffra.',
	'{dir} already exists. Pick another name, or keep it and choose a different folder next.':
		'{dir} finns redan. Välj ett annat namn, eller behåll det och välj en annan mapp i nästa steg.',
	'creating {app}: installing, questions follow':
		'skapar {app}: installerar, frågor kommer strax',
	'The scaffolder could not be run from here':
		'Verktyget kunde inte köras härifrån',
	'creating {app} failed, see the log': 'kunde inte skapa {app}, se loggen',
	'{app} created in {dir}': '{app} skapad i {dir}',
	'{app} created': '{app} skapad',
	'Create the addon "{addon}" on {domain} now?':
		'Skapa tillägget "{addon}" på {domain} nu?',
	'↑↓ move · Space toggle · Enter submit · Esc cancel':
		'↑↓ flytta · Mellanslag markera · Enter skicka · Esc avbryt',
	'App id': 'App-id',
	Version: 'Version',
	Name: 'Namn',
	Description: 'Beskrivning',
	Author: 'Författare',
	'Help URL': 'Hjälp-URL',
	'Not saved: {label} is required.': 'Inte sparat: {label} krävs.',
	'Identifier of the app in Sitevision; it also names the zip. Changing it makes the next deploy a new app instead of an update.':
		'Appens identifierare i Sitevision; den namnger också zip-filen. Ändras den blir nästa driftsättning en ny app i stället för en uppdatering.',
	'Version of the app. Id and version together identify an upload, so bump it to deploy a new version instead of overwriting the current one.':
		'Appens version. Id och version identifierar tillsammans en uppladdning, så höj den för att driftsätta en ny version i stället för att skriva över den nuvarande.',
	'Name shown when importing and administering the app in the Sitevision editor. A multilingual manifest needs at least English.':
		'Namnet som visas när appen importeras och administreras i Sitevisions redigerare. Ett flerspråkigt manifest behöver minst engelska.',
	'Short description shown next to the name in the Sitevision editor.':
		'Kort beskrivning som visas bredvid namnet i Sitevisions redigerare.',
	'Who made the app, shown in the Sitevision editor.':
		'Vem som gjort appen, visas i Sitevisions redigerare.',
	"Link to the app's documentation, shown in the Sitevision editor.":
		'Länk till appens dokumentation, visas i Sitevisions redigerare.',
	ENVIRONMENT: 'MILJÖ',
	'Environment name': 'Miljönamn',
	Production: 'Produktion',
	'What this base configuration is: dev, test, prod… Other environments are added on top of it with E or the palette and override only what differs.':
		'Vad denna grundkonfiguration är: dev, test, prod… Andra miljöer läggs ovanpå med E eller paletten och skriver bara över det som skiljer.',
	'Treat deploys to this base environment as production: signed zip, confirmation, activation, and no dev loop. Off by default even when the name says prod, so a repo with only a production site still gets a dev loop.':
		'Behandla driftsättningar till grundmiljön som produktion: signerad zip, bekräftelse, aktivering och ingen dev-loop. Av som standard även om namnet säger prod, så att ett repo med bara en produktionssajt ändå får en dev-loop.',
	'Saved {label}.': 'Sparade {label}.',
	'Looking up OAuth2 endpoints…': 'Slår upp OAuth2-endpoints…',
	'Endpoints filled from the site OpenID config.':
		'Endpoints ifyllda från webbplatsens OpenID-konfig.',
	'Could not discover OAuth2 endpoints; enter them by hand.':
		'Kunde inte hitta OAuth2-endpoints; ange dem manuellt.',
	'✗ required': '✗ krävs',
	keychain: 'nyckelring',
	local: 'lokal',
	'•••••••• keychain': '•••••••• nyckelring',
	FIELD: 'FÄLT',
	VALUE: 'VÄRDE',
	SOURCE: 'KÄLLA',
	"Shared by every app below {root}. An app's own value wins.":
		'Delas av alla appar under {root}. Appens eget värde vinner.',
	'PACKAGE.JSON SYNC': 'PACKAGE.JSON-SYNK',
	'no workspace package.json · y to set up':
		'ingen package.json i arbetsytan · y för att skapa',
	'Not saved: {error}': 'Inte sparat: {error}',
	'←→ choose · Enter confirm · Esc cancel':
		'←→ välj · Enter bekräfta · Esc avbryt',
	'Enter save · Esc cancel': 'Enter spara · Esc avbryt',
	'↑↓ field · Enter edit · ^O pick addon':
		'↑↓ fält · Enter redigera · ^O välj tillägg',
	'↑↓ field · Enter edit': '↑↓ fält · Enter redigera',
	'Tab to edit': 'Tab för att redigera',
	yes: 'ja',
	no: 'nej',
	// Shell
	workspace: 'arbetsyta',
	settings: 'inställningar',
	save: 'spara',
	cancel: 'avbryt',
	field: 'fält',
	edit: 'redigera',
	back: 'tillbaka',
	quit: 'avsluta',
	search: 'sök',
	move: 'flytta',
	select: 'välj',
	clear: 'rensa',
	'no matches': 'inga träffar',
	'{n} matches': '{n} träffar',
	'1 match': '1 träff',
	'edit settings': 'redigera inställningar',
	apps: 'appar',
	activate: 'aktivera',
	refresh: 'uppdatera',
	deploy: 'driftsätt',
	force: 'tvinga',
	versions: 'versioner',
	commands: 'kommandon',
	follow: 'följ',
	wrap: 'radbryt',
	stop: 'stoppa',
	'pick addon': 'välj tillägg',
	login: 'logga in',
	install: 'installera',
	'{v} is already active': '{v} är redan aktiv',
	'{v} activated': '{v} aktiverad',
	'No credentials.': 'Inga uppgifter.',
	'not available': 'ej tillgänglig',
	'{n} tasks': '{n} uppgifter',
	idle: 'inaktiv',
	'workspace config saved': 'arbetsytans konfig sparad',
	'config saved': 'konfig sparad',
	'Saved {label} as {value} — a domain is a host only.':
		'Sparade {label} som {value} — en domän är enbart ett värdnamn.',
	' · shared .dev_properties.json at the root':
		' · delad .dev_properties.json i roten',
	' · new workspace: fill in once, every app inherits · Esc skips':
		' · ny arbetsyta: fyll i en gång, alla appar ärver · Esc hoppar över',
	'y confirm · n cancel': 'y bekräfta · n avbryt',
	// Config help
	"Domain of this environment's site (USE or TSE) without https://, e.g. myorg-use.sitevision-cloud.se. Deploys and version lookups go here.":
		'Domän för den här miljöns webbplats (USE eller TSE) utan https://, t.ex. myorg-use.sitevision-cloud.se. Driftsättningar och versionslistor går hit.',
	"Name of the site's root node in Sitevision, exactly as shown in the site tree. It becomes part of the REST API path.":
		'Namnet på webbplatsens rotnod i Sitevision, exakt som i webbplatsträdet. Det blir en del av REST API-sökvägen.',
	"Name of the addon (custom module) in the site's Addon Repository that this app is uploaded into. Ctrl+O lists the existing ones.":
		'Namnet på tillägget (custom module) i webbplatsens tilläggsförråd som appen laddas upp till. Ctrl+O listar befintliga.',
	'Sitevision account used for deploys, usually your Sitevision Cloud e-mail. It needs DEVELOPER or MANAGE_ADDONS permission on the site. Required for basic auth; with oauth2 or cookie it only labels the stored credential.':
		'Sitevision-konto som används för driftsättning, oftast din Sitevision Cloud-e-post. Behöver DEVELOPER eller MANAGE_ADDONS på webbplatsen. Krävs för basic; med oauth2 eller cookie används det bara för att märka den sparade inloggningen.',
	"How deploys authenticate: basic = username and password; oauth2 = bearer token from the site's OAuth2 provider (PKCE, opens a browser); cookie = reuse a browser SSO/SAML session.":
		'Hur driftsättningar autentiseras: basic = användarnamn och lösenord; oauth2 = bearer-token från webbplatsens OAuth2-provider (PKCE, öppnar webbläsare); cookie = återanvänd en SSO/SAML-session från webbläsaren.',
	'Deploy password for the account above. Stored in the OS keychain, never in a file. Leave empty to be asked on each run.':
		'Driftsättningslösenord för kontot ovan. Sparas i nyckelringen, aldrig i en fil. Lämna tomt för att bli tillfrågad varje gång.',
	'Client id of the OAuth2 client registered on the site. Its redirect URI must be http://127.0.0.1:8137/callback.':
		'Klient-id för OAuth2-klienten som är registrerad på webbplatsen. Dess redirect-URI måste vara http://127.0.0.1:8137/callback.',
	"The provider's authorization URL. Filled in from the site's OpenID configuration when it can be discovered.":
		'Providerns auktoriserings-URL. Fylls i från webbplatsens OpenID-konfiguration när den kan hittas.',
	"The provider's token URL. Filled in from the site's OpenID configuration when it can be discovered.":
		'Providerns token-URL. Fylls i från webbplatsens OpenID-konfiguration när den kan hittas.',
	'Secret of a confidential OAuth2 client, stored in the OS keychain. Leave empty for a public client.':
		'Hemlighet för en konfidentiell OAuth2-klient, sparas i nyckelringen. Lämna tomt för en publik klient.',
	'Page opened in the browser for the SSO login. Leave empty to use the site root.':
		'Sida som öppnas i webbläsaren för SSO-inloggning. Tomt = webbplatsens rot.',
	'Use plain HTTP instead of HTTPS for deploys. Only for local or test servers without TLS.':
		'Använd HTTP i stället för HTTPS vid driftsättning. Bara för lokala servrar eller testservrar utan TLS.',
	'Your developer.sitevision.se account. Production deploys need the app signed by it.':
		'Ditt konto på developer.sitevision.se. Produktionsdriftsättningar kräver att appen är signerad av det.',
	'Which certificate to sign with when your developer account has several. Leave empty for the default.':
		'Vilket certifikat som ska signera när utvecklarkontot har flera. Tomt = standard.',
	'Password for the signing account, stored in the OS keychain. Leave empty to be asked on each run.':
		'Lösenord för signeringskontot, sparas i nyckelringen. Lämna tomt för att bli tillfrågad varje gång.',
	// Settings screen
	Language: 'Språk',
	'Intro animation': 'Introanimation',
	on: 'på',
	off: 'av',
	'Saved.': 'Sparat.',
	'stored in {file}': 'sparas i {file}',
	'↑↓ setting · Enter edit · Esc close':
		'↑↓ inställning · Enter redigera · Esc stäng',
	// Password prompt / login
	'Press Enter to submit, Esc to cancel':
		'Tryck Enter för att skicka, Esc för att avbryta',
	'(Tab to toggle)': '(Tab växlar)',
	'OAuth2 login': 'OAuth2-inloggning',
	'Session cookie login': 'Sessionskaka-inloggning',
	'Waiting for you to finish login in the browser…':
		'Väntar på att du loggar in i webbläsaren…',
	"If the browser didn't open, visit:":
		'Om webbläsaren inte öppnades, gå till:',
	'Opening browser…': 'Öppnar webbläsare…',
	'Log in in the opened browser, then press Enter to capture the session.':
		'Logga in i webbläsaren och tryck sedan Enter för att fånga sessionen.',
	'Capturing session…': 'Fångar session…',
	'A Chrome window is open at:': 'Ett Chrome-fönster är öppet på:',
	'1. Log in to the site there, single sign-on included.':
		'1. Logga in på webbplatsen där, även med enkel inloggning.',
	'2. Wait until the site itself has finished loading.':
		'2. Vänta tills själva webbplatsen har laddat klart.',
	'3. Come back here and press Enter.': '3. Kom tillbaka hit och tryck Enter.',
	'Leave the browser window open; it closes once the session is captured.':
		'Låt webbläsarfönstret vara öppet; det stängs när sessionen har hämtats.',
	'Press Esc to cancel.': 'Tryck Esc för att avbryta.',
};
