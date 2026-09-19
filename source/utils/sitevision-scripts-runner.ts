/**
 * Sitevision Scripts Runner
 *
 * Delegates the compile/build step to the official sitevision-scripts npm
 * package when a project has no local webpack config of its own.
 *
 * Sitevision WebApp builds are tightly coupled to the platform runtime (a
 * dual server/client multi-compiler, AMD externals for React and the sitevision
 * api packages, an embedded ES5 server engine, and a precise addon zip layout).
 * Rather than
 * reproduce that contract — which lives in proprietary babel presets and an
 * undocumented internal config — we shell out to the package's public CLI, which
 * is the canonical, maintained source of that build pipeline.
 *
 * `sitevision-scripts build` runs build + zip + cleanup and writes the archive to
 * `dist/<appId>.zip` — the exact path the CLI's own sign/deploy steps already use.
 */

import path from 'path';
import fs from 'fs';
import {killChild, spawnChild} from './process-runner.js';
import {getAppIdConfig, getFullAppId} from './project-detection.js';

/**
 * Directory of an installed package, looked up the way Node does: the project's
 * node_modules, then each parent's, since workspaces hoist to the repo root.
 */
export function findInstalledPackage(
	projectRoot: string,
	name: string,
): string | null {
	let dir = path.resolve(projectRoot);
	for (;;) {
		const candidate = path.join(dir, 'node_modules', name);
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

const PACKAGE = '@sitevision/sitevision-scripts';

/**
 * Resolve the path to the sitevision-scripts CLI entry for a project.
 * Returns null if the package is not installed.
 */
export function getSitevisionScriptsBin(projectRoot: string): string | null {
	const dir = findInstalledPackage(projectRoot, PACKAGE);
	const bin = dir && path.join(dir, 'bin', 'sitevision-scripts.js');
	return bin && fs.existsSync(bin) ? bin : null;
}

/**
 * Whether the sitevision-scripts package is available in the project.
 */
export function hasSitevisionScripts(projectRoot: string): boolean {
	return getSitevisionScriptsBin(projectRoot) !== null;
}

/**
 * Path of the zip that `sitevision-scripts build` writes.
 *
 * sitevision-scripts names it from `APP_ID_PREFIX`/`APP_ID_SUFFIX`; the build is
 * started with those set from `getAppIdConfig`, so this is the same file that
 * sign and deploy look for.
 */
export function getDelegatedZipPath(
	projectRoot: string,
	manifestId: string,
): string {
	return path.join(projectRoot, 'dist', `${getFullAppId(manifestId)}.zip`);
}

// =============================================================================
// VERSION COMPATIBILITY
// =============================================================================

/**
 * Range of the sitevision-scripts package the CLI's build delegation has been
 * validated against. The delegation depends on the package's CLI commands, its
 * `dist/<appId>.zip` output, and the app-id convention — all stable within a
 * major. A new major may change that contract, so we warn rather than assume.
 *
 * Bump these (and re-validate) when adopting a new sitevision-scripts major.
 */
export const SUPPORTED_SITEVISION_SCRIPTS_MIN = '8.0.0';
const SUPPORTED_SITEVISION_SCRIPTS_MAX_EXCLUSIVE_MAJOR = 9;

/** Human-readable supported range, e.g. ">=8.0.0 <9.0.0". */
export const SUPPORTED_SITEVISION_SCRIPTS_RANGE = `>=${SUPPORTED_SITEVISION_SCRIPTS_MIN} <${SUPPORTED_SITEVISION_SCRIPTS_MAX_EXCLUSIVE_MAJOR}.0.0`;

export type SitevisionScriptsCompatStatus =
	| 'ok'
	| 'too-old'
	| 'too-new'
	| 'not-installed'
	| 'unknown';

export interface SitevisionScriptsCompat {
	installed: string | null;
	supportedRange: string;
	status: SitevisionScriptsCompatStatus;
	/** Populated for 'too-old'/'too-new' — a ready-to-display warning. */
	warning?: string;
}

/**
 * Read the installed sitevision-scripts version from the project, or null if it
 * is not installed / unreadable.
 */
export function getSitevisionScriptsVersion(
	projectRoot: string,
): string | null {
	const packageJsonPath = path.join(
		findInstalledPackage(projectRoot, PACKAGE) ?? projectRoot,
		'package.json',
	);

	try {
		const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
			version?: string;
		};
		return parsed.version ?? null;
	} catch {
		return null;
	}
}

/**
 * Parse a semver string into [major, minor, patch], ignoring any prerelease
 * suffix. Returns null if it does not look like a version.
 */
function parseVersion(version: string): [number, number, number] | null {
	const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/.exec(version);
	if (!match?.groups) {
		return null;
	}

	return [
		Number(match.groups['major']),
		Number(match.groups['minor']),
		Number(match.groups['patch']),
	];
}

/**
 * Compare two parsed versions: negative if a < b, 0 if equal, positive if a > b.
 */
function compareVersions(
	a: [number, number, number],
	b: [number, number, number],
): number {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Check the project's installed sitevision-scripts against the supported range.
 * Use the `warning` field to surface a message when the version has drifted.
 */
export function checkSitevisionScriptsCompatibility(
	projectRoot: string,
): SitevisionScriptsCompat {
	const installed = getSitevisionScriptsVersion(projectRoot);
	const supportedRange = SUPPORTED_SITEVISION_SCRIPTS_RANGE;

	if (!installed) {
		return {
			installed: null,
			supportedRange,
			status: hasSitevisionScripts(projectRoot) ? 'unknown' : 'not-installed',
		};
	}

	const parsed = parseVersion(installed);
	if (!parsed) {
		return {installed, supportedRange, status: 'unknown'};
	}

	if (
		compareVersions(parsed, parseVersion(SUPPORTED_SITEVISION_SCRIPTS_MIN)!) < 0
	) {
		return {
			installed,
			supportedRange,
			status: 'too-old',
			warning: `@sitevision/sitevision-scripts ${installed} is older than the supported range (${supportedRange}). Update it in your project: npm install @sitevision/sitevision-scripts@latest`,
		};
	}

	if (parsed[0] >= SUPPORTED_SITEVISION_SCRIPTS_MAX_EXCLUSIVE_MAJOR) {
		return {
			installed,
			supportedRange,
			status: 'too-new',
			warning: `@sitevision/sitevision-scripts ${installed} is newer than the range this CLI was validated against (${supportedRange}). The build may still work; update sitevision-cli if you hit problems.`,
		};
	}

	return {installed, supportedRange, status: 'ok'};
}

export interface SitevisionBuildResult {
	success: boolean;
	/** Combined stdout/stderr (tail-trimmed) for error reporting. */
	output: string;
	error?: string;
}

/** Keep at most this many trailing characters of build output in memory. */
const MAX_OUTPUT_CHARS = 50_000;

/**
 * Run `sitevision-scripts build` (build + zip + cleanup) as a subprocess.
 *
 * The package's own webpack pipeline produces the deployable `dist/<appId>.zip`.
 * Invoked via the current Node binary so it works cross-platform without relying
 * on the `node_modules/.bin` shims or shell PATH resolution.
 *
 * @param projectRoot - Project root directory (used as cwd)
 * @param onOutput - Optional callback for streaming output chunks
 * @param signal - Aborting kills the build and everything it started
 */
export async function runSitevisionScriptsBuild(
	projectRoot: string,
	onOutput?: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<SitevisionBuildResult> {
	const bin = getSitevisionScriptsBin(projectRoot);

	if (!bin) {
		return {
			success: false,
			output: '',
			error:
				'@sitevision/sitevision-scripts not found in project. Run npm install.',
		};
	}

	return new Promise(resolve => {
		let output = '';

		const {prefix, suffix} = getAppIdConfig();
		const child = spawnChild(process.execPath, [bin, 'build'], {
			cwd: projectRoot,
			env: {...process.env, APP_ID_PREFIX: prefix, APP_ID_SUFFIX: suffix},
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const abort = () => {
			killChild(child);
		};

		signal?.addEventListener('abort', abort, {once: true});
		if (signal?.aborted) abort();

		const handleData = (data: Buffer) => {
			const text = data.toString();
			output += text;
			if (output.length > MAX_OUTPUT_CHARS) {
				output = output.slice(-MAX_OUTPUT_CHARS);
			}

			onOutput?.(text);
		};

		child.stdout?.on('data', handleData);
		child.stderr?.on('data', handleData);

		child.on('error', error => {
			resolve({success: false, output, error: error.message});
		});

		child.on('close', code => {
			signal?.removeEventListener('abort', abort);
			const stopped = signal?.aborted ?? false;
			resolve({
				success: code === 0 && !stopped,
				output,
				error: stopped
					? 'Build stopped.'
					: code === 0
						? undefined
						: `sitevision-scripts build exited with code ${code}`,
			});
		});
	});
}
