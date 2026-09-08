import {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	type ProjectInfo,
	type PackageJsonSyncChange,
	getAppType,
	localizedText,
	migrateLegacyPassword,
	getPackageJsonSyncChanges,
	syncDevPropertiesToPackageJson,
	readSvcConfig,
	writeSvcConfig,
} from '../utils/project-detection.js';
import {ProcessRunner} from '../utils/process-runner.js';
import {ProcessOutputComponent} from './ProcessOutput.js';
import {StatusIndicator} from './StatusIndicator.js';
import {DevPropertiesForm} from './DevPropertiesForm.js';
import {SigningPropertiesForm} from './SigningPropertiesForm.js';

interface Props {
	project: ProjectInfo;
	// Re-detect the project from disk/keychain after a setup step writes changes,
	// so the in-memory project (passed down from App) reflects them immediately.
	onReload: () => void;
	onComplete: () => void;
}

type SetupStep =
	| 'check-node-modules'
	| 'confirm-npm-install'
	| 'running-npm-install'
	| 'check-dev-properties'
	| 'confirm-dev-setup'
	| 'setup-dev-properties'
	| 'confirm-password-migration'
	| 'check-package-sync'
	| 'confirm-package-sync'
	| 'confirm-save-sync-choice'
	| 'check-signing-properties'
	| 'confirm-signing-setup'
	| 'setup-signing-properties'
	| 'show-info'
	| 'complete';

