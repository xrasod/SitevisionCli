import fs from 'node:fs';
import path from 'node:path';
import {
	detectProject,
	readWorkspaceDevProperties,
	type ProjectInfo,
} from './project-detection.js';
import type {DeployConfig, DevProperties} from '../types/index.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const MAX_DEPTH = 3;

/**
 * Find every Sitevision app below `root` (e.g. root/webapps/x, root/restapps/y).
 * Depth-limited walk that skips dependency and output folders.
 */
export function discoverApps(
	root: string,
	// Filled with why each app that was left out is broken.
	skipped: string[] = [],
): ProjectInfo[] {
	const found: ProjectInfo[] = [];
	const walk = (dir: string, depth: number) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, {withFileTypes: true});
		} catch {
			return;
		}

		for (const entry of entries) {
			if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
			if (entry.name.startsWith('.')) continue;
			const full = path.join(dir, entry.name);
			let project: ProjectInfo | null = null;
			try {
				project = detectProject(full);
			} catch (error) {
				// A broken app is left out, said out loud, and not searched for more.
				skipped.push(error instanceof Error ? error.message : String(error));
				continue;
			}

			if (project) {
				found.push(project);
			} else if (depth < MAX_DEPTH) {
				walk(full, depth + 1);
			}
		}
	};

	walk(root, 1);
	// Group first, then path: a deeper folder (webapps/nested) must not split
	// its parent's run of apps, or the same group heading renders twice.
	return found.toSorted(
		(a, b) =>
			path.dirname(a.root).localeCompare(path.dirname(b.root)) ||
			a.root.localeCompare(b.root),
	);
}

/** Group label for an app: its parent folder relative to the workspace root. */
export function appGroup(root: string, appRoot: string): string {
	const relative = path.relative(root, path.dirname(appRoot));
	return relative === '' ? '.' : relative;
}

/** Missing something nothing can deploy without. */
export function configIncomplete(dev?: Partial<DevProperties>): boolean {
	if (!dev?.domain || !dev.siteName) return true;
	return (dev.authMethod ?? 'basic') === 'basic' && !dev.username;
}

/**
 * What a deploy is sent with, or which required value is missing. The one place
 * dev properties become a DeployConfig, so nothing ever posts to "undefined".
 */
export function toDeployConfig(
	dev?: Partial<DevProperties>,
	// False for what talks to the site rather than an addon: listing its addons
	// (how an empty addon name gets picked) and logging in.
	{addon = true}: {addon?: boolean} = {},
): {config: DeployConfig} | {error: string} {
	const required = {
		domain: dev?.domain,
		siteName: dev?.siteName,
		...(addon && {addonName: dev?.addonName}),
		// A token or cookie login has no use for a username.
		...((dev?.authMethod ?? 'basic') === 'basic' && {username: dev?.username}),
	};
	const missing = Object.entries(required).find(([, value]) => !value)?.[0];
	if (!dev || missing) {
		return {
			error: `Deploy config is missing "${missing ?? 'domain'}". Run svc and press e to set it, or add it to .dev_properties.json.`,
		};
	}

	return {
		config: {
			domain: dev.domain!,
			siteName: dev.siteName!,
			addonName: dev.addonName ?? '',
			username: dev.username ?? '',
			password: dev.password,
			accessToken: dev.accessToken,
			sessionCookie: dev.sessionCookie,
			useHTTP: dev.useHTTPForDevDeploy,
		},
	};
}

/**
 * True when a workspace has apps but nothing usable to deploy with: neither the
 * shared root config nor the apps themselves carry domain/site/username. The
 * shell then opens on Workspace settings instead of the first app.
 */
export function needsOnboarding(root: string, apps: ProjectInfo[]): boolean {
	return (
		apps.length > 0 &&
		configIncomplete(readWorkspaceDevProperties(root)) &&
		apps.some(app => configIncomplete(app.devProperties))
	);
}
