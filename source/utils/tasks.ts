import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {useSyncExternalStore} from 'react';
import type {
	ProjectInfo,
	SigningCredentials,
	DeployConfig,
	BuildResult,
} from '../types/index.js';
import {WebpackRunner, hasLocalWebpackConfig} from './webpack-runner.js';
import {
	hasSitevisionScripts,
	runSitevisionScriptsBuild,
	getDelegatedZipPath,
	checkSitevisionScriptsCompatibility,
} from './sitevision-scripts-runner.js';
import {
	copyStaticToBuild,
	copySrcToBuild,
	cleanBuild,
	createBuildZip,
	zipExists,
} from './zip.js';
import {
	isBundledApp,
	getAppType,
	getFullAppId,
	getZipPath,
	getSignedZipPath,
	getDeployZipPath,
	localizedText,
} from './project-detection.js';
import {
	signApp,
	deployApp,
	deployProduction,
	activateApp,
	createAddon,
	listAddons,
	classifyAddon,
} from './sitevision-api.js';
import {ProcessRunner} from './process-runner.js';

export type TaskKind =
	| 'dev'
	| 'watch'
	| 'build'
	| 'sign'
	| 'deploy'
	| 'activate'
	| 'install';
export type TaskStatus = 'running' | 'success' | 'error' | 'stopped';
export type LogLevel = 'info' | 'ok' | 'warn' | 'error';

export interface LogLine {
	time: number;
	tag: string;
	level: LogLevel;
	text: string;
}

export interface Task {
	id: number;
	kind: TaskKind;
	appRoot: string;
	appName: string;
	label: string;
	status: TaskStatus;
	phase: string;
	startedAt: number;
	endedAt?: number;
	lines: LogLine[];
	error?: string;
	stop: () => void;
}

const MAX_LINES = 2000;
const emitter = new EventEmitter();
let tasks: Task[] = [];
let nextId = 1;

function notify() {
	tasks = [...tasks];
	emitter.emit('change');
}

export function getTasks(): Task[] {
	return tasks;
}

export function useTasks(): Task[] {
	return useSyncExternalStore(
		callback => {
			emitter.on('change', callback);
			return () => emitter.off('change', callback);
		},
		() => tasks,
	);
}

export function runningTasks(appRoot?: string): Task[] {
	return tasks.filter(
		t => t.status === 'running' && (!appRoot || t.appRoot === appRoot),
	);
}

export function clearFinished(): void {
	tasks = tasks.filter(t => t.status === 'running');
	notify();
}

type Log = (tag: string, text: string, level?: LogLevel) => void;

function createTask(
	kind: TaskKind,
	project: ProjectInfo,
	label: string,
	stop: () => void = () => {},
): {
	task: Task;
	log: Log;
	finish: (status: TaskStatus, error?: string) => void;
} {
	const task: Task = {
		id: nextId++,
		kind,
		appRoot: project.root,
		appName: localizedText(project.manifest.name) || project.manifest.id,
		label,
		status: 'running',
		phase: 'starting',
		startedAt: Date.now(),
		lines: [],
		stop,
	};
	tasks.push(task);
	notify();

	const log: Log = (tag, text, level = 'info') => {
		for (const line of text.trimEnd().split('\n')) {
			task.lines.push({time: Date.now(), tag, level, text: line});
		}

		if (task.lines.length > MAX_LINES) {
			task.lines.splice(0, task.lines.length - MAX_LINES);
		}

		notify();
	};

	const finish = (status: TaskStatus, error?: string) => {
		if (task.status !== 'running') return;
		task.status = status;
		task.error = error;
		task.endedAt = Date.now();
		task.phase = status;
		if (error) log('svc', error, 'error');
		notify();
	};

	return {task, log, finish};
}

function setPhase(task: Task, phase: string) {
	task.phase = phase;
	notify();
}

const errorText = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

// ---------------------------------------------------------------------------
// One-shot steps shared by the tasks below.
// ---------------------------------------------------------------------------

