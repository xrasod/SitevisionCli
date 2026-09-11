import {useState, type ReactNode} from 'react';
import {Box, Text, useInput} from 'ink';
import type {ProjectInfo} from '../types/index.js';
import {ACCENT} from './Frame.js';
import {actions, fuzzyMatch, type Action} from './actions.js';

const GROUPS: {id: Action['group']; label: string}[] = [
	{id: 'app', label: 'APP'},
	{id: 'setup', label: 'SETUP'},
	{id: 'auth', label: 'AUTH'},
];

export function CommandPalette({
	project,
	onRun,
	onClose,
	height,
}: {
	project: ProjectInfo;
	onRun: (action: Action) => void;
	onClose: () => void;
	height: number;
}) {
	const [query, setQuery] = useState('');
	const [index, setIndex] = useState(0);

	const matches = actions.filter(a => fuzzyMatch(query, a.label));
	const ordered = GROUPS.flatMap(g => matches.filter(a => a.group === g.id));

	useInput((input, key) => {
		if (key.escape) {
			onClose();
		} else if (key.return) {
			const action = ordered[index];
			if (action) onRun(action);
		} else if (key.upArrow) {
			setIndex(i => (i > 0 ? i - 1 : Math.max(0, ordered.length - 1)));
		} else if (key.downArrow) {
			setIndex(i => (i < ordered.length - 1 ? i + 1 : 0));
		} else if (key.backspace || key.delete) {
			setQuery(q => q.slice(0, -1));
			setIndex(0);
		} else if (!key.ctrl && !key.meta && input) {
			setQuery(q => q + input);
			setIndex(0);
		}
	});

	const visible = Math.max(3, height - 5);
	const start = Math.max(
		0,
		Math.min(index - visible + 1, ordered.length - visible),
	);
	const rows: ReactNode[] = [];
	let lastGroup: string | undefined;
	for (const [i, action] of ordered.entries()) {
		if (i < start || i >= start + visible) continue;
		if (action.group !== lastGroup) {
			rows.push(
				<Text key={`g-${action.group}`} bold dimColor>
					{GROUPS.find(g => g.id === action.group)!.label}
				</Text>,
			);
			lastGroup = action.group;
		}

		const enabled = action.enabled?.(project) ?? true;
		const detail = action.detail?.(project);
		rows.push(
			<Box key={action.id} justifyContent="space-between">
				<Text
					backgroundColor={i === index ? ACCENT : undefined}
					color={i === index ? 'black' : undefined}
					dimColor={!enabled && i !== index}
					wrap="truncate"
				>
					{'  '}
					{action.label}
					{detail && <Text dimColor={i !== index}> · {detail}</Text>}
				</Text>
				<Text bold color={ACCENT}>
					{action.key ?? '—'}
				</Text>
			</Box>,
		);
	}

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={ACCENT}
			paddingX={1}
			width={64}
		>
			<Text>
				<Text bold>Commands</Text>
				<Text dimColor> {project.manifest.id}</Text>
			</Text>
			<Text>
				<Text color={ACCENT}>❯ </Text>
				{query}
				<Text inverse> </Text>
				<Text dimColor> {ordered.length} actions</Text>
			</Text>
			{rows}
			<Text dimColor>type to filter · ↑↓ move · Enter run · Esc close</Text>
		</Box>
	);
}
