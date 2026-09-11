import path from 'node:path';
import {useCallback, useEffect, useMemo, useReducer, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import Spinner from 'ink-spinner';
import type {ProjectInfo, DevProperties} from '../types/index.js';
import {detectProject, localizedText} from '../utils/project-detection.js';
import {appGroup} from '../utils/workspace.js';
import {listExecutables} from '../utils/sitevision-api.js';
import {
	useTasks,
	runningTasks,
	startActivate,
	getTasks,
	type Task,
} from '../utils/tasks.js';
import {PasswordInput} from '../components/PasswordInput.js';
import {AuthLoginScreen} from '../components/AuthLoginScreen.js';
import {DevPropertiesForm} from '../components/DevPropertiesForm.js';
import {SigningPropertiesForm} from '../components/SigningPropertiesForm.js';
import {
	TopBar,
	Navigator,
	NavigatorStrip,
	BottomBar,
	NAV_WIDTH,
	NARROW_BELOW,
	ACCENT,
	type Hint,
} from './Frame.js';
import {
	TabBar,
	TABS,
	Overview,
	Config,
	Versions,
	Log,
	type VersionsState,
} from './Tabs.js';
import {CommandPalette} from './CommandPalette.js';
import {
	actionForKey,
	authState,
	resolveDeployConfig,
	type Action,
	type ActionContext,
	type Credential,
	type FormKind,
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
	| {kind: 'form'; form: FormKind};

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

	const project = apps[selected]!;
	const single = !workspaceRoot;
	const narrow = columns < NARROW_BELOW;
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
			setTab,
			openForm: form => setOverlay({kind: 'form', form}),
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
		[project, reload, notify, quit],
	);

	const run = useCallback(
		(action: Action) => {
			setOverlay(null);
			if (action.enabled && !action.enabled(project)) {
				notify(
					`${action.label}: ${action.detail?.(project) ?? 'not available'}`,
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
			notify(`${executable.appVersion} is already active`);
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
			task.error ?? `${executable.appVersion} activated`,
			task.error ? 'error' : 'ok',
		);
		await fetchVersions();
	}, [versions, project, versionRow, context, notify, fetchVersions]);

	const appTasks = tasks.filter(t => t.appRoot === project.root);
	const logTask: Task | undefined =
		appTasks.find(t => t.status === 'running') ?? appTasks.at(-1);

	useInput(
		(input, key) => {
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
				const i = TABS.findIndex(t => t.id === tab);
				setTab(
					TABS[(i + (key.rightArrow ? 1 : TABS.length - 1)) % TABS.length]!.id,
				);
				return;
			}

			if (focus === 'nav') {
				if (key.upArrow) setSelected(s => (s > 0 ? s - 1 : apps.length - 1));
				if (key.downArrow) setSelected(s => (s < apps.length - 1 ? s + 1 : 0));
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
		{isActive: overlay === null},
	);

	// Frame geometry: one row for Ink's trailing newline, top bar, bottom bar.
	const frameRows = Math.max(10, rows - 1);
	const mainHeight = frameRows - 2;
	const contentHeight = mainHeight - 1 - (narrow ? 1 : 0);
	const groupOf = (app: ProjectInfo) =>
		workspaceRoot ? appGroup(workspaceRoot, app.root) : '.';
	const appName = localizedText(project.manifest.name) || project.manifest.id;
	const contextLabel = workspaceRoot
		? `workspace ▸ ${path.relative(workspaceRoot, project.root)} ▸ ${tab}`
		: `${appName} ▸ ${tab}`;

	const hints: Hint[] = overlay
		? [{key: 'Esc', label: 'cancel'}]
		: tab === 'versions'
			? [
					{key: 'a', label: 'activate'},
					{key: 'R', label: 'refresh'},
					{key: 'p', label: 'deploy'},
					{key: '/', label: 'commands'},
					{key: 'q', label: 'quit'},
				]
			: tab === 'log'
				? [
						{key: 'f', label: 'follow'},
						{key: 'x', label: 'wrap'},
						{key: 'K', label: 'stop'},
						{key: 'p', label: 'deploy'},
						{key: '/', label: 'commands'},
						{key: 'q', label: 'quit'},
					]
				: tab === 'config'
					? [
							{key: 'e', label: 'edit'},
							{key: 'y', label: 'sync'},
							{key: 'l', label: 'login'},
							{key: '/', label: 'commands'},
							{key: 'q', label: 'quit'},
						]
					: [
							{key: 'd', label: 'dev'},
							{key: 'w', label: 'watch'},
							{key: 'b', label: 'build'},
							{key: 's', label: 'sign'},
							{key: 'p', label: 'deploy'},
							{key: 'a', label: 'activate'},
							{key: '/', label: 'commands'},
							{key: 'q', label: 'quit'},
						];

	const right =
		running.length > 0 ? (
			<Text>
				<Text color={ACCENT}>
					<Spinner type="dots" />
				</Text>{' '}
				{running[0]!.label} {running[0]!.appName}
				{running.length > 1 && <Text dimColor> · {running.length} tasks</Text>}
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
			<Text dimColor>idle</Text>
		);

	const closeOverlay = () => setOverlay(null);
	const content = overlay ? (
		renderOverlay(overlay, {
			project,
			closeOverlay,
			run,
			reload,
			notify,
			height: contentHeight,
		})
	) : (
		<>
			{tab === 'overview' && (
				<Overview project={project} tasks={tasks} height={contentHeight} />
			)}
			{tab === 'config' && <Config project={project} />}
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
					/>
				)}
				<Box
					flexDirection="column"
					width={narrow ? columns : columns - NAV_WIDTH}
					overflow="hidden"
				>
					{narrow && !single && (
						<NavigatorStrip
							apps={apps}
							selected={selected}
							focused={focus === 'nav'}
						/>
					)}
					<TabBar tab={tab} narrow={narrow} focused={focus === 'content'} />
					<Box height={contentHeight} overflow="hidden">
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
		reload: () => void;
		notify: (text: string, level?: 'info' | 'ok' | 'warn' | 'error') => void;
		height: number;
	},
) {
	const {project, closeOverlay, run, reload, notify, height} = env;
	const done = () => {
		closeOverlay();
		reload();
	};

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
		case 'form':
			if (overlay.form === 'signing') {
				return (
					<SigningPropertiesForm
						projectRoot={project.root}
						onComplete={done}
						onCancel={closeOverlay}
					/>
				);
			}

			return (
				<DevPropertiesForm
					projectRoot={project.root}
					initialProperties={project.devProperties}
					packageJson={project.packageJson}
					authOnly={overlay.form === 'auth-method'}
					onComplete={done}
					onCancel={closeOverlay}
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
			<Text dimColor>y confirm · n cancel</Text>
		</Box>
	);
}
