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
	LocalizedString,
} from '../types/index.js';
import {
	getDeployPassword,
	setDeployPassword,
	getSessionCookie,
} from './keychain.js';
import {parseJsonc} from './jsonc.js';
import {getLanguage} from './i18n.js';

// Re-export types for backward compatibility
export type {
	SitevisionManifest,
	DevProperties,
	ProjectInfo,
} from '../types/index.js';

// =============================================================================
// LOCALIZED TEXT
// =============================================================================

/**
 * Resolve a manifest text field that may be a plain string or a localized
 * object (e.g. `{sv: 'Namn', en: 'Name'}`) to a single display string.
 *
 * Preference order: Swedish, then English, then any available language. Returns
 * an empty string for missing/empty values. This guards the UI from rendering a
 * raw object as a React child, which Sitevision's localized manifests would
 * otherwise trigger.
 */
export function localizedText(
	value: LocalizedString | undefined,
	preferred: string = getLanguage(),
): string {
	if (!value) return '';
	if (typeof value === 'string') return value;
	return value[preferred] ?? value['en'] ?? Object.values(value)[0] ?? '';
}

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Get standard project paths for a given root directory
 */
export function getProjectPaths(
	root: string,
	manifestPath: string,
	devPropertiesPath: string | null,
): ProjectPaths {
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

/**
 * Ancestor directories of `root` (outermost first) up to and including the
 * nearest one containing `.git`, or the filesystem root. Each may carry a
 * `.dev_properties.json` whose values the app inherits (nearest wins).
 */
function ancestorDirs(root: string): string[] {
	const dirs: string[] = [];
	let dir = path.dirname(root);
	while (true) {
		dirs.unshift(dir);
		if (fs.existsSync(path.join(dir, '.git'))) break;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return dirs;
}

function readDevPropertiesFile(dir: string): Partial<DevProperties> | null {
	const file = findDevPropertiesPath(dir);
	if (!file) return null;
	try {
		return JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<DevProperties>;
	} catch {
		return null;
	}
}

/**
 * The dev properties a workspace root defines (its own file merged over any
 * ancestors'), with the deploy password resolved from the keychain like an
 * app's would be. Used to edit shared config from the shell.
 */
export function readWorkspaceDevProperties(
	root: string,
): Partial<DevProperties> {
	const merged = {
		...readInheritedDevProperties(root),
		...readDevPropertiesFile(root),
	};
	if (merged.domain && merged.username && !merged.password) {
		merged.password =
			process.env['SITEVISION_DEPLOY_PASSWORD'] ??
			getDeployPassword(merged.domain, merged.username) ??
			undefined;
	}

	return merged;
}

/** Dev properties inherited from ancestor directories only (no own file). */
export function readInheritedDevProperties(
	root: string,
): Partial<DevProperties> {
	let merged: Partial<DevProperties> = {};
	for (const dir of ancestorDirs(root)) {
		merged = {...merged, ...readDevPropertiesFile(dir)};
	}

	return merged;
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
export function getZipPath(
	projectRoot: string,
	manifest: SitevisionManifest,
): string {
	return path.join(projectRoot, 'dist', getZipFilename(manifest));
}

/**
 * Get the full path to the signed zip file in dist/
 */
export function getSignedZipPath(
	projectRoot: string,
	manifest: SitevisionManifest,
): string {
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
		case 'mcp':
			return {
				addon: 'mcpServerCustomModule',
				import: 'mcpServerImport',
			};
	}
}

/**
 * Build the base URL for API requests
 */
export function buildApiBaseUrl(
	domain: string,
	siteName: string,
	useHTTP = false,
): string {
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
 * Thrown when a manifest.json is present but cannot be parsed. Kept distinct from
 * a plain "no project here" (null) so the CLI can tell the user their manifest is
 * malformed instead of the misleading "Not a Sitevision project".
 */
export class ManifestParseError extends Error {
	constructor(manifestPath: string, cause: unknown) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		super(`${manifestPath} is not valid JSON: ${reason}`);
		this.name = 'ManifestParseError';
	}
}

/**
 * Read manifest.json from its supported locations (root, static/, src/).
 * Throws ManifestParseError on malformed JSON.
 */
export function readManifest(
	cwd: string,
): {manifestPath: string; manifest: SitevisionManifest} | null {
	const manifestPaths = [
		path.join(cwd, 'manifest.json'),
		path.join(cwd, 'static', 'manifest.json'),
		path.join(cwd, 'src', 'manifest.json'),
	];

	for (const manifestPath of manifestPaths) {
		if (!fs.existsSync(manifestPath)) {
			continue;
		}

		// Manifests may contain comments (Sitevision's own docs show them), so
		// parse as JSONC.
		try {
			return {
				manifestPath,
				manifest: parseJsonc<SitevisionManifest>(
					fs.readFileSync(manifestPath, 'utf-8'),
				),
			};
		} catch (error) {
			throw new ManifestParseError(manifestPath, error);
		}
	}

	return null;
}

/**
 * Detect if the current directory is a Sitevision project
 */
export function detectProject(cwd: string = process.cwd()): ProjectInfo | null {
	try {
		const found = readManifest(cwd);
		if (!found) {
			return null;
		}

		const {manifestPath, manifest} = found;

		// Check for package.json
		const packageJsonPath = path.join(cwd, 'package.json');
		if (!fs.existsSync(packageJsonPath)) {
			return null;
		}

		const packageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf-8'),
		) as PackageJson;

		// Check if sitevision-scripts is installed
		const hasSitevisionScripts = Boolean(
			packageJson.dependencies?.['@sitevision/scripts'] ||
			packageJson.devDependencies?.['@sitevision/scripts'],
		);

		// Check for node_modules
		const nodeModulesPath = path.join(cwd, 'node_modules');
		const hasNodeModules = fs.existsSync(nodeModulesPath);

		// Dev properties: ancestor files (workspace root) merged under the app's
		// own file, so shared site/auth config lives once at the repo root.
		const devPropertiesPath = findDevPropertiesPath(cwd);
		const inherited = readInheritedDevProperties(cwd);
		const own = devPropertiesPath ? readDevPropertiesFile(cwd) : null;
		const inheritedKeys = Object.keys(inherited).filter(
			key => !own || !Object.hasOwn(own, key),
		);
		let devProperties: DevProperties | undefined;
		const hasDevProperties = Boolean(own) || inheritedKeys.length > 0;
		let hasLegacyPassword = false;

		if (hasDevProperties) {
			try {
				const parsed = {...inherited, ...own} as DevProperties & {
					password?: string;
				};
				hasLegacyPassword =
					typeof parsed.password === 'string' && parsed.password.length > 0;
				devProperties = parsed;

				if (!hasLegacyPassword) resolveRuntimeSecrets(devProperties);
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
			inheritedKeys,
			packageJson,
			hasSitevisionScripts,
			hasNodeModules,
			paths,
		};
	} catch (error) {
		// A malformed manifest is a real error the user should see; everything else
		// (missing files, unreadable optional config) just means "no project here".
		if (error instanceof ManifestParseError) {
			throw error;
		}

		return null;
	}
}

/**
 * Fill the runtime-only credential fields for the given domain/username:
 * deploy password (env var > keychain), OAuth2 access token (env var), and
 * session cookie (env var > keychain). Mutates and returns `dev`.
 */
export function resolveRuntimeSecrets(dev: DevProperties): DevProperties {
	if (dev.domain && dev.username) {
		dev.password =
			process.env['SITEVISION_DEPLOY_PASSWORD'] ??
			getDeployPassword(dev.domain, dev.username) ??
			undefined;
	}

	if (dev.authMethod === 'oauth2') {
		dev.accessToken = process.env['SITEVISION_ACCESS_TOKEN'] ?? undefined;
	}

	if (dev.authMethod === 'cookie' && dev.domain && dev.username) {
		dev.sessionCookie =
			process.env['SITEVISION_SESSION_COOKIE'] ??
			getSessionCookie(dev.domain, dev.username) ??
			undefined;
	}

	return dev;
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
 * The app type (web, widget, rest, mcp), or undefined for a manifest type
 * this CLI does not know. Display code uses this so one odd app never takes
 * the whole shell down.
 */
export function appTypeOf(
	manifest: SitevisionManifest,
): SimpleAppType | undefined {
	const type = manifest.type.toLowerCase();
	if (type.startsWith('web')) return 'web';
	if (type.startsWith('widget')) return 'widget';
	if (type.startsWith('rest')) return 'rest';
	if (type.startsWith('mcp')) return 'mcp';
	return undefined;
}

/**
 * Get the app type (web, widget, rest, mcp). Throws for unknown types, since
 * build and deploy cannot proceed without knowing the endpoints.
 */
export function getAppType(manifest: SitevisionManifest): SimpleAppType {
	const type = appTypeOf(manifest);
	if (!type) throw new Error(`Unknown app type: ${manifest.type}`);
	return type;
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
		return JSON.parse(
			fs.readFileSync(devPropertiesPath, 'utf-8'),
		) as DevProperties;
	} catch {
		return null;
	}
}

/**
 * Write dev properties to file. Secrets are never persisted — `password`,
 * `accessToken` and `sessionCookie` are held in the OS keychain / resolved at
 * runtime instead.
 */
export function writeDevProperties(
	projectRoot: string,
	properties: DevProperties,
): void {
	const devPropertiesPath =
		findDevPropertiesPath(projectRoot) ||
		getDefaultDevPropertiesPath(projectRoot);
	const {
		password: _password,
		accessToken: _accessToken,
		sessionCookie: _sessionCookie,
		environmentName: _environmentName,
		productionEnvironment: _productionEnvironment,
		...persisted
	} = properties;
	// Keep the app file minimal: values identical to the inherited ones stay
	// at the workspace root instead of being copied into every app.
	const inherited: Record<string, unknown> =
		readInheritedDevProperties(projectRoot);
	const own = Object.fromEntries(
		Object.entries(persisted).filter(
			([key, value]) =>
				!Object.hasOwn(inherited, key) ||
				JSON.stringify(inherited[key]) !== JSON.stringify(value),
		),
	);

	fs.writeFileSync(devPropertiesPath, JSON.stringify(own, null, 2));
}

// =============================================================================
// SVC CONFIG
// =============================================================================

/**
 * CLI preferences stored in .svcconfig at the project root. Unknown keys are
 * preserved on write so hand-edited entries survive.
 */
export interface SvcConfig {
	syncPackageJson?: boolean;
	// Last selected environment in the shell.
	environment?: string;
	[key: string]: unknown;
}

export function readSvcConfig(projectRoot: string): SvcConfig {
	try {
		return parseJsonc<SvcConfig>(
			fs.readFileSync(path.join(projectRoot, '.svcconfig'), 'utf-8'),
		);
	} catch {
		return {};
	}
}

export function writeSvcConfig(projectRoot: string, updates: SvcConfig): void {
	const merged = {...readSvcConfig(projectRoot), ...updates};
	fs.writeFileSync(
		path.join(projectRoot, '.svcconfig'),
		JSON.stringify(merged, null, 2) + '\n',
	);
}

// =============================================================================
// PACKAGE.JSON SYNC
// =============================================================================

/**
 * Fields duplicated between .dev_properties.json and package.json, where
 * sitevision-scripts reads them under different names.
 */
const PACKAGE_JSON_SYNC_KEYS: {
	packageKey: 'developmentDomain' | 'siteName' | 'addonName';
	devKey: keyof DevProperties;
}[] = [
	{packageKey: 'developmentDomain', devKey: 'domain'},
	{packageKey: 'siteName', devKey: 'siteName'},
	{packageKey: 'addonName', devKey: 'addonName'},
];

export interface PackageJsonSyncChange {
	key: string;
	from?: string;
	to: string;
}

function readPackageJson(projectRoot: string): PackageJson | null {
	try {
		return JSON.parse(
			fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
		) as PackageJson;
	} catch {
		return null;
	}
}

/**
 * Which of the shared fields package.json is missing or disagrees on, relative
 * to the given dev properties. Reads package.json from disk — an earlier
 * `npm install` in the same session may have rewritten it.
 */
export function getPackageJsonSyncChanges(
	projectRoot: string,
	properties: DevProperties,
): PackageJsonSyncChange[] {
	const packageJson = readPackageJson(projectRoot);
	if (!packageJson) return [];

	const changes: PackageJsonSyncChange[] = [];
	for (const {packageKey, devKey} of PACKAGE_JSON_SYNC_KEYS) {
		const to = properties[devKey];
		if (typeof to !== 'string' || to === '') continue;
		const from = packageJson[packageKey];
		if (from !== to) {
			changes.push(
				from === undefined
					? {key: packageKey, to}
					: {key: packageKey, from, to},
			);
		}
	}

	return changes;
}

/**
 * Copy the shared fields from dev properties into package.json, preserving the
 * file's existing indentation and trailing newline.
 */
export function syncDevPropertiesToPackageJson(
	projectRoot: string,
	properties: DevProperties,
): boolean {
	const packageJsonPath = path.join(projectRoot, 'package.json');
	let raw: string;
	try {
		raw = fs.readFileSync(packageJsonPath, 'utf-8');
	} catch {
		return false;
	}

	let packageJson: PackageJson;
	try {
		packageJson = JSON.parse(raw) as PackageJson;
	} catch {
		return false;
	}

	for (const {packageKey, devKey} of PACKAGE_JSON_SYNC_KEYS) {
		const value = properties[devKey];
		if (typeof value === 'string' && value !== '') {
			packageJson[packageKey] = value;
		}
	}

	const indent = /^(?<indent>[\t ]+)/m.exec(raw)?.groups?.['indent'] ?? '\t';
	const newline = raw.endsWith('\n') ? '\n' : '';
	fs.writeFileSync(
		packageJsonPath,
		JSON.stringify(packageJson, null, indent) + newline,
	);
	return true;
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
