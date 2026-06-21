import fs from 'fs';
import path from 'path';
import type {
	SitevisionManifest,
	DevProperties,
	ProjectInfo,
	ProjectPaths,
	SimpleAppType,
	PackageJson,
	ApiEndpoints,
} from '../types/index.js';
import {getDeployPassword, setDeployPassword} from './keychain.js';

// Re-export types for backward compatibility
export type {SitevisionManifest, DevProperties, ProjectInfo} from '../types/index.js';

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Get standard project paths for a given root directory
 */
export function getProjectPaths(root: string, manifestPath: string, devPropertiesPath: string | null): ProjectPaths {
	return {
		root,
		src: path.join(root, 'src'),
		static: path.join(root, 'static'),
		build: path.join(root, 'build'),
		dist: path.join(root, 'dist'),
		manifest: manifestPath,
		devProperties: devPropertiesPath,
		packageJson: path.join(root, 'package.json'),
		nodeModules: path.join(root, 'node_modules'),
	};
}

/**
 * Find the dev properties file path (supports both naming conventions)
 */
export function findDevPropertiesPath(root: string): string | null {
	const paths = [
		path.join(root, '.dev_properties.json'),
		path.join(root, '.dev-properties.json'),
	];

	for (const p of paths) {
		if (fs.existsSync(p)) {
			return p;
		}
	}

	return null;
}

/**
 * Get the default dev properties path (for creating new files)
 */
export function getDefaultDevPropertiesPath(root: string): string {
	return path.join(root, '.dev_properties.json');
}

// =============================================================================
// APP ID UTILITIES
// =============================================================================

/**
 * Environment variable configuration for app ID
 */
interface AppIdConfig {
	prefix: string;
	suffix: string;
}

/**
 * Get app ID configuration from environment or defaults
 */
function getAppIdConfig(): AppIdConfig {
	return {
		prefix: process.env['SITEVISION_APP_ID_PREFIX'] || '',
		suffix: process.env['SITEVISION_APP_ID_SUFFIX'] || '',
	};
}

/**
 * Get the full app ID including any prefix/suffix from environment
 *
 * This combines: prefix + baseId + suffix
 * Used for generating zip filenames and deployment identifiers
 */
export function getFullAppId(baseId: string): string {
	const config = getAppIdConfig();
	return `${config.prefix}${baseId}${config.suffix}`;
}

/**
 * Get the zip filename for an app
 */
export function getZipFilename(manifest: SitevisionManifest): string {
	return `${getFullAppId(manifest.id)}.zip`;
}

/**
 * Get the signed zip filename for an app
 */
export function getSignedZipFilename(manifest: SitevisionManifest): string {
	return `${getFullAppId(manifest.id)}-signed.zip`;
}

/**
 * Get the full path to the zip file in dist/
 */
export function getZipPath(projectRoot: string, manifest: SitevisionManifest): string {
	return path.join(projectRoot, 'dist', getZipFilename(manifest));
}

/**
 * Get the full path to the signed zip file in dist/
 */
export function getSignedZipPath(projectRoot: string, manifest: SitevisionManifest): string {
	return path.join(projectRoot, 'dist', getSignedZipFilename(manifest));
}

// =============================================================================
// API ENDPOINT UTILITIES
// =============================================================================

/**
 * Get API endpoints for the given app type
 */
export function getApiEndpoints(appType: SimpleAppType): ApiEndpoints {
	switch (appType) {
		case 'web':
			return {
				addon: 'custommodule',
				import: 'webAppImport',
			};
		case 'widget':
			return {
				addon: 'widgetcustommodule',
				import: 'webAppImport',
			};
		case 'rest':
			return {
				addon: 'headlesscustommodule',
				import: 'restAppImport',
			};
	}
}

/**
 * Build the base URL for API requests
 */
export function buildApiBaseUrl(domain: string, siteName: string, useHTTP = false): string {
	const protocol = useHTTP ? 'http' : 'https';
	return `${protocol}://${domain}/rest-api/1/0/${encodeURIComponent(siteName)}`;
}

/**
 * Build the addon endpoint URL
 */
export function buildAddonEndpointUrl(
	domain: string,
	siteName: string,
	appType: SimpleAppType,
	useHTTP = false,
): string {
	const baseUrl = buildApiBaseUrl(domain, siteName, useHTTP);
	const endpoints = getApiEndpoints(appType);
	return `${baseUrl}/Addon%20Repository/${endpoints.addon}`;
}

/**
 * Build the import endpoint URL
 */
export function buildImportEndpointUrl(
	domain: string,
	siteName: string,
	addonName: string,
	appType: SimpleAppType,
	useHTTP = false,
): string {
	const baseUrl = buildApiBaseUrl(domain, siteName, useHTTP);
	const endpoints = getApiEndpoints(appType);
	return `${baseUrl}/Addon%20Repository/${encodeURIComponent(addonName)}/${endpoints.import}`;
}

// =============================================================================
// PROJECT DETECTION
// =============================================================================

/**
 * Detect if the current directory is a Sitevision project
 */
