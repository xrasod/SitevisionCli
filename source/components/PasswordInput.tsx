import {useState} from 'react';
import {Box, Text, useInput} from 'ink';

interface Props {
	label?: string;
	showRememberOption?: boolean;
	onSubmit: (password: string, remember: boolean) => void;
	onCancel: () => void;
}

export function PasswordInput({
	label = 'Enter Signing Password',
	showRememberOption = false,
	onSubmit,
	onCancel,
}: Props) {
	const [password, setPassword] = useState('');
	const [remember, setRemember] = useState(false);

	useInput((input, key) => {
		if (key.return) {
			onSubmit(password, remember);
			return;
		}

		if (key.escape) {
			onCancel();
			return;
		}

		if (key.tab && showRememberOption) {
			setRemember(prev => !prev);
			return;
		}

		if (key.delete || key.backspace) {
			setPassword(prev => prev.slice(0, -1));
			return;
		}

		// Handle regular characters (including paste)
		if (!key.ctrl && !key.meta) {
			setPassword(prev => prev + input);
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{label}
				</Text>
			</Box>
			<Box borderStyle="round" borderColor="cyan" paddingX={1}>
				<Text>{'*'.repeat(password.length)}</Text>
			</Box>
			{showRememberOption && (
				<Box marginTop={1}>
					<Text dimColor>Save to OS keychain: </Text>
					<Text color={remember ? 'green' : 'gray'}>
						[{remember ? 'x' : ' '}]
					</Text>
					<Text dimColor> (Tab to toggle)</Text>
				</Box>
			)}
			<Box marginTop={1}>
				<Text dimColor>Press Enter to submit, Esc to cancel</Text>
			</Box>
		</Box>
	);
}
