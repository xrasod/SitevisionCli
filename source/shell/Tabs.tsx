import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {ProjectInfo} from '../types/index.js';
import {
	getAppType,
	getPackageJsonSyncChanges,
	localizedText,
} from '../utils/project-detection.js';
import {checkSitevisionScriptsCompatibility} from '../utils/sitevision-scripts-runner.js';
import {type Task, type LogLine} from '../utils/tasks.js';
import {type Executable} from '../utils/sitevision-api.js';
import {ACCENT, elapsed} from './Frame.js';
import {type Tab} from './actions.js';

export const TABS: {id: Tab; label: string; short: string}[] = [
	{id: 'overview', label: 'Overview', short: 'Ovw'},
	{id: 'config', label: 'Config', short: 'Cfg'},
	{id: 'versions', label: 'Versions', short: 'Ver'},
	{id: 'log', label: 'Log', short: 'Log'},
];

export function TabBar({
	tab,
	narrow,
	focused,
}: {
	tab: Tab;
	narrow: boolean;
	focused: boolean;
}) {
	return (
		<Box paddingX={1}>
			{TABS.map((t, i) => (
				<Text key={t.id}>
					<Text
						bold={t.id === tab}
						color={t.id === tab ? ACCENT : undefined}
						dimColor={t.id !== tab}
						underline={t.id === tab && focused}
					>
						{i + 1} {narrow ? t.short : t.label}
					</Text>
					{' '.repeat(3)}
				</Text>
			))}
		</Box>
	);
}

function Row({
	label,
	value,
	dim,
}: {
	label: string;
	value: string;
	dim?: string;
}) {
	return (
		<Text wrap="truncate">
			<Text dimColor>{label.padEnd(14)}</Text>
			{value}
			{dim && <Text dimColor> {dim}</Text>}
		</Text>
	);
}

const LEVEL_COLOR = {
	info: undefined,
	ok: 'green',
	warn: 'yellow',
	error: 'red',
} as const;

const STATUS_GLYPH = {
	running: <Spinner type="dots" />,
	success: <Text color="green">✓</Text>,
	error: <Text color="red">✗</Text>,
	stopped: <Text dimColor>■</Text>,
};

function time(ms: number, seconds = false) {
	const d = new Date(ms);
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	const ss = String(d.getSeconds()).padStart(2, '0');
	return seconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export function Overview({
	project,
	tasks,
	height,
}: {
	project: ProjectInfo;
	tasks: Task[];
	height: number;
}) {
	const dev = project.devProperties;
	const inherited = new Set(project.inheritedKeys);
	const src = (key: string) => (inherited.has(key) ? '↑ root' : undefined);
	const sync = dev ? getPackageJsonSyncChanges(project.root, dev).length : 0;
	const scripts = checkSitevisionScriptsCompatibility(project.root);
	const recent = tasks
		.filter(t => t.appRoot === project.root && t.status !== 'running')
		.slice(-Math.max(1, height - 18))
		.toReversed();

	const status = (
		ok: boolean,
		okText: string,
		badText: string,
		warn = false,
	) => (
		<Text>
			<Text color={ok ? 'green' : warn ? 'yellow' : 'red'}>
				{ok ? '✓' : warn ? '~' : '✗'}
			</Text>{' '}
			{ok ? okText : badText}
		</Text>
	);

	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden">
			<Text bold>
				{localizedText(project.manifest.name) || project.manifest.id}{' '}
				<Text dimColor>
					{project.manifest.type}
					{project.manifest.bundled ? ' · bundled' : ''}
				</Text>
			</Text>
			<Row label="id" value={project.manifest.id} />
			<Row label="version" value={project.manifest.version} />
			<Row
				label="type"
				value={`${project.manifest.type} (${getAppType(project.manifest)})`}
			/>
			<Row
				label="addon"
				value={dev?.addonName ?? 'not set'}
				dim={src('addonName')}
			/>
			<Row
				label="site"
				value={dev?.siteName ?? 'not set'}
				dim={src('siteName')}
			/>
			<Row
				label="domain"
				value={dev?.domain ?? 'not set'}
				dim={src('domain')}
			/>
			<Row
				label="auth"
				value={dev?.authMethod ?? (dev ? 'basic' : 'not set')}
				dim={src('authMethod')}
			/>
			<Row
				label="signing user"
				value={dev?.signingUsername ?? 'not set'}
				dim={src('signingUsername')}
			/>
			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					{'deps    '}
					{status(
						project.hasNodeModules,
						'node_modules',
						'missing · run install',
					)}
				</Text>
				<Text dimColor>
					{'config  '}
					{status(Boolean(dev), 'dev properties', 'missing · e to edit')}
				</Text>
				<Text dimColor>
					{'sync    '}
					{status(
						sync === 0,
						'package.json',
						`${sync} diff${sync === 1 ? '' : 's'} · y to apply`,
						true,
					)}
				</Text>
				<Text dimColor>
					{'signing '}
					{status(
						project.hasSigningProperties,
						dev?.signingUsername ?? '',
						'missing · / set up signing',
					)}
				</Text>
				<Text dimColor>
					{'scripts '}
					{status(
						scripts.status === 'ok',
						scripts.installed ?? '',
						scripts.installed
							? `${scripts.installed} · ${scripts.status}`
							: 'not installed',
						scripts.status !== 'not-installed',
					)}
				</Text>
				{project.hasLegacyPassword && (
					<Text color="yellow">
						{' '.repeat(8)}⚠ plaintext password in .dev_properties.json · /
						migrate
					</Text>
				)}
			</Box>
			{recent.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text bold dimColor>
						RECENT
					</Text>
					{recent.map(t => (
						<Text key={t.id} wrap="truncate">
							<Text dimColor>{time(t.endedAt ?? t.startedAt)} </Text>
							{STATUS_GLYPH[t.status]} {t.label}{' '}
							<Text dimColor>{t.error ?? elapsed(t)}</Text>
						</Text>
					))}
				</Box>
			)}
		</Box>
	);
}

