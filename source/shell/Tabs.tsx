import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {ProjectInfo} from '../types/index.js';
import {
	appTypeOf,
	getPackageJsonSyncChanges,
	localizedText,
} from '../utils/project-detection.js';
import {checkSitevisionScriptsCompatibility} from '../utils/sitevision-scripts-runner.js';
import {type Task, type LogLine} from '../utils/tasks.js';
import {type Executable} from '../utils/sitevision-api.js';
import {ACCENT, elapsed} from './Frame.js';
import {type Tab} from './actions.js';
import {t} from '../utils/i18n.js';

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
			{TABS.map((entry, i) => (
				<Text key={entry.id}>
					<Text
						bold={entry.id === tab}
						color={entry.id === tab ? ACCENT : undefined}
						dimColor={entry.id !== tab}
						underline={entry.id === tab && focused}
					>
						{i + 1} {t(narrow ? entry.short : entry.label)}
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
	const src = (key: string) => (inherited.has(key) ? t('↑ root') : undefined);
	const notSet = t('not set');
	const sync = dev ? getPackageJsonSyncChanges(project.root, dev).length : 0;
	const scripts = checkSitevisionScriptsCompatibility(project.root);
	const recent = tasks
		.filter(task => task.appRoot === project.root && task.status !== 'running')
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
					{project.manifest.bundled ? t(' · bundled') : ''}
				</Text>
			</Text>
			<Row label={t('id')} value={project.manifest.id} />
			<Row label={t('version')} value={project.manifest.version} />
			<Row
				label={t('type')}
				value={`${project.manifest.type} (${appTypeOf(project.manifest) ?? '?'})`}
			/>
			<Row
				label={t('addon')}
				value={dev?.addonName ?? notSet}
				dim={src('addonName')}
			/>
			<Row
				label={t('site')}
				value={dev?.siteName ?? notSet}
				dim={src('siteName')}
			/>
			<Row
				label={t('domain')}
				value={dev?.domain ?? notSet}
				dim={src('domain')}
			/>
			<Row
				label={t('auth')}
				value={dev?.authMethod ?? (dev ? 'basic' : notSet)}
				dim={src('authMethod')}
			/>
			<Row
				label={t('signing user')}
				value={dev?.signingUsername ?? notSet}
				dim={src('signingUsername')}
			/>
			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					{t('deps').padEnd(10)}
					{status(
						project.hasNodeModules,
						'node_modules',
						t('missing · run install'),
					)}
				</Text>
				<Text dimColor>
					{t('config').padEnd(10)}
					{status(Boolean(dev), t('dev properties'), t('missing · e to edit'))}
				</Text>
				<Text dimColor>
					{t('sync').padEnd(10)}
					{status(
						sync === 0,
						'package.json',
						sync === 1
							? t('1 diff · y to apply')
							: t('{n} diffs · y to apply', {n: sync}),
						true,
					)}
				</Text>
				<Text dimColor>
					{t('signing').padEnd(10)}
					{status(
						project.hasSigningProperties,
						dev?.signingUsername ?? '',
						t('missing · / set up signing'),
					)}
				</Text>
				<Text dimColor>
					{t('scripts').padEnd(10)}
					{status(
						scripts.status === 'ok',
						scripts.installed ?? '',
						scripts.installed
							? `${scripts.installed} · ${scripts.status}`
							: t('not installed'),
						scripts.status !== 'not-installed',
					)}
				</Text>
				{project.hasLegacyPassword && (
					<Text color="yellow">
						{' '.repeat(10)}
						{t('⚠ plaintext password in .dev_properties.json · / migrate')}
					</Text>
				)}
			</Box>
			{recent.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text bold dimColor>
						{t('RECENT')}
					</Text>
					{recent.map(task => (
						<Text key={task.id} wrap="truncate">
							<Text dimColor>{time(task.endedAt ?? task.startedAt)} </Text>
							{STATUS_GLYPH[task.status]} {task.label}{' '}
							<Text dimColor>{task.error ?? elapsed(task)}</Text>
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
				<Text color="yellow">{t('⚠ Configure dev properties first (e).')}</Text>
			</Box>
		);
	}

	if (!state) {
		return (
			<Box paddingX={1}>
				<Text dimColor>
					{t('Press R to fetch versions from {domain}.', {
						domain: project.devProperties.domain,
					})}
				</Text>
			</Box>
		);
	}

	const list = state.executables ?? [];
	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden">
			<Text dimColor>
				{t('APP IDENTIFIER').padEnd(30)}
				{t('VERSION').padEnd(12)}
				{t('ACTIVE')}
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
					{t('No versions uploaded to {addon}.', {
						addon: project.devProperties.addonName,
					})}
				</Text>
			)}
			<Box marginTop={1}>
				<Text dimColor>
					{list.length === 1
						? t('1 version · a activate selected · R refresh')
						: t('{n} versions · a activate selected · R refresh', {
								n: list.length,
							})}
					{state.fetchedAt
						? t(' · fetched {time}', {time: time(state.fetchedAt)})
						: ''}
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
					{t('No task yet. d dev · w watch · b build · s sign · p deploy')}
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
					{scroll > 0 ? ` · ↑${scroll}` : t(' · following')}
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
