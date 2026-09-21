import fs from 'node:fs';
import path from 'node:path';
import {useCallback, useEffect, useMemo, useReducer, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import Spinner from 'ink-spinner';
import type {ProjectInfo, DevProperties} from '../types/index.js';
import {
	detectProject,
	appTypeOf,
	localizedText,
	readWorkspaceDevProperties,
	readSvcConfig,
	writeSvcConfig,
	writeDevProperties,
	syncDevPropertiesToPackageJson,
} from '../utils/project-detection.js';
import {
	appGroup,
	configIncomplete,
	discoverApps,
	needsOnboarding,
} from '../utils/workspace.js';
import {
	createAppInTerminal,
	isEmptyOrMissing,
	seedNewApp,
	startCreateApp,
	appNameAdvice,
	appNameProblem,
	type Ask,
} from '../utils/create-app.js';
import {
	listAddons,
	listExecutables,
	type AddonNode,
} from '../utils/sitevision-api.js';
import {
	useTasks,
	runningTasks,
	startActivate,
	getTasks,
	scaffoldRunning,
	type Task,
} from '../utils/tasks.js';
import {PasswordInput} from '../components/PasswordInput.js';
import {AuthLoginScreen} from '../components/AuthLoginScreen.js';
import {
	TopBar,
	Navigator,
	NavigatorStrip,
	BottomBar,
	navMatches,
	navMove,
	appLabel,
	navWidth,
	NARROW_BELOW,
	ACCENT,
	type Hint,
} from './Frame.js';
import {
	TabBar,
	TABS,
	Overview,
	Versions,
	Log,
	type VersionsState,
} from './Tabs.js';
import {CommandPalette} from './CommandPalette.js';
import {ConfigForm, type ConfigTarget} from './ConfigForm.js';
import {AddonPicker} from './AddonPicker.js';
import {SettingsScreen} from './Settings.js';
import {HelpPanel, type Where} from './Help.js';
import {Popover} from './Popover.js';
import {ChangelogPanel} from './Changelog.js';
import {
	baseEnvironment,
	environmentColor,
	environmentNames,
	environmentProject,
	isProductionEnvironment,
	resolveEnvironment,
} from '../utils/environments.js';
import {t} from '../utils/i18n.js';
import {onKeychainSaveFailed} from '../utils/keychain.js';
import {
	actionForKey,
	actions,
	authState,
	resolveDeployConfig,
	type Action,
	type ActionContext,
	type Credential,
	type Tab,
} from './actions.js';

export type Overlay =
	| {kind: 'palette'}
	| {
			kind: 'password';
			label: string;
			rememberLabel?: string;
			resolve: (v: {password: string; remember: boolean} | null) => void;
	  }
	| {
			kind: 'login';
			method: 'oauth2' | 'cookie';
			devProperties: DevProperties;
			resolve: (v: Credential | null) => void;
	  }
	| {kind: 'confirm'; message: string; resolve: (v: boolean) => void}
	| {kind: 'picker'; resolve: (v: string | null) => void}
	| {kind: 'settings'}
	| {kind: 'help'}
	| {kind: 'changelog'; since?: string}
	| {
			kind: 'prompt';
			label: string;
			initial?: string;
			// Returns what is wrong with the value; the prompt then stays open.
			validate?: (value: string) => string | undefined;
			// Like validate, but shown once: Enter on the same value keeps it.
			advise?: (value: string) => string | undefined;
			error?: string;
			resolve: (v: string | null) => void;
	  }
	| {
			kind: 'choice';
			label: string;
			choices: string[];
			multi: boolean;
			initial: number[];
			resolve: (v: number[] | null) => void;
	  };

interface Props {
	apps: ProjectInfo[];
	workspaceRoot?: string;
	version: string;
	// `--minimal`: use the compact layout however wide the terminal is.
	minimal?: boolean;
	// Set on the first run after an upgrade: opens the changelog since then.
	updatedFrom?: string;
	// Leave the shell, give `job` the real terminal, then start the shell again.
	handover?: (job: () => Promise<void>) => void;
	// Apps left out of the workspace, each with the reason.
	skipped?: string[];
}

function useSize() {
	const {stdout} = useStdout();
	const read = () => ({columns: stdout.columns || 80, rows: stdout.rows || 24});
	const [size, setSize] = useState(read);
	useEffect(() => {
		const onResize = () => setSize(read());
		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stdout]);
	return size;
}

export function Shell({
	apps: initialApps,
	workspaceRoot,
	version,
	minimal = false,
	updatedFrom,
	handover,
	skipped,
}: Props) {
	const {exit} = useApp();
	const {columns, rows} = useSize();
	const tasks = useTasks();
	const [apps, setApps] = useState(initialApps);
	// A workspace with nothing to deploy against opens on its settings form.
	const onboard = useMemo(
		() =>
			Boolean(workspaceRoot) && needsOnboarding(workspaceRoot!, initialApps),
		[workspaceRoot, initialApps],
	);
	const [selected, setSelected] = useState(onboard ? initialApps.length : 0);
	const [tab, setTab] = useState<Tab>('overview');
	const [focus, setFocus] = useState<'nav' | 'content'>(
		workspaceRoot && !onboard ? 'nav' : 'content',
	);
	const [overlays, setOverlays] = useState<Overlay[]>(
		updatedFrom ? [{kind: 'changelog', since: updatedFrom}] : [],
	);
	const setOverlay = useCallback((next: Overlay | null) => {
		setOverlays(stack => overlayStack(stack, next));
	}, []);
	const [editing, setEditing] = useState(false);
	// A confirm that turns up mid-edit stays hidden until the field is done.
	const top = overlays.at(-1) ?? null;
	const overlay = top?.kind === 'confirm' && editing ? null : top;
	const [filter, setFilter] = useState('');
	const [versions, setVersions] = useState<Record<string, VersionsState>>({});
	const [versionRow, setVersionRow] = useState(0);
	const [logScroll, setLogScroll] = useState(0);
	const [logWrap, setLogWrap] = useState(false);
	const [offerAddon, setOfferAddon] = useState<string>();
	const [notice, setNotice] = useState<{
		text: string;
		level: 'info' | 'ok' | 'warn' | 'error';
	} | null>(
		skipped?.length
			? {
					text:
						skipped.length === 1
							? t('Skipped: {reason}', {reason: skipped[0]!})
							: t('Skipped {n} apps. First: {reason}', {
									n: skipped.length,
									reason: skipped[0]!,
								}),
					level: 'warn',
				}
			: null,
	);
	const [, tick] = useReducer((n: number) => n + 1, 0);

	// In workspace mode the row after the last app is "Workspace settings".
	const settings = Boolean(workspaceRoot) && selected === apps.length;
	const rawProject = apps[Math.min(selected, apps.length - 1)]!;
	// Active environment, remembered per workspace (or app) in .svcconfig.
	const configRoot = workspaceRoot ?? rawProject.root;
	const [envChoice, setEnvChoice] = useState<string>(
		() => readSvcConfig(configRoot).environment ?? '',
	);
	const envNames = environmentNames(rawProject.devProperties);
	const envList = envNames.join(',');
	const env = envNames.includes(envChoice)
		? envChoice
		: baseEnvironment(rawProject.devProperties);
	const project = useMemo(
		() => environmentProject(rawProject, env),
		[rawProject, env],
	);
	const isProduction = isProductionEnvironment(env, rawProject.devProperties);
	const versionsKey = `${project.root}|${env}`;
	const single = !workspaceRoot;
	const workspaceTarget = useMemo<ConfigTarget | undefined>(
		() =>
			workspaceRoot
				? {
						root: workspaceRoot,
						base: readWorkspaceDevProperties(workspaceRoot),
						devProperties: resolveEnvironment(
							readWorkspaceDevProperties(workspaceRoot) as DevProperties,
							env,
						),
						environment: env,
						workspace: true,
					}
				: undefined,
		// Re-read after any reload so saved values show up.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[workspaceRoot, apps, env],
	);
	const narrow = minimal || columns < NARROW_BELOW;
	const sidebar = navWidth(columns);
	// The navigator shows the fuzzy matches; `selected` stays an index into
	// `apps` (with `apps.length` meaning the workspace settings row).
	const matches = useMemo(() => navMatches(apps, filter), [apps, filter]);
	const ring = single ? matches : [...matches, apps.length];
	const running = runningTasks();

	// Re-render once a second while something runs so elapsed times move.
	useEffect(() => {
		if (running.length === 0) return;
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	}, [running.length]);

	const reload = useCallback(() => {
		setApps(current =>
			current.map(app => {
				try {
					return detectProject(app.root) ?? app;
				} catch {
					return app;
				}
			}),
		);
	}, []);

	// A finished npm install changes what detection sees (node_modules,
	// sitevision-scripts); re-detect so the status strip flips.
	const installsDone = tasks.filter(
		task => task.kind === 'install' && task.status !== 'running',
	).length;
	useEffect(() => {
		if (installsDone > 0) reload();
	}, [installsDone, reload]);

	const notify = useCallback(
		(text: string, level: 'info' | 'ok' | 'warn' | 'error' = 'info') => {
			setNotice({text, level});
		},
		[],
	);

	// "Save to keychain" that did not save would otherwise just ask again.
	useEffect(() => {
		onKeychainSaveFailed(() => {
			notify(
				t(
					'Could not save to the OS keychain; you will be asked again next time.',
				),
				'warn',
			);
		});
	}, [notify]);

	const quit = useCallback(() => {
		const leave = () => {
			for (const task of getTasks()) if (task.status === 'running') task.stop();
			exit();
		};

		// Between the scaffolder's questions nothing is open, so q is live:
		// quitting then would leave a half-made app behind without a word.
		if (scaffoldRunning()) {
			setOverlay({
				kind: 'confirm',
				message: t('A new app is still being created. Stop it and quit?'),
				resolve(yes) {
					if (yes) leave();
				},
			});
		} else {
			leave();
		}
	}, [exit, setOverlay]);

	const context = useMemo<ActionContext>(
		() => ({
			project,
			reload,
			notify,
			quit,
			setTab(next) {
				setTab(next);
				setFocus('content');
			},
			openSettings() {
				setOverlay({kind: 'settings'});
			},
			openChangelog() {
				setOverlay({kind: 'changelog'});
			},
			environment: env,
			isProduction,
			cycleEnvironment() {
				const next = envNames[(envNames.indexOf(env) + 1) % envNames.length]!;
				setEnvChoice(next);
				writeSvcConfig(configRoot, {environment: next});
				notify(t('switched to {env}', {env: next}));
			},
			async addEnvironment() {
				const name = await new Promise<string | null>(resolve => {
					setOverlay({
						kind: 'prompt',
						label: t('Environment name (e.g. test, prod)'),
						resolve,
					});
				});
				const clean = name
					?.trim()
					.toLowerCase()
					.replaceAll(/[^\d\-a-z]/g, '');
				if (!clean || clean === baseEnvironment(rawProject.devProperties))
					return;
				const targetRoot = workspaceRoot ?? rawProject.root;
				const base = (
					workspaceRoot
						? readWorkspaceDevProperties(workspaceRoot)
						: rawProject.devProperties
				) as DevProperties | undefined;
				if (!base) return;
				writeDevProperties(
					targetRoot,
					{...base, environments: {...base.environments, [clean]: {}}},
					{complete: !workspaceRoot},
				);
				reload();
				setEnvChoice(clean);
				writeSvcConfig(configRoot, {environment: clean});
				notify(t('environment {env} added', {env: clean}), 'ok');
			},
			async createApp() {
				// Only what this flow opened is closed when the scaffolder ends.
				const asked = new Set<Overlay>();
				const openOwn = (next: Overlay) => {
					asked.add(next);
					setOverlay(next);
				};

				if (scaffoldRunning()) {
					notify(t('An app is already being created.'), 'warn');
					return;
				}

				const promptText = async (
					label: string,
					initial?: string,
					validate?: (value: string) => string | undefined,
					error?: string,
					advise?: (value: string) => string | undefined,
				) =>
					new Promise<string | null>(resolve => {
						openOwn({
							kind: 'prompt',
							label,
							initial,
							validate,
							advise,
							error,
							resolve,
						});
					});
				const base = workspaceRoot ?? path.dirname(rawProject.root);
				const suggested = workspaceRoot
					? path.relative(workspaceRoot, path.dirname(rawProject.root)) || '.'
					: base;
				// Asked again, with the reason, until the name is free in that folder.
				let name = '';
				let parentDir = '';
				let appDir = '';
				let taken: string | undefined;
				for (;;) {
					// eslint-disable-next-line no-await-in-loop
					const typed = await promptText(
						t('Name of the new app'),
						name,
						appNameProblem,
						taken,
						appNameAdvice,
					);
					if (typed === null) return;
					name = typed.trim();

					// Folders that already hold apps, then a way to type another one.
					const folders = [
						...new Set([
							suggested,
							...apps.map(app =>
								workspaceRoot
									? path.relative(base, path.dirname(app.root)) || '.'
									: path.dirname(app.root),
							),
						]),
					].toSorted((a, b) => a.localeCompare(b));
					// eslint-disable-next-line no-await-in-loop
					const folderPick = await new Promise<number[] | null>(resolve => {
						openOwn({
							kind: 'choice',
							label: t('Create it in folder'),
							choices: [...folders, t('Other folder…')],
							multi: false,
							initial: [folders.indexOf(suggested)],
							resolve,
						});
					});
					if (!folderPick) return;
					const folder =
						folders[folderPick[0]!] ??
						// eslint-disable-next-line no-await-in-loop
						(await promptText(t('Create it in folder'), suggested));
					if (folder === null) return;
					parentDir = path.resolve(base, folder.trim() || '.');
					appDir = path.join(parentDir, name);
					if (isEmptyOrMissing(appDir)) break;
					taken = t(
						'{dir} already exists. Pick another name, or keep it and choose a different folder next.',
						{dir: path.relative(base, appDir)},
					);
				}

				// Both were checked above, so a run that leaves no app may remove them.
				const madeParent = !fs.existsSync(parentDir);
				const discard = () => {
					fs.rmSync(appDir, {recursive: true, force: true});
					if (madeParent && isEmptyOrMissing(parentDir))
						fs.rmSync(parentDir, {recursive: true, force: true});
				};

				fs.mkdirSync(parentDir, {recursive: true});
				const known = (
					workspaceRoot
						? readWorkspaceDevProperties(workspaceRoot)
						: rawProject.devProperties
				) as Record<string, unknown> | undefined;
				const ask: Ask = async question => {
					// svc keeps passwords in the keychain, never in the app's file.
					if (question.name === 'password') return {skip: true};
					const shared = known?.[question.name];
					if (
						!question.error &&
						['domain', 'siteName', 'username', 'useHTTPForDevDeploy'].includes(
							question.name,
						) &&
						shared !== undefined &&
						shared !== ''
					)
						return {value: shared};

					const label = question.error
						? `${question.message} (${question.error})`
						: question.message;
					if (question.type === 'confirm') {
						const value = await new Promise<boolean>(resolve => {
							openOwn({kind: 'confirm', message: label, resolve});
						});
						return {value};
					}

					if (question.type === 'password') {
						const secret = await new Promise<{password: string} | null>(
							resolve => {
								openOwn({kind: 'password', label, resolve});
							},
						);
						return secret && {value: secret.password};
					}

					if (question.choices.length > 0) {
						const multi = question.type === 'checkbox';
						const picked = await new Promise<number[] | null>(resolve => {
							openOwn({
								kind: 'choice',
								label,
								choices: question.choices,
								multi,
								initial: [question.default ?? []].flat() as number[],
								resolve,
							});
						});
						return picked && {value: multi ? picked : picked[0]};
					}

					const initial =
						question.default ?? (question.name === 'addonName' ? name : '');
					const value = await promptText(
						label,
						typeof initial === 'string' ? initial : JSON.stringify(initial),
					);
					return value === null ? null : {value};
				};

				notify(t('creating {app}: installing, questions follow', {app: name}));
				setTab('log');
				const {done} = startCreateApp({name, parentDir, ask});
				let outcome = await done;
				setOverlays(stack => withoutOverlays(stack, asked));
				if (outcome === 'unmanaged') {
					if (!handover) {
						notify(t('The scaffolder could not be run from here'), 'error');
						return;
					}

					fs.rmSync(appDir, {recursive: true, force: true});
					handover(async () => {
						if (await createAppInTerminal(name, parentDir))
							seedNewApp(appDir, workspaceRoot);
						else discard();
					});
					return;
				}

				if (outcome !== 'created') {
					discard();
					if (outcome === 'failed')
						notify(
							t('creating {app} failed, see the log', {app: name}),
							'error',
						);
					return;
				}

				try {
					seedNewApp(appDir, workspaceRoot);
				} catch (error) {
					notify(
						error instanceof Error ? error.message : String(error),
						'warn',
					);
					outcome = 'failed';
				}

				if (
					!workspaceRoot ||
					path.relative(workspaceRoot, appDir).startsWith('..')
				) {
					notify(t('{app} created in {dir}', {app: name, dir: appDir}), 'ok');
					return;
				}

				const left: string[] = [];
				const found = discoverApps(workspaceRoot, left);
				if (left[0]) notify(t('Skipped: {reason}', {reason: left[0]}), 'warn');
				setApps(found);
				setFilter('');
				setSelected(
					Math.max(
						0,
						found.findIndex(app => app.root === appDir),
					),
				);
				if (outcome === 'created')
					notify(t('{app} created', {app: name}), 'ok');
				setOfferAddon(appDir);
			},
			openWorkspaceSettings: workspaceRoot
				? () => {
						setSelected(apps.length);
						setFocus('content');
					}
				: undefined,
			askPassword: (label, rememberLabel) =>
				new Promise(resolve => {
					setOverlay({kind: 'password', label, rememberLabel, resolve});
				}),
			login: method =>
				new Promise(resolve => {
					setOverlay({
						kind: 'login',
						method,
						devProperties: project.devProperties!,
						resolve,
					});
				}),
			confirm: message =>
				new Promise(resolve => {
					setOverlay({kind: 'confirm', message, resolve});
				}),
			openHelp() {
				setOverlay({kind: 'help'});
			},
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[project, reload, notify, quit, workspaceRoot, apps.length, env, envList],
	);

	const run = useCallback(
		(action: Action) => {
			setOverlay(null);
			if (action.enabled && !action.enabled(project)) {
				notify(
					`${t(action.label)}: ${action.detail?.(project) ?? t('not available')}`,
					'warn',
				);
				return;
			}

			action.run(context).catch((error: unknown) => {
				notify(error instanceof Error ? error.message : String(error), 'error');
			});
		},
		[context, project, notify, setOverlay],
	);

	const fetchVersions = useCallback(
		async (fresh = false) => {
			const key = versionsKey;
			const config = await resolveDeployConfig(context, fresh);
			if (!config) return;
			setVersions(v => ({
				...v,
				[key]: {...v[key], loading: true, error: undefined},
			}));
			const result = await listExecutables(config);
			setVersions(v => ({
				...v,
				[key]: {
					loading: false,
					executables: result.executables ?? v[key]?.executables,
					error: result.error,
					fetchedAt: result.success ? Date.now() : v[key]?.fetchedAt,
				},
			}));
			setVersionRow(0);
		},
		[versionsKey, context],
	);

	const activateSelected = useCallback(async () => {
		const executable = versions[versionsKey]?.executables?.[versionRow];
		if (!executable) return;
		if (executable.active) {
			notify(t('{v} is already active', {v: executable.appVersion}));
			return;
		}

		const config = await resolveDeployConfig(context);
		if (!config) return;
		const task = startActivate(
			project,
			config,
			executable.id,
			executable.appVersion,
		);
		const wait = () =>
			new Promise<void>(resolve => {
				const check = () =>
					task.status === 'running' ? setTimeout(check, 200) : resolve();
				check();
			});
		await wait();
		notify(
			task.error ?? t('{v} activated', {v: executable.appVersion}),
			task.error ? 'error' : 'ok',
		);
		await fetchVersions();
	}, [
		versions,
		versionsKey,
		project,
		versionRow,
		context,
		notify,
		fetchVersions,
	]);

	// A popover owns the keyboard; the form stays mounted underneath it.
	const formActive =
		(tab === 'config' || settings) && focus === 'content' && !overlay;
	const pickAddon = useCallback(
		async () =>
			new Promise<string | null>(resolve => {
				setOverlay({kind: 'picker', resolve});
			}),
		[setOverlay],
	);
	// A freshly created app: once it is the selected project, offer its addon.
	useEffect(() => {
		if (!offerAddon || project.root !== offerAddon || overlay) return;
		setOfferAddon(undefined);
		const addon = project.devProperties?.addonName;
		const action = actions.find(entry => entry.id === 'create-addon');
		if (!addon || !action || !project.devProperties?.domain) return;
		void context
			.confirm(
				t('Create the addon "{addon}" on {domain} now?', {
					addon,
					domain: project.devProperties.domain,
				}),
			)
			.then(yes => {
				if (yes) run(action);
			});
	}, [offerAddon, project, overlay, context, run]);

	const loadAddons = useCallback(async () => {
		const config = await resolveDeployConfig(context, false, {addon: false});
		return config ? listAddons(config) : {error: t('No credentials.')};
	}, [context]);

	const appTasks = tasks.filter(task => task.appRoot === project.root);
	// A new app is not in the list while it is being created, so its log shows
	// wherever you are; a failed one stays up until another task runs.
	const creating = tasks.findLast(task => task.kind === 'create');
	const logTask: Task | undefined =
		appTasks.find(task => task.status === 'running') ??
		(creating?.status === 'running' ||
		(creating?.status === 'error' && creating === tasks.at(-1))
			? creating
			: appTasks.at(-1));

	useInput(
		(raw, key) => {
			// Terminals speaking the kitty keyboard protocol report shift+s as
			// "s" plus a shift flag; fold that back into the uppercase letter so
			// P and K behave the same everywhere.
			const input =
				key.shift && raw.length === 1 && /[a-z]/.test(raw)
					? raw.toUpperCase()
					: raw;
			if (key.escape) {
				if (focus === 'nav' && filter) {
					setFilter('');
					return;
				}

				// Esc backs out of the workspace settings pane, not just its focus.
				if (settings) setSelected(0);
				setFocus(single ? 'content' : 'nav');
				return;
			}

			// Ctrl+D is not d: only plain keys are shortcuts.
			if (key.ctrl || key.meta) return;

			if (input === '/') {
				setOverlay({kind: 'palette'});
				return;
			}

			if (input === '?') {
				setOverlay({kind: 'help'});
				return;
			}

			// Reachable from the navigator's search and the workspace form too.
			if (input === ',') {
				setOverlay({kind: 'settings'});
				return;
			}

			// The config form uses Tab/Shift+Tab to move between fields.
			if (key.tab && !formActive) {
				setFilter('');
				setFocus(f =>
					f === 'nav' && !single ? 'content' : single ? 'content' : 'nav',
				);
				return;
			}

			// Navigator: typing searches, so no action key fires until Enter has
			// moved the focus into the content pane.
			if (focus === 'nav') {
				const move = (delta: number) => {
					setSelected(navMove(ring, selected, delta));
				};

				const search = (next: string) => {
					setFilter(next);
					const found = navMatches(apps, next);
					if (found.length > 0 && !found.includes(selected))
						setSelected(found[0]!);
				};

				if (key.upArrow) move(-1);
				else if (key.downArrow) move(1);
				else if (key.return) {
					if (matches.length > 0 || settings) {
						setFilter('');
						setFocus('content');
					}
				} else if (key.backspace || key.delete) search(filter.slice(0, -1));
				else if (input === 'q' && !filter) quit();
				else if (input?.length === 1 && input >= ' ' && !key.ctrl && !key.meta)
					search(filter + input);

				return;
			}

			if (settings && focus === 'content') {
				// Settings pane: the form owns everything but q, y and Tab/Esc above.
				if (input === 'q') quit();
				else if (input === 'y') {
					try {
						if (syncDevPropertiesToPackageJson(workspaceRoot!)) {
							reload();
							notify(t('package.json updated'), 'ok');
						}
					} catch (error) {
						notify(
							error instanceof Error ? error.message : String(error),
							'error',
						);
					}
				}

				return;
			}

			if (input === 'a' && tab !== 'versions') {
				setTab('versions');
				setFocus('content');
				if (!Object.hasOwn(versions, versionsKey)) void fetchVersions(false);
				return;
			}

			const digit = Number.parseInt(input, 10);
			if (digit >= 1 && digit <= TABS.length) {
				setTab(TABS[digit - 1]!.id);
				setFocus('content');
				return;
			}

			if (key.leftArrow || key.rightArrow) {
				const i = TABS.findIndex(entry => entry.id === tab);
				setTab(
					TABS[(i + (key.rightArrow ? 1 : TABS.length - 1)) % TABS.length]!.id,
				);
				return;
			}

			if (tab === 'versions') {
				const count = versions[versionsKey]?.executables?.length ?? 0;
				if (key.upArrow) setVersionRow(r => Math.max(0, r - 1));
				if (key.downArrow)
					setVersionRow(r => Math.min(Math.max(0, count - 1), r + 1));
				if (input === 'r') void fetchVersions(false);
				else if (input === 'a' && count > 0) void activateSelected();
			} else if (tab === 'log') {
				const max = Math.max(0, (logTask?.lines.length ?? 0) - 1);
				if (key.upArrow) setLogScroll(s => Math.min(max, s + 1));
				if (key.downArrow) setLogScroll(s => Math.max(0, s - 1));
				if (key.pageUp) setLogScroll(s => Math.min(max, s + 10));
				if (key.pageDown) setLogScroll(s => Math.max(0, s - 10));
				if (input === 'f') setLogScroll(0);
				else if (input === 'x') setLogWrap(w => !w);
			}

			const action = actionForKey(input);
			if (action) run(action);
		},
		{isActive: overlay === null && !editing},
	);

	// Frame geometry: one row for Ink's trailing newline, top bar, bottom bar.
	// The sidebar layout needs 10 rows to stack its own fixed rows without
	// overflowing; the compact one has no sidebar and fits in 6.
	const frameRows = Math.max(narrow ? 6 : 10, rows - 1);
	const mainHeight = frameRows - 2;
	const contentHeight = mainHeight - 1 - (narrow ? 1 : 0);
	const groupOf = (app: ProjectInfo) =>
		workspaceRoot ? appGroup(workspaceRoot, app.root) : '.';
	const appName = appLabel(project);
	const tabName = t(TABS.find(entry => entry.id === tab)!.label).toLowerCase();
	const contextLabel = settings
		? `${t('workspace')} ▸ ${t('settings')}`
		: workspaceRoot
			? `${t('workspace')} ▸ ${path.relative(workspaceRoot, project.root)} ▸ ${tabName}`
			: `${appName} ▸ ${tabName}`;

	const h = (pairs: Array<[string, string]>): Hint[] =>
		pairs.map(([key, label]) => ({key, label: t(label)}));
	const settingsHints: Hint[] = editing
		? h([
				['Enter', 'save'],
				['Esc', 'cancel'],
			])
		: formActive
			? h([
					['↑↓', 'field'],
					['Enter', 'edit'],
					['y', 'sync'],
					['Esc', 'back'],
					['q', 'quit'],
				])
			: h([
					['Enter', 'edit settings'],
					['↑↓', 'apps'],
					['q', 'quit'],
				]);
	const navHints: Hint[] = filter
		? h([
				['↑↓', 'move'],
				['Enter', 'select'],
				['Esc', 'clear'],
				['/', 'commands'],
			])
		: h([
				['a–z', 'search'],
				['↑↓', 'move'],
				['Enter', 'select'],
				['/', 'commands'],
				['q', 'quit'],
			]);
	const where: Where =
		focus === 'nav' && !settings ? 'nav' : settings ? 'workspace' : tab;
	const hereHints: Hint[] =
		focus === 'nav' && !settings
			? navHints
			: settings
				? settingsHints
				: tab === 'versions'
					? h([
							['a', 'activate'],
							['r', 'refresh'],
							['p', 'deploy'],
							['P', 'force'],
							['/', 'commands'],
							['q', 'quit'],
						])
					: tab === 'log'
						? h([
								['f', 'follow'],
								['x', 'wrap'],
								['K', 'stop'],
								['p', 'deploy'],
								['P', 'force'],
								['/', 'commands'],
								['q', 'quit'],
							])
						: tab === 'config'
							? editing
								? h([
										['Enter', 'save'],
										['Esc', 'cancel'],
									])
								: formActive
									? h([
											['↑↓', 'field'],
											['Enter', 'edit'],
											['^O', 'pick addon'],
											['y', 'sync'],
											['/', 'commands'],
											['q', 'quit'],
										])
									: h([
											['Tab', 'edit'],
											['y', 'sync'],
											['l', 'login'],
											['/', 'commands'],
											['q', 'quit'],
										])
							: h([
									['d', 'dev'],
									['w', 'watch'],
									['b', 'build'],
									['s', 'sign'],
									['p', 'deploy'],
									['P', 'force'],
									['v', 'env'],
									['K', 'stop'],
									['a', 'versions'],
									['e', 'config'],
									['i', 'install'],
									['l', 'login'],
									[',', 'settings'],
									['/', 'commands'],
									['q', 'quit'],
								]);
	const hints: Hint[] = overlay
		? h([['Esc', 'cancel']])
		: editing
			? hereHints
			: [...hereHints, ...h([['?', 'help']])];

	const right =
		running.length > 0 ? (
			<Text>
				<Text color={ACCENT}>
					<Spinner type="dots" />
				</Text>{' '}
				{running[0]!.label} {running[0]!.appName}
				{running.length > 1 && (
					<Text dimColor> · {t('{n} tasks', {n: running.length})}</Text>
				)}
			</Text>
		) : notice ? (
			<Text
				color={
					{info: undefined, ok: 'green', warn: 'yellow', error: 'red'}[
						notice.level
					]
				}
				wrap="truncate"
			>
				{notice.text}
			</Text>
		) : (
			<Text dimColor>{t('idle')}</Text>
		);

	const closeOverlay = () => setOverlay(null);
	const popoverWidth = Math.min(96, columns - 8);
	const popoverHeight = Math.min(30, frameRows - 4);
	const popover =
		overlay &&
		renderOverlay(overlay, {
			project,
			here: hereHints,
			where,
			closeOverlay,
			run,
			notify,
			loadAddons,
			height: popoverHeight - 2,
			rerender: tick,
			openWorkspace: workspaceRoot
				? () => {
						setOverlay(null);
						setSelected(apps.length);
						setFocus('content');
					}
				: undefined,
		});
	const content =
		settings && workspaceTarget ? (
			<ConfigForm
				key="workspace"
				project={workspaceTarget}
				active={formActive}
				width={narrow ? columns : columns - sidebar}
				height={contentHeight}
				pickAddon={async () => null}
				onSaved={() => {
					reload();
					notify(t('workspace config saved'), 'ok');
				}}
				onEditingChange={setEditing}
			/>
		) : (
			<>
				{tab === 'overview' && (
					<Overview project={project} tasks={tasks} height={contentHeight} />
				)}
				{tab === 'config' && (
					<ConfigForm
						key={`${project.root}|${env}`}
						project={{
							root: project.root,
							devProperties: project.devProperties,
							base: rawProject.devProperties,
							environment: env,
							workspaceRoot,
							manifest: project.manifest,
							manifestPath: project.paths.manifest,
						}}
						active={formActive}
						width={narrow ? columns : columns - sidebar}
						height={contentHeight}
						pickAddon={pickAddon}
						onSaved={() => {
							reload();
							notify(t('config saved'), 'ok');
						}}
						onEditingChange={setEditing}
					/>
				)}
				{tab === 'versions' && (
					<Versions
						project={project}
						state={versions[versionsKey]}
						selected={versionRow}
					/>
				)}
				{tab === 'log' && (
					<Log
						task={logTask}
						height={contentHeight}
						scroll={logScroll}
						wrap={logWrap}
					/>
				)}
			</>
		);

	return (
		<Box flexDirection="column" width={columns} height={frameRows}>
			<TopBar
				context={contextLabel}
				domain={project.devProperties?.domain}
				auth={authState(project)}
				environment={{
					name: env,
					color: environmentColor(env, rawProject.devProperties),
				}}
				version={version}
			/>
			{/* Each pane draws its own top border so the focused one can light up. */}
			<Box flexGrow={1} height={mainHeight}>
				{!narrow && (
					<Navigator
						apps={matches.map(i => apps[i]!)}
						groupOf={groupOf}
						selected={matches.indexOf(selected)}
						focused={focus === 'nav'}
						tasks={tasks}
						height={mainHeight}
						single={single}
						settingsSelected={settings}
						width={sidebar}
						filter={filter}
					/>
				)}
				<Box
					flexDirection="column"
					width={narrow ? columns : columns - sidebar}
					overflow="hidden"
					borderStyle="single"
					borderLeft={false}
					borderRight={false}
					borderBottom={false}
					borderColor={focus === 'content' ? ACCENT : undefined}
					borderDimColor={focus !== 'content'}
				>
					{narrow && !single && (
						<NavigatorStrip
							apps={matches.map(i => apps[i]!)}
							selected={matches.indexOf(selected)}
							focused={focus === 'nav'}
							width={columns}
							filter={filter}
						/>
					)}
					{settings ? (
						<Box paddingX={1}>
							<Text bold color={ACCENT}>
								{t('Workspace settings')}
							</Text>
							<Text dimColor>
								{onboard && configIncomplete(workspaceTarget?.base)
									? t(
											' · new workspace: fill in once, every app inherits · Esc skips',
										)
									: t(' · shared .dev_properties.json at the root')}
							</Text>
						</Box>
					) : (
						<TabBar tab={tab} narrow={narrow} focused={focus === 'content'} />
					)}
					<Box
						flexDirection="column"
						height={contentHeight}
						overflow="hidden"
						alignItems="flex-start"
					>
						{content}
					</Box>
				</Box>
			</Box>
			<BottomBar hints={hints} right={right} />
			{popover && (
				<Popover
					columns={columns}
					rows={frameRows}
					width={popoverWidth}
					height={popoverHeight}
				>
					{popover}
				</Popover>
			)}
		</Box>
	);
}

function renderOverlay(
	overlay: Overlay,
	env: {
		project: ProjectInfo;
		here: Hint[];
		where: Where;
		closeOverlay: () => void;
		run: (action: Action) => void;
		notify: (text: string, level?: 'info' | 'ok' | 'warn' | 'error') => void;
		loadAddons: () => Promise<{addons?: AddonNode[]; error?: string}>;
		height: number;
		rerender: () => void;
		openWorkspace?: () => void;
	},
) {
	const {
		project,
		here,
		where,
		closeOverlay,
		run,
		notify,
		loadAddons,
		height,
		rerender,
		openWorkspace,
	} = env;

	switch (overlay.kind) {
		case 'palette':
			return (
				<CommandPalette
					project={project}
					onRun={run}
					onClose={closeOverlay}
					height={height}
				/>
			);
		case 'password':
			return (
				<PasswordInput
					key={overlay.label}
					label={overlay.label}
					showRememberOption={Boolean(overlay.rememberLabel)}
					rememberLabel={
						overlay.rememberLabel ? `${overlay.rememberLabel}: ` : undefined
					}
					onSubmit={(password, remember) => {
						closeOverlay();
						overlay.resolve({password, remember});
					}}
					onCancel={() => {
						closeOverlay();
						overlay.resolve(null);
					}}
				/>
			);
		case 'login':
			return (
				<AuthLoginScreen
					method={overlay.method}
					devProperties={overlay.devProperties}
					onComplete={credential => {
						closeOverlay();
						overlay.resolve(credential);
					}}
					onError={message => {
						closeOverlay();
						notify(message, 'error');
						overlay.resolve(null);
					}}
					onCancel={() => {
						closeOverlay();
						overlay.resolve(null);
					}}
				/>
			);
		case 'confirm':
			return (
				<Confirm
					message={overlay.message}
					onAnswer={answer => {
						closeOverlay();
						overlay.resolve(answer);
					}}
				/>
			);
		case 'prompt':
			return (
				<TextPrompt
					key={overlay.label}
					label={overlay.label}
					initial={overlay.initial}
					validate={overlay.validate}
					advise={overlay.advise}
					error={overlay.error}
					onSubmit={value => {
						closeOverlay();
						overlay.resolve(value);
					}}
					onCancel={() => {
						closeOverlay();
						overlay.resolve(null);
					}}
				/>
			);
		case 'choice':
			return (
				<ChoicePrompt
					key={overlay.label}
					label={overlay.label}
					choices={overlay.choices}
					multi={overlay.multi}
					initial={overlay.initial}
					onSubmit={picked => {
						closeOverlay();
						overlay.resolve(picked);
					}}
					onCancel={() => {
						closeOverlay();
						overlay.resolve(null);
					}}
				/>
			);
		case 'help':
			return (
				<HelpPanel
					here={here}
					where={where}
					height={height}
					onClose={closeOverlay}
				/>
			);
		case 'changelog':
			return (
				<ChangelogPanel
					since={overlay.since}
					height={height}
					onClose={closeOverlay}
				/>
			);
		case 'settings':
			return (
				<SettingsScreen
					onChanged={rerender}
					onClose={closeOverlay}
					onOpenWorkspace={openWorkspace}
				/>
			);
		case 'picker':
			return (
				<AddonPicker
					domain={project.devProperties?.domain ?? ''}
					appType={appTypeOf(project.manifest)}
					initialQuery={localizedText(project.manifest.name)}
					load={loadAddons}
					height={height}
					onSelect={name => {
						closeOverlay();
						overlay.resolve(name);
					}}
					onClose={() => {
						closeOverlay();
						overlay.resolve(null);
					}}
				/>
			);
	}
}

/**
 * The open overlays, last one shown. `null` closes the shown one. A new overlay
 * covers the current one instead of replacing it, so whoever awaits the covered
 * one still gets an answer. A confirm goes underneath: background tasks raise
 * them, and on top it would take the keys being typed into a prompt.
 */
export function overlayStack(
	stack: Overlay[],
	next: Overlay | null,
): Overlay[] {
	if (next === null) return stack.slice(0, -1);
	return next.kind === 'confirm' ? [next, ...stack] : [...stack, next];
}

export function withoutOverlays(
	stack: Overlay[],
	gone: Set<Overlay>,
): Overlay[] {
	return stack.filter(overlay => !gone.has(overlay));
}

export function Confirm({
	message,
	onAnswer,
}: {
	message: string;
	onAnswer: (yes: boolean) => void;
}) {
	useInput((input, key) => {
		if (input === 'y' || input === 'Y') onAnswer(true);
		else if (input === 'n' || input === 'N' || key.escape) onAnswer(false);
	});
	return (
		<Box flexDirection="column" paddingX={1}>
			<Text>{message}</Text>
			<Text dimColor>{t('y confirm · n cancel')}</Text>
		</Box>
	);
}

function ChoicePrompt({
	label,
	choices,
	multi,
	initial,
	onSubmit,
	onCancel,
}: {
	label: string;
	choices: string[];
	multi: boolean;
	initial: number[];
	onSubmit: (picked: number[]) => void;
	onCancel: () => void;
}) {
	const [cursor, setCursor] = useState(multi ? 0 : (initial[0] ?? 0));
	const [checked, setChecked] = useState(() => new Set(multi ? initial : []));
	useInput((input, key) => {
		if (key.escape) onCancel();
		else if (key.return)
			onSubmit(multi ? [...checked].toSorted((a, b) => a - b) : [cursor]);
		else if (key.upArrow)
			setCursor(c => (c - 1 + choices.length) % choices.length);
		else if (key.downArrow) setCursor(c => (c + 1) % choices.length);
		else if (multi && input === ' ') {
			setChecked(current => {
				const next = new Set(current);
				if (!next.delete(cursor)) next.add(cursor);
				return next;
			});
		}
	});
	return (
		<Box flexDirection="column" paddingX={1}>
			<Text bold>{label}</Text>
			{choices.map((choice, i) => (
				<Text
					key={choice}
					color={i === cursor ? ACCENT : undefined}
					bold={i === cursor}
				>
					{i === cursor ? '▸ ' : '  '}
					{multi ? (checked.has(i) ? '◉ ' : '◯ ') : ''}
					{choice}
				</Text>
			))}
			<Text dimColor>
				{multi
					? t('↑↓ move · Space toggle · Enter submit · Esc cancel')
					: t('↑↓ move · Enter select · Esc cancel')}
			</Text>
		</Box>
	);
}

function TextPrompt({
	label,
	initial = '',
	validate,
	advise,
	error,
	onSubmit,
	onCancel,
}: {
	label: string;
	initial?: string;
	validate?: (value: string) => string | undefined;
	advise?: (value: string) => string | undefined;
	error?: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState(initial);
	const [problem, setProblem] = useState(error);
	// The value an advice was shown for; submitting it again keeps it.
	const [advised, setAdvised] = useState<string>();
	const advice = advised === value ? advise?.(value) : undefined;
	useInput((input, key) => {
		if (key.escape) onCancel();
		else if (key.return) {
			const invalid = validate?.(value);
			setProblem(invalid);
			if (invalid) return;
			if (advise?.(value) && advised !== value) setAdvised(value);
			else onSubmit(value);
		} else if (key.backspace || key.delete) setValue(v => v.slice(0, -1));
		else if (input && !key.ctrl && !key.meta) setValue(v => v + input);
	});
	return (
		<Box flexDirection="column" paddingX={1}>
			<Text bold>{label}</Text>
			<Text>
				<Text color={ACCENT}>❯ </Text>
				{value}
				<Text inverse> </Text>
			</Text>
			{problem && <Text color="red">✗ {problem}</Text>}
			{!problem && advice && <Text color="yellow">{advice}</Text>}
			<Text dimColor>{t('Press Enter to submit, Esc to cancel')}</Text>
		</Box>
	);
}
