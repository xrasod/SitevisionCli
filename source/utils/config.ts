import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {type Language} from './i18n.js';
import {parseJsonc} from './jsonc.js';
import {debug} from './debug.js';

/**
 * Global (machine-wide) CLI configuration, stored outside any project so the
 * "first run" experience is shown only once per user, not once per project.
 */
interface CliConfig {
	firstRunCompleted?: boolean;
	lastSeenVersion?: string;
	language?: Language;
	introAnimation?: boolean;
	updateCheck?: boolean;
	warnings?: {addonNameDrift?: boolean};
	signingUsername?: string;
	certificateName?: string;
}

/** User-facing preferences editable from the shell's Settings screen. */
export interface Settings {
	language: Language;
	introAnimation: boolean;
	updateCheck: boolean;
	addonNameDriftWarning: boolean;
}

/** The signing identity used by projects that do not set their own. */
export interface GlobalSigning {
	signingUsername?: string;
	certificateName?: string;
}

function configDir(): string {
	const base =
		process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
	return path.join(base, 'sitevision-cli');
}

function configFile(): string {
	return path.join(configDir(), 'config.json');
}

function readConfig(): CliConfig {
	try {
		return parseJsonc<CliConfig>(fs.readFileSync(configFile(), 'utf8'));
	} catch {
		return {};
	}
}

/** Set when the file exists but does not parse; it is then left untouched. */
export function configProblem(): string | undefined {
	let text: string;
	try {
		text = fs.readFileSync(configFile(), 'utf8');
	} catch {
		return undefined;
	}

	try {
		parseJsonc(text);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

function writeConfig(config: CliConfig): void {
	// A hand-edited file with a typo must not be replaced by defaults.
	if (configProblem()) return;
	try {
		fs.mkdirSync(configDir(), {recursive: true});
		fs.writeFileSync(configFile(), JSON.stringify(config, null, 2));
	} catch {
		// Best-effort: if we can't persist the flag the welcome screen simply
		// shows again next time, which is harmless.
	}
}

export function getSettings(): Settings {
	const config = readConfig();
	return {
		language: config.language ?? 'en',
		introAnimation: config.introAnimation ?? true,
		updateCheck: config.updateCheck ?? true,
		addonNameDriftWarning: config.warnings?.addonNameDrift ?? true,
	};
}

export function setSettings(patch: Partial<Settings>): void {
	debug('config', `settings ${JSON.stringify(patch)}`);
	const {addonNameDriftWarning, ...rest} = patch;
	const config = {...readConfig(), ...rest};
	if (addonNameDriftWarning !== undefined) {
		config.warnings = {
			...config.warnings,
			addonNameDrift: addonNameDriftWarning,
		};
	}

	writeConfig(config);
}

export function getGlobalSigning(): GlobalSigning {
	const {signingUsername, certificateName} = readConfig();
	return {
		...(signingUsername && {signingUsername}),
		...(certificateName && {certificateName}),
	};
}

export function setGlobalSigning(signing: GlobalSigning): void {
	debug('config', `global signing ${Object.keys(signing).join(', ')}`);
	writeConfig({...readConfig(), ...signing});
}

/** Path of the config file, for display. */
export function settingsFile(): string {
	return configFile();
}

/**
 * True until the user has completed the first-run welcome at least once.
 */
export function isFirstRun(): boolean {
	return !configProblem() && !readConfig().firstRunCompleted;
}

/**
 * Persist that the first-run welcome has been seen.
 */
export function markFirstRunComplete(): void {
	const config = readConfig();
	config.firstRunCompleted = true;
	writeConfig(config);
}

/**
 * The CLI version that was last run, or undefined if never recorded (a fresh
 * install, or a user who completed first-run before version tracking existed).
 */
export function getLastSeenVersion(): string | undefined {
	return readConfig().lastSeenVersion;
}

/**
 * Persist the CLI version that just ran, so the next run can detect an upgrade.
 */
export function setLastSeenVersion(version: string): void {
	const config = readConfig();
	if (config.lastSeenVersion === version) return;
	config.lastSeenVersion = version;
	writeConfig(config);
}
