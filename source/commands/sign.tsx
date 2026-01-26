import React from 'react';
import {render, Box, Text} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {signApp} from '../utils/sitevision-api.js';
import {promptPassword} from '../utils/password-prompt.js';
import {
	getZipPath,
	getSignedZipPath,
} from '../utils/project-detection.js';
import {formatFileSize, getZipSize, zipExists} from '../utils/zip.js';
import type {SitevisionManifest, DevProperties} from '../types/index.js';

interface SignScreenProps {
	projectRoot: string;
	manifest: SitevisionManifest;
	devProperties: DevProperties;
	password: string;
}

type SignStatus = 'signing' | 'success' | 'error';

interface SignState {
	status: SignStatus;
	message?: string;
	signedPath?: string;
	signedSize?: number;
	error?: string;
}

function SignScreen({projectRoot, manifest, devProperties, password}: SignScreenProps) {
	const [state, setState] = React.useState<SignState>({
		status: 'signing',
		message: 'Signing app via developer.sitevision.se...',
	});

	React.useEffect(() => {
		async function runSign() {
			try {
				const zipPath = getZipPath(projectRoot, manifest);
				const signedZipPath = getSignedZipPath(projectRoot, manifest);

				// Validate zip exists
				if (!zipExists(zipPath)) {
					setState({
						status: 'error',
						error: `Zip file not found: ${zipPath}\nRun 'build' first to create the zip file.`,
					});
					return;
				}

				// Sign the app
				const result = await signApp(
					zipPath,
					{
						username: devProperties.signingUsername!,
						password,
						certificateName: devProperties.certificateName,
					},
					signedZipPath,
				);

				if (!result.success) {
					setState({
						status: 'error',
						error: result.error || 'Signing failed',
					});
					return;
				}

				const signedSize = getZipSize(signedZipPath);
				setState({
					status: 'success',
					message: 'App signed successfully',
					signedPath: signedZipPath,
					signedSize,
				});
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		runSign();
	}, [projectRoot, manifest, devProperties, password]);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={state.status === 'signing' ? 'running' : state.status}
					label={state.status === 'signing' ? 'Signing' : state.status === 'success' ? 'Signed' : 'Failed'}
					message={state.message}
				/>
			</Box>

			{/* Signed file info on success */}
			{state.status === 'success' && state.signedPath && (
				<Box flexDirection="column" marginLeft={2}>
					<Text color="green">Created: {state.signedPath}</Text>
					{state.signedSize !== undefined && (
						<Text dimColor>Size: {formatFileSize(state.signedSize)}</Text>
					)}
				</Box>
			)}

			{/* Error display */}
			{state.status === 'error' && state.error && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red">{state.error}</Text>
				</Box>
			)}
		</Box>
	);
}

export const signCommand: Command = {
	name: 'sign',
	description: 'Sign the app for production deployment',
	requiresProject: true,
	async execute({project}) {
		// Check if signing credentials are configured
		if (!project.hasSigningProperties || !project.devProperties?.signingUsername) {
			console.log('\n\x1b[33mSigning credentials not configured.\x1b[0m');
			console.log('Run \x1b[36msetup-signing\x1b[0m to configure credentials.\n');
			return;
		}

		// Prompt for password
		console.log('');
		const password = await promptPassword('Signing password: ');

		if (!password) {
			console.log('\x1b[31mError: Password is required\x1b[0m');
			return;
		}

		const {waitUntilExit} = render(
			<SignScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties}
				password={password}
			/>,
		);
		await waitUntilExit();
	},
};
