import React from 'react';
import {render, Box, Text, useApp} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {WebpackRunner} from '../utils/webpack-runner.js';
import {promptPassword} from '../utils/password-prompt.js';
import {signApp, deployApp} from '../utils/sitevision-api.js';
import {
	copyStaticToBuild,
	createBuildZip,
	cleanBuild,
} from '../utils/zip.js';
import {
	isBundledApp,
	getAppType,
	getFullAppId,
	getZipPath,
	getSignedZipPath,
} from '../utils/project-detection.js';
import type {SitevisionManifest, DevProperties, BuildResult, SigningCredentials} from '../types/index.js';

interface DevScreenProps {
	projectRoot: string;
	manifest: SitevisionManifest;
	devProperties: DevProperties;
	signed: boolean;
	signingCredentials?: SigningCredentials;
}

type DevStatus = 'initializing' | 'watching' | 'building' | 'signing' | 'deploying' | 'ready' | 'error';

interface DevState {
	status: DevStatus;
	message?: string;
	buildCount: number;
	lastBuildTime?: number;
	error?: string;
	webpackReady: boolean;
}

function DevScreen({
	projectRoot,
	manifest,
	devProperties,
	signed,
	signingCredentials,
}: DevScreenProps) {
	const {exit} = useApp();
	const [state, setState] = React.useState<DevState>({
		status: 'initializing',
		message: 'Starting webpack watch...',
		buildCount: 0,
		webpackReady: false,
	});

	const webpackRunnerRef = React.useRef<WebpackRunner | null>(null);

	const handleBuildComplete = React.useCallback(async (result: BuildResult) => {
		if (!result.success) {
			setState(prev => ({
				...prev,
				status: 'error',
				message: result.errors?.join('\n') || 'Build failed',
				error: result.errors?.join('\n'),
			}));
			return;
		}

		try {
			// Copy static files
			copyStaticToBuild(projectRoot);

			// Create zip
			const appId = getFullAppId(manifest.id);
			await createBuildZip(projectRoot, appId);
			const zipPath = getZipPath(projectRoot, manifest);

			let deployZipPath = zipPath;

			// Sign if needed
			if (signed && signingCredentials) {
				setState(prev => ({
					...prev,
					status: 'signing',
					message: 'Signing app...',
				}));

				const signedZipPath = getSignedZipPath(projectRoot, manifest);
				const signResult = await signApp(zipPath, signingCredentials, signedZipPath);

				if (!signResult.success) {
					setState(prev => ({
						...prev,
						status: 'error',
						message: `Signing failed: ${signResult.error}`,
						error: signResult.error,
					}));
					return;
				}

				deployZipPath = signedZipPath;
			}

			// Deploy
			setState(prev => ({
				...prev,
				status: 'deploying',
				message: 'Deploying to dev...',
			}));

			const appType = getAppType(manifest);
			const deployResult = await deployApp(
				deployZipPath,
				{
					domain: devProperties.domain,
					siteName: devProperties.siteName,
					addonName: devProperties.addonName,
					username: devProperties.username,
					password: devProperties.password,
					useHTTP: devProperties.useHTTPForDevDeploy,
				},
				appType,
				true, // force
			);

			if (!deployResult.success) {
				setState(prev => ({
					...prev,
					status: 'error',
					message: `Deploy failed: ${deployResult.error}`,
					error: deployResult.error,
				}));
				return;
			}

			// Success - back to watching
			setState(prev => ({
				...prev,
				status: 'ready',
				message: 'Deployed. Watching for changes...',
				buildCount: prev.buildCount + 1,
				lastBuildTime: result.stats?.time,
				error: undefined,
			}));
		} catch (error) {
			setState(prev => ({
				...prev,
				status: 'error',
				message: error instanceof Error ? error.message : String(error),
				error: error instanceof Error ? error.message : String(error),
			}));
		}
	}, [projectRoot, manifest, devProperties, signed, signingCredentials]);

	React.useEffect(() => {
		const isBundled = isBundledApp(manifest);

		async function startWatch() {
			try {
				// Clean build directory
				cleanBuild(projectRoot);

				if (isBundled) {
					// Check if webpack is available
					if (!WebpackRunner.isWebpackAvailable(projectRoot)) {
						setState({
							status: 'error',
							message: 'webpack not found. Run npm install.',
							buildCount: 0,
							webpackReady: false,
							error: 'webpack not found',
						});
						return;
					}

					setState(prev => ({
						...prev,
						status: 'building',
						message: 'Starting initial build...',
					}));

					const appType = getAppType(manifest);
					const runner = new WebpackRunner(projectRoot, {
						mode: 'development',
						watch: true,
						cssPrefix: manifest.id,
						restApp: appType === 'rest',
					});

					webpackRunnerRef.current = runner;

					await runner.watch(handleBuildComplete);

					setState(prev => ({
						...prev,
						status: 'watching',
						message: 'Building...',
						webpackReady: true,
					}));
				} else {
					// Non-bundled app: just copy and deploy
					setState(prev => ({
						...prev,
						status: 'building',
						message: 'Copying files...',
					}));

					await handleBuildComplete({
						success: true,
						stats: {time: 0, hash: '', assets: []},
					});
				}
			} catch (error) {
				setState({
					status: 'error',
					message: error instanceof Error ? error.message : String(error),
					buildCount: 0,
					webpackReady: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		startWatch();

		// Cleanup
		return () => {
			if (webpackRunnerRef.current) {
				webpackRunnerRef.current.close().catch(() => {});
			}
		};
	}, [projectRoot, manifest, handleBuildComplete]);

	// Handle Ctrl+C
	React.useEffect(() => {
		const handleExit = () => {
			if (webpackRunnerRef.current) {
				webpackRunnerRef.current.close().catch(() => {});
			}
			exit();
		};

		process.on('SIGINT', handleExit);
		process.on('SIGTERM', handleExit);

		return () => {
			process.off('SIGINT', handleExit);
			process.off('SIGTERM', handleExit);
		};
	}, [exit]);

	const getStatusType = (): 'running' | 'success' | 'error' => {
		switch (state.status) {
			case 'error':
				return 'error';
			case 'ready':
				return 'success';
			default:
				return 'running';
		}
	};

	const getStatusLabel = (): string => {
		switch (state.status) {
			case 'initializing':
				return 'Initializing';
			case 'watching':
				return 'Watching';
			case 'building':
				return 'Building';
			case 'signing':
				return 'Signing';
			case 'deploying':
				return 'Deploying';
			case 'ready':
				return 'Ready';
			case 'error':
				return 'Error';
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={getStatusType()}
					label={getStatusLabel()}
					message={state.message}
				/>
			</Box>

			{/* Build stats */}
			{state.buildCount > 0 && (
				<Box marginLeft={2} marginBottom={1}>
					<Text dimColor>
						Builds: {state.buildCount}
						{state.lastBuildTime ? ` | Last build: ${state.lastBuildTime}ms` : ''}
						{signed ? ' | Signed mode' : ''}
					</Text>
				</Box>
			)}

			{/* Target info */}
			<Box marginLeft={2} marginBottom={1}>
				<Text dimColor>
					Target: {devProperties.domain}/{devProperties.siteName}/{devProperties.addonName}
				</Text>
			</Box>

			{/* Error display */}
			{state.status === 'error' && state.error && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red">{state.error}</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>Press Ctrl+C to stop</Text>
			</Box>
		</Box>
	);
}

export const devCommand: Command = {
	name: 'dev',
	description: 'Start development server with watch mode',
	requiresProject: true,
	flags: {
		signed: {
			type: 'boolean',
			description: 'Use signed mode (sign before each deploy)',
			alias: 's',
			default: false,
		},
	},
	async execute({project, flags}) {
		// Check if dev properties are configured
		if (!project.hasDevProperties || !project.devProperties) {
			console.log('\n\x1b[33mDeployment credentials not configured.\x1b[0m');
			console.log('Create a .dev_properties.json file with domain, siteName, addonName, username, and password.\n');
			return;
		}

		const signed = Boolean(flags['signed']);
		let signingCredentials: SigningCredentials | undefined;

		// If signed mode, prompt for signing password
		if (signed) {
			if (!project.hasSigningProperties || !project.devProperties.signingUsername) {
				console.log('\n\x1b[33mSigning credentials not configured.\x1b[0m');
				console.log('Run \x1b[36msetup-signing\x1b[0m to configure credentials.\n');
				return;
			}

			console.log('');
			const password = await promptPassword('Signing password: ');

			if (!password) {
				console.log('\x1b[31mError: Password is required for signed mode\x1b[0m');
				return;
			}

			signingCredentials = {
				username: project.devProperties.signingUsername,
				password,
				certificateName: project.devProperties.certificateName,
			};
		}

		const {waitUntilExit} = render(
			<DevScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties}
				signed={signed}
				signingCredentials={signingCredentials}
			/>,
		);

		await waitUntilExit();
	},
};
