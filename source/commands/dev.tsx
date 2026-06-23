import fs from 'fs';
import path from 'path';
import React from 'react';
import {render, Box, Text, useApp, useInput} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {WebpackRunner, hasLocalWebpackConfig} from '../utils/webpack-runner.js';
import {
	hasSitevisionScripts,
	runSitevisionScriptsBuild,
	getDelegatedZipPath,
	checkSitevisionScriptsCompatibility,
} from '../utils/sitevision-scripts-runner.js';
import {promptPassword, promptYesNo} from '../utils/password-prompt.js';
import {signApp, deployApp} from '../utils/sitevision-api.js';
import {setDeployPassword} from '../utils/keychain.js';
import {resolveSigningPassword} from '../utils/signing-password.js';
import {copyStaticToBuild, createBuildZip, cleanBuild} from '../utils/zip.js';
import {
	isBundledApp,
	getAppType,
	getFullAppId,
	getZipPath,
	getSignedZipPath,
	localizedText,
} from '../utils/project-detection.js';
import type {
	SitevisionManifest,
	DevProperties,
	BuildResult,
	SigningCredentials,
} from '../types/index.js';

interface DevScreenProps {
	projectRoot: string;
	manifest: SitevisionManifest;
	devProperties?: DevProperties;
	signed: boolean;
	// When false, build (and sign, if enabled) on each change but skip deploy.
	// Powers the `watch` command. Defaults to true (the `dev` command).
	deploy?: boolean;
	signingCredentials?: SigningCredentials;
	onBack?: () => void;
	onRetryCredentials?: () => void;
}

type DevStatus =
	| 'initializing'
	| 'watching'
	| 'building'
	| 'signing'
	| 'deploying'
	| 'ready'
	| 'error';

interface DevState {
	status: DevStatus;
	message?: string;
	buildCount: number;
	lastBuildTime?: number;
	error?: string;
	webpackReady: boolean;
	warning?: string;
}

