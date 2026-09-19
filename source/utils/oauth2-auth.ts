import http from 'http';
import crypto from 'crypto';
import open from 'open';
import type {DevProperties, OAuth2Config} from '../types/index.js';
import {makeRequest, summarizeErrorBody} from './sitevision-api.js';
import {
	getOAuth2RefreshToken,
	setOAuth2RefreshToken,
	deleteOAuth2RefreshToken,
	getOAuth2ClientSecret,
} from './keychain.js';

/** Default loopback port. Fixed so a single redirect URI can be whitelisted. */
export const DEFAULT_REDIRECT_PORT = 8137;
// Sitevision's provider grants everything under ALL; offline_access adds the
// refresh token so later runs log in silently.
export const DEFAULT_SCOPES = ['ALL', 'offline_access'];

/** Seconds to wait for the user to finish logging in before giving up. */
const LOGIN_TIMEOUT_MS = 300_000;

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
}

function base64url(buffer: Buffer): string {
	return buffer
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

/** RFC 7636 S256 pair. Exported for testing the challenge derivation. */
export function createPkcePair(): {verifier: string; challenge: string} {
	const verifier = base64url(crypto.randomBytes(32));
	const challenge = base64url(
		crypto.createHash('sha256').update(verifier).digest(),
	);
	return {verifier, challenge};
}

/**
 * Why this project's OAuth2 settings cannot be used, if they cannot. The
 * endpoints may come from a committed package.json, and the keychain secrets
 * are stored per site, so they only ever go to that site, over TLS.
 */
export function oauth2ConfigProblem(dev: DevProperties): string | undefined {
	const config = dev.oauth2;
	if (
		!config?.authorizationEndpoint ||
		!config.tokenEndpoint ||
		!config.clientId
	) {
		return 'OAuth2 is not fully configured (authorization/token endpoint or client ID missing).';
	}

	const schemes = dev.useHTTPForDevDeploy ? ['https:', 'http:'] : ['https:'];
	for (const endpoint of [config.authorizationEndpoint, config.tokenEndpoint]) {
		const url = URL.canParse(endpoint) ? new URL(endpoint) : undefined;
		if (!url || !schemes.includes(url.protocol)) {
			return `OAuth2 endpoint ${endpoint} must be an https URL.`;
		}
	}

	const tokenHost = new URL(config.tokenEndpoint).host.toLowerCase();
	if (tokenHost !== dev.domain.toLowerCase()) {
		return `OAuth2 token endpoint is on ${tokenHost}, not on ${dev.domain}. Stored secrets are only sent to the site they belong to.`;
	}

	return undefined;
}

async function postToken(
	config: OAuth2Config,
	params: Record<string, string>,
	secret?: string,
): Promise<{tokens?: TokenResponse; error?: string; status?: number}> {
	const body = Buffer.from(new URLSearchParams(params).toString());
	try {
		const response = await makeRequest(config.tokenEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': String(body.length),
			},
			body,
			// client_secret_basic when confidential; public+PKCE clients omit it.
			auth: secret ? {username: config.clientId, password: secret} : undefined,
		});
		if (response.statusCode !== 200) {
			return {
				status: response.statusCode,
				error: `Token endpoint returned ${response.statusCode}: ${summarizeErrorBody(
					response.body,
					response.headers,
				)}`,
			};
		}

		return {tokens: JSON.parse(response.body.toString()) as TokenResponse};
	} catch (error) {
		return {
			error: `Token request failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

/** OpenID configuration path (published at the issuer root once the provider is saved). */
const DISCOVERY_PATH = '/.well-known/openid-configuration';

export interface DiscoveredOAuth2 {
	authorizationEndpoint: string;
	tokenEndpoint: string;
	scopesSupported?: string[];
}

/**
 * Fetch the site's OpenID configuration (unauthenticated) to auto-fill the
 * authorization/token endpoints. Returns null if it isn't published (provider
 * not enabled) or the response isn't a valid config, so callers fall back to
 * manual entry.
 */
export async function discoverOAuth2Config(
	domain: string,
	useHTTP = false,
): Promise<DiscoveredOAuth2 | null> {
	if (!domain) return null;
	const protocol = useHTTP ? 'http' : 'https';
	try {
		const response = await makeRequest(
			`${protocol}://${domain}${DISCOVERY_PATH}`,
			{method: 'GET'},
		);
		if (response.statusCode !== 200) return null;
		const doc = JSON.parse(response.body.toString()) as {
			authorization_endpoint?: string;
			token_endpoint?: string;
			scopes_supported?: string[];
		};
		if (!doc.authorization_endpoint || !doc.token_endpoint) return null;
		return {
			authorizationEndpoint: doc.authorization_endpoint,
			tokenEndpoint: doc.token_endpoint,
			scopesSupported: Array.isArray(doc.scopes_supported)
				? doc.scopes_supported
				: undefined,
		};
	} catch {
		return null;
	}
}

export function openBrowser(url: string): void {
	// Preserve the full OAuth URL, including & and percent-encoded parameters,
	// through Windows shell parsing. `open` handles platform-specific escaping.
	void open(url).catch(() => {
		// Fall back to the printed URL.
	});
}

/**
 * Serve the loopback redirect once. Returns the awaited code and a `close()`
 * that shuts the server down (freeing the port) if the login is cancelled — so
 * a retry doesn't hit an EADDRINUSE on the fixed redirect port.
 */
interface LoopbackResult {
	code?: string;
	error?: string;
}

/**
 * Turn a redirect's query params into a result, prioritizing the provider's own
 * error (the most useful reason) over a generic "no code". Exported for testing.
 */
