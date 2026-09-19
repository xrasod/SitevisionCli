/**
 * New apps are scaffolded by Sitevision's own tool. svc runs it as a task and
 * answers its questions through a socket (see source/scaffold); when the tool no
 * longer asks through inquirer the run is reported as unmanaged, and the caller
 * hands it the real terminal instead.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {stripVTControlCharacters} from 'node:util';
import type {DevProperties} from '../types/index.js';
import {t} from './i18n.js';
import {ProcessRunner} from './process-runner.js';
import {createTask, setPhase, type Task} from './tasks.js';
import {
	detectProject,
	findDevPropertiesPath,
	migrateLegacyPassword,
	readInheritedDevProperties,
	readManifest,
	updatePackageJson,
	writeManifestField,
} from './project-detection.js';

export const CREATE_COMMAND = [
	'npx',
	'--yes',
	'@sitevision/create-sitevision-app',
];

export interface PromptQuestion {
	name: string;
	type: string;
	message: string;
	choices: string[];
	default?: unknown;
	error?: string;
}

// `value` is text, a boolean, a choice index or a list of them; `skip` leaves
// the question unanswered.
export type PromptReply = {value: unknown} | {skip: true};
export type Ask = (question: PromptQuestion) => Promise<PromptReply | null>;

/** A folder name that is also a usable package name and manifest id. */
export const validAppName = (name: string) => /^[\da-z][\w\-.]*$/i.test(name);

/** The closest conventional name: "Min nya app!" and "MinNyaApp" become "min-nya-app". */
export function suggestAppName(name: string): string {
	return name
		.trim()
		.normalize('NFKD')
		.replaceAll(/[\u0300-\u036F]/g, '')
		.replaceAll(/(?<=[\da-z])(?=[A-Z])/g, '-')
		.toLowerCase()
		.replaceAll(/\s+/g, '-')
		.replaceAll(/[^\w\-.]/g, '')
		.replace(/^[^\da-z]+/i, '');
}

/** What is wrong with a typed app name, said so the fix is obvious. */
export function appNameProblem(typed: string): string | undefined {
	const name = typed.trim();
	if (!name) return t('Type a name for the app, for example my-new-app.');
	if (validAppName(name)) return undefined;
	const suggestion = suggestAppName(name);
	const tryThis = suggestion
		? ' ' + t('Try "{suggestion}".', {suggestion})
		: '';
	if (/\s/.test(name) && validAppName(name.replaceAll(/\s+/g, '-')))
		return t("An app name can't have spaces.") + tryThis;
	const bad = [...new Set(name.replaceAll(/[\s\w\-.]/g, ''))].join(' ');
	if (bad) {
		return (
			t(
				"An app name can't contain {chars}: it becomes the folder, the package name and the app id.",
				{
					chars: bad,
				},
			) + tryThis
		);
	}

	return t('Start the name with a letter or a digit.') + tryThis;
}

/** A valid name that could be better; the user may keep it. */
export function appNameAdvice(typed: string): string | undefined {
	const name = typed.trim();
	if (!validAppName(name) || name === name.toLowerCase()) return undefined;
	return t(
		'Lowercase is safer: npm expects it, and "{name}" and "{lower}" are one folder on macOS and Windows but two on Linux. Try "{suggestion}", or press Enter again to keep "{name}".',
		{name, lower: name.toLowerCase(), suggestion: suggestAppName(name)},
	);
}

export const isEmptyOrMissing = (dir: string) =>
	!fs.existsSync(dir) || fs.readdirSync(dir).length === 0;

