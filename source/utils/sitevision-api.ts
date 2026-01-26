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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create Basic Auth header value
 */
function createBasicAuth(username: string, password: string): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
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
	parts.push(Buffer.from(
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
		`Content-Type: application/octet-stream\r\n\r\n`,
	));
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
function makeRequest(
	url: string,
	options: {
		method: string;
		headers?: Record<string, string>;
		body?: Buffer;
		auth?: {username: string; password: string};
	},
): Promise<{statusCode: number; body: Buffer; headers: Record<string, string>}> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const isHttps = parsedUrl.protocol === 'https:';
		const transport = isHttps ? https : http;

		const headers: Record<string, string> = {
			...options.headers,
		};

		if (options.auth) {
			headers['Authorization'] = createBasicAuth(
				options.auth.username,
				options.auth.password,
			);
		}

		const requestOptions: https.RequestOptions = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port || (isHttps ? 443 : 80),
			path: parsedUrl.pathname + parsedUrl.search,
			method: options.method,
			headers,
		};

		const req = transport.request(requestOptions, (res) => {
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

		req.on('error', reject);

		if (options.body) {
			req.write(options.body);
		}

		req.end();
	});
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
	const {body, contentType} = createMultipartFormData(zipPath, 'file', boundary);

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
			return {
				success: false,
				error: 'Unauthorized. Check username and password.',
			};
		}

		return {
			success: false,
			error: `Signing failed with status ${response.statusCode}: ${response.body.toString()}`,
		};
	} catch (error) {
		return {
			success: false,
			error: `Signing request failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
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

	// Create multipart form data
	const boundary = generateBoundary();
	const {body, contentType} = createMultipartFormData(zipPath, 'file', boundary);

	try {
		const response = await makeRequest(url, {
			method: 'POST',
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(body.length),
			},
			body,
			auth: {
				username: config.username,
				password: config.password,
			},
		});

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

		if (response.statusCode === 401) {
			return {
				success: false,
				error: 'Unauthorized. Check username and password.',
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
			error: `Deployment failed with status ${response.statusCode}: ${response.body.toString()}`,
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
		const activationResult = await activateApp(deployResult.executableId, config, appType);
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

	try {
		const response = await makeRequest(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(Buffer.byteLength(body)),
			},
			body: Buffer.from(body),
			auth: {
				username: config.username,
				password: config.password,
			},
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
				error: 'Unauthorized. Check username and password.',
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
			error: `Create addon failed with status ${response.statusCode}: ${response.body.toString()}`,
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

	try {
		const response = await makeRequest(url, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(Buffer.byteLength(body)),
			},
			body: Buffer.from(body),
			auth: {
				username: config.username,
				password: config.password,
			},
		});

		if (response.statusCode === 200) {
			return {success: true};
		}

		if (response.statusCode === 401) {
			return {
				success: false,
				error: 'Unauthorized. Check username and password.',
			};
		}

		return {
			success: false,
			error: `Activation failed with status ${response.statusCode}: ${response.body.toString()}`,
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

export {createBasicAuth};
