import {useEffect, useRef, useState} from 'react';
import {Box, Text, measureElement, useInput, type DOMElement} from 'ink';
import {t} from '../utils/i18n.js';
import {ACCENT, type Hint} from './Frame.js';
import {actions} from './actions.js';
import {GROUPS} from './CommandPalette.js';
import type {Tab} from './actions.js';

export type Where = Tab | 'nav' | 'workspace';

// What the pane you are in does, beyond the key list. One entry per paragraph.
const GUIDE: Record<Where, {title: string; text: string[]}> = {
	nav: {
		title: 'Navigator',
		text: [
			'Typing filters the app list. ↑↓ move, Enter selects the app and moves focus to the content pane. Action keys such as d or p only work there; in the navigator they search.',
			'The last row is Workspace settings: the shared root config that every app inherits.',
		],
	},
	workspace: {
		title: 'Workspace settings',
		text: [
			"The root .dev_properties.json shared by every app, with the root package.json defaults underneath. Fill in site, auth and environments once; an app's own config overrides only what differs.",
			'Same keys as the Config tab: Enter edits and saves, Esc cancels, ←→ or space cycles choices.',
		],
	},
	overview: {
		title: 'Overview',
		text: [
			'Each status line names the key that fixes it: i installs dependencies, e opens Config, y syncs package.json, / sets up signing.',
			'The badge in the top bar is the active environment: green for the base, yellow for others, red for production. v cycles it.',
		],
	},
	config: {
		title: 'Config',
		text: [
			'Values come in layers and the source is shown next to each: your local .dev_properties.json wins, shared package.json values sit underneath, and in a workspace the root config underneath that. Environments add on top of the base and override only what differs.',
			'Enter edits and saves a field, Esc cancels, ←→ or space cycles choices, Ctrl+O lists the addons on the site. y copies shared values into package.json for the team.',
			'Passwords and secrets go to the OS keychain, never to a file. Leave them empty to be asked on each run.',
		],
	},
	versions: {
		title: 'Versions',
		text: [
			"The versions uploaded to the addon on the active environment's site, the domain in the top bar. v switches environment.",
			'↑↓ select, a activates the selected version, r refreshes. A production deploy asks whether to activate.',
		],
	},
	log: {
		title: 'Log',
		text: [
			'Output from build, sign, deploy, dev and watch for the selected app. Dev and watch keep running while you switch apps; K stops them.',
			'↑↓ scroll, PgUp/PgDn page, f jumps to the end, x toggles line wrap.',
		],
	},
};

const MOVE: Array<[string, string]> = [
	['Tab', 'switch pane'],
	['1–4', 'tabs'],
	['←→', 'tabs'],
	['/', 'commands'],
	['?', 'help'],
	['Esc', 'back'],
];

function Row({keys, label}: {keys: string; label: string}) {
	return (
		<Text wrap="truncate">
			<Text bold color={ACCENT}>
				{keys.padEnd(6)}
			</Text>
			{label}
		</Text>
	);
}

export function HelpPanel({
	here,
	where,
	height,
	onClose,
}: {
	here: Hint[];
	where: Where;
	height: number;
	onClose: () => void;
}) {
	const inner = useRef<DOMElement>(null);
	const [top, setTop] = useState(0);
	const [total, setTotal] = useState(0);
	// The text depends on the pane and the language, both fixed while this is open.
	useEffect(() => {
		if (inner.current) setTotal(measureElement(inner.current).height);
	}, [here, where, height]);
	const visible = Math.max(1, height - 1);
	const max = Math.max(0, total - visible);

	useInput((input, key) => {
		if (key.escape || key.return || input === '?' || input === 'q') onClose();
		else if (key.upArrow) setTop(n => Math.max(0, n - 1));
		else if (key.downArrow) setTop(n => Math.min(max, n + 1));
		else if (key.pageUp) setTop(n => Math.max(0, n - visible));
		else if (key.pageDown) setTop(n => Math.min(max, n + visible));
	});
	// Only keys not already listed elsewhere, e.g. f and x on the Log tab.
	const local = here.filter(
		hint =>
			actions.every(action => action.key !== hint.key) &&
			MOVE.every(([keys]) => keys !== hint.key),
	);

	return (
		<Box flexDirection="column" paddingX={1} height={height} overflow="hidden">
			<Text>
				<Text bold>{t(GUIDE[where].title)}</Text>
				<Text dimColor>
					{' · '}
					{max > 0 ? t('↑↓ scroll · Esc close') : t('Esc close')}
				</Text>
			</Text>
			<Box flexDirection="column" overflow="hidden" height={visible}>
				<Box ref={inner} flexDirection="column" flexShrink={0} marginTop={-top}>
					{GUIDE[where].text.map(line => (
						<Text key={line} wrap="wrap">
							{t(line)}
						</Text>
					))}
					<Box marginTop={1}>
						<Text bold>{t('Keys')}</Text>
					</Box>
					<Box flexWrap="wrap" columnGap={4}>
						<Box flexDirection="column">
							{GROUPS.map(group => (
								<Box key={group.id} flexDirection="column">
									<Text bold dimColor>
										{t(group.label)}
									</Text>
									{actions.flatMap(action =>
										action.group === group.id && action.key
											? [
													<Row
														key={action.id}
														keys={action.key}
														label={t(action.label)}
													/>,
												]
											: [],
									)}
								</Box>
							))}
						</Box>
						<Box flexDirection="column">
							{local.length > 0 && (
								<Box flexDirection="column" marginBottom={1}>
									<Text bold dimColor>
										{t('Here')}
									</Text>
									{local.map(hint => (
										<Row
											key={hint.key + hint.label}
											keys={hint.key}
											label={hint.label}
										/>
									))}
								</Box>
							)}
							<Box flexDirection="column">
								<Text bold dimColor>
									{t('Move around')}
								</Text>
								{MOVE.map(([keys, label]) => (
									<Row key={keys + label} keys={keys} label={t(label)} />
								))}
							</Box>
						</Box>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
