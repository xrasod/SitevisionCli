import {Box, Text, useInput} from 'ink';
import {t} from '../utils/i18n.js';
import {ACCENT, type Hint} from './Frame.js';
import {actions} from './actions.js';
import {GROUPS} from './CommandPalette.js';

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
	height,
	onClose,
}: {
	here: Hint[];
	height: number;
	onClose: () => void;
}) {
	useInput((input, key) => {
		if (key.escape || key.return || input === '?' || input === 'q') onClose();
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
				<Text bold>{t('Keys')}</Text>
				<Text dimColor> · {t('Esc close')}</Text>
			</Text>
			<Box flexWrap="wrap" columnGap={4}>
				<Box flexDirection="column" marginTop={1}>
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
				<Box flexDirection="column" marginTop={1}>
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
	);
}
