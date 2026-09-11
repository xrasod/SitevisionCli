import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {type Language} from './i18n.js';

/**
 * Global (machine-wide) CLI configuration, stored outside any project so the
 * "first run" experience is shown only once per user, not once per project.
 */
interface CliConfig {
	firstRunCompleted?: boolean;
	lastSeenVersion?: string;
	language?: Language;
	introAnimation?: boolean;
}

/** User-facing preferences editable from the shell's Settings screen. */
export interface Settings {
	language: Language;
	introAnimation: boolean;
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
		return JSON.parse(fs.readFileSync(configFile(), 'utf8')) as CliConfig;
	} catch {
		return {};
	}
}

function writeConfig(config: CliConfig): void {
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
	};
}

export function setSettings(patch: Partial<Settings>): void {
	writeConfig({...readConfig(), ...patch});
}

/** Path of the config file, for display. */
export function settingsFile(): string {
	return configFile();
}

/**
 * True until the user has completed the first-run welcome at least once.
 */
export function isFirstRun(): boolean {
	return !readConfig().firstRunCompleted;
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
	config.lastSeenVersion = version;
	writeConfig(config);
}
