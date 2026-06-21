import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {type ProjectInfo, getAppType, migrateLegacyPassword} from '../utils/project-detection.js';
import {ProcessRunner} from '../utils/process-runner.js';
import {ProcessOutputComponent} from './ProcessOutput.js';
import {StatusIndicator} from './StatusIndicator.js';
import {DevPropertiesForm} from './DevPropertiesForm.js';
import {SigningPropertiesForm} from './SigningPropertiesForm.js';

interface Props {
	project: ProjectInfo;
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
	| 'check-signing-properties'
	| 'confirm-signing-setup'
	| 'setup-signing-properties'
	| 'show-info'
	| 'complete';

export function SetupFlow({project, onComplete}: Props) {
	const [step, setStep] = useState<SetupStep>('check-node-modules');
	const [runner, setRunner] = useState<any>(null);
	const [commandStatus, setCommandStatus] = useState<'running' | 'success' | 'error'>('running');
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
					setStep('check-signing-properties');
				}
			} else {
				setStep('confirm-dev-setup');
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

	useInput((input) => {
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
					// Manually update project state locally if possible, or just proceed
					// Since we can't easily update 'project' prop from here without reloading,
					// we just move to next step. The file is written.
					project.hasDevProperties = true; // Optimization/Hack to pass check
					setStep('check-signing-properties');
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
					project.hasSigningProperties = true; // Optimization/Hack
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
					<Text bold color="cyan">Sitevision CLI</Text>
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
					<Text bold color="cyan">Sitevision CLI</Text>
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
					<Text bold color="cyan">Sitevision CLI</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">⚠ Plaintext password found in .dev_properties.json</Text>
				</Box>
				<Box marginBottom={1} flexDirection="column">
					<Text>Move it to the OS keychain and remove it from the file? (y/n)</Text>
					<Text dimColor>Recommended — storing passwords in project files is insecure.</Text>
				</Box>
			</Box>
		);
	}

	// Confirm signing setup
	if (step === 'confirm-signing-setup') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">Sitevision CLI</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="yellow">⚠ signing credentials not configured</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>Signing credentials are required for signing apps on developer.sitevision.se</Text>
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
					<Text bold color="cyan">Sitevision Project Information</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					<Box>
						<Text bold>Name: </Text>
						<Text>{project.manifest.name}</Text>
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
							<Text bold color="cyan">Development Configuration</Text>
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
								<Text>{project.devProperties.useHTTPForDevDeploy ? 'Yes' : 'No'}</Text>
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