export function SetupFlow({project, onReload, onComplete}: Props) {
	const [step, setStep] = useState<SetupStep>('check-node-modules');
	const [runner, setRunner] = useState<any>(null);
	const [commandStatus, setCommandStatus] = useState<
		'running' | 'success' | 'error'
	>('running');
	const [syncChanges, setSyncChanges] = useState<PackageJsonSyncChange[]>([]);
	const [syncDecision, setSyncDecision] = useState(false);
	const appType = getAppType(project.manifest);

	// Auto-advance through checks
	useEffect(() => {
		if (step === 'check-node-modules') {
			if (project.hasNodeModules) {
				setStep('check-dev-properties');
			} else {
				setStep('confirm-npm-install');
			}
		} else if (step === 'check-dev-properties') {
			if (project.hasDevProperties) {
				if (project.hasLegacyPassword) {
					setStep('confirm-password-migration');
				} else {
					setStep('check-package-sync');
				}
			} else {
				setStep('confirm-dev-setup');
			}
		} else if (step === 'check-package-sync') {
			const preference = readSvcConfig(project.root).syncPackageJson;
			const properties = project.devProperties;
			const changes =
				preference !== false && properties
					? getPackageJsonSyncChanges(project.root, properties)
					: [];
			if (changes.length === 0 || !properties) {
				setStep('check-signing-properties');
			} else if (preference === true) {
				syncDevPropertiesToPackageJson(project.root, properties);
				onReload();
				setStep('check-signing-properties');
			} else {
				setSyncChanges(changes);
				setStep('confirm-package-sync');
			}
		} else if (step === 'check-signing-properties') {
			if (project.hasSigningProperties) {
				setStep('show-info');
			} else {
				setStep('confirm-signing-setup');
			}
		} else if (step === 'show-info') {
			// Auto-advance to menu after displaying info
			onComplete();
		}
	}, [step, project, onComplete]); // Removed specific props from dependency array to allow re-check after updates

	useInput(input => {
		if (step === 'confirm-npm-install') {
			if (input === 'y' || input === 'Y') {
				setStep('running-npm-install');
				setCommandStatus('running');

				// npm install is a native command, not a script
				const newRunner = new ProcessRunner('npm', ['install'], project.root);
				newRunner.on('exit', (code: number) => {
					if (code === 0) {
						setCommandStatus('success');
						// Force project info refresh would be ideal here
						// For now, assume success and move on
						setTimeout(() => setStep('check-dev-properties'), 1000);
					} else {
						setCommandStatus('error');
					}
				});
				setRunner(newRunner);
				newRunner.run().catch(() => setCommandStatus('error'));
			} else if (input === 'n' || input === 'N') {
				setStep('check-dev-properties');
			}
		} else if (step === 'confirm-dev-setup') {
			if (input === 'y' || input === 'Y') {
				setStep('setup-dev-properties');
			} else if (input === 'n' || input === 'N') {
				setStep('check-signing-properties');
			}
		} else if (step === 'confirm-password-migration') {
			if (input === 'y' || input === 'Y') {
				migrateLegacyPassword(project);
				// The file was rewritten (plaintext stripped, password moved to
				// keychain) — re-detect so hasLegacyPassword/password reflect that.
				onReload();
				setStep('check-package-sync');
			} else if (input === 'n' || input === 'N') {
				setStep('check-package-sync');
			}
		} else if (step === 'confirm-package-sync') {
			if (['y', 'Y', 'n', 'N'].includes(input)) {
				const accepted = input.toLowerCase() === 'y';
				if (accepted && project.devProperties) {
					syncDevPropertiesToPackageJson(project.root, project.devProperties);
					onReload();
				}

				setSyncDecision(accepted);
				setStep('confirm-save-sync-choice');
			}
		} else if (step === 'confirm-save-sync-choice') {
			if (input === 'y' || input === 'Y') {
				writeSvcConfig(project.root, {syncPackageJson: syncDecision});
				setStep('check-signing-properties');
			} else if (input === 'n' || input === 'N') {
				setStep('check-signing-properties');
			}
		} else if (step === 'confirm-signing-setup') {
			if (input === 'y' || input === 'Y') {
				setStep('setup-signing-properties');
			} else if (input === 'n' || input === 'N') {
				setStep('show-info');
			}
		}
	});

	// Setup Dev Properties Form
	if (step === 'setup-dev-properties') {
		return (
			<DevPropertiesForm
				projectRoot={project.root}
				initialProperties={project.devProperties}
				packageJson={project.packageJson}
				onComplete={() => {
					// Re-detect from disk/keychain so devProperties (incl. the keychain
					// password) populate in memory — otherwise the rest of this flow and
					// the menu would see stale state until the CLI is restarted.
					onReload();
					setStep('check-package-sync');
				}}
				onCancel={() => setStep('check-signing-properties')}
			/>
		);
	}

	// Setup Signing Properties Form
	if (step === 'setup-signing-properties') {
		return (
			<SigningPropertiesForm
				projectRoot={project.root}
				onComplete={() => {
					// Re-detect so signing credentials are reflected in memory before
					// the info screen / menu render.
					onReload();
					setStep('show-info');
				}}
				onCancel={() => setStep('show-info')}
			/>
		);
	}

	// Running npm install
	if (step === 'running-npm-install') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<StatusIndicator
						status={commandStatus}
						label="Installing dependencies"
					/>
				</Box>
				{runner && <ProcessOutputComponent runner={runner} />}
			</Box>
		);
	}

	// Confirm npm install
	if (step === 'confirm-npm-install') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision CLI
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">⚠ node_modules not found</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>Would you like to run npm install? (y/n)</Text>
				</Box>
			</Box>
		);
	}

	// Confirm dev setup
	if (step === 'confirm-dev-setup') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision CLI
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">⚠ dev properties not configured</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>Would you like to set up dev properties? (y/n)</Text>
				</Box>
			</Box>
		);
	}

	// Confirm legacy password migration
	if (step === 'confirm-password-migration') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision CLI
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">
						⚠ Plaintext password found in .dev_properties.json
					</Text>
				</Box>
				<Box marginBottom={1} flexDirection="column">
					<Text>
						Move it to the OS keychain and remove it from the file? (y/n)
					</Text>
					<Text dimColor>
						Recommended — storing passwords in project files is insecure.
					</Text>
				</Box>
			</Box>
		);
	}

	// Confirm package.json sync
	if (step === 'confirm-package-sync') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision CLI
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">
						⚠ package.json is out of sync with .dev_properties.json
					</Text>
				</Box>
				<Box marginBottom={1} flexDirection="column" marginLeft={2}>
					{syncChanges.map(change => (
						<Box key={change.key}>
							<Text color={change.from === undefined ? 'green' : 'yellow'}>
								{change.from === undefined ? '+ ' : '~ '}
							</Text>
							<Text bold>{change.key}: </Text>
							{change.from !== undefined && (
								<Text dimColor>{change.from} → </Text>
							)}
							<Text>{change.to}</Text>
						</Box>
					))}
				</Box>
				<Box marginBottom={1} flexDirection="column">
					<Text>Update package.json from .dev_properties.json? (y/n)</Text>
					<Text dimColor>
						sitevision-scripts reads these fields from package.json.
					</Text>
				</Box>
			</Box>
		);
	}

	// Offer to persist the sync decision in .svcconfig
	if (step === 'confirm-save-sync-choice') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision CLI
					</Text>
				</Box>
				<Box marginBottom={1} flexDirection="column">
					<Text>Remember this choice in .svcconfig? (y/n)</Text>
					<Text dimColor>
						{syncDecision
							? 'svc will update package.json automatically from now on.'
							: 'svc will stop asking about package.json sync.'}
					</Text>
				</Box>
			</Box>
		);
	}

	// Confirm signing setup
	if (step === 'confirm-signing-setup') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision CLI
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">⚠ signing credentials not configured</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>
						Signing credentials are required for signing apps on
						developer.sitevision.se
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>Would you like to set up signing credentials? (y/n)</Text>
				</Box>
			</Box>
		);
	}

	// Show info
	if (step === 'show-info') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Sitevision Project Information
					</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					<Box>
						<Text bold>Name: </Text>
						<Text>{localizedText(project.manifest.name)}</Text>
					</Box>
					<Box>
						<Text bold>ID: </Text>
						<Text>{project.manifest.id}</Text>
					</Box>
					<Box>
						<Text bold>Version: </Text>
						<Text>{project.manifest.version}</Text>
					</Box>
					<Box>
						<Text bold>Type: </Text>
						<Text color="green">{project.manifest.type}</Text>
						<Text dimColor> ({appType})</Text>
					</Box>
					<Box>
						<Text bold>Bundled: </Text>
						<Text>{project.manifest.bundled ? 'Yes' : 'No'}</Text>
					</Box>
				</Box>

				{project.hasDevProperties && project.devProperties && (
					<>
						<Box marginTop={1} marginBottom={1}>
							<Text bold color="cyan">
								Development Configuration
							</Text>
						</Box>

						<Box flexDirection="column" marginLeft={2}>
							<Box>
								<Text bold>Domain: </Text>
								<Text>{project.devProperties.domain}</Text>
							</Box>
							<Box>
								<Text bold>Site: </Text>
								<Text>{project.devProperties.siteName}</Text>
							</Box>
							<Box>
								<Text bold>Addon: </Text>
								<Text>{project.devProperties.addonName}</Text>
							</Box>
							<Box>
								<Text bold>Username: </Text>
								<Text>{project.devProperties.username}</Text>
							</Box>
							<Box>
								<Text bold>Use HTTP: </Text>
								<Text>
									{project.devProperties.useHTTPForDevDeploy ? 'Yes' : 'No'}
								</Text>
							</Box>
						</Box>
					</>
				)}

				{!project.hasDevProperties && (
					<Box marginTop={1}>
						<Text color="yellow">⚠ No dev properties configured</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text bold>Project Root: </Text>
					<Text dimColor>{project.root}</Text>
				</Box>
			</Box>
		);
	}

	return null;
}
