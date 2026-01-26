import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

interface Props {
	label: string;
	defaultValue?: string;
	placeholder?: string;
	onSubmit: (value: string) => void;
	onCancel?: () => void;
	type?: 'text' | 'password';
}

export function TextInput({
	label,
	defaultValue = '',
	placeholder,
	onSubmit,
	onCancel,
	type = 'text',
}: Props) {
	const [value, setValue] = useState(defaultValue);

	useInput((input, key) => {
		if (key.return) {
			if (value === '' && defaultValue) {
				onSubmit(defaultValue);
			} else {
				onSubmit(value);
			}
			return;
		}

		if (key.escape && onCancel) {
			onCancel();
			return;
		}

		if (key.delete || key.backspace) {
			setValue((prev) => prev.slice(0, -1));
			return;
		}

		if (!key.ctrl && !key.meta) {
			setValue((prev) => prev + input);
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">{label}</Text>
			</Box>
			<Box borderStyle="round" borderColor="cyan" paddingX={1}>
				<Text>
					{type === 'password' ? '*'.repeat(value.length) : value}
				</Text>
				{value === '' && placeholder && (
					<Text dimColor>{placeholder}</Text>
				)}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to submit{onCancel ? ', Esc to cancel' : ''}</Text>
			</Box>
		</Box>
	);
}