export function detectProject(cwd: string = process.cwd()): ProjectInfo | null {
	try {
		// Look for manifest.json in multiple locations (current, static/, src/)
		const manifestPaths = [
			path.join(cwd, 'manifest.json'),
			path.join(cwd, 'static', 'manifest.json'),
			path.join(cwd, 'src', 'manifest.json'),
		];

		let manifestPath: string | null = null;
		let manifest: SitevisionManifest | null = null;

		for (const p of manifestPaths) {
			if (fs.existsSync(p)) {
				manifestPath = p;
				manifest = JSON.parse(fs.readFileSync(p, 'utf-8')) as SitevisionManifest;
				break;
			}
		}

		if (!manifest || !manifestPath) {
			return null;
		}

		// Check for package.json
		const packageJsonPath = path.join(cwd, 'package.json');
		if (!fs.existsSync(packageJsonPath)) {
			return null;
		}

		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;

		// Check if sitevision-scripts is installed
		const hasSitevisionScripts = Boolean(
			packageJson.dependencies?.['@sitevision/scripts'] ||
			packageJson.devDependencies?.['@sitevision/scripts'],
		);

		// Check for node_modules
		const nodeModulesPath = path.join(cwd, 'node_modules');
		const hasNodeModules = fs.existsSync(nodeModulesPath);

		// Check for dev properties
		const devPropertiesPath = findDevPropertiesPath(cwd);
		let devProperties: DevProperties | undefined;
		let hasDevProperties = false;
		let hasLegacyPassword = false;

		if (devPropertiesPath) {
			hasDevProperties = true;
			try {
				const parsed = JSON.parse(fs.readFileSync(devPropertiesPath, 'utf-8')) as DevProperties & {password?: string};
				hasLegacyPassword = typeof parsed.password === 'string' && parsed.password.length > 0;
				devProperties = parsed;

				// Resolve deploy password: env var > keychain (file is legacy-only)
				if (!hasLegacyPassword && devProperties.domain && devProperties.username) {
					const envPassword = process.env['SITEVISION_DEPLOY_PASSWORD'];
					if (envPassword) {
						devProperties.password = envPassword;
					} else {
						const stored = getDeployPassword(devProperties.domain, devProperties.username);
						if (stored) {
							devProperties.password = stored;
						}
					}
				}
			} catch {
				// Invalid dev properties file
			}
		}

		// Check if signing properties are configured (only username is stored, password is entered at runtime)
		const hasSigningProperties = Boolean(devProperties?.signingUsername);

		// Build paths object
		const paths = getProjectPaths(cwd, manifestPath, devPropertiesPath);

		return {
			root: cwd,
			manifest,
			hasDevProperties,
			hasSigningProperties,
			hasLegacyPassword,
			devProperties,
			packageJson,
			hasSitevisionScripts,
			hasNodeModules,
			paths,
		};
	} catch {
		return null;
	}
}

/**
 * Validate that we're in a Sitevision project directory
 */
export function requireProject(cwd?: string): ProjectInfo {
	const project = detectProject(cwd);
	if (!project) {
		throw new Error(
			'Not a Sitevision project. Run this command inside a Sitevision app directory.',
		);
	}

	return project;
}

/**
 * Get the app type (web, widget, rest)
 */
export function getAppType(manifest: SitevisionManifest): SimpleAppType {
	const type = manifest.type.toLowerCase();
	if (type.startsWith('web')) {
		return 'web';
	}

	if (type.startsWith('widget')) {
		return 'widget';
	}

	if (type.startsWith('rest')) {
		return 'rest';
	}

	throw new Error(`Unknown app type: ${manifest.type}`);
}

/**
 * Check if the app uses webpack bundling
 */
export function isBundledApp(manifest: SitevisionManifest): boolean {
	return manifest.bundled === true;
}

/**
 * Read and parse the dev properties file
 */
export function readDevProperties(projectRoot: string): DevProperties | null {
	const devPropertiesPath = findDevPropertiesPath(projectRoot);
	if (!devPropertiesPath) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(devPropertiesPath, 'utf-8')) as DevProperties;
	} catch {
		return null;
	}
}

/**
 * Write dev properties to file. The `password` field is never persisted —
 * it is held in the OS keychain instead.
 */
export function writeDevProperties(projectRoot: string, properties: DevProperties): void {
	const devPropertiesPath = findDevPropertiesPath(projectRoot) || getDefaultDevPropertiesPath(projectRoot);
	const {password: _password, ...persisted} = properties;
	fs.writeFileSync(devPropertiesPath, JSON.stringify(persisted, null, 2));
}

/**
 * Move a plaintext password from .dev_properties.json into the OS keychain and
 * strip it from the file. Returns true if the password was migrated.
 *
 * The in-memory `project.devProperties.password` is intentionally left intact
 * so the current invocation can keep using it; only the on-disk copy is removed.
 */
export function migrateLegacyPassword(project: ProjectInfo): boolean {
	if (!project.hasLegacyPassword || !project.devProperties) return false;
	const {domain, username, password} = project.devProperties;
	if (!domain || !username || !password) return false;

	if (!setDeployPassword(domain, username, password)) return false;

	// writeDevProperties strips `password` defensively; keep the in-memory value.
	writeDevProperties(project.root, project.devProperties);
	project.hasLegacyPassword = false;
	return true;
}

/**
 * Ensure the dist directory exists
 */
export function ensureDistDir(projectRoot: string): string {
	const distPath = path.join(projectRoot, 'dist');
	if (!fs.existsSync(distPath)) {
		fs.mkdirSync(distPath, {recursive: true});
	}

	return distPath;
}

/**
 * Ensure the build directory exists
 */
export function ensureBuildDir(projectRoot: string): string {
	const buildPath = path.join(projectRoot, 'build');
	if (!fs.existsSync(buildPath)) {
		fs.mkdirSync(buildPath, {recursive: true});
	}

	return buildPath;
}

/**
 * Clean the build directory
 */
export function cleanBuildDir(projectRoot: string): void {
	const buildPath = path.join(projectRoot, 'build');
	if (fs.existsSync(buildPath)) {
		fs.rmSync(buildPath, {recursive: true, force: true});
	}
}
