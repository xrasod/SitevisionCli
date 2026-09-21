import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	configProblem,
	getGlobalSigning,
	getSettings,
	setGlobalSigning,
	setSettings,
	settingsFile,
} from '../utils/config.js';
import {
	LANGUAGES,
	LANGUAGE_NAMES,
	setLanguage,
	t,
	type Language,
} from '../utils/i18n.js';
import {ACCENT} from './Frame.js';

interface Row {
	key:
		| 'language'
		| 'introAnimation'
		| 'updateCheck'
		| 'addonNameDriftWarning'
		| 'signingUsername'
		| 'certificateName';
	label: string;
	help: string;
	// Empty for a free-text row.
	options: string[];
	display: (value: string) => string;
}

const ROWS: Row[] = [
	{
		key: 'language',
		label: 'Language',
		help: 'The language svc itself speaks.',
		options: LANGUAGES,
		display: value => LANGUAGE_NAMES[value as Language],
	},
	{
		key: 'introAnimation',
		label: 'Intro animation',
		help: 'Play the logo animation when the shell starts.',
		options: ['on', 'off'],
		display: value => t(value),
	},
	{
		key: 'updateCheck',
		label: 'Update check',
		help: 'Look for a newer svc on npm at start.',
		options: ['on', 'off'],
		display: value => t(value),
	},
	{
		key: 'addonNameDriftWarning',
		label: 'Addon name warning',
		help: 'Mark the addon name with ≠ manifest when it is none of the names in manifest.json.',
		options: ['on', 'off'],
		display: value => t(value),
	},
	{
		key: 'signingUsername',
		label: 'Default signing user',
		help: 'The developer.sitevision.se account that signs in every project without a signing user of its own.',
		options: [],
		display: value => value,
	},
	{
		key: 'certificateName',
		label: 'Default certificate',
		help: 'Which certificate signs when the account has several. Empty = the account default.',
		options: [],
		display: value => value,
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
		const signing = getGlobalSigning();
		return {
			language: s.language,
			introAnimation: s.introAnimation ? 'on' : 'off',
			updateCheck: s.updateCheck ? 'on' : 'off',
			addonNameDriftWarning: s.addonNameDriftWarning ? 'on' : 'off',
			signingUsername: signing.signingUsername ?? '',
			certificateName: signing.certificateName ?? '',
		};
	});
	const [cursor, setCursor] = useState(0);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [note, setNote] = useState(() =>
		configProblem()
			? t('The settings file does not parse and is ignored until it is fixed.')
			: '',
	);
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
			updateCheck: next.updateCheck === 'on',
			addonNameDriftWarning: next.addonNameDriftWarning === 'on',
		});
		setGlobalSigning({
			signingUsername: next.signingUsername.trim() || undefined,
			certificateName: next.certificateName.trim() || undefined,
		});
		setNote(
			configProblem()
				? t('Not saved: the settings file does not parse.')
				: t('Saved.'),
		);
		onChanged();
	};

	useInput((input, key) => {
		if (editing) {
			if (key.escape) {
				setEditing(false);
			} else if (key.return) {
				setEditing(false);
				if (draft !== values[current.key]) commit(draft);
			} else if (current.options.length === 0) {
				if (key.backspace || key.delete) setDraft(d => d.slice(0, -1));
				else if (input && !key.ctrl && !key.meta) setDraft(d => d + input);
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
		<Box flexDirection="column" paddingX={1}>
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
							{(focused ? '▸ ' : '  ') + t(row.label).padEnd(24)}
						</Text>
						{row.options.length === 0 && (
							<Text dimColor={!typing && !chosen}>
								{chosen || (typing ? '' : t('not set'))}
								{typing && <Text inverse> </Text>}
							</Text>
						)}
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
						{(onWorkspaceRow ? '▸ ' : '  ') + t('Workspace config').padEnd(24)}
					</Text>
					<Text dimColor>{t('shared auth and site config for every app')}</Text>
				</Box>
			)}
			<Box marginTop={1} paddingLeft={2}>
				<Text dimColor italic>
					{onWorkspaceRow ? ' ' : t(current.help)}
				</Text>
			</Box>
			<Text color="yellow">{note}</Text>
			<Text dimColor>
				{editing
					? current.options.length === 0
						? t('Enter confirm · Esc cancel')
						: t('←→ choose · Enter confirm · Esc cancel')
					: t('↑↓ setting · Enter edit · Esc close')}
			</Text>
		</Box>
	);
}
