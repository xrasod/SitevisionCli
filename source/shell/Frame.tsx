import {type ReactNode} from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {ProjectInfo} from '../types/index.js';
import {
	getAppType,
	getPackageJsonSyncChanges,
	localizedText,
} from '../utils/project-detection.js';
import {type Task} from '../utils/tasks.js';

export const ACCENT = 'cyan';
export const NAV_WIDTH = 32;
// Row: marker(1) glyph(3) sp name sp version(6) sp dots(4) inside NAV_WIDTH - 2.
const NAME_WIDTH = NAV_WIDTH - 2 - 17;
export const NARROW_BELOW = 100;

export interface TopBarProps {
	context: string;
	domain?: string;
	auth: {ready: boolean; label: string};
	version: string;
}

export function TopBar({context, domain, auth, version}: TopBarProps) {
	return (
		<Box paddingX={1} justifyContent="space-between" height={1}>
			<Box flexShrink={1} marginRight={2}>
				<Text wrap="truncate">
					<Text bold color={ACCENT}>
						svc
					</Text>
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

export const TYPE_GLYPH = {web: 'web', widget: 'wgt', rest: 'rst'} as const;

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

export interface NavigatorProps {
	apps: ProjectInfo[];
	groupOf: (app: ProjectInfo) => string;
	selected: number;
	focused: boolean;
	tasks: Task[];
	height: number;
	single: boolean;
}

export function Navigator({
	apps,
	groupOf,
	selected,
	focused,
	tasks,
	height,
	single,
}: NavigatorProps) {
	const rows: ReactNode[] = [];
	let lastGroup: string | undefined;
	for (const [index, app] of apps.entries()) {
		const group = groupOf(app);
		if (!single && group !== lastGroup) {
			rows.push(
				<Text key={`g-${group}`} dimColor>
					{'  '}
					{group}
				</Text>,
			);
			lastGroup = group;
		}

		const active = index === selected;
		const running = tasks.some(
			t => t.appRoot === app.root && t.status === 'running',
		);
		const name = localizedText(app.manifest.name) || app.manifest.id;
		rows.push(
			<Box key={app.root} width={NAV_WIDTH - 2} height={1}>
				<Text
					backgroundColor={active && focused ? ACCENT : undefined}
					color={active && focused ? 'black' : undefined}
					bold={active}
					wrap="truncate"
				>
					{active ? '▎' : ' '}
					<Text dimColor={!active}>
						{TYPE_GLYPH[getAppType(app.manifest)]}
					</Text>{' '}
					{name.padEnd(NAME_WIDTH).slice(0, NAME_WIDTH)}{' '}
					<Text dimColor>
						{app.manifest.version.padStart(6).slice(0, 6)}
					</Text>{' '}
				</Text>
				{running ? (
					<Text color={ACCENT}>
						<Spinner type="dots" />
					</Text>
				) : (
					<Dots project={app} />
				)}
			</Box>,
		);
	}

	const running = tasks.filter(t => t.status === 'running');
	return (
		<Box
			flexDirection="column"
			width={NAV_WIDTH}
			height={height}
			borderStyle="single"
			borderDimColor
			borderTop={false}
			borderBottom={false}
			borderLeft={false}
			paddingX={1}
			overflow="hidden"
		>
			<Text bold dimColor>
				{single
					? 'APP'
					: `WORKSPACE ${apps.length} app${apps.length === 1 ? '' : 's'}`}
			</Text>
			{rows}
			<Text dimColor>{'  deps·config·sync·signing'}</Text>
			{running.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold dimColor>
						TASKS
					</Text>
					{running.map(t => (
						<Text key={t.id} wrap="truncate">
							<Text color={ACCENT}>
								<Spinner type="dots" />
							</Text>{' '}
							{t.label} {t.appName} <Text dimColor>{elapsed(t)}</Text>
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
						{TYPE_GLYPH[getAppType(app.manifest)]}{' '}
						{localizedText(app.manifest.name) || app.manifest.id}{' '}
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
