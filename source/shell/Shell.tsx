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
	needsOnboarding,
} from '../utils/workspace.js';
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
import {
	baseEnvironment,
	environmentColor,
	environmentNames,
	environmentProject,
	isProductionEnvironment,
	resolveEnvironment,
} from '../utils/environments.js';
import {t} from '../utils/i18n.js';
import {
	actionForKey,
	authState,
	resolveDeployConfig,
	type Action,
	type ActionContext,
	type Credential,
	type Tab,
} from './actions.js';

type Overlay =
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
	| {kind: 'prompt'; label: string; resolve: (v: string | null) => void};

interface Props {
	apps: ProjectInfo[];
	workspaceRoot?: string;
	version: string;
	// `--minimal`: use the compact layout however wide the terminal is.
	minimal?: boolean;
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
	const [overlay, setOverlay] = useState<Overlay | null>(null);
	const [filter, setFilter] = useState('');
	const [versions, setVersions] = useState<Record<string, VersionsState>>({});
	const [versionRow, setVersionRow] = useState(0);
	const [logScroll, setLogScroll] = useState(0);
	const [logWrap, setLogWrap] = useState(false);
	const [notice, setNotice] = useState<{
		text: string;
		level: 'info' | 'ok' | 'warn' | 'error';
	} | null>(null);
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

	const quit = useCallback(() => {
		for (const task of getTasks()) if (task.status === 'running') task.stop();
		exit();
	}, [exit]);

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
		[context, project, notify],
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
	}, [versions, project, versionRow, context, notify, fetchVersions]);

	const formActive = (tab === 'config' || settings) && focus === 'content';
	const [editing, setEditing] = useState(false);
	const pickAddon = useCallback(
		async () =>
			new Promise<string | null>(resolve => {
				setOverlay({kind: 'picker', resolve});
			}),
		[],
	);
	const loadAddons = useCallback(async () => {
		const config = await resolveDeployConfig(context);
		return config ? listAddons(config) : {error: t('No credentials.')};
	}, [context]);

	const appTasks = tasks.filter(task => task.appRoot === project.root);
	const logTask: Task | undefined =
		appTasks.find(task => task.status === 'running') ?? appTasks.at(-1);

	useInput(
		(raw, key) => {
			// Terminals speaking the kitty keyboard protocol report shift+s as
			// "s" plus a shift flag; fold that back into the uppercase letter so
			// P, K, R behave the same everywhere.
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

			if (input === '/') {
				setOverlay({kind: 'palette'});
				return;
			}

			if (key.tab) {
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

			if (tab === 'versions') {
				const count = versions[versionsKey]?.executables?.length ?? 0;
				if (key.upArrow) setVersionRow(r => Math.max(0, r - 1));
				if (key.downArrow)
					setVersionRow(r => Math.min(Math.max(0, count - 1), r + 1));
				if (input === 'R') void fetchVersions(false);
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
	const hints: Hint[] = overlay
		? h([['Esc', 'cancel']])
		: focus === 'nav' && !settings
			? navHints
			: settings
				? settingsHints
				: tab === 'versions'
					? h([
							['a', 'activate'],
							['R', 'refresh'],
							['p', 'deploy'],
							['/', 'commands'],
							['q', 'quit'],
						])
					: tab === 'log'
						? h([
								['f', 'follow'],
								['x', 'wrap'],
								['K', 'stop'],
								['p', 'deploy'],
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
									['a', 'activate'],
									['E', 'env'],
									['i', 'install'],
									['/', 'commands'],
									['q', 'quit'],
								]);

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
	const content = overlay ? (
		renderOverlay(overlay, {
			project,
			closeOverlay,
			run,
			notify,
			loadAddons,
			height: contentHeight,
			rerender: tick,
			openWorkspace: workspaceRoot
				? () => {
						setOverlay(null);
						setSelected(apps.length);
						setFocus('content');
					}
				: undefined,
		})
	) : settings && workspaceTarget ? (
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
		</Box>
	);
}

function renderOverlay(
	overlay: Overlay,
	env: {
		project: ProjectInfo;
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
					label={overlay.label}
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

function Confirm({
	message,
	onAnswer,
}: {
	message: string;
	onAnswer: (yes: boolean) => void;
}) {
	useInput(input => {
		if (input === 'y' || input === 'Y') onAnswer(true);
		else if (input === 'n' || input === 'N') onAnswer(false);
	});
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
		>
			<Text>{message}</Text>
			<Text dimColor>{t('y confirm · n cancel')}</Text>
		</Box>
	);
}

function TextPrompt({
	label,
	onSubmit,
	onCancel,
}: {
	label: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState('');
	useInput((input, key) => {
		if (key.escape) onCancel();
		else if (key.return) onSubmit(value);
		else if (key.backspace || key.delete) setValue(v => v.slice(0, -1));
		else if (input && !key.ctrl && !key.meta) setValue(v => v + input);
	});
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={ACCENT}
			paddingX={1}
		>
			<Text bold>{label}</Text>
			<Text>
				<Text color={ACCENT}>❯ </Text>
				{value}
				<Text inverse> </Text>
			</Text>
			<Text dimColor>{t('Press Enter to submit, Esc to cancel')}</Text>
		</Box>
	);
}
