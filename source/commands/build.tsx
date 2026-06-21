import React from 'react';
import {render, Box, Text, useInput} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {WebpackRunner} from '../utils/webpack-runner.js';
import {
	copyStaticToBuild,
	copySrcToBuild,
	cleanBuild,
	formatFileSize,
	createBuildZip,
	getZipSize,
} from '../utils/zip.js';
import {
	isBundledApp,
	getAppType,
	getFullAppId,
} from '../utils/project-detection.js';
import type {SitevisionManifest, BuildResult} from '../types/index.js';

interface BuildScreenProps {
	projectRoot: string;
	manifest: SitevisionManifest;
	createZip?: boolean;
	onBack?: () => void;
}

type BuildStatus =
	| 'cleaning'
	| 'building'
	| 'copying'
	| 'zipping'
	| 'success'
	| 'error';

interface BuildState {
	status: BuildStatus;
	message?: string;
	result?: BuildResult;
	zipPath?: string;
	zipSize?: number;
	error?: string;
}

export function BuildScreen({
	projectRoot,
	manifest,
	createZip = true,
	onBack,
}: BuildScreenProps) {
	const [state, setState] = React.useState<BuildState>({
		status: 'cleaning',
		message: 'Cleaning build directory...',
	});

	useInput((input, key) => {
		if (
			onBack &&
			(key.escape || input === 'q') &&
			(state.status === 'success' || state.status === 'error')
		) {
			onBack();
		}
	});

	const isBundled = isBundledApp(manifest);

	React.useEffect(() => {
		async function runBuild() {
			try {
				// Step 1: Clean build directory
				setState({status: 'cleaning', message: 'Cleaning build directory...'});
				cleanBuild(projectRoot);

				// Step 2: Build or copy files
				if (isBundled) {
					// Check if webpack is available
					if (!WebpackRunner.isWebpackAvailable(projectRoot)) {
						setState({
							status: 'error',
							error:
								'webpack not found. Run npm install to install dependencies.',
						});
						return;
					}

					setState({status: 'building', message: 'Compiling with webpack...'});

					const appType = getAppType(manifest);
					const runner = new WebpackRunner(projectRoot, {
						mode: 'production',
						cssPrefix: manifest.id,
						restApp: appType === 'rest',
					});

					const result = await runner.run();
					await runner.close();

					if (!result.success) {
						setState({
							status: 'error',
							error: result.errors?.join('\n') || 'Build failed',
							result,
						});
						return;
					}

					// Copy static files after webpack build
					setState({status: 'copying', message: 'Copying static files...'});
					copyStaticToBuild(projectRoot);

					setState(prev => ({...prev, result}));
				} else {
					// Non-bundled app: just copy files
					setState({status: 'copying', message: 'Copying source files...'});
					copySrcToBuild(projectRoot);
					copyStaticToBuild(projectRoot);
				}

				// Step 3: Create zip if requested
				if (createZip) {
					setState({status: 'zipping', message: 'Creating zip archive...'});
					const appId = getFullAppId(manifest.id);
					const zipPath = await createBuildZip(projectRoot, appId);
					const zipSize = getZipSize(zipPath);

					setState(prev => ({
						...prev,
						status: 'success',
						message: 'Build complete',
						zipPath,
						zipSize,
					}));
				} else {
					setState(prev => ({
						...prev,
						status: 'success',
						message: 'Build complete',
					}));
				}
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		runBuild();
	}, [projectRoot, manifest, isBundled, createZip]);

	const getStatusIndicator = () => {
		switch (state.status) {
			case 'cleaning':
			case 'building':
			case 'copying':
			case 'zipping':
				return 'running';
			case 'success':
				return 'success';
			case 'error':
				return 'error';
		}
	};

	const getStatusLabel = () => {
		switch (state.status) {
			case 'cleaning':
				return 'Cleaning';
			case 'building':
				return 'Building';
			case 'copying':
				return 'Copying files';
			case 'zipping':
				return 'Creating zip';
			case 'success':
				return 'Build complete';
			case 'error':
				return 'Build failed';
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={getStatusIndicator()}
					label={getStatusLabel()}
					message={state.message}
				/>
			</Box>

			{/* Build stats on success */}
			{state.status === 'success' && state.result?.stats && (
				<Box flexDirection="column" marginLeft={2}>
					<Text dimColor>Compiled in {state.result.stats.time}ms</Text>
					{state.result.stats.assets &&
						state.result.stats.assets.length > 0 && (
							<Text dimColor>
								Assets: {state.result.stats.assets.join(', ')}
							</Text>
						)}
				</Box>
			)}

			{/* Zip info on success */}
			{state.status === 'success' && state.zipPath && (
				<Box flexDirection="column" marginLeft={2} marginTop={1}>
					<Text color="green">✓ Created: {state.zipPath}</Text>
					{state.zipSize !== undefined && (
						<Text dimColor> Size: {formatFileSize(state.zipSize)}</Text>
					)}
				</Box>
			)}

			{/* Warnings */}
			{state.result?.warnings && state.result.warnings.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="yellow">Warnings:</Text>
					{state.result.warnings.slice(0, 5).map((warning, i) => (
						<Text key={i} color="yellow" dimColor>
							{warning.substring(0, 200)}
						</Text>
					))}
					{state.result.warnings.length > 5 && (
						<Text color="yellow" dimColor>
							...and {state.result.warnings.length - 5} more
						</Text>
					)}
				</Box>
			)}

			{/* Error display */}
			{state.status === 'error' && state.error && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red">{state.error}</Text>
				</Box>
			)}

			{onBack && (state.status === 'success' || state.status === 'error') && (
				<Box marginTop={1}>
					<Text dimColor>Press q or Esc to return to menu</Text>
				</Box>
			)}
		</Box>
	);
}

export const buildCommand: Command = {
	name: 'build',
	description: 'Build the application for production',
	requiresProject: true,
	flags: {
		'no-zip': {
			type: 'boolean',
			description: 'Skip creating the zip archive',
			default: false,
		},
	},
	async execute({project, flags}) {
		const createZip = !flags['no-zip'];
		const {waitUntilExit} = render(
			<BuildScreen
				projectRoot={project.root}
				manifest={project.manifest}
				createZip={createZip}
			/>,
		);
		await waitUntilExit();
	},
};