export interface VersionsState {
	loading: boolean;
	executables?: Executable[];
	error?: string;
	fetchedAt?: number;
}

export function Versions({
	project,
	state,
	selected,
}: {
	project: ProjectInfo;
	state?: VersionsState;
	selected: number;
}) {
	if (!project.devProperties) {
		return (
			<Box paddingX={1}>
				<Text color="yellow">⚠ Configure dev properties first (e).</Text>
			</Box>
		);
	}

	if (!state) {
		return (
			<Box paddingX={1}>
				<Text dimColor>
					Press R to fetch versions from {project.devProperties.domain}.
				</Text>
			</Box>
		);
	}

	const list = state.executables ?? [];
	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden">
			<Text dimColor>
				{'APP IDENTIFIER'.padEnd(30)}
				{'VERSION'.padEnd(12)}ACTIVE
				{state.loading && (
					<Text color={ACCENT}>
						{' '.repeat(3)}
						<Spinner type="dots" />
					</Text>
				)}
			</Text>
			{state.error && <Text color="red">{state.error}</Text>}
			{list.map((e, i) => (
				<Text
					key={e.id}
					backgroundColor={i === selected ? ACCENT : undefined}
					color={i === selected ? 'black' : undefined}
					wrap="truncate"
				>
					{e.appIdentifier.padEnd(30).slice(0, 30)}
					{e.appVersion.padEnd(12)}
					{e.active ? '●' : '○'}
					{i === selected ? ` ${e.id}` : ''}
				</Text>
			))}
			{!state.loading && !state.error && list.length === 0 && (
				<Text dimColor>
					No versions uploaded to {project.devProperties.addonName}.
				</Text>
			)}
			<Box marginTop={1}>
				<Text dimColor>
					{list.length} version{list.length === 1 ? '' : 's'} · a activate
					selected · R refresh
					{state.fetchedAt ? ` · fetched ${time(state.fetchedAt)}` : ''}
				</Text>
			</Box>
		</Box>
	);
}

export function Log({
	task,
	height,
	scroll,
	wrap,
}: {
	task?: Task;
	height: number;
	scroll: number;
	wrap: boolean;
}) {
	if (!task) {
		return (
			<Box paddingX={1}>
				<Text dimColor>
					No task yet. d dev · w watch · b build · s sign · p deploy
				</Text>
			</Box>
		);
	}

	const visible = Math.max(1, height - 2);
	const end = Math.max(0, task.lines.length - scroll);
	const lines: LogLine[] = task.lines.slice(Math.max(0, end - visible), end);
	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden">
			<Text>
				{STATUS_GLYPH[task.status]} {task.label} {task.appName}{' '}
				<Text dimColor>
					{task.phase} · {elapsed(task)}
					{scroll > 0 ? ` · ↑${scroll}` : ' · following'}
				</Text>
			</Text>
			{lines.map((line, i) => (
				<Text
					key={i}
					wrap={wrap ? 'wrap' : 'truncate'}
					color={LEVEL_COLOR[line.level]}
				>
					<Text dimColor>
						{time(line.time, true)} {line.tag.padEnd(3)}
					</Text>{' '}
					{line.text}
				</Text>
			))}
		</Box>
	);
}
