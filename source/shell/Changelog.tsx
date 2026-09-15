import {readFileSync} from 'node:fs';
import {useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {t} from '../utils/i18n.js';
import {ACCENT} from './Frame.js';

/** CHANGELOG.md without its title, or undefined when it isn't shipped. */
export function readChangelog(): string[] | undefined {
	try {
		return readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
			.replace(/^# .*\n/, '')
			.trim()
			.split('\n');
	} catch {
		return undefined;
	}
}

export function ChangelogPanel({
	height,
	onClose,
}: {
	height: number;
	onClose: () => void;
}) {
	const lines = useMemo(() => readChangelog(), []);
	const [top, setTop] = useState(0);
	const visible = Math.max(1, height - 1);
	const max = Math.max(0, (lines?.length ?? 0) - visible);

	useInput((input, key) => {
		if (key.escape || key.return || input === 'q') onClose();
		else if (key.upArrow) setTop(n => Math.max(0, n - 1));
		else if (key.downArrow) setTop(n => Math.min(max, n + 1));
		else if (key.pageUp) setTop(n => Math.max(0, n - visible));
		else if (key.pageDown) setTop(n => Math.min(max, n + visible));
	});

	return (
		<Box flexDirection="column" paddingX={1}>
			<Text>
				<Text bold>{t('Changelog')}</Text>
				<Text dimColor> · {t('↑↓ scroll · Esc close')}</Text>
			</Text>
			{lines ? (
				lines.slice(top, top + visible).map((line, i) =>
					line.startsWith('## ') ? (
						<Text key={top + i} bold color={ACCENT}>
							{line.slice(3)}
						</Text>
					) : (
						<Text key={top + i} wrap="truncate">
							{line || ' '}
						</Text>
					),
				)
			) : (
				<Text dimColor>{t('No changelog found.')}</Text>
			)}
		</Box>
	);
}
