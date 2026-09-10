import type {DevProperties} from '../types/index.js';
import {setSessionCookie} from './keychain.js';

interface RawCookie {
	name: string;
	value: string;
	domain: string;
}

export interface CaptureResult {
	cookie?: string;
	note?: string;
	error?: string;
}

export interface CookieLoginSession {
	capture: () => Promise<CaptureResult>;
	close: () => Promise<void>;
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

/**
 * Pick the session from a cookie jar: find JSESSIONID (preferring the deploy
 * host), then return every cookie on that host as a `Cookie:` header. On miss,
 * return diagnostics naming the domains actually seen. Pure — no keychain, no
 * browser — so it's unit-testable.
 */
export function selectSessionCookie(
	all: RawCookie[],
	siteDomain: string,
): CaptureResult {
	const sessions = all.filter(c => c.name === 'JSESSIONID');
	if (sessions.length === 0) {
		const domains = [...new Set(all.map(c => bareDomain(c.domain)))];
		return {
			error: `No JSESSIONID among ${all.length} cookies. Domains seen: ${
				domains.join(', ') || 'none'
			}. If these are only your IdP, open a Sitevision page in the browser, then press Enter again.`,
		};
	}

	const chosen =
		sessions.find(c => domainRelated(c.domain, siteDomain)) ?? sessions[0]!;
	const cookies = all.filter(c => domainRelated(c.domain, chosen.domain));
	return {
		cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
		note: `Captured session on ${bareDomain(chosen.domain)} (${cookies.length} cookies).`,
	};
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
 * Launch a real browser at the login URL for an interactive SAML/SSO login and
 * return handles to capture the session and close the browser. UI-agnostic: the
 * Ink login screen decides when to `capture()` (on the user's keypress) and
 * `close()`. Returns null if the browser can't be launched.
 *
 * `capture()` reads the whole cookie jar via CDP (httponly and secure included),
 * stores the session in the keychain on success, and otherwise returns
 * diagnostics naming the cookie domains it actually saw.
 */
export async function beginCookieLogin(
	dev: DevProperties,
): Promise<CookieLoginSession | null> {
	const {domain, username} = dev;
	if (!domain || !username) return null;

	let puppeteer;
	try {
		({default: puppeteer} = await import('puppeteer-core'));
	} catch {
		return null;
	}

	let browser: any;
	try {
		browser = await puppeteer.launch({headless: false, channel: 'chrome'});
		const page = await browser.newPage();
		const loginUrl = dev.sessionLoginUrl || `https://${domain}/`;
		await page.goto(loginUrl, {waitUntil: 'domcontentloaded'}).catch(() => {
			// A SAML redirect may abort the initial navigation — that's fine.
		});

		const capture = async (): Promise<CaptureResult> => {
			const all = await readAllCookies(browser, page);
			const result = selectSessionCookie(all, domain);
			if (result.cookie) {
				setSessionCookie(domain, username, result.cookie);
			}

			return result;
		};

		const close = async () => {
			await browser!.close().catch(() => {
				// Best-effort close.
			});
		};

		return {capture, close};
	} catch {
		if (browser) {
			await browser.close().catch(() => {
				// Best-effort close.
			});
		}

		return null;
	}
}
