import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {getSettings, setSettings, settingsFile} from '../utils/config.js';
import {
	LANGUAGES,
	LANGUAGE_NAMES,
	setLanguage,
	t,
	type Language,
} from '../utils/i18n.js';
import {ACCENT} from './Frame.js';

interface Row {
	key: 'language' | 'introAnimation';
	label: string;
	options: string[];
	display: (value: string) => string;
}

const ROWS: Row[] = [
	{
		key: 'language',
		label: 'Language',
		options: LANGUAGES,
		display: value => LANGUAGE_NAMES[value as Language],
	},
	{
		key: 'introAnimation',
		label: 'Intro animation',
		options: ['on', 'off'],
		display: value => t(value),
	},
];

/** Global preferences, saved per field like the Config tab. */
export function SettingsScreen({
	onChanged,
	onClose,
	onOpenWorkspace,
}: {
	onChanged: () => void;
	onClose: () => void;
	// Workspace mode: jump to the shared root config from here.
	onOpenWorkspace?: () => void;
}) {
	const [values, setValues] = useState(() => {
		const s = getSettings();
		return {
			language: s.language,
			introAnimation: s.introAnimation ? 'on' : 'off',
		};
	});
	const [cursor, setCursor] = useState(0);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [note, setNote] = useState('');
	const rowCount = ROWS.length + (onOpenWorkspace ? 1 : 0);
	const onWorkspaceRow = cursor === ROWS.length;
	const current = ROWS[Math.min(cursor, ROWS.length - 1)]!;

	const commit = (value: string) => {
		const next = {...values, [current.key]: value};
		setValues(next);
		if (current.key === 'language') setLanguage(value as Language);
		setSettings({
			language: next.language as Language,
			introAnimation: next.introAnimation === 'on',
		});
		setNote(t('Saved.'));
		onChanged();
	};

	useInput((input, key) => {
		if (editing) {
			if (key.escape) {
				setEditing(false);
			} else if (key.return) {
				setEditing(false);
				if (draft !== values[current.key]) commit(draft);
			} else {
				const step =
					key.leftArrow || key.upArrow
						? -1
						: key.rightArrow || key.downArrow || input === ' '
							? 1
							: 0;
				if (step !== 0) {
					const i = current.options.indexOf(draft);
					const n = current.options.length;
					setDraft(current.options[(i + step + n) % n]!);
				}
			}

			return;
		}

		if (key.escape) onClose();
		else if (key.downArrow || key.tab) setCursor(c => (c + 1) % rowCount);
		else if (key.upArrow) setCursor(c => (c - 1 + rowCount) % rowCount);
		else if (key.return) {
			if (onWorkspaceRow) {
				onOpenWorkspace?.();
				return;
			}

			setDraft(values[current.key]);
			setEditing(true);
		}
	});

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={ACCENT}
			paddingX={1}
			width={64}
		>
			<Text>
				<Text bold>{t('Settings')}</Text>
				<Text dimColor> · {t('stored in {file}', {file: settingsFile()})}</Text>
			</Text>
			{ROWS.map((row, i) => {
				const focused = i === cursor && !onWorkspaceRow;
				const typing = focused && editing;
				const chosen = typing ? draft : values[row.key];
				return (
					<Box key={row.key} height={1}>
						<Text
							color={focused ? ACCENT : undefined}
							bold={focused}
							dimColor={!focused}
						>
							{(focused ? '▸ ' : '  ') + t(row.label).padEnd(18)}
						</Text>
						<Text>
							{row.options.map((option, j) => (
								<Text key={option}>
									<Text
										bold={option === chosen}
										color={option === chosen ? ACCENT : undefined}
										inverse={typing && option === chosen}
										dimColor={option !== chosen}
									>
										{row.display(option)}
									</Text>
									{j < row.options.length - 1 && <Text dimColor> · </Text>}
								</Text>
							))}
						</Text>
					</Box>
				);
			})}
			{onOpenWorkspace && (
				<Box height={1}>
					<Text
						color={onWorkspaceRow ? ACCENT : undefined}
						bold={onWorkspaceRow}
						dimColor={!onWorkspaceRow}
					>
						{(onWorkspaceRow ? '▸ ' : '  ') + t('Workspace config').padEnd(18)}
					</Text>
					<Text dimColor>{t('shared auth and site config for every app')}</Text>
				</Box>
			)}
			<Text color="yellow">{note}</Text>
			<Text dimColor>
				{editing
					? t('←→ choose · Enter confirm · Esc cancel')
					: t('↑↓ setting · Enter edit · Esc close')}
			</Text>
		</Box>
	);
}