export function classifyRedirect(params: {
	expectedState: string;
	state: string | null;
	error: string | null;
	errorDescription: string | null;
	code: string | null;
}): LoopbackResult {
	if (params.error) {
		return {
			error: `The OAuth2 provider rejected the login: ${
				params.errorDescription
					? `${params.error} — ${params.errorDescription}`
					: params.error
			}`,
		};
	}

	if (params.state !== params.expectedState) {
		return {
			error:
				'State mismatch — the login response did not match this request (a stale browser tab, or the wrong window).',
		};
	}

	if (params.code) {
		return {code: params.code};
	}

	return {error: 'No authorization code was returned by the provider.'};
}

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function startLoopback(
	port: number,
	state: string,
): {result: Promise<LoopbackResult>; close: (reason?: string) => void} {
	let finish!: (result: LoopbackResult) => void;
	let settled = false;

	const result = new Promise<LoopbackResult>(resolve => {
		finish = (value: LoopbackResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			server.close();
			resolve(value);
		};
	});

	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
		if (url.pathname !== '/callback') {
			res.writeHead(404).end();
			return;
		}

		const outcome = classifyRedirect({
			expectedState: state,
			state: url.searchParams.get('state'),
			error: url.searchParams.get('error'),
			errorDescription: url.searchParams.get('error_description'),
			code: url.searchParams.get('code'),
		});

		const message = outcome.code
			? 'Login complete. You can close this window and return to the terminal.'
			: `Login failed: ${outcome.error}`;
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.end(
			`<!doctype html><meta charset="utf-8"><p>${escapeHtml(message)}</p>`,
		);
		finish(outcome);
	});

	const timer = setTimeout(
		() => finish({error: 'Timed out waiting for the login to complete.'}),
		LOGIN_TIMEOUT_MS,
	);
	server.on('error', error =>
		finish({
			error: `Local login server error: ${
				error instanceof Error ? error.message : String(error)
			}`,
		}),
	);
	server.listen(port, '127.0.0.1');

	return {
		result,
		close: (reason?: string) => finish({error: reason ?? 'Login cancelled.'}),
	};
}

/**
 * Start an interactive OAuth2 login. Returns the authorize URL to open and a
 * `complete()` that awaits the loopback redirect, exchanges the code, stores the
 * refresh token, and resolves the access token. UI-agnostic, so an Ink screen
 * can drive it without owning the terminal.
 */
export function beginOAuth2Login(dev: DevProperties): {
	authUrl: string;
	complete: () => Promise<{token?: string; error?: string}>;
	cancel: () => void;
} | null {
	const config = dev.oauth2;
	if (!config || oauth2ConfigProblem(dev)) return null;

	const {domain} = dev;
	const secret = getOAuth2ClientSecret(domain, config.clientId) ?? undefined;
	const port = config.redirectPort ?? DEFAULT_REDIRECT_PORT;
	const redirectUri = `http://127.0.0.1:${port}/callback`;
	const {verifier, challenge} = createPkcePair();
	const state = base64url(crypto.randomBytes(16));

	const url = new URL(config.authorizationEndpoint);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', config.clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', challenge);
	url.searchParams.set('code_challenge_method', 'S256');
	url.searchParams.set('scope', (config.scopes ?? DEFAULT_SCOPES).join(' '));

	const loopback = startLoopback(port, state);

	const complete = async (): Promise<{token?: string; error?: string}> => {
		const redirect = await loopback.result;
		if (redirect.error || !redirect.code) {
			return {error: redirect.error ?? 'Login failed.'};
		}

		const {tokens, error} = await postToken(
			config,
			{
				grant_type: 'authorization_code',
				code: redirect.code,
				redirect_uri: redirectUri,
				client_id: config.clientId,
				code_verifier: verifier,
			},
			secret,
		);
		if (error) return {error};
		if (!tokens?.access_token) {
			return {error: 'The token endpoint did not return an access token.'};
		}

		if (tokens.refresh_token) {
			setOAuth2RefreshToken(domain, config.clientId, tokens.refresh_token);
		}

		return {token: tokens.access_token};
	};

	return {authUrl: url.href, complete, cancel: () => loopback.close()};
}

/**
 * Silently resolve an access token by refreshing the keychain refresh token.
 * Returns null when there's no refresh token or it's expired/revoked (in which
 * case the stale token is dropped). Interactive login lives in `beginOAuth2Login`,
 * driven by the Ink login screen — the access token is never persisted.
 */
export async function resolveOAuth2AccessToken(
	dev: DevProperties,
): Promise<string | null> {
	const config = dev.oauth2;
	if (!config || oauth2ConfigProblem(dev)) return null;

	const {domain} = dev;
	const secret = getOAuth2ClientSecret(domain, config.clientId) ?? undefined;

	const storedRefresh = getOAuth2RefreshToken(domain, config.clientId);
	if (!storedRefresh) return null;

	const {tokens, status} = await postToken(
		config,
		{
			grant_type: 'refresh_token',
			refresh_token: storedRefresh,
			client_id: config.clientId,
		},
		secret,
	);
	if (tokens?.access_token) {
		if (tokens.refresh_token) {
			setOAuth2RefreshToken(domain, config.clientId, tokens.refresh_token);
		}
		return tokens.access_token;
	}

	// Only a rejection (invalid_grant) means the token is dead. Offline, a
	// timeout or a 5xx says nothing about it, so it stays.
	if (status === 400 || status === 401) {
		deleteOAuth2RefreshToken(domain, config.clientId);
	}

	return null;
}
