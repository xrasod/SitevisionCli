/**
 * Sitevision CLI - Shared Type Definitions
 *
 * This file contains all shared types used across the CLI.
 */

// =============================================================================
// MANIFEST TYPES
// =============================================================================

/**
 * App types supported by Sitevision
 */
export type AppType = 'WebApp' | 'Widget' | 'RESTApp' | 'MCPServer';

/**
 * Simplified app type for internal use
 */
export type SimpleAppType = 'web' | 'widget' | 'rest' | 'mcp';

/**
 * A manifest text field that may be a plain string or a localized object keyed
 * by language code, e.g. `{sv: 'Namn', en: 'Name'}`. Sitevision allows either
 * form for human-facing fields like `name` and `description`.
 */
export type LocalizedString = string | Record<string, string>;

/**
 * Sitevision app manifest (manifest.json)
 */
export interface SitevisionManifest {
	id: string;
	name: LocalizedString;
	version: string;
	type: AppType;
	bundled?: boolean;
	description?: LocalizedString;
	author?: string;
	helpUrl?: string;
	license?: string;
	categories?: string[];
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Development properties.
 *
 * Persisted fields live in .dev_properties.json. `password` is runtime-only:
 * resolved from the OS keychain (or a legacy plaintext file during migration)
 * and never written back to disk.
 */
export interface DevProperties {
	domain: string;
	siteName: string;
	addonName: string;
	username: string;
	password?: string;
	useHTTPForDevDeploy?: boolean;
	signingUsername?: string;
	certificateName?: string;
	// Absent means 'basic' — existing configs keep working without migration.
	authMethod?: 'basic' | 'oauth2' | 'cookie';
	oauth2?: OAuth2Config;
	// URL to open for the session-cookie login (defaults to the site root).
	sessionLoginUrl?: string;
	// Runtime-only, never persisted: resolved from env/keychain like `password`.
	accessToken?: string;
	sessionCookie?: string;
}

/**
 * OAuth2 provider config for bearer-token deploys.
 *
 * Deliberately secret-free: the client secret and refresh token live in the OS
 * keychain, so nothing here is unsafe to write to .dev_properties.json.
 */
export interface OAuth2Config {
	authorizationEndpoint: string;
	tokenEndpoint: string;
	clientId: string;
	scopes?: string[];
	// Fixed so the admin can whitelist one redirect URI (RFC 8252 loopback).
	redirectPort?: number;
}

/**
 * Signing credentials (password is runtime-only, not persisted)
 */
export interface SigningCredentials {
	username: string;
	password: string;
	certificateName?: string;
}

/**
 * Deployment configuration
 */
export interface DeployConfig {
	domain: string;
	siteName: string;
	addonName: string;
	username: string;
	// One auth path is used, in precedence order: sessionCookie (cookie),
	// accessToken (bearer), otherwise username+password (basic).
	password?: string;
	accessToken?: string;
	sessionCookie?: string;
	useHTTP?: boolean;
}

/**
 * Production deployment configuration
 */
export interface ProductionDeployConfig extends DeployConfig {
	activate?: boolean;
}

/**
 * Package.json sitevision_scripts_properties section
 */
export interface SitevisionScriptsProperties {
	transpile?: boolean;
	transpilePackages?: string[];
	babel?: Record<string, unknown>;
}

// =============================================================================
// PROJECT TYPES
// =============================================================================

/**
 * Full project information detected from the filesystem
 */
export interface ProjectInfo {
	root: string;
	manifest: SitevisionManifest;
	hasDevProperties: boolean;
	hasSigningProperties: boolean;
	hasLegacyPassword: boolean;
	devProperties?: DevProperties;
	// Keys of devProperties that come from an ancestor .dev_properties.json.
	inheritedKeys: string[];
	packageJson: PackageJson;
	hasSitevisionScripts: boolean;
	hasNodeModules: boolean;
	paths: ProjectPaths;
}

/**
 * Standard project paths
 */
export interface ProjectPaths {
	root: string;
	src: string;
	static: string;
	build: string;
	dist: string;
	manifest: string;
	devProperties: string | null;
	packageJson: string;
	nodeModules: string;
}

/**
 * Partial package.json with fields we care about
 */
export interface PackageJson {
	name?: string;
	version?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	sitevision_scripts_properties?: SitevisionScriptsProperties;
	developmentDomain?: string;
	productionDomain?: string;
	addonName?: string;
	siteName?: string;
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * REST API endpoints by app type
 */
export interface ApiEndpoints {
	addon: string;
	import: string;
}

/**
 * API response from app signing
 */
export interface SigningResponse {
	success: boolean;
	signedFilePath?: string;
	error?: string;
}

/**
 * API response from deployment
 */
export interface DeployResponse {
	success: boolean;
	executableId?: string;
	message?: string;
	error?: string;
	// Set when the failure looks like a stale/rejected session or token, so the
	// caller can drop the cached credential and re-authenticate.
	authExpired?: boolean;
}

/**
 * API response from addon creation
 */
export interface CreateAddonResponse {
	success: boolean;
	addonId?: string;
	error?: string;
	authExpired?: boolean;
}

/**
 * API response from activation
 */
export interface ActivationResponse {
	success: boolean;
	error?: string;
	authExpired?: boolean;
}

// =============================================================================
// BUILD TYPES
// =============================================================================

/**
 * Build mode
 */
export type BuildMode = 'development' | 'production';

/**
 * Build options for webpack
 */
export interface BuildOptions {
	mode: BuildMode;
	watch?: boolean;
	cssPrefix?: string;
	restApp?: boolean;
}

/**
 * Build result
 */
export interface BuildResult {
	success: boolean;
	outputPath?: string;
	errors?: string[];
	warnings?: string[];
	stats?: {
		time: number;
		hash: string;
		assets: string[];
	};
}

/**
 * Watch callback for webpack watch mode
 */
export type WatchCallback = (result: BuildResult) => void;

// =============================================================================
// COMMAND TYPES
// =============================================================================

/**
 * Command execution context
 */
export interface CommandContext {
	project: ProjectInfo;
	flags: Record<string, unknown>;
	args: string[];
}

/**
 * Command definition
 */
export interface Command {
	name: string;
	description: string;
	requiresProject: boolean;
	flags?: Record<string, CommandFlag>;
	execute: (context: CommandContext) => Promise<void>;
}

/**
 * Command flag definition
 */
export interface CommandFlag {
	type: 'string' | 'boolean';
	description: string;
	alias?: string;
	default?: unknown;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Process output types
 */
export interface ProcessOutput {
	type: 'stdout' | 'stderr';
	data: string;
}

/**
 * Process execution result
 */
export interface ProcessResult {
	exitCode: number;
	output: ProcessOutput[];
}

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	headers?: Record<string, string>;
	body?: unknown;
	auth?: {
		username: string;
		password: string;
	};
}

/**
 * Generic result type for operations that can fail
 */
export type Result<T, E = Error> =
	| {success: true; data: T}
	| {success: false; error: E};