export function DevScreen({
	projectRoot,
	manifest,
	devProperties,
	signed,
	deploy = true,
	signingCredentials,
	onBack,
	onRetryCredentials,
}: DevScreenProps) {
	const {exit} = useApp();
	const [state, setState] = React.useState<DevState>({
		status: 'initializing',
		message: 'Starting webpack watch...',
		buildCount: 0,
		webpackReady: false,
	});

	useInput((input, key) => {
		if (onBack && (key.escape || input === 'q')) {
			onBack();
		}
		if (onRetryCredentials && state.status === 'error' && input === 'r') {
			onRetryCredentials();
		}
	});

	const webpackRunnerRef = React.useRef<WebpackRunner | null>(null);
	const watchersRef = React.useRef<fs.FSWatcher[]>([]);
	const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
	const isBuildingRef = React.useRef(false);
	const pendingRebuildRef = React.useRef(false);

	// Sign (if needed) and deploy an already-built zip, updating UI state.
	const signAndDeploy = React.useCallback(
		async (zipPath: string, buildTime?: number) => {
			try {
				let deployZipPath = zipPath;

				// Sign if needed
				if (signed && signingCredentials) {
					setState(prev => ({
						...prev,
						status: 'signing',
						message: 'Signing app...',
					}));

					const signedZipPath = getSignedZipPath(projectRoot, manifest);
					const signResult = await signApp(
						zipPath,
						signingCredentials,
						signedZipPath,
					);

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

				// Watch/build-only mode: stop after building (and signing).
				if (!deploy || !devProperties) {
					setState(prev => ({
						...prev,
						status: 'ready',
						message: signed
							? 'Signed. Watching for changes...'
							: 'Built. Watching for changes...',
						buildCount: prev.buildCount + 1,
						lastBuildTime: buildTime,
						error: undefined,
					}));
					return;
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
						password: devProperties.password!,
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
					lastBuildTime: buildTime,
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
		},
		[projectRoot, manifest, devProperties, signed, deploy, signingCredentials],
	);

	// In-house webpack path: copy static, zip, then sign + deploy.
	const handleBuildComplete = React.useCallback(
		async (result: BuildResult) => {
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
				copyStaticToBuild(projectRoot);
				const appId = getFullAppId(manifest.id);
				await createBuildZip(projectRoot, appId);
				await signAndDeploy(
					getZipPath(projectRoot, manifest),
					result.stats?.time,
				);
			} catch (error) {
				setState(prev => ({
					...prev,
					status: 'error',
					message: error instanceof Error ? error.message : String(error),
					error: error instanceof Error ? error.message : String(error),
				}));
			}
		},
		[projectRoot, manifest, signAndDeploy],
	);

	// Delegated path: full `sitevision-scripts build` then sign + deploy.
	// Coalesces overlapping triggers so a save mid-build queues one rebuild.
	const runDelegatedBuild = React.useCallback(async () => {
		if (isBuildingRef.current) {
			pendingRebuildRef.current = true;
			return;
		}

		isBuildingRef.current = true;

		const buildOnce = async (): Promise<void> => {
			pendingRebuildRef.current = false;

			setState(prev => ({
				...prev,
				status: 'building',
				message: 'Building via sitevision-scripts...',
			}));

			const result = await runSitevisionScriptsBuild(projectRoot);

			if (result.success) {
				await signAndDeploy(getDelegatedZipPath(projectRoot, manifest.id));
			} else {
				setState(prev => ({
					...prev,
					status: 'error',
					message: result.error ?? 'Build failed',
					error: `${result.error}\n${result.output.slice(-1000)}`,
				}));
			}

			if (pendingRebuildRef.current) {
				await buildOnce();
			}
		};

		try {
			await buildOnce();
		} finally {
			isBuildingRef.current = false;
		}
	}, [projectRoot, manifest, signAndDeploy]);

	// Watch source files and trigger a delegated rebuild (debounced).
	const startFileWatcher = React.useCallback(() => {
		const targets = [
			'src',
			'static',
			'i18n',
			'resource',
			'config',
			'manifest.json',
		]
			.map(name => path.join(projectRoot, name))
			.filter(target => fs.existsSync(target));

		for (const target of targets) {
			const isDir = fs.statSync(target).isDirectory();
			const watcher = fs.watch(target, {recursive: isDir}, () => {
				if (debounceTimerRef.current) {
					clearTimeout(debounceTimerRef.current);
				}

				debounceTimerRef.current = setTimeout(() => {
					void runDelegatedBuild();
				}, 300);
			});
			watchersRef.current.push(watcher);
		}
	}, [projectRoot, runDelegatedBuild]);

	React.useEffect(() => {
		const isBundled = isBundledApp(manifest);

		async function startWatch() {
			try {
				// Clean build directory
				cleanBuild(projectRoot);

				if (isBundled && !hasLocalWebpackConfig(projectRoot)) {
					// No local webpack config: delegate each build to
					// sitevision-scripts (full rebuild) and watch source files
					// ourselves, keeping the CLI's own sign + deploy flow.
					if (!hasSitevisionScripts(projectRoot)) {
						setState({
							status: 'error',
							message:
								'No webpack.config.js found and @sitevision/sitevision-scripts is not installed. Run npm install.',
							buildCount: 0,
							webpackReady: false,
							error: 'No build pipeline available',
						});
						return;
					}

					const warning =
						checkSitevisionScriptsCompatibility(projectRoot).warning;
					setState(prev => ({...prev, webpackReady: true, warning}));
					startFileWatcher();
					await runDelegatedBuild();
				} else if (isBundled) {
					// Project ships its own webpack config: incremental in-process watch.
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

			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}

			for (const watcher of watchersRef.current) {
				watcher.close();
			}

			watchersRef.current = [];
		};
	}, [
		projectRoot,
		manifest,
		handleBuildComplete,
		runDelegatedBuild,
		startFileWatcher,
	]);

	// Handle Ctrl+C
	React.useEffect(() => {
		const handleExit = () => {
			if (webpackRunnerRef.current) {
				webpackRunnerRef.current.close().catch(() => {});
			}

			for (const watcher of watchersRef.current) {
				watcher.close();
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

			{/* Version-compatibility warning */}
			{state.warning && (
				<Box marginBottom={1}>
					<Text color="yellow">⚠ {state.warning}</Text>
				</Box>
			)}

			{/* Build stats */}
			{state.buildCount > 0 && (
				<Box marginLeft={2} marginBottom={1}>
					<Text dimColor>
						Builds: {state.buildCount}
						{state.lastBuildTime
							? ` | Last build: ${state.lastBuildTime}ms`
							: ''}
						{signed ? ' | Signed mode' : ''}
					</Text>
				</Box>
			)}

			{/* App info */}
			<Box marginLeft={2} marginBottom={1}>
				<Text dimColor>
					{localizedText(manifest.name)} v{manifest.version}
				</Text>
			</Box>

			{/* Target info */}
			{deploy && devProperties && (
				<Box marginLeft={2} marginBottom={1}>
					<Text dimColor>
						Target: {devProperties.domain}/{devProperties.siteName}/
						{devProperties.addonName}
					</Text>
				</Box>
			)}

			{/* Error display */}
			{state.status === 'error' && state.error && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red">{state.error}</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				{state.status === 'error' && onRetryCredentials && (
					<Text dimColor>Press r to retry with new credentials</Text>
				)}
				{onBack ? (
					<Text dimColor>
						Press q or Esc to return to menu (Ctrl+C to stop process)
					</Text>
				) : (
					<Text dimColor>Press Ctrl+C to stop</Text>
				)}
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
			console.log(
				'Create a .dev_properties.json file with domain, siteName, addonName, and username, then run setup.\n',
			);
			return;
		}

		// Resolve deploy password (already loaded from keychain/env in detectProject — prompt if missing)
		if (!project.devProperties.password) {
			const {domain, username} = project.devProperties;
			console.log('');
			const pw = await promptPassword(
				`Deploy password for ${username}@${domain}: `,
			);
			if (!pw) {
				console.log('\x1b[31mError: Password is required\x1b[0m');
				return;
			}
			const remember = await promptYesNo(
				'Save password to OS keychain? (y/N): ',
			);
			if (remember && domain && username) {
				setDeployPassword(domain, username, pw);
			}
			project.devProperties.password = pw;
		}

		const signed = Boolean(flags['signed']);
		let signingCredentials: SigningCredentials | undefined;

		// If signed mode, resolve signing password (keychain → env → prompt)
		if (signed) {
			if (
				!project.hasSigningProperties ||
				!project.devProperties.signingUsername
			) {
				console.log('\n\x1b[33mSigning credentials not configured.\x1b[0m');
				console.log(
					'Run \x1b[36msetup-signing\x1b[0m to configure credentials.\n',
				);
				return;
			}

			const signingUsername = project.devProperties.signingUsername;
			const password = await resolveSigningPassword(signingUsername);

			if (!password) {
				console.log(
					'\x1b[31mError: Password is required for signed mode\x1b[0m',
				);
				return;
			}

			signingCredentials = {
				username: signingUsername,
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
