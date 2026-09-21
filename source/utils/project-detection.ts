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
import {parseJsonc, stripJsonComments} from './jsonc.js';
import {getLanguage} from './i18n.js';
import {getGlobalSigning} from './config.js';

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

/**
 * The manifest's names when the addon name is none of them. The two are
 * separate things (the addon is an object on the site, the name a label in the
 * zip), so a difference is only ever pointed out, never "fixed".
 */
export function addonNameDrift(
	addonName: string | undefined,
	manifest?: {name?: LocalizedString},
): string[] | undefined {
	const same = (text: string) => text.trim().toLowerCase();
	const names = (
		typeof manifest?.name === 'string'
			? [manifest.name]
			: Object.values(manifest?.name ?? {})
	).filter(name => name.trim() !== '');
	if (!addonName?.trim() || names.length === 0) return undefined;
	return names.some(name => same(name) === same(addonName)) ? undefined : names;
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

/** A bare host: no scheme, no path, no stray spaces. */
export function normalizeDomain(value: string): string {
	const host = value
		.trim()
		.replace(/^[a-z]+:\/\//i, '')
		.replaceAll(/\s/g, '');
	const slash = host.indexOf('/');
	return slash === -1 ? host : host.slice(0, slash);
}

function readDevPropertiesFile(dir: string): Partial<DevProperties> | null {
	const file = findDevPropertiesPath(dir);
	if (!file) return null;
	try {
		const dev = JSON.parse(
			fs.readFileSync(file, 'utf-8'),
		) as Partial<DevProperties>;
		// ponytail: top level only; a hand-edited environment override keeps its
		// scheme until it is saved from the config form.
		dev.domain &&= normalizeDomain(dev.domain);
		return dev;
	} catch {
		return null;
	}
}

/**
 * Merge config layers, later ones winning. `environments` merges per name, so a
 * layer that overrides one field of an environment keeps the rest of it.
 */
export function mergeDevLayers(
	...layers: Array<Partial<DevProperties> | null | undefined>
): Partial<DevProperties> {
	let merged: Partial<DevProperties> = {};
	for (const layer of layers) {
		if (!layer) continue;
		const environments = {...merged.environments};
		for (const [name, override] of Object.entries(layer.environments ?? {})) {
			environments[name] = {...environments[name], ...override};
		}

		merged = {...merged, ...layer};
		if (Object.keys(environments).length > 0) {
			merged.environments = environments;
		}
	}

	return merged;
}

/**
 * The dev properties a workspace root defines (its own file merged over any
 * ancestors'), with the deploy password resolved from the keychain like an
 * app's would be. Used to edit shared config from the shell.
 */
export function readWorkspaceDevProperties(
	root: string,
): Partial<DevProperties> {
	const merged = mergeDevLayers(
		readInheritedDevProperties(root),
		readDevPropertiesFile(root),
	);
	if (merged.domain && merged.username && !merged.password) {
		merged.password =
			process.env['SITEVISION_DEPLOY_PASSWORD'] ??
			getDeployPassword(merged.domain, merged.username) ??
			undefined;
	}

	return merged;
}

/** Ancestor directories' .dev_properties.json merged, nearest wins (no own file). */
export function readAncestorDevProperties(
	root: string,
): Partial<DevProperties> {
	return mergeDevLayers(
		...ancestorDirs(root).map(dir => readDevPropertiesFile(dir)),
	);
}

/** Shared defaults from package.json: the workspace root's first, the app's on top. */
export function readPackageDefaultsChain(root: string): Partial<DevProperties> {
	return mergeDevLayers(
		...[...ancestorDirs(root), root].map(dir => readPackageDefaults(dir)),
	);
}

/**
 * Everything an app's own .dev_properties.json sits on top of: package.json
 * defaults (root, then app), then ancestor .dev_properties.json files.
 */
export function readInheritedDevProperties(
	root: string,
): Partial<DevProperties> {
	return mergeDevLayers(
		readPackageDefaultsChain(root),
		readAncestorDevProperties(root),
	);
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
export function getAppIdConfig(): AppIdConfig {
	return {
		// svc's own names first, then the ones sitevision-scripts reads.
		prefix:
			process.env['SITEVISION_APP_ID_PREFIX'] ||
			process.env['APP_ID_PREFIX'] ||
			'',
		suffix:
			process.env['SITEVISION_APP_ID_SUFFIX'] ||
			process.env['APP_ID_SUFFIX'] ||
			'',
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

/**
 * The zip a non-production deploy uploads: the signed one when it is at least
 * as new as the build, since some sites reject unsigned apps even on dev.
 */
export function getDeployZipPath(
	projectRoot: string,
	manifest: SitevisionManifest,
): string {
	const zip = getZipPath(projectRoot, manifest);
	const signed = getSignedZipPath(projectRoot, manifest);
	const mtime = (file: string) =>
		fs.statSync(file, {throwIfNoEntry: false})?.mtimeMs;
	const signedAt = mtime(signed);
	if (signedAt === undefined) return zip;
	const builtAt = mtime(zip);
	return builtAt === undefined || signedAt >= builtAt ? signed : zip;
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
		super(`${manifestPath} ${reason}`);
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
		let manifest: SitevisionManifest;
		try {
			manifest = parseJsonc<SitevisionManifest>(
				fs.readFileSync(manifestPath, 'utf-8'),
			);
		} catch (error) {
			throw new ManifestParseError(
				manifestPath,
				`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		if (typeof manifest !== 'object' || manifest === null) {
			throw new ManifestParseError(manifestPath, 'must be a JSON object');
		}

		// Zip names, endpoints and the build all derive from these.
		for (const key of ['id', 'version', 'type'] as const) {
			if (typeof manifest[key] !== 'string' || manifest[key] === '') {
				throw new ManifestParseError(manifestPath, `is missing "${key}"`);
			}
		}

		return {manifestPath, manifest};
	}

	return null;
}

const JSON_STRING = String.raw`"(?:[^"\\]|\\.)*"`;
const escapeRegExp = (s: string) =>
	s.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/**
 * Set one text field of manifest.json, or one language of a localized field.
 * An empty value removes the key. A value that is already a string is replaced
 * in the text, so comments and formatting survive; anything else rewrites the
 * file, which is refused when that would drop comments.
 */
export function writeManifestField(
	manifestPath: string,
	key: string,
	value: string,
	lang?: string,
): void {
	const raw = fs.readFileSync(manifestPath, 'utf-8');
	const wanted = parseJsonc<Record<string, unknown>>(raw);
	const existing = wanted[key];
	if (lang && typeof existing !== 'object') {
		// A plain string becomes the English text of a multilingual value.
		wanted[key] = existing ? {en: existing} : {};
	}

	const holder = lang ? (wanted[key] as Record<string, unknown>) : wanted;
	const leaf = lang ?? key;
	// JSON.stringify drops an undefined key.
	holder[leaf] = value || undefined;

	const prefix = lang
		? String.raw`"${escapeRegExp(key)}"\s*:\s*\{[^}]*?"${escapeRegExp(lang)}"\s*:\s*`
		: String.raw`"${escapeRegExp(key)}"\s*:\s*`;
	const patched = raw.replace(
		new RegExp(`(${prefix})${JSON_STRING}`),
		(_, before: string) => before + JSON.stringify(value),
	);
	let patchedOk = false;
	try {
		patchedOk = JSON.stringify(parseJsonc(patched)) === JSON.stringify(wanted);
	} catch {}

	if (patchedOk) {
		fs.writeFileSync(manifestPath, patched);
		return;
	}

	if (stripJsonComments(raw) !== raw) {
		throw new Error(
			`${manifestPath} has comments; add or remove "${leaf}" by hand`,
		);
	}

	const indent = /^(?<indent>[\t ]+)/m.exec(raw)?.groups?.['indent'] ?? '\t';
	fs.writeFileSync(
		manifestPath,
		JSON.stringify(wanted, null, indent) + (raw.endsWith('\n') ? '\n' : ''),
	);
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
				// ponytail: the global signing identity only reaches a project that
				// has some config of its own, so "configured?" checks stay truthful.
				const parsed = mergeDevLayers(
					getGlobalSigning(),
					inherited,
					own,
				) as DevProperties & {
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

	if (dev.authMethod === 'cookie' && dev.domain) {
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
	const type = String(manifest.type ?? '').toLowerCase();
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
	// App mode: write every value, so plain sitevision-scripts finds them all.
	{complete = false}: {complete?: boolean} = {},
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
	// at the workspace root instead of being copied into every app. An empty
	// string means "unset", so it is dropped rather than written as an override
	// that would shadow the inherited value.
	const inherited: Record<string, unknown> = complete
		? {}
		: mergeDevLayers(
				getGlobalSigning(),
				readInheritedDevProperties(projectRoot),
			);
	const own = Object.fromEntries(
		Object.entries(persisted).filter(
			([key, value]) =>
				value !== '' &&
				(!Object.hasOwn(inherited, key) ||
					JSON.stringify(inherited[key]) !== JSON.stringify(value)),
		),
	);

	// A plaintext password already in the file (sitevision-scripts puts it
	// there) moves to the keychain; if that fails it stays rather than be lost.
	const legacy = readDevPropertiesFile(projectRoot)?.password;
	if (legacy) {
		const {domain, username} = {...inherited, ...persisted} as DevProperties;
		if (!setDeployPassword(domain, username, legacy)) own['password'] = legacy;
	}

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
 * Values tied to the person running svc. They stay in .dev_properties.json and
 * never go into package.json.
 */
export const USER_KEYS = ['username', 'signingUsername', 'certificateName'];

// Shared values package.json can hold: three top-level fields, the rest under "svc".
const PACKAGE_TOP_KEYS: Record<string, string> = {
	domain: 'developmentDomain',
	siteName: 'siteName',
	addonName: 'addonName',
};
const PACKAGE_SVC_KEYS = [
	'authMethod',
	'oauth2',
	'sessionLoginUrl',
	'useHTTPForDevDeploy',
	'baseEnvironment',
	'production',
	'environments',
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

/** The shared defaults one directory's package.json provides. */
export function readPackageDefaults(dir: string): Partial<DevProperties> {
	const packageJson = readPackageJson(dir) as Record<string, unknown> | null;
	if (!packageJson) return {};
	const defaults: Record<string, unknown> = {};
	for (const [devKey, packageKey] of Object.entries(PACKAGE_TOP_KEYS)) {
		const value = packageJson[packageKey];
		if (typeof value === 'string' && value !== '') defaults[devKey] = value;
	}

	const svc = packageJson['svc'] as Record<string, unknown> | undefined;
	for (const key of PACKAGE_SVC_KEYS) {
		if (svc?.[key] !== undefined) defaults[key] = svc[key];
	}

	if (typeof defaults['domain'] === 'string') {
		defaults['domain'] = normalizeDomain(defaults['domain']);
	}

	return defaults as Partial<DevProperties>;
}

/**
 * Shared values in this directory's own .dev_properties.json that package.json
 * does not already provide, here or further up. User values never qualify.
 */
function pendingSync(dir: string): Array<{key: string; value: unknown}> {
	const own = readDevPropertiesFile(dir) as Record<string, unknown> | null;
	if (!own) return [];
	const defaults = readPackageDefaultsChain(dir) as Record<string, unknown>;
	const pending: Array<{key: string; value: unknown}> = [];
	for (const key of [...Object.keys(PACKAGE_TOP_KEYS), ...PACKAGE_SVC_KEYS]) {
		let value = own[key];
		if (key === 'environments' && value) {
			value = Object.fromEntries(
				Object.entries(value as Record<string, Record<string, unknown>>).map(
					([name, override]) => [
						name,
						Object.fromEntries(
							Object.entries(override).filter(
								([field]) => !USER_KEYS.includes(field),
							),
						),
					],
				),
			);
		}

		if (value === undefined || value === '') continue;
		if (
			JSON.stringify(value) ===
			JSON.stringify(defaults[key] ?? IMPLICIT_VALUES[key])
		)
			continue;
		pending.push({key, value});
	}

	return pending;
}

// Manifest fields package.json mirrors under the same name; the manifest wins.
const MANIFEST_PACKAGE_KEYS = ['version', 'description', 'author'] as const;

/**
 * Manifest values the app's own package.json does not mirror yet. Nothing when
 * either file is missing, so syncing never creates a package.json for this.
 */
function pendingManifestSync(
	dir: string,
): Array<{key: string; from?: string; value: string}> {
	const packageJson = readPackageJson(dir) as Record<string, unknown> | null;
	if (!packageJson) return [];
	let manifest: SitevisionManifest | undefined;
	try {
		manifest = readManifest(dir)?.manifest;
	} catch {}

	if (!manifest) return [];
	const pending: Array<{key: string; from?: string; value: string}> = [];
	for (const key of MANIFEST_PACKAGE_KEYS) {
		const value =
			key === 'description'
				? localizedText(manifest.description, 'en')
				: manifest[key];
		const current = packageJson[key];
		// ponytail: an author object ({name, email}) is left alone.
		if (!value || typeof value !== 'string' || value === current) continue;
		if (current !== undefined && typeof current !== 'string') continue;
		pending.push({key, from: current, value});
	}

	return pending;
}

/** What an unset field means, so spelling out the default is not a change. */
export const IMPLICIT_VALUES: Record<string, unknown> = {
	authMethod: 'basic',
	useHTTPForDevDeploy: false,
	production: false,
};

const packageLabel = (key: string) => PACKAGE_TOP_KEYS[key] ?? `svc.${key}`;
const display = (value: unknown) =>
	typeof value === 'string' ? value : JSON.stringify(value);

/** What syncing this directory would change in its package.json. */
export function getPackageJsonSyncChanges(
	dir: string,
): PackageJsonSyncChange[] {
	const current = readPackageDefaults(dir) as Record<string, unknown>;
	return [
		...pendingSync(dir).map(({key, value}) =>
			current[key] === undefined
				? {key: packageLabel(key), to: display(value)}
				: {
						key: packageLabel(key),
						from: display(current[key]),
						to: display(value),
					},
		),
		...pendingManifestSync(dir).map(({key, from, value}) => ({
			key,
			...(from !== undefined && {from}),
			to: value,
		})),
	];
}

export function hasPackageJson(dir: string): boolean {
	return fs.existsSync(path.join(dir, 'package.json'));
}

/**
 * Copy the pending shared values from .dev_properties.json, and the manifest
 * fields package.json mirrors, into package.json, creating package.json when
 * the directory has none. Throws if it cannot be
 * read or written.
 */
export function syncDevPropertiesToPackageJson(dir: string): boolean {
	const pending = pendingSync(dir);
	const mirrored = pendingManifestSync(dir);
	if (pending.length + mirrored.length === 0 && hasPackageJson(dir))
		return false;
	updatePackageJson(dir, packageJson => {
		for (const {key, value} of mirrored) packageJson[key] = value;
		for (const {key, value} of pending) {
			const topKey = PACKAGE_TOP_KEYS[key];
			if (topKey) {
				packageJson[topKey] = value;
			} else {
				packageJson['svc'] = {
					...(packageJson['svc'] as Record<string, unknown>),
					[key]: value,
				};
			}
		}
	});
	return true;
}

/**
 * Edit package.json in place, keeping its indentation and trailing newline. A
 * missing file is created; an unreadable or invalid one throws, so the caller
 * can warn instead of dropping the change silently.
 */
export function updatePackageJson(
	dir: string,
	mutate: (packageJson: Record<string, unknown>) => void,
): void {
	const packageJsonPath = path.join(dir, 'package.json');
	// A new file is private, so a workspace root is never published by accident.
	let raw = '{\n\t"private": true\n}\n';
	try {
		if (hasPackageJson(dir)) raw = fs.readFileSync(packageJsonPath, 'utf-8');
		const packageJson = JSON.parse(raw) as Record<string, unknown>;
		mutate(packageJson);
		const indent = /^(?<indent>[\t ]+)/m.exec(raw)?.groups?.['indent'] ?? '\t';
		const newline = raw.endsWith('\n') ? '\n' : '';
		fs.writeFileSync(
			packageJsonPath,
			JSON.stringify(packageJson, null, indent) + newline,
		);
	} catch (error) {
		throw new Error(
			`Could not update ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
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

	// Remove only the password, from whichever file holds it; every other value
	// stays as written.
	for (const dir of [project.root, ...ancestorDirs(project.root)]) {
		const file = findDevPropertiesPath(dir);
		if (!file) continue;
		try {
			const {password: stored, ...rest} = JSON.parse(
				fs.readFileSync(file, 'utf8'),
			) as Record<string, unknown>;
			if (stored !== undefined) {
				fs.writeFileSync(file, JSON.stringify(rest, null, 2));
			}
		} catch {
			// Unreadable file: nothing to migrate there. Unwritable: checked below.
		}
	}

	// Moved only if no file still holds it.
	const left = [project.root, ...ancestorDirs(project.root)].some(
		dir => readDevPropertiesFile(dir)?.password,
	);
	project.hasLegacyPassword = left;
	return !left;
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
