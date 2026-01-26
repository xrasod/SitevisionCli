import fs from 'fs';
import path from 'path';

export interface SitevisionManifest {
	id: string;
	name: string;
	version: string;
	type: 'WebApp' | 'Widget' | 'RESTApp';
	bundled?: boolean;
}

export interface DevProperties {
	domain: string;
	siteName: string;
	addonName: string;
	username: string;
	password: string;
	useHTTPForDevDeploy?: boolean;
	// Signing properties for developer.sitevision.se (stored on disk)
	signingUsername?: string;
	certificateName?: string;
}

export interface ProjectInfo {
	root: string;
	manifest: SitevisionManifest;
	hasDevProperties: boolean;
	hasSigningProperties: boolean;
	devProperties?: DevProperties;
	packageJson: any;
	hasSitevisionScripts: boolean;
	hasNodeModules: boolean;
}

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
				manifest = JSON.parse(fs.readFileSync(p, 'utf-8'));
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

		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

		// Check if sitevision-scripts is installed
		const hasSitevisionScripts =
			packageJson.dependencies?.['@sitevision/scripts'] ||
			packageJson.devDependencies?.['@sitevision/scripts'] ||
			false;

		// Check for node_modules
		const nodeModulesPath = path.join(cwd, 'node_modules');
		const hasNodeModules = fs.existsSync(nodeModulesPath);

		// Check for dev properties (try both underscore and dash variants)
		const devPropertiesPaths = [
			path.join(cwd, '.dev_properties.json'),
			path.join(cwd, '.dev-properties.json'),
		];

		let devProperties: DevProperties | undefined;
		let hasDevProperties = false;

		for (const p of devPropertiesPaths) {
			if (fs.existsSync(p)) {
				hasDevProperties = true;
				try {
					devProperties = JSON.parse(fs.readFileSync(p, 'utf-8'));
				} catch {
					// Invalid dev properties file
				}
				break;
			}
		}

		// Check if signing properties are configured (only username is stored, password is entered at runtime)
		const hasSigningProperties = Boolean(devProperties?.signingUsername);

		return {
			root: cwd,
			manifest,
			hasDevProperties,
			hasSigningProperties,
			devProperties,
			packageJson,
			hasSitevisionScripts,
			hasNodeModules,
		};
	} catch (error) {
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
export function getAppType(manifest: SitevisionManifest): 'web' | 'widget' | 'rest' {
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
