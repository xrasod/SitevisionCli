import {type ReactNode} from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {ProjectInfo} from '../types/index.js';
import {
	appTypeOf,
	getPackageJsonSyncChanges,
	localizedText,
} from '../utils/project-detection.js';
import {type Task} from '../utils/tasks.js';
import {fuzzyMatch} from './actions.js';
import {t} from '../utils/i18n.js';

export const ACCENT = 'cyan';
export const NARROW_BELOW = 100;

/** Navigator width for a terminal: a quarter of the columns, within 32..48. */
export function navWidth(columns: number): number {
	return Math.min(48, Math.max(32, Math.floor(columns / 4)));
}
export interface TopBarProps {
	context: string;
	domain?: string;
	auth: {ready: boolean; label: string};
	version: string;
	// Active environment badge; colour says how careful to be.
	environment?: {name: string; color: 'green' | 'yellow' | 'red'};
}

export function TopBar({
	context,
	domain,
	auth,
	version,
	environment,
}: TopBarProps) {
	return (
		<Box paddingX={1} justifyContent="space-between" height={1}>
			<Box flexShrink={1} marginRight={2}>
				<Text wrap="truncate">
					<Text bold color={ACCENT}>
						svc
					</Text>
					{environment && (
						<Text>
							{' '}
							<Text backgroundColor={environment.color} color="black" bold>
								{` ${environment.name.toUpperCase()} `}
							</Text>
						</Text>
					)}
					<Text dimColor> {context}</Text>
				</Text>
			</Box>
			<Box flexShrink={0}>
				<Text wrap="truncate">
					{domain && <Text dimColor>{domain} </Text>}
					<Text color={auth.ready ? 'green' : 'yellow'}>
						{auth.ready ? '●' : '○'}
					</Text>
					<Text> {auth.label} </Text>
					<Text dimColor>v{version}</Text>
				</Text>
			</Box>
		</Box>
	);
}

const TYPE_GLYPH = {
	web: 'web',
	widget: 'wgt',
	rest: 'rst',
	mcp: 'mcp',
} as const;

/** Three-letter type marker; unknown manifest types show as "???". */
export function typeGlyph(manifest: ProjectInfo['manifest']): string {
	const type = appTypeOf(manifest);
	return type ? TYPE_GLYPH[type] : '???';
}

export function appStatus(project: ProjectInfo) {
	const sync = project.devProperties
		? getPackageJsonSyncChanges(project.root, project.devProperties).length
		: 0;
	return {
		deps: project.hasNodeModules,
		config: Boolean(project.devProperties),
		sync,
		signing: project.hasSigningProperties,
		scriptsWarning: undefined as string | undefined,
	};
}

function Dots({project}: {project: ProjectInfo}) {
	const s = appStatus(project);
	const dot = (ok: boolean, warn = false) => (
		<Text color={ok ? 'green' : warn ? 'yellow' : 'red'}>●</Text>
	);
	return (
		<Text>
			{dot(s.deps)}
			{dot(s.config)}
			{dot(s.sync === 0, s.sync > 0)}
			{dot(s.signing, !s.signing)}
		</Text>
	);
}

/** The name shown for an app in the navigator, and what the filter matches. */
export function appLabel(app: ProjectInfo): string {
	return localizedText(app.manifest.name) || app.manifest.id;
}

/** Indices into `apps` whose label fuzzy-matches the filter. */
export function navMatches(apps: ProjectInfo[], filter: string): number[] {
	return apps
		.map((_, index) => index)
		.filter(index => fuzzyMatch(filter, appLabel(apps[index]!)));
}

/** Next selectable index when moving by `delta`, wrapping at both ends. */
export function navMove(
	ring: number[],
	selected: number,
	delta: number,
): number {
	if (ring.length === 0) return selected;
	const at = ring.indexOf(selected);
	return ring[at === -1 ? 0 : (at + delta + ring.length) % ring.length]!;
}

export interface NavigatorProps {
	apps: ProjectInfo[];
	groupOf: (app: ProjectInfo) => string;
	selected: number;
	focused: boolean;
	tasks: Task[];
	height: number;
	single: boolean;
	// Workspace mode: `selected === apps.length` highlights the settings row.
	settingsSelected?: boolean;
	width: number;
	// Typed search; when set the header becomes the query line.
	filter?: string;
}

