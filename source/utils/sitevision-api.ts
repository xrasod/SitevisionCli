/**
 * Sitevision API Client
 *
 * Handles all API interactions with Sitevision servers:
 * - Signing apps via developer.sitevision.se
 * - Deploying to development environments
 * - Deploying to production environments
 * - Creating addons
 * - Activating production apps
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import type {
	SigningCredentials,
	DeployConfig,
	ProductionDeployConfig,
	SigningResponse,
	DeployResponse,
	CreateAddonResponse,
	ActivationResponse,
	SimpleAppType,
} from '../types/index.js';
import {
	buildImportEndpointUrl,
	buildAddonEndpointUrl,
} from './project-detection.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const SIGNING_API_HOST = 'developer.sitevision.se';
const SIGNING_API_PATH = '/rest-api/appsigner/signapp';

/** Default per-request timeout. Generous because signing uploads a full zip. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Max attempts for transient failures (network errors, timeouts, 5xx). */
const SIGN_MAX_ATTEMPTS = 3;

/** Base backoff between retries; grows exponentially per attempt. */
const RETRY_BASE_DELAY_MS = 1000;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create Basic Auth header value
 */
function createBasicAuth(username: string, password: string): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

type RequestAuth =
	| {username: string; password: string}
	| {token: string}
	| {cookie: string};

type AuthKind = 'basic' | 'bearer' | 'cookie';

/** Single source of the 401 message, worded for the auth kind actually used. */
function unauthorizedMessage(kind: AuthKind): string {
	switch (kind) {
		case 'bearer':
			return 'Unauthorized. The access token was rejected or has expired.';
		case 'cookie':
			return 'Unauthorized. The session cookie was rejected or has expired — log in again.';
		default:
			return 'Unauthorized. Check username and password.';
	}
}

/** Pick cookie > bearer > basic based on what the deploy config carries. */
function configAuth(config: {
	username: string;
	password?: string;
	accessToken?: string;
	sessionCookie?: string;
}): {auth: RequestAuth; kind: AuthKind} {
	if (config.sessionCookie) {
		return {auth: {cookie: config.sessionCookie}, kind: 'cookie'};
	}

	if (config.accessToken) {
		return {auth: {token: config.accessToken}, kind: 'bearer'};
	}

	return {
		auth: {username: config.username, password: config.password ?? ''},
		kind: 'basic',
	};
}

/**
 * Generate a random boundary for multipart form data
 */
function generateBoundary(): string {
	return `----FormBoundary${Math.random().toString(36).substring(2)}`;
}

/**
 * Create multipart form data for file upload
 */
