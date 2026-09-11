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
	'{n} versions · a activate selected · R refresh':
		'{n} versioner · a aktivera vald · R uppdatera',
	'1 version · a activate selected · R refresh':
		'1 version · a aktivera vald · R uppdatera',
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
	'Deploy to dev': 'Driftsätt till dev',
	'Deploy to dev (force)': 'Driftsätt till dev (tvinga)',
	'Deploy to production': 'Driftsätt till produktion',
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
	'Deploy the signed {id} to production and activate it?':
		'Driftsätt signerade {id} till produktion och aktivera?',
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
	'Development domain': 'Utvecklingsdomän',
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
	'blank = client default': 'tomt = klientens standard',
	'blank = site root': 'tomt = webbplatsens rot',
	'required for signed deploys': 'krävs för signerad driftsättning',
	'blank = prompt each run': 'tomt = fråga varje gång',
	SIGNING: 'SIGNERING',
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
	'edit settings': 'redigera inställningar',
	apps: 'appar',
	activate: 'aktivera',
	refresh: 'uppdatera',
	deploy: 'driftsätt',
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
	' · shared .dev_properties.json at the root':
		' · delad .dev_properties.json i roten',
	'y confirm · n cancel': 'y bekräfta · n avbryt',
	// Config help
	'Domain of the development environment (USE or TSE) without https://, e.g. myorg-use.sitevision-cloud.se. Deploys and version lookups go here.':
		'Domän för utvecklingsmiljön (USE eller TSE) utan https://, t.ex. myorg-use.sitevision-cloud.se. Driftsättningar och versionslistor går hit.',
	"Name of the site's root node in Sitevision, exactly as shown in the site tree. It becomes part of the REST API path.":
		'Namnet på webbplatsens rotnod i Sitevision, exakt som i webbplatsträdet. Det blir en del av REST API-sökvägen.',
	"Name of the addon (custom module) in the site's Addon Repository that this app is uploaded into. Ctrl+O lists the existing ones.":
		'Namnet på tillägget (custom module) i webbplatsens tilläggsförråd som appen laddas upp till. Ctrl+O listar befintliga.',
	'Sitevision account used for deploys, usually your Sitevision Cloud e-mail. It needs DEVELOPER or MANAGE_ADDONS permission on the site.':
		'Sitevision-konto som används för driftsättning, oftast din Sitevision Cloud-e-post. Behöver DEVELOPER eller MANAGE_ADDONS på webbplatsen.',
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
	"Space-separated scopes to request. Leave empty for the client's defaults. Add offline_access (in the client's casing) to get a refresh token.":
		'Scopes att begära, separerade med mellanslag. Tomt = klientens standard. Lägg till offline_access (med klientens skiftläge) för refresh-token.',
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
	'Press Esc to cancel.': 'Tryck Esc för att avbryta.',
};
