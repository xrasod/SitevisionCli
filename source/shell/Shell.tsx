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
} from '../utils/project-detection.js';
import {appGroup} from '../utils/workspace.js';
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
	| {kind: 'settings'};

interface Props {
	apps: ProjectInfo[];
	workspaceRoot?: string;
	version: string;
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

export function Shell({apps: initialApps, workspaceRoot, version}: Props) {
	const {exit} = useApp();
	const {columns, rows} = useSize();
	const tasks = useTasks();
	const [apps, setApps] = useState(initialApps);
	const [selected, setSelected] = useState(0);
	const [tab, setTab] = useState<Tab>('overview');
	const [focus, setFocus] = useState<'nav' | 'content'>(
		workspaceRoot ? 'nav' : 'content',
	);
	const [overlay, setOverlay] = useState<Overlay | null>(null);
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
	const project = apps[Math.min(selected, apps.length - 1)]!;
	const single = !workspaceRoot;
	const workspaceTarget = useMemo<ConfigTarget | undefined>(
		() =>
			workspaceRoot
				? {
						root: workspaceRoot,
						devProperties: readWorkspaceDevProperties(workspaceRoot),
						workspace: true,
					}
				: undefined,
		// Re-read after any reload so saved values show up.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[workspaceRoot, apps],
	);
	const narrow = columns < NARROW_BELOW;
	const sidebar = navWidth(columns);
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
		[project, reload, notify, quit, workspaceRoot, apps.length],
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
			const key = project.root;
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
		[project.root, context],
	);

	const activateSelected = useCallback(async () => {
		const executable = versions[project.root]?.executables?.[versionRow];
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
				setFocus(single ? 'content' : 'nav');
				return;
			}

			if (input === '/') {
				setOverlay({kind: 'palette'});
				return;
			}

			if (key.tab) {
				setFocus(f =>
					f === 'nav' && !single ? 'content' : single ? 'content' : 'nav',
				);
				return;
			}

			if (input === 'a' && tab !== 'versions') {
				setTab('versions');
				setFocus('content');
				if (!Object.hasOwn(versions, project.root)) void fetchVersions(false);
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
				// Settings pane: the form owns everything but q and Tab/Esc above.
				if (input === 'q') quit();
				return;
			}

			if (focus === 'nav') {
				const last = single ? apps.length - 1 : apps.length;
				if (key.upArrow) setSelected(s => (s > 0 ? s - 1 : last));
				if (key.downArrow) setSelected(s => (s < last ? s + 1 : 0));
				if (key.return) setFocus('content');
			} else if (tab === 'versions') {
				const count = versions[project.root]?.executables?.length ?? 0;
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
	const frameRows = Math.max(10, rows - 1);
	const mainHeight = frameRows - 2;
	const contentHeight = mainHeight - 1 - (narrow ? 1 : 0);
	const groupOf = (app: ProjectInfo) =>
		workspaceRoot ? appGroup(workspaceRoot, app.root) : '.';
	const appName = localizedText(project.manifest.name) || project.manifest.id;
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
					['Esc', 'back'],
					['q', 'quit'],
				])
			: h([
					['Enter', 'edit settings'],
					['↑↓', 'apps'],
					['q', 'quit'],
				]);
	const hints: Hint[] = overlay
		? h([['Esc', 'cancel']])
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
					key={project.root}
					project={project}
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
					state={versions[project.root]}
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
				version={version}
			/>
			<Box
				flexGrow={1}
				height={mainHeight}
				borderStyle="single"
				borderDimColor
				borderLeft={false}
				borderRight={false}
				borderBottom={false}
			>
				{!narrow && (
					<Navigator
						apps={apps}
						groupOf={groupOf}
						selected={selected}
						focused={focus === 'nav'}
						tasks={tasks}
						height={mainHeight - 1}
						single={single}
						settingsSelected={settings}
						width={sidebar}
					/>
				)}
				<Box
					flexDirection="column"
					width={narrow ? columns : columns - sidebar}
					overflow="hidden"
				>
					{narrow && !single && (
						<NavigatorStrip
							apps={apps}
							selected={selected}
							focused={focus === 'nav'}
						/>
					)}
					{settings ? (
						<Box paddingX={1}>
							<Text bold color={ACCENT}>
								{t('Workspace settings')}
							</Text>
							<Text dimColor>
								{t(' · shared .dev_properties.json at the root')}
							</Text>
						</Box>
					) : (
						<TabBar tab={tab} narrow={narrow} focused={focus === 'content'} />
					)}
					<Box height={contentHeight} overflow="hidden" alignItems="flex-start">
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
