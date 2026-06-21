import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type ProjectInfo} from '../utils/project-detection.js';
import {PasswordInput} from './PasswordInput.js';
import {
	getSigningPassword,
	setSigningPassword as saveSigningPassword,
} from '../utils/keychain.js';
import {LOGO, AUTHOR} from '../utils/branding.js';

interface Props {
	project: ProjectInfo;
	onComplete: () => void;
}

function Banner() {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{LOGO.map((line, index) => (
				<Text key={index} color="cyan">
					{line}
				</Text>
			))}
			<Box marginTop={1}>
				<Text dimColor>{'  a tool by '}</Text>
				<Text bold>{AUTHOR}</Text>
			</Box>
		</Box>
	);
}

type Step = 'prompt' | 'password' | 'done';

/**
 * First-run welcome screen. Shows the branding once and, when signing
 * credentials are configured but no password is stored yet, offers to save the
 * signing password to the OS keychain. If signing isn't set up, it just shows
 * the branding — the user can still save a signing password later (the regular
 * signing flow offers a "remember" option every time).
 */
export function WelcomeScreen({project, onComplete}: Props) {
	const signingUsername = project.devProperties?.signingUsername;
	const canSaveSigning =
		Boolean(signingUsername) && !getSigningPassword(signingUsername!);
	const [step, setStep] = useState<Step>('prompt');
	const [resultMessage, setResultMessage] = useState<string>('');

	useInput((input, key) => {
		if (step === 'prompt') {
			if (canSaveSigning && (input === 'y' || input === 'Y')) {
				setStep('password');
			} else if (input === 'n' || input === 'N' || key.return) {
				onComplete();
			}
		} else if (step === 'done') {
			onComplete();
		}
	});

	if (step === 'password') {
		return (
			<Box flexDirection="column" padding={1}>
				<Banner />
				<PasswordInput
					label="Enter Signing Password (developer.sitevision.se)"
					onSubmit={password => {
						if (password && signingUsername) {
							const saved = saveSigningPassword(signingUsername, password);
							setResultMessage(
								saved
									? '✓ Signing password saved to the OS keychain.'
									: 'Could not access the keychain; password not saved.',
							);
						} else {
							setResultMessage('Skipped — no password entered.');
						}

						setStep('done');
					}}
					onCancel={onComplete}
				/>
			</Box>
		);
	}

	if (step === 'done') {
		return (
			<Box flexDirection="column" padding={1}>
				<Banner />
				<Text color={resultMessage.startsWith('✓') ? 'green' : 'yellow'}>
					{resultMessage}
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Press any key to continue…</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Banner />
			<Box marginBottom={1}>
				<Text>Welcome to Sitevision CLI! 👋</Text>
			</Box>
			{canSaveSigning ? (
				<Box flexDirection="column">
					<Text>Save your signing password to the OS keychain now? (y/n)</Text>
					<Text dimColor>
						So you won't be asked for it every time you sign.
					</Text>
				</Box>
			) : (
				<Box flexDirection="column">
					{signingUsername ? (
						<Text dimColor>
							Your signing password is already saved in the keychain.
						</Text>
					) : (
						<>
							<Text dimColor>Signing credentials aren't configured yet.</Text>
							<Text dimColor>
								Run "svc setup-signing" later to enable app signing.
							</Text>
						</>
					)}
					<Box marginTop={1}>
						<Text>Press Enter to continue…</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}
