import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import type {SimpleAppType} from '../types/index.js';
import {type AddonNode} from '../utils/sitevision-api.js';
import {ACCENT} from './Frame.js';
import {fuzzyMatch} from './actions.js';

export function AddonPicker({
	domain,
	appType,
	initialQuery,
	load,
	onSelect,
	onClose,
	height,
}: {
	domain: string;
	appType: SimpleAppType;
	initialQuery: string;
	load: () => Promise<{addons?: AddonNode[]; error?: string}>;
	onSelect: (name: string) => void;
	onClose: () => void;
	height: number;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [index, setIndex] = useState(0);
	const [addons, setAddons] = useState<AddonNode[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		void load().then(result => {
			setAddons(result.addons ?? []);
			setError(result.error ?? '');
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const matches = (addons ?? [])
		.filter(a => fuzzyMatch(query, a.name))
		.toSorted(
			(a, b) =>
				Number(b.appType === appType) - Number(a.appType === appType) ||
				a.name.localeCompare(b.name),
		);

	useInput((input, key) => {
		if (key.escape) {
			onClose();
		} else if (key.return) {
			const pick = matches[index];
			if (pick) onSelect(pick.name);
		} else if (key.upArrow) {
			setIndex(i => (i > 0 ? i - 1 : Math.max(0, matches.length - 1)));
		} else if (key.downArrow) {
			setIndex(i => (i < matches.length - 1 ? i + 1 : 0));
		} else if (key.backspace || key.delete) {
			setQuery(q => q.slice(0, -1));
			setIndex(0);
		} else if (input && !key.ctrl && !key.meta) {
			setQuery(q => q + input);
			setIndex(0);
		}
	});

	const visible = Math.max(3, height - 6);
	const start = Math.max(
		0,
		Math.min(index - visible + 1, matches.length - visible),
	);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={ACCENT}
			paddingX={1}
			width={64}
			height={Math.min(height, matches.length + 6)}
		>
			<Text>
				<Text bold>Addon Repository</Text>
				<Text dimColor> {domain}</Text>
			</Text>
			<Text>
				<Text color={ACCENT}>❯ </Text>
				{query}
				<Text inverse> </Text>
				<Text dimColor>
					{'  '}
					{addons ? `${matches.length} of ${addons.length}` : ''}
				</Text>
			</Text>
			{!addons && !error && (
				<Text color={ACCENT}>
					<Spinner type="dots" /> <Text dimColor>fetching addons</Text>
				</Text>
			)}
			{error && <Text color="red">{error}</Text>}
			{matches.slice(start, start + visible).map((a, i) => {
				const selected = start + i === index;
				return (
					<Box key={a.id} justifyContent="space-between">
						<Text
							backgroundColor={selected ? ACCENT : undefined}
							color={selected ? 'black' : undefined}
							wrap="truncate"
						>
							{'  '}
							{a.name}
						</Text>
						<Text dimColor>{a.appType ?? a.type}</Text>
					</Box>
				);
			})}
			<Text dimColor>↑↓ move · Enter select · Esc cancel</Text>
		</Box>
	);
}