/** Listen for the stub's questions. `null` from `ask` means the user cancelled. */
export async function servePrompts(
	ask: Ask,
	onCancel: () => void,
): Promise<{socketPath: string; connected: () => boolean; close: () => void}> {
	const id = `svc-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
	const socketPath =
		process.platform === 'win32'
			? `\\\\.\\pipe\\${id}`
			: path.join(os.tmpdir(), `${id}.sock`);
	let connected = false;
	const server = net.createServer(socket => {
		connected = true;
		socket.on('error', () => {});
		void (async () => {
			for await (const line of readline.createInterface({input: socket})) {
				const reply = await ask(JSON.parse(line) as PromptQuestion);
				if (!reply) {
					socket.destroy();
					onCancel();
					return;
				}

				socket.write(JSON.stringify(reply) + '\n');
			}
		})();
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(socketPath, resolve);
	});
	return {
		socketPath,
		connected: () => connected,
		close: () => server.close(),
	};
}

export type CreateOutcome = 'created' | 'unmanaged' | 'failed' | 'stopped';

/**
 * Run the scaffolder for `name` inside `parentDir`. "unmanaged" means it never
 * asked svc anything and left no app: the prompt bridge did not take.
 */
export function startCreateApp(options: {
	name: string;
	parentDir: string;
	ask: Ask;
	command?: string[];
}): {task: Task; done: Promise<CreateOutcome>} {
	const {name, parentDir, ask, command = CREATE_COMMAND} = options;
	const appDir = path.join(parentDir, name);
	let runner: ProcessRunner | undefined;
	let stopped = false;
	const {task, log, finish} = createTask(
		'create',
		{root: appDir, manifest: {name, id: name}},
		'create-sitevision-app',
		() => {
			stopped = true;
			runner?.kill();
			finish('stopped');
		},
	);

	const done = (async (): Promise<CreateOutcome> => {
		const prompts = await servePrompts(ask, () => task.stop());
		try {
			// .js from dist, .ts when svc itself runs from source.
			const register = new URL(
				`../scaffold/register${path.extname(import.meta.url)}`,
				import.meta.url,
			).href;
			runner = new ProcessRunner(
				command[0]!,
				[...command.slice(1), name],
				parentDir,
				{
					...process.env,
					NODE_OPTIONS:
						`${process.env['NODE_OPTIONS'] ?? ''} --import=${register}`.trim(),
					SVC_PROMPT_SOCKET: prompts.socketPath,
				},
			);
			runner.on('output', (output: {type: string; data: string}) => {
				// The tool clears the screen between steps; that is noise in a log.
				const text = stripVTControlCharacters(output.data);
				if (text.trim())
					log('create', text, output.type === 'stderr' ? 'warn' : 'info');
			});
			setPhase(task, 'scaffolding');
			await runner.run();
			if (stopped) return 'stopped';
			// The exit code is 0 even when the prompts crash, so look at the result.
			if (readManifest(appDir)) {
				finish('success');
				return 'created';
			}

			if (prompts.connected()) {
				finish('error', 'The scaffolder finished without creating an app');
				return 'failed';
			}

			finish('stopped');
			return 'unmanaged';
		} catch (error) {
			finish('error', error instanceof Error ? error.message : String(error));
			return 'failed';
		} finally {
			prompts.close();
		}
	})();

	return {task, done};
}

/** Run the scaffolder on the real terminal; resolves when it exits. */
export async function createAppInTerminal(
	name: string,
	parentDir: string,
): Promise<boolean> {
	await new Promise<void>(resolve => {
		const child = spawn(
			CREATE_COMMAND[0]!,
			[...CREATE_COMMAND.slice(1), name],
			{
				cwd: parentDir,
				stdio: 'inherit',
				shell: true,
			},
		);
		child.on('close', () => resolve());
		child.on('error', () => resolve());
	});
	return Boolean(readManifest(path.join(parentDir, name)));
}

/**
 * Replace the template's placeholders with what is known, and fold the config
 * the tool wrote into svc's layout: no plaintext password, and nothing in the
 * app's .dev_properties.json that the workspace already provides.
 */
export function seedNewApp(appDir: string, workspaceRoot?: string): void {
	const found = readManifest(appDir);
	if (!found) return;
	const {manifest, manifestPath} = found;
	const seed = (key: 'name' | 'description', value: string) => {
		const localized = typeof manifest[key] === 'object';
		writeManifestField(manifestPath, key, value, localized ? 'en' : undefined);
	};

	seed('name', path.basename(appDir));
	if (workspaceRoot) {
		let shared: Record<string, unknown> = {};
		try {
			shared = JSON.parse(
				fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
			) as Record<string, unknown>;
		} catch {}

		const author =
			typeof shared['author'] === 'object'
				? (shared['author'] as {name?: unknown} | null)?.name
				: shared['author'];
		if (typeof author === 'string' && author)
			writeManifestField(manifestPath, 'author', author);
		if (typeof shared['homepage'] === 'string' && shared['homepage'])
			writeManifestField(manifestPath, 'helpUrl', shared['homepage']);
	}

	const project = detectProject(appDir);
	if (project) migrateLegacyPassword(project);

	const file = findDevPropertiesPath(appDir);
	if (!workspaceRoot || !file) return;
	const own = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
		string,
		unknown
	>;
	const inherited = readInheritedDevProperties(appDir) as Record<
		string,
		unknown
	>;
	if (typeof own['addonName'] === 'string' && own['addonName']) {
		const addonName = own['addonName'];
		updatePackageJson(appDir, packageJson => {
			packageJson['addonName'] = addonName;
		});
	}

	const rest = Object.fromEntries(
		Object.entries(own).filter(
			([key, value]) =>
				key !== 'addonName' &&
				value !== '' &&
				value !== undefined &&
				!(key === 'useHTTPForDevDeploy' && value === false) &&
				JSON.stringify(value) !== JSON.stringify(inherited[key]),
		),
	) as Partial<DevProperties>;
	if (Object.keys(rest).length === 0) fs.rmSync(file);
	else fs.writeFileSync(file, JSON.stringify(rest, null, 2) + '\n');
}
