import {readFileSync} from 'node:fs';
import {useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {t} from '../utils/i18n.js';
import {ACCENT} from './Frame.js';

/**
 * CHANGELOG.md without its title, or undefined when it isn't shipped. `cutoff`
 * is the line where `since` (the version the user had) begins: everything
 * before it is new to them, everything from it on is shown dimmed for context.
 */
export function readChangelog(
	since?: string,
): {lines: string[]; cutoff: number} | undefined {
	try {
		const lines = readFileSync(
			new URL('../../CHANGELOG.md', import.meta.url),
			'utf8',
		)
			.replace(/^# .*\n/, '')
			.trim()
			.split('\n');
		const end = since ? lines.indexOf(`## ${since}`) : -1;
		return {lines, cutoff: end > 0 ? end : lines.length};
	} catch {
		return undefined;
	}
}

export function ChangelogPanel({
	since,
	height,
	onClose,
}: {
	since?: string;
	height: number;
	onClose: () => void;
}) {
	const changelog = useMemo(() => readChangelog(since), [since]);
	const lines = changelog?.lines;
	const cutoff = changelog?.cutoff ?? 0;
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
				<Text bold>
					{since
						? t("What's new since {version}", {version: since})
						: t('Changelog')}
				</Text>
				<Text dimColor> · {t('↑↓ scroll · Esc close')}</Text>
			</Text>
			{lines ? (
				lines.slice(top, top + visible).map((line, i) => {
					const old = top + i >= cutoff;
					return line.startsWith('## ') ? (
						<Text
							key={top + i}
							bold
							color={old ? undefined : ACCENT}
							dimColor={old}
						>
							{line.slice(3)}
						</Text>
					) : (
						<Text key={top + i} wrap="truncate" dimColor={old}>
							{line || ' '}
						</Text>
					);
				})
			) : (
				<Text dimColor>{t('No changelog found.')}</Text>
			)}
		</Box>
	);
}
