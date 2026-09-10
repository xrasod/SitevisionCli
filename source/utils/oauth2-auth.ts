import http from 'http';
import crypto from 'crypto';
import {spawn} from 'child_process';
import type {DevProperties, OAuth2Config} from '../types/index.js';
import {makeRequest} from './sitevision-api.js';
import {
	getOAuth2RefreshToken,
	setOAuth2RefreshToken,
	deleteOAuth2RefreshToken,
	getOAuth2ClientSecret,
} from './keychain.js';

/** Default loopback port. Fixed so a single redirect URI can be whitelisted. */
export const DEFAULT_REDIRECT_PORT = 8137;

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

function hasOAuth2Config(config?: OAuth2Config): config is OAuth2Config {
	return Boolean(
		config?.authorizationEndpoint && config.tokenEndpoint && config.clientId,
	);
}

async function postToken(
	config: OAuth2Config,
	params: Record<string, string>,
	secret?: string,
): Promise<TokenResponse | null> {
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
		if (response.statusCode !== 200) return null;
		return JSON.parse(response.body.toString()) as TokenResponse;
	} catch {
		return null;
	}
}

export function openBrowser(url: string): void {
	const isWin = process.platform === 'win32';
	const cmd =
		process.platform === 'darwin' ? 'open' : isWin ? 'cmd' : 'xdg-open';
	const args = isWin ? ['/c', 'start', '', url] : [url];
	try {
		spawn(cmd, args, {stdio: 'ignore', detached: true}).unref();
	} catch {
		// Fall back to the printed URL.
	}
}

/**
 * Serve the loopback redirect once. Returns the awaited code and a `close()`
 * that shuts the server down (freeing the port) if the login is cancelled — so
 * a retry doesn't hit an EADDRINUSE on the fixed redirect port.
 */
function startLoopback(
	port: number,
	state: string,
): {code: Promise<string | null>; close: () => void} {
	let finish!: (code: string | null) => void;
	let settled = false;

	const code = new Promise<string | null>(resolve => {
		finish = (value: string | null) => {
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

		const ok = url.searchParams.get('state') === state;
		const authCode = url.searchParams.get('code');
		const message =
			ok && authCode
				? 'Login complete. You can close this window and return to the terminal.'
				: 'Login failed. Check the terminal.';
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.end(`<!doctype html><meta charset="utf-8"><p>${message}</p>`);
		finish(ok ? authCode : null);
	});

	const timer = setTimeout(() => finish(null), LOGIN_TIMEOUT_MS);
	server.on('error', () => finish(null));
	server.listen(port, '127.0.0.1');

	return {code, close: () => finish(null)};
}

/**
 * Start an interactive OAuth2 login. Returns the authorize URL to open and a
 * `complete()` that awaits the loopback redirect, exchanges the code, stores the
 * refresh token, and resolves the access token. UI-agnostic, so an Ink screen
 * can drive it without owning the terminal.
 */
export function beginOAuth2Login(dev: DevProperties): {
	authUrl: string;
	complete: () => Promise<string | null>;
	cancel: () => void;
} | null {
	const config = dev.oauth2;
	if (!hasOAuth2Config(config)) return null;

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
	if (config.scopes?.length) {
		url.searchParams.set('scope', config.scopes.join(' '));
	}

	const loopback = startLoopback(port, state);

	const complete = async (): Promise<string | null> => {
		const code = await loopback.code;
		if (!code) return null;
		const tokens = await postToken(
			config,
			{
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				client_id: config.clientId,
				code_verifier: verifier,
			},
			secret,
		);
		if (!tokens?.access_token) return null;
		if (tokens.refresh_token) {
			setOAuth2RefreshToken(domain, config.clientId, tokens.refresh_token);
		}
		return tokens.access_token;
	};

	return {authUrl: url.href, complete, cancel: loopback.close};
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
	if (!hasOAuth2Config(config)) return null;

	const {domain} = dev;
	const secret = getOAuth2ClientSecret(domain, config.clientId) ?? undefined;

	const storedRefresh = getOAuth2RefreshToken(domain, config.clientId);
	if (!storedRefresh) return null;

	const tokens = await postToken(
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

	// Stale/expired refresh token — drop it so the next run logs in fresh.
	deleteOAuth2RefreshToken(domain, config.clientId);
	return null;
}
