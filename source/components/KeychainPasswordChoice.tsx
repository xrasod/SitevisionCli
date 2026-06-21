import {useState} from 'react';
import {Box, Text, useInput} from 'ink';

interface Props {
	label?: string;
	onUseSaved: () => void;
	onEnterNew: () => void;
	onCancel: () => void;
}

const OPTIONS = [
	{label: 'Use saved password from keychain', value: 'saved'},
	{label: 'Enter a new password', value: 'new'},
];

export function KeychainPasswordChoice({
	label = 'A signing password is saved in your OS keychain.',
	onUseSaved,
	onEnterNew,
	onCancel,
}: Props) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	useInput((_input, key) => {
		if (key.upArrow) {
			setSelectedIndex(prev => (prev === 0 ? OPTIONS.length - 1 : prev - 1));
		} else if (key.downArrow) {
			setSelectedIndex(prev => (prev === OPTIONS.length - 1 ? 0 : prev + 1));
		} else if (key.return) {
			if (selectedIndex === 0) {
				onUseSaved();
			} else {
				onEnterNew();
			}
		} else if (key.escape) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{label}
				</Text>
			</Box>
			{OPTIONS.map((option, index) => (
				<Text
					key={option.value}
					color={index === selectedIndex ? 'green' : undefined}
				>
					{index === selectedIndex ? '❯ ' : '  '}
					{option.label}
				</Text>
			))}
			<Box marginTop={1}>
				<Text dimColor>↑/↓ to move, Enter to select, Esc to cancel</Text>
			</Box>
		</Box>
	);
}
