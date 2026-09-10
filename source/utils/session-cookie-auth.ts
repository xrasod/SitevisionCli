import type {DevProperties} from '../types/index.js';
import {getSessionCookie, setSessionCookie} from './keychain.js';
import {promptEnter} from './password-prompt.js';

/** Match cookies set on the site host or any parent domain. */
function domainMatches(cookieDomain: string, siteDomain: string): boolean {
	const bare = cookieDomain.replace(/^\./, '');
	return siteDomain === bare || siteDomain.endsWith(`.${bare}`);
}

/**
 * Open a real browser at the login URL, let the user complete SSO, then read
 * the session cookies (JSESSIONID and any siblings) via CDP — which returns
 * httponly cookies that page JavaScript can't see. Returns a `Cookie:` header
 * value, or null if capture failed.
 */
async function captureViaBrowser(
	loginUrl: string,
	siteDomain: string,
): Promise<string | null> {
	let puppeteer;
	try {
		({default: puppeteer} = await import('puppeteer-core'));
	} catch {
		console.log(
			'\x1b[31mpuppeteer-core is not installed. Run `npm i puppeteer-core`, or pass --cookie / set SITEVISION_SESSION_COOKIE.\x1b[0m',
		);
		return null;
	}

	let browser;
	try {
		browser = await puppeteer.launch({headless: false, channel: 'chrome'});
		const page = await browser.newPage();
		await page.goto(loginUrl, {waitUntil: 'domcontentloaded'}).catch(() => {
			// A SAML redirect may abort the initial navigation — that's fine.
		});

		await promptEnter(
			'\nLog in in the opened browser, then press Enter here to capture the session: ',
		);

		const client = await page.createCDPSession();
		const {cookies} = await client.send('Network.getAllCookies');
		const wanted = cookies.filter(c => domainMatches(c.domain, siteDomain));

		if (wanted.every(c => c.name !== 'JSESSIONID')) {
			console.log(
				'\x1b[31mNo JSESSIONID found for this site. Was the login completed?\x1b[0m',
			);
			return null;
		}

		return wanted.map(c => `${c.name}=${c.value}`).join('; ');
	} catch (error) {
		console.log(
			`\x1b[31mBrowser login failed: ${
				error instanceof Error ? error.message : String(error)
			}\x1b[0m`,
		);
		return null;
	} finally {
		if (browser) {
			await browser.close().catch(() => {
				// Best-effort close.
			});
		}
	}
}

/**
 * Return a usable session cookie, or null. Order: keychain (a prior capture),
 * then (when `interactive`) a browser login. Pass `interactive: false` from the
 * Ink menu, which can't own the terminal for the "press Enter" handoff.
 */
export async function resolveSessionCookie(
	dev: DevProperties,
	options: {interactive?: boolean} = {},
): Promise<string | null> {
	const {interactive = true} = options;
	const {domain, username} = dev;
	if (!domain || !username) return null;

	const stored = getSessionCookie(domain, username);
	if (stored) return stored;

	if (!interactive || !process.stdin.isTTY) return null;

	const loginUrl = dev.sessionLoginUrl || `https://${domain}/`;
	const cookie = await captureViaBrowser(loginUrl, domain);
	if (cookie) setSessionCookie(domain, username, cookie);
	return cookie;
}