export function Navigator({
	apps,
	groupOf,
	selected,
	focused,
	tasks,
	height,
	single,
	settingsSelected = false,
	width,
	filter = '',
}: NavigatorProps) {
	// Row: marker(1) glyph(3) sp name sp version(6) sp dots(4) inside the padding.
	const nameWidth = width - 2 - 17;
	const running = tasks.filter(task => task.status === 'running');
	// Every row is exactly one line; nothing may shrink or the rows overlap.
	const rows: ReactNode[] = [];
	const rowApp: number[] = [];
	let lastGroup: string | undefined;
	for (const [index, app] of apps.entries()) {
		const group = groupOf(app);
		if (!single && group !== lastGroup) {
			rows.push(
				<Box key={`g-${index}-${group}`} height={1} flexShrink={0}>
					<Text dimColor wrap="truncate">
						{'  '}
						{group}
					</Text>
				</Box>,
			);
			rowApp.push(-1);
			lastGroup = group;
		}

		rowApp.push(index);

		const active = index === selected;
		const busy = running.some(task => task.appRoot === app.root);
		const name = appLabel(app);
		rows.push(
			<Box key={app.root} width={width - 2} height={1} flexShrink={0}>
				<Text
					backgroundColor={active && focused ? ACCENT : undefined}
					color={active && focused ? 'black' : undefined}
					bold={active}
					wrap="truncate"
				>
					{active ? '▎' : ' '}
					<Text dimColor={!active}>{typeGlyph(app.manifest)}</Text>{' '}
					{name.padEnd(nameWidth).slice(0, nameWidth)}{' '}
					<Text dimColor>
						{app.manifest.version.padStart(6).slice(0, 6)}
					</Text>{' '}
				</Text>
				{busy ? (
					<Text color={ACCENT}>
						<Spinner type="dots" />
					</Text>
				) : (
					<Dots project={app} />
				)}
			</Box>,
		);
	}

	if (rows.length === 0) {
		rows.push(
			<Box key="none" height={1} flexShrink={0}>
				<Text dimColor>{'  ' + t('no matches')}</Text>
			</Box>,
		);
		rowApp.push(-1);
	}

	// Window the list so the selected app stays visible; the lines outside
	// are summarised as "… n more".
	const fixed =
		1 + 1 + (single ? 0 : 2) + (running.length > 0 ? running.length + 2 : 0);
	const avail = Math.max(3, height - fixed);
	let shown = rows;
	if (rows.length > avail) {
		const target = settingsSelected
			? rows.length - 1
			: rowApp.indexOf(selected);
		const start = Math.max(
			0,
			Math.min(target - Math.floor(avail / 2), rows.length - avail),
		);
		const end = start + avail;
		shown = rows.slice(start, end);
		const more = (n: number, arrow: string) => (
			<Box key={`more-${arrow}`} height={1} flexShrink={0}>
				<Text dimColor>
					{'  '}
					{t('{arrow} {n} more', {arrow, n})}
				</Text>
			</Box>
		);
		if (start > 0) shown[0] = more(start, '↑');
		if (end < rows.length)
			shown[shown.length - 1] = more(rows.length - end, '↓');
	}

	return (
		<Box
			flexDirection="column"
			width={width}
			height={height}
			borderStyle="single"
			borderDimColor
			borderTop={false}
			borderBottom={false}
			borderLeft={false}
			paddingX={1}
			overflow="hidden"
		>
			{filter ? (
				<Text wrap="truncate">
					<Text color={ACCENT}>❯ </Text>
					{filter}
					<Text inverse> </Text>
					<Text dimColor>
						{' '}
						{apps.length === 1
							? t('1 match')
							: t('{n} matches', {n: apps.length})}
					</Text>
				</Text>
			) : (
				<Text bold dimColor>
					{single
						? t('APP')
						: apps.length === 1
							? t('WORKSPACE 1 app')
							: t('WORKSPACE {n} apps', {n: apps.length})}
				</Text>
			)}
			{shown}
			<Text dimColor>{'  ' + t('deps·config·sync·signing')}</Text>
			{!single && (
				<Box marginTop={1}>
					<Text
						backgroundColor={settingsSelected && focused ? ACCENT : undefined}
						color={settingsSelected && focused ? 'black' : undefined}
						bold={settingsSelected}
					>
						{settingsSelected ? '▎' : ' '}⚙ {t('Workspace settings')}
					</Text>
				</Box>
			)}
			{running.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold dimColor>
						{t('TASKS')}
					</Text>
					{running.map(task => (
						<Text key={task.id} wrap="truncate">
							<Text color={ACCENT}>
								<Spinner type="dots" />
							</Text>{' '}
							{task.label} {task.appName} <Text dimColor>{elapsed(task)}</Text>
						</Text>
					))}
				</Box>
			)}
		</Box>
	);
}

export function NavigatorStrip({
	apps,
	selected,
	focused,
}: Pick<NavigatorProps, 'apps' | 'selected' | 'focused'>) {
	return (
		<Box paddingX={1}>
			<Text wrap="truncate">
				{apps.map((app, index) => (
					<Text
						key={app.root}
						backgroundColor={index === selected && focused ? ACCENT : undefined}
						color={index === selected && focused ? 'black' : undefined}
						bold={index === selected}
					>
						{' '}
						{typeGlyph(app.manifest)} {appLabel(app)}{' '}
					</Text>
				))}
			</Text>
		</Box>
	);
}

export function elapsed(task: Task): string {
	const ms = (task.endedAt ?? Date.now()) - task.startedAt;
	const s = Math.round(ms / 1000);
	return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export interface Hint {
	key: string;
	label: string;
}

export function BottomBar({hints, right}: {hints: Hint[]; right: ReactNode}) {
	return (
		<Box paddingX={1} justifyContent="space-between">
			<Text wrap="truncate">
				{hints.map(h => (
					<Text key={h.key + h.label}>
						<Text bold color={ACCENT}>
							{h.key}
						</Text>
						<Text dimColor> {h.label} </Text>
					</Text>
				))}
			</Text>
			{right}
		</Box>
	);
}