/** Build the app to dist/<appId>.zip. Returns the zip path or throws. */
async function buildOnce(
	project: ProjectInfo,
	task: Task,
	log: Log,
	mode: 'development' | 'production',
	signal?: AbortSignal,
): Promise<string> {
	const {root, manifest} = project;
	cleanBuild(root);

	if (isBundledApp(manifest) && !hasLocalWebpackConfig(root)) {
		if (!hasSitevisionScripts(root)) {
			throw new Error(
				'No webpack.config.js found and @sitevision/sitevision-scripts is not installed. Run npm install.',
			);
		}

		const {warning} = checkSitevisionScriptsCompatibility(root);
		if (warning) log('bld', warning, 'warn');
		setPhase(task, 'building');
		log('bld', 'building via sitevision-scripts');
		const result = await runSitevisionScriptsBuild(
			root,
			chunk => log('bld', chunk),
			signal,
		);
		if (!result.success) throw new Error(result.error ?? 'Build failed');
		const zipPath = getDelegatedZipPath(root, manifest.id);
		if (!zipExists(zipPath)) {
			throw new Error(
				`Build reported success but no zip was found at ${zipPath}.`,
			);
		}

		return zipPath;
	}

	if (isBundledApp(manifest)) {
		if (!WebpackRunner.isWebpackAvailable(root)) {
			throw new Error('webpack not found. Run npm install.');
		}

		setPhase(task, 'building');
		log('bld', 'compiling with webpack');
		const runner = new WebpackRunner(root, {
			mode,
			cssPrefix: manifest.id,
			restApp:
				getAppType(manifest) !== 'web' && getAppType(manifest) !== 'widget',
		});
		const result = await runner.run();
		await runner.close();
		reportBuild(result, log);
		if (!result.success)
			throw new Error(result.errors?.join('\n') || 'Build failed');
		copyStaticToBuild(root);
	} else {
		setPhase(task, 'copying');
		log('bld', 'copying source files');
		copySrcToBuild(root);
		copyStaticToBuild(root);
	}

	setPhase(task, 'zipping');
	return createBuildZip(root, getFullAppId(manifest.id));
}

function reportBuild(result: BuildResult, log: Log) {
	for (const warning of result.warnings ?? []) log('bld', warning, 'warn');
	for (const error of result.errors ?? []) log('bld', error, 'error');
	if (result.success) {
		log(
			'bld',
			`compiled in ${result.stats?.time ?? 0}ms${result.stats?.assets?.length ? ` · ${result.stats.assets.join(', ')}` : ''}`,
			'ok',
		);
	}
}

async function signOnce(
	project: ProjectInfo,
	task: Task,
	log: Log,
	zipPath: string,
	credentials: SigningCredentials,
): Promise<string> {
	setPhase(task, 'signing');
	log(
		'sgn',
		`signing via developer.sitevision.se${credentials.certificateName ? ` · cert ${credentials.certificateName}` : ''}`,
	);
	const signedPath = getSignedZipPath(project.root, project.manifest);
	const result = await signApp(zipPath, credentials, signedPath);
	if (!result.success) throw new Error(result.error ?? 'Signing failed');
	log('sgn', `signed ${path.basename(signedPath)}`, 'ok');
	return signedPath;
}

export interface DeployOptions {
	force?: boolean;
	production?: boolean;
	activate?: boolean;
	// Asked when the addon is confirmed missing; true creates it and redeploys.
	onAddonMissing?: (addonName: string) => Promise<boolean>;
}

