import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {t} from '../utils/i18n.js';

interface Props {
	label?: string;
	showRememberOption?: boolean;
	defaultRemember?: boolean;
	rememberLabel?: string;
	onSubmit: (password: string, remember: boolean) => void;
	onCancel: () => void;
}

export function PasswordInput({
	label = 'Enter Signing Password',
	showRememberOption = false,
	defaultRemember = false,
	rememberLabel = 'Save to OS keychain: ',
	onSubmit,
	onCancel,
}: Props) {
	const [password, setPassword] = useState('');
	const [remember, setRemember] = useState(defaultRemember);

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
					<Text dimColor>{rememberLabel}</Text>
					<Text color={remember ? 'green' : 'gray'}>
						[{remember ? 'x' : ' '}]
					</Text>
					<Text dimColor> {t('(Tab to toggle)')}</Text>
				</Box>
			)}
			<Box marginTop={1}>
				<Text dimColor>{t('Press Enter to submit, Esc to cancel')}</Text>
			</Box>
		</Box>
	);
}
