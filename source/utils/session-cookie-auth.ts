import type {DevProperties} from '../types/index.js';
import {getSessionCookie, setSessionCookie} from './keychain.js';
import {promptEnter} from './password-prompt.js';

interface RawCookie {
	name: string;
	value: string;
	domain: string;
}

function bareDomain(domain: string): string {
	return domain.replace(/^\./, '');
}

/** Related if either host is the other or a subdomain of it (both directions). */
function domainRelated(a: string, b: string): boolean {
	const x = bareDomain(a);
	const y = bareDomain(b);
	return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/** Read every cookie in the browser jar (httponly and secure included). */
async function readAllCookies(browser: any, page: any): Promise<RawCookie[]> {
	// puppeteer >= 22 exposes the whole jar directly.
	if (typeof browser.cookies === 'function') {
		try {
			return (await browser.cookies()) as RawCookie[];
		} catch {
			// Fall through to CDP.
		}
	}

	const client = await page.createCDPSession();
	const {cookies} = await client.send('Network.getAllCookies');
	return cookies as RawCookie[];
}

/**
 * Open a real browser at the login URL, let the user complete SSO, then read
 * the session cookies via CDP — which returns httponly, secure cookies that
 * page JavaScript can't see. Returns a `Cookie:` header value, or null.
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
			'\nLog in in the browser this tool opened, then press Enter here to capture the session: ',
		);

		const all = await readAllCookies(browser, page);
		const sessions = all.filter(c => c.name === 'JSESSIONID');

		if (sessions.length === 0) {
			const domains = [...new Set(all.map(c => bareDomain(c.domain)))];
			console.log(`\x1b[31mNo JSESSIONID among ${all.length} cookies.\x1b[0m`);
			console.log(
				`Cookie domains seen: ${domains.join(', ') || '(none — was the login done in the browser this tool opened?)'}`,
			);
			console.log(
				'If those are only your IdP and not the Sitevision site, open a Sitevision page/editor in that same browser (so it issues a session), then run this again.',
			);
			return null;
		}

		// Prefer the JSESSIONID on the deploy host; else take the only/first one.
		const chosen =
			sessions.find(c => domainRelated(c.domain, siteDomain)) ?? sessions[0]!;
		const cookies = all.filter(c => domainRelated(c.domain, chosen.domain));

		console.log(
			`\x1b[32mCaptured session on ${bareDomain(chosen.domain)} (${cookies.length} cookies).\x1b[0m`,
		);
		return cookies.map(c => `${c.name}=${c.value}`).join('; ');
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