async function deployOnce(
	project: ProjectInfo,
	task: Task,
	log: Log,
	zipPath: string,
	config: DeployConfig,
	options: DeployOptions,
): Promise<string | undefined> {
	setPhase(task, 'deploying');
	const appType = getAppType(project.manifest);
	log(
		'dep',
		`POST multipart → ${options.production ? 'production' : 'dev'} import · ${config.addonName} · ${path.basename(zipPath)}`,
	);
	const upload = async () =>
		options.production
			? deployProduction(
					zipPath,
					{...config, activate: options.activate},
					appType,
				)
			: deployApp(zipPath, config, appType, options.force);
	let result = await upload();
	if (!result.success && result.contextNodeMissing) {
		const addon = classifyAddon(await listAddons(config), config.addonName);
		if (addon === 'unknown') {
			throw new Error(
				`${result.error}\nCould not list the site's addons either, so the session may have expired. Press l to log in again.`,
			);
		}

		if (addon === 'missing' && options.onAddonMissing) {
			log('dep', `addon ${config.addonName} does not exist`, 'warn');
			if (await options.onAddonMissing(config.addonName)) {
				const created = await createAddon(config, appType);
				if (!created.success) {
					throw new Error(created.error ?? 'Create addon failed');
				}

				log('dep', `created addon ${config.addonName}`, 'ok');
				result = await upload();
			}
		}
	}

	if (!result.success) throw new Error(result.error ?? 'Deployment failed');
	log(
		'dep',
		`${result.message ?? 'deployed'}${result.executableId ? ` · exec ${result.executableId}` : ''}`,
		'ok',
	);
	return result.executableId;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function startBuild(project: ProjectInfo): Task {
	const controller = new AbortController();
	const {task, log, finish} = createTask('build', project, 'build', () => {
		controller.abort();
		finish('stopped');
	});
	void (async () => {
		try {
			const zip = await buildOnce(
				project,
				task,
				log,
				'production',
				controller.signal,
			);
			log('bld', `created ${zip}`, 'ok');
			finish('success');
		} catch (error) {
			finish('error', errorText(error));
		}
	})();
	return task;
}

export function startSign(
	project: ProjectInfo,
	credentials: SigningCredentials,
): Task {
	const {task, log, finish} = createTask('sign', project, 'sign');
	void (async () => {
		try {
			const zipPath = getZipPath(project.root, project.manifest);
			if (!zipExists(zipPath)) {
				throw new Error(`Zip file not found: ${zipPath}. Run build first.`);
			}

			await signOnce(project, task, log, zipPath, credentials);
			finish('success');
		} catch (error) {
			finish('error', errorText(error));
		}
	})();
	return task;
}

export function startDeploy(
	project: ProjectInfo,
	config: DeployConfig,
	options: DeployOptions,
): Task {
	const {task, log, finish} = createTask(
		'deploy',
		project,
		options.production ? 'deploy production' : 'deploy',
	);
	void (async () => {
		try {
			const zipPath = options.production
				? getSignedZipPath(project.root, project.manifest)
				: getDeployZipPath(project.root, project.manifest);
			if (!zipExists(zipPath)) {
				throw new Error(
					`${options.production ? 'Signed zip' : 'Zip'} not found: ${zipPath}. Run ${options.production ? 'sign' : 'build'} first.`,
				);
			}

			await deployOnce(project, task, log, zipPath, config, options);
			finish('success');
		} catch (error) {
			finish('error', errorText(error));
		}
	})();
	return task;
}

export function startActivate(
	project: ProjectInfo,
	config: DeployConfig,
	executableId: string,
	versionLabel: string,
): Task {
	const {task, log, finish} = createTask(
		'activate',
		project,
		`activate ${versionLabel}`,
	);
	void (async () => {
		try {
			setPhase(task, 'activating');
			log('act', `PUT activateCustomModuleExecutable · ${versionLabel}`);
			const result = await activateApp(
				executableId,
				config,
				getAppType(project.manifest),
			);
			if (!result.success) throw new Error(result.error ?? 'Activation failed');
			log('act', `${versionLabel} is now active`, 'ok');
			finish('success');
		} catch (error) {
			finish('error', errorText(error));
		}
	})();
	return task;
}

export function startInstall(project: ProjectInfo): Task {
	const runner = new ProcessRunner('npm', ['install'], project.root);
	const {task, log, finish} = createTask(
		'install',
		project,
		'npm install',
		() => {
			runner.kill();
			finish('stopped');
		},
	);
	setPhase(task, 'installing');
	runner.on('output', (output: {type: string; data: string}) =>
		log('npm', output.data, output.type === 'stderr' ? 'warn' : 'info'),
	);
	runner
		.run()
		.then(result =>
			finish(
				result.exitCode === 0 ? 'success' : 'error',
				result.exitCode === 0
					? undefined
					: `npm install exited with ${result.exitCode}`,
			),
		)
		.catch(error => finish('error', errorText(error)));
	return task;
}

export interface DevOptions {
	// false = watch: build (and sign) on change but never deploy.
	deploy: boolean;
	signingCredentials?: SigningCredentials;
	deployConfig?: DeployConfig;
	onAddonMissing?: DeployOptions['onAddonMissing'];
}

const WATCH_TARGETS = [
	'src',
	'static',
	'i18n',
	'resource',
	'config',
	'manifest.json',
];

/**
 * Dev / watch loop: build on every source change, then optionally sign and
 * deploy. Runs until `task.stop()`; the task stays in the registry meanwhile.
 */
export function startDev(project: ProjectInfo, options: DevOptions): Task {
	const {root, manifest} = project;
	const watchers: fs.FSWatcher[] = [];
	let webpack: WebpackRunner | null = null;
	let debounce: NodeJS.Timeout | undefined;
	let building = false;
	let pending = false;

	const controller = new AbortController();

	const stop = () => {
		controller.abort();
		clearTimeout(debounce);
		for (const watcher of watchers) watcher.close();
		void webpack?.close().catch(() => {});
		finish('stopped');
	};

	const {task, log, finish} = createTask(
		options.deploy ? 'dev' : 'watch',
		project,
		options.deploy ? 'dev' : 'watch',
		stop,
	);

	const afterBuild = async (zipPath: string) => {
		// Stopped mid-build: never sign or deploy what is left.
		if (controller.signal.aborted) return;
		let deployZip = zipPath;
		if (options.signingCredentials) {
			deployZip = await signOnce(
				project,
				task,
				log,
				zipPath,
				options.signingCredentials,
			);
		}

		if (options.deploy && options.deployConfig) {
			await deployOnce(project, task, log, deployZip, options.deployConfig, {
				force: true,
				onAddonMissing: options.onAddonMissing,
			});
		}

		setPhase(task, 'watching');
		log('svc', 'watching for changes');
	};

	const fail = (error: unknown) => {
		if (controller.signal.aborted) return;
		log('svc', errorText(error), 'error');
		setPhase(task, 'error');
	};

	const rebuild = async () => {
		if (building) {
			pending = true;
			return;
		}

		building = true;
		try {
			do {
				pending = false;
				try {
					// eslint-disable-next-line no-await-in-loop
					const zip = await buildOnce(
						project,
						task,
						log,
						'development',
						controller.signal,
					);
					// eslint-disable-next-line no-await-in-loop
					await afterBuild(zip);
				} catch (error) {
					fail(error);
				}
			} while (pending && !controller.signal.aborted);
		} finally {
			building = false;
		}
	};

	const onChange = (name: string, file: string | null) => {
		log('fs', `changed ${file ?? name}`);
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			void rebuild();
		}, 300);
	};

	const watchFiles = () => {
		for (const name of WATCH_TARGETS) {
			const target = path.join(root, name);
			if (!fs.existsSync(target)) continue;
			const isDir = fs.statSync(target).isDirectory();
			watchers.push(
				fs.watch(target, {recursive: isDir}, (_event, file) => {
					onChange(name, file);
				}),
			);
		}

		log('svc', `watching ${WATCH_TARGETS.join(', ')}`);
	};

	void (async () => {
		try {
			cleanBuild(root);
			if (isBundledApp(manifest) && hasLocalWebpackConfig(root)) {
				// Project ships its own webpack config: incremental in-process watch.
				if (!WebpackRunner.isWebpackAvailable(root)) {
					throw new Error('webpack not found. Run npm install.');
				}

				setPhase(task, 'building');
				webpack = new WebpackRunner(root, {
					mode: 'development',
					watch: true,
					cssPrefix: manifest.id,
					restApp:
						getAppType(manifest) !== 'web' && getAppType(manifest) !== 'widget',
				});
				await webpack.watch(result => {
					void (async () => {
						reportBuild(result, log);
						if (!result.success) {
							setPhase(task, 'error');
							return;
						}

						try {
							copyStaticToBuild(root);
							await afterBuild(
								await createBuildZip(root, getFullAppId(manifest.id)),
							);
						} catch (error) {
							fail(error);
						}
					})();
				});
			} else {
				watchFiles();
				await rebuild();
			}
		} catch (error) {
			finish('error', errorText(error));
		}
	})();

	return task;
}
