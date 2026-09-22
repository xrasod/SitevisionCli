import fs from 'node:fs';
import path from 'node:path';
import {stripVTControlCharacters} from 'node:util';

let logFile: string | undefined;

/** Start the debug log (one file per run) in the given directory. */
export function enableDebug(dir: string): string {
	if (logFile) return logFile;
	fs.mkdirSync(dir, {recursive: true});
	logFile = path.join(dir, 'debug.log');
	fs.writeFileSync(logFile, '');
	return logFile;
}

export const debugFile = () => logFile;

/** Append one line; a multi-line message is indented under the first line. */
export function debug(scope: string, message: string): void {
	if (!logFile) return;
	const text = message.split('\n').join('\n' + ' '.repeat(34));
	try {
		fs.appendFileSync(
			logFile,
			`${new Date().toISOString()} ${scope.padEnd(8)} ${text}\n`,
		);
	} catch {
		// NOOP: A full or read-only disk must not take the CLI down.
	}
}

/** Print a message for the user and keep a copy in the debug log. */
export function say(text: string): void {
	debug('out', stripVTControlCharacters(text).trim());
	console.log(text);
}

export const errorText = (error: unknown) =>
	error instanceof Error ? (error.stack ?? error.message) : String(error);