function createMultipartFormData(
	filePath: string,
	fieldName: string,
	boundary: string,
): {body: Buffer; contentType: string} {
	const filename = path.basename(filePath);
	const fileContent = fs.readFileSync(filePath);

	const parts: Buffer[] = [];

	// File part
	parts.push(
		Buffer.from(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
				`Content-Type: application/octet-stream\r\n\r\n`,
		),
	);
	parts.push(fileContent);
	parts.push(Buffer.from('\r\n'));

	// Closing boundary
	parts.push(Buffer.from(`--${boundary}--\r\n`));

	return {
		body: Buffer.concat(parts),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

/**
 * Make an HTTP/HTTPS request
 */
export function makeRequest(
	url: string,
	options: {
		method: string;
		headers?: Record<string, string>;
		body?: Buffer;
		auth?: RequestAuth;
		timeoutMs?: number;
	},
): Promise<{
	statusCode: number;
	body: Buffer;
	headers: Record<string, string>;
}> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const isHttps = parsedUrl.protocol === 'https:';
		const transport = isHttps ? https : http;

		const headers: Record<string, string> = {
			...options.headers,
		};

		if (options.auth) {
			if ('cookie' in options.auth) {
				headers['Cookie'] = options.auth.cookie;
				// Session-authenticated state-changing calls typically need this to
				// pass Sitevision's CSRF guard, unlike Basic-auth requests.
				headers['X-Requested-With'] ??= 'XMLHttpRequest';
			} else if ('token' in options.auth) {
				headers['Authorization'] = `Bearer ${options.auth.token}`;
			} else {
				headers['Authorization'] = createBasicAuth(
					options.auth.username,
					options.auth.password,
				);
			}
		}

		const requestOptions: https.RequestOptions = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port || (isHttps ? 443 : 80),
			path: parsedUrl.pathname + parsedUrl.search,
			method: options.method,
			headers,
		};

		const req = transport.request(requestOptions, res => {
			const chunks: Buffer[] = [];

			res.on('data', (chunk: Buffer) => {
				chunks.push(chunk);
			});

			res.on('end', () => {
				resolve({
					statusCode: res.statusCode || 0,
					body: Buffer.concat(chunks),
					headers: res.headers as Record<string, string>,
				});
			});
		});

		// Abort hung connections instead of blocking the CLI indefinitely.
		req.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
			req.destroy(
				new Error(
					`Request timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
				),
			);
		});

		req.on('error', reject);

		if (options.body) {
			req.write(options.body);
		}

		req.end();
	});
}

/**
 * Whether an HTTP status is worth retrying (transient server-side failures).
 */
export function isRetryableStatus(statusCode: number): boolean {
	return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

/**
 * Sleep helper for backoff between retries.
 */
async function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

/**
 * Summarize a non-success response body for error messages.
 * Avoids dumping raw bytes (e.g. an HTML error page or a binary blob) by
 * trimming text bodies and labelling binary ones by their content type.
 */
export function summarizeErrorBody(
	body: Buffer,
	headers: Record<string, string>,
): string {
	const contentType = headers['content-type'] ?? 'unknown';
	const declaredText =
		contentType.includes('text') ||
		contentType.includes('json') ||
		contentType.includes('xml');

	const text = body.toString('utf8');

	// Show the body when the server declares it text OR the bytes decode to
	// mostly-printable text. Sitevision sometimes returns a text/JSON error with
	// a missing or non-text content-type, and hiding it obscures the real cause.
	if (declaredText || isMostlyPrintable(text)) {
		const collapsed = text.replaceAll(/\s+/g, ' ').trim();
		const max = 300;
		const summary =
			collapsed.length > max ? collapsed.slice(0, max) + '…' : collapsed;
		if (summary.length > 0) return summary;
	}

	return `(${contentType}, ${body.length} bytes)`;
}

/** Heuristic: a decoded string is text if <10% of chars are control/undecodable. */
function isMostlyPrintable(text: string): boolean {
	if (text.length === 0) return false;
	let bad = 0;
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		// Undecodable byte (replacement char), or a control char other than
		// tab/newline/vertical-tab/form-feed/carriage-return.
		if (code === 0xff_fd || code < 9 || (code > 13 && code < 32)) {
			bad++;
		}
	}

	return bad / text.length < 0.1;
}

/** ZIP local-file-header magic bytes: "PK\x03\x04". */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Check that a buffer begins with the ZIP magic bytes. Used to fail fast when
 * the signing endpoint returns an error page with HTTP 200.
 */
export function looksLikeZip(body: Buffer): boolean {
	return body.length >= 4 && body.subarray(0, 4).equals(ZIP_MAGIC);
}

/**
 * A stale Sitevision session usually answers with a redirect to the login page
 * or a 200 carrying an HTML login form — not a clean 401. Detect both so cookie
 * auth can drop the dead session and re-login instead of showing a generic error.
 */
export function looksLikeAuthExpired(
	statusCode: number,
	body: Buffer,
	headers: Record<string, string>,
): boolean {
	if (statusCode === 401) return true;
	if (statusCode >= 300 && statusCode < 400) return true;
	if (statusCode === 200) {
		const contentType = headers['content-type'] ?? '';
		if (contentType.includes('html')) return true;
		const head = body
			.subarray(0, 64)
			.toString('utf8')
			.trimStart()
			.toLowerCase();
		if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
			return true;
		}
	}

	return false;
}

// =============================================================================
// SIGNING API
// =============================================================================

/**
 * Sign an app via developer.sitevision.se
 *
 * @param zipPath - Path to the unsigned zip file
 * @param credentials - Signing credentials
 * @param outputPath - Path to write the signed zip file
 */
export async function signApp(
	zipPath: string,
	credentials: SigningCredentials,
	outputPath: string,
): Promise<SigningResponse> {
	// Validate zip exists
	if (!fs.existsSync(zipPath)) {
		return {
			success: false,
			error: `Zip file not found: ${zipPath}. Run build first.`,
		};
	}

	// Build URL with optional certificate name
	let url = `https://${SIGNING_API_HOST}${SIGNING_API_PATH}`;
	if (credentials.certificateName) {
		url += `?certificateName=${encodeURIComponent(credentials.certificateName)}`;
	}

	// Create multipart form data
	const boundary = generateBoundary();
	const {body, contentType} = createMultipartFormData(
		zipPath,
		'file',
		boundary,
	);

	// Signing is idempotent (same input → same signed output), so transient
	// failures (network errors, timeouts, 5xx) are safe to retry with backoff.
	let lastError = 'Signing failed';

	for (let attempt = 1; attempt <= SIGN_MAX_ATTEMPTS; attempt++) {
		try {
			const response = await makeRequest(url, {
				method: 'POST',
				headers: {
					'Content-Type': contentType,
					'Content-Length': String(body.length),
				},
				body,
				auth: {
					username: credentials.username,
					password: credentials.password,
				},
			});

			if (response.statusCode === 200) {
				// Guard against an error page returned with a 200 status.
				if (!looksLikeZip(response.body)) {
					return {
						success: false,
						error: `Signing returned a non-zip response: ${summarizeErrorBody(
							response.body,
							response.headers,
						)}`,
					};
				}

				// Write signed zip to output path
				const outputDir = path.dirname(outputPath);
				if (!fs.existsSync(outputDir)) {
					fs.mkdirSync(outputDir, {recursive: true});
				}

				fs.writeFileSync(outputPath, response.body);

				return {
					success: true,
					signedFilePath: outputPath,
				};
			}

			if (response.statusCode === 401) {
				// Auth failures will not resolve on retry.
				return {
					success: false,
					error: unauthorizedMessage('basic'),
				};
			}

			lastError = `Signing failed with status ${response.statusCode}: ${summarizeErrorBody(
				response.body,
				response.headers,
			)}`;

			if (!isRetryableStatus(response.statusCode)) {
				return {success: false, error: lastError};
			}
		} catch (error) {
			lastError = `Signing request failed: ${error instanceof Error ? error.message : String(error)}`;
		}

		// Back off before the next attempt (skip after the final attempt).
		if (attempt < SIGN_MAX_ATTEMPTS) {
			await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
		}
	}

	return {
		success: false,
		error: `${lastError} (after ${SIGN_MAX_ATTEMPTS} attempts)`,
	};
}

// =============================================================================
// DEPLOYMENT API
// =============================================================================

/**
 * Deploy an app to a development environment
 *
 * @param zipPath - Path to the zip file (signed or unsigned)
 * @param config - Deployment configuration
 * @param appType - The app type (web, widget, rest)
 * @param force - Whether to force deploy (overwrite existing)
 */
export async function deployApp(
	zipPath: string,
	config: DeployConfig,
	appType: SimpleAppType,
	force = false,
): Promise<DeployResponse> {
	// Validate zip exists
	if (!fs.existsSync(zipPath)) {
		return {
			success: false,
			error: `Zip file not found: ${zipPath}`,
		};
	}

	// Build import URL
	let url = buildImportEndpointUrl(
		config.domain,
		config.siteName,
		config.addonName,
		appType,
		config.useHTTP,
	);

	if (force) {
		url += '?force=true';
	}

	// The import endpoints expect the archive in a multipart part named "data"
	// (per the webAppImport/restAppImport docs). Signing uses "file" separately.
	const boundary = generateBoundary();
	const {body, contentType} = createMultipartFormData(
		zipPath,
		'data',
		boundary,
	);

	const {auth, kind} = configAuth(config);

	try {
		const response = await makeRequest(url, {
			method: 'POST',
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(body.length),
			},
			body,
			auth,
		});

		if (response.statusCode === 401) {
			return {
				success: false,
				error: unauthorizedMessage(kind),
				authExpired: true,
			};
		}

		// A cookie session fails without a clean 401: a redirect to login or a
		// 200 carrying an HTML login page. Flag it so the caller re-authenticates.
		if (
			kind === 'cookie' &&
			looksLikeAuthExpired(response.statusCode, response.body, response.headers)
		) {
			return {
				success: false,
				error: unauthorizedMessage('cookie'),
				authExpired: true,
			};
		}

		if (response.statusCode === 200) {
			// Try to parse response for executable ID
			let executableId: string | undefined;
			try {
				const responseData = JSON.parse(response.body.toString());
				executableId = responseData.executableId || responseData.id;
			} catch {
				// Response may not be JSON
			}

			return {
				success: true,
				executableId,
				message: 'Deployment successful',
			};
		}

		if (response.statusCode === 409) {
			return {
				success: false,
				error: 'Conflict. Addon already exists. Use --force to overwrite.',
			};
		}

		return {
			success: false,
			error: `Deployment failed with status ${response.statusCode}: ${summarizeErrorBody(response.body, response.headers)}`,
		};
	} catch (error) {
		return {
			success: false,
			error: `Deployment request failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Deploy an app to production
 *
 * @param signedZipPath - Path to the SIGNED zip file (required for production)
 * @param config - Production deployment configuration
 * @param appType - The app type (web, widget, rest)
 */
export async function deployProduction(
	signedZipPath: string,
	config: ProductionDeployConfig,
	appType: SimpleAppType,
): Promise<DeployResponse> {
	// Deploy the signed app
	const deployResult = await deployApp(signedZipPath, config, appType, true);

	if (!deployResult.success) {
		return deployResult;
	}

	// If activation requested and we have an executable ID
	if (config.activate && deployResult.executableId) {
		const activationResult = await activateApp(
			deployResult.executableId,
			config,
			appType,
		);
		if (!activationResult.success) {
			return {
				success: true,
				executableId: deployResult.executableId,
				message: `Deployed successfully but activation failed: ${activationResult.error}`,
			};
		}

		return {
			success: true,
			executableId: deployResult.executableId,
			message: 'Deployed and activated successfully',
		};
	}

	return deployResult;
}

// =============================================================================
// ADDON MANAGEMENT API
// =============================================================================

/**
 * Create a new addon on a Sitevision site
 *
 * @param config - Deployment configuration
 * @param appType - The app type (web, widget, rest)
 */
export async function createAddon(
	config: DeployConfig,
	appType: SimpleAppType,
): Promise<CreateAddonResponse> {
	const url = buildAddonEndpointUrl(
		config.domain,
		config.siteName,
		appType,
		config.useHTTP,
	);

	const body = JSON.stringify({
		name: config.addonName,
		category: 'Other',
	});

	const {auth, kind} = configAuth(config);

	try {
		const response = await makeRequest(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(Buffer.byteLength(body)),
			},
			body: Buffer.from(body),
			auth,
		});

		if (response.statusCode === 200 || response.statusCode === 201) {
			let addonId: string | undefined;
			try {
				const responseData = JSON.parse(response.body.toString());
				addonId = responseData.id;
			} catch {
				// Response may not be JSON
			}

			return {
				success: true,
				addonId,
			};
		}

		if (response.statusCode === 401) {
			return {
				success: false,
				error: unauthorizedMessage(kind),
				authExpired: true,
			};
		}

		if (response.statusCode === 409) {
			return {
				success: false,
				error: 'Addon already exists.',
			};
		}

		return {
			success: false,
			error: `Create addon failed with status ${response.statusCode}: ${summarizeErrorBody(response.body, response.headers)}`,
		};
	} catch (error) {
		return {
			success: false,
			error: `Create addon request failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Activate a deployed production app
 *
 * @param executableId - The executable ID returned from deployment
 * @param config - Deployment configuration
 * @param appType - The app type (web, widget, rest)
 */
export async function activateApp(
	executableId: string,
	config: DeployConfig,
	_appType: SimpleAppType,
): Promise<ActivationResponse> {
	const protocol = config.useHTTP ? 'http' : 'https';
	const url = `${protocol}://${config.domain}/rest-api/1/0/${encodeURIComponent(config.siteName)}/Addon%20Repository/${encodeURIComponent(config.addonName)}/activateCustomModuleExecutable`;

	const body = JSON.stringify({
		executableId,
	});

	const {auth, kind} = configAuth(config);

	try {
		const response = await makeRequest(url, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(Buffer.byteLength(body)),
			},
			body: Buffer.from(body),
			auth,
		});

		if (response.statusCode === 200) {
			return {success: true};
		}

		if (response.statusCode === 401) {
			return {
				success: false,
				error: unauthorizedMessage(kind),
				authExpired: true,
			};
		}

		return {
			success: false,
			error: `Activation failed with status ${response.statusCode}: ${summarizeErrorBody(response.body, response.headers)}`,
		};
	} catch (error) {
		return {
			success: false,
			error: `Activation request failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

// =============================================================================
// HELPER EXPORTS
// =============================================================================

export {createBasicAuth, configAuth, unauthorizedMessage};
