import {useCallback, useMemo, useState} from 'react';
import {type ProjectInfo, detectProject} from './utils/project-detection.js';
import {MainMenu} from './components/MainMenu.js';
import {InfoScreen} from './components/InfoScreen.js';
import {SetupFlow} from './components/SetupFlow.js';
import {PasswordInput} from './components/PasswordInput.js';
import {KeychainPasswordChoice} from './components/KeychainPasswordChoice.js';
import {decideSigningStep} from './utils/signing-step.js';
import {DevScreen} from './commands/dev.js';
import {BuildScreen} from './commands/build.js';
import {DeployScreen} from './commands/deploy.js';
import {SignScreen} from './commands/sign.js';
import {SigningPropertiesForm} from './components/SigningPropertiesForm.js';
import {
	getSigningPassword,
	setDeployPassword as saveDeployPassword,
	setSigningPassword as saveSigningPassword,
} from './utils/keychain.js';

type Props = {
	project: ProjectInfo;
};

type AppState =
	| 'setup'
	| 'menu'
	| 'info'
	| 'dev-password-input'
	| 'signing-password-input'
	| 'signing-password-choice'
	| 'dev'
	| 'watch'
	| 'build'
	| 'deploy'
	| 'sign'
	| 'setup-signing';

export default function App({project: initialProject}: Props) {
	// The project is loaded once at startup, but setup flows write new values to
	// disk and the OS keychain. Hold it in state so we can re-detect after setup
	// and pick up those changes (e.g. saved passwords) without restarting the CLI.
	const [project, setProject] = useState<ProjectInfo>(initialProject);
	const reloadProject = useCallback(() => {
		try {
			const refreshed = detectProject(initialProject.root);
			if (refreshed) setProject(refreshed);
		} catch {
			// Re-detection failed (e.g. manifest became unparseable mid-session) —
			// keep the existing in-memory project rather than crashing.
		}
	}, [initialProject.root]);

	const [state, setState] = useState<AppState>('setup');
	const [currentCommand, setCurrentCommand] = useState<string>('');
	const [signingPassword, setSigningPassword] = useState<string>('');
	const [devPassword, setDevPassword] = useState<string>('');
	// When true, skip the keychain "use saved / enter new" choice and go straight
	// to manual entry (e.g. the saved password just failed and we're retrying).
	const [signingRetry, setSigningRetry] = useState(false);

	// Read the saved signing password from the keychain once (keychain access is
	// slow and this component re-renders frequently).
	const signingUsername = project.devProperties?.signingUsername;
	const storedSigningPassword = useMemo<string | null>(
		() => (signingUsername ? getSigningPassword(signingUsername) : null),
		[signingUsername],
	);

	// Map a signing-capable command to the screen it lands on once the signing
	// password is resolved.
	const signedDestination = (command = currentCommand): AppState => {
		if (command === 'dev-signed') return 'dev';
		if (command === 'watch-signed') return 'watch';
		return 'sign';
	};

	// Decide the next step once a signing password is needed: proceed if we already
	// have one this session, offer the keychain choice if one is saved, otherwise
	// prompt for manual entry.
	const routeToSigningStep = (command = currentCommand) => {
		const step = decideSigningStep({
			hasSessionPassword: Boolean(signingPassword),
			hasStoredPassword: Boolean(storedSigningPassword),
			isRetry: signingRetry,
		});
		if (step === 'proceed') {
			setState(signedDestination(command));
		} else if (step === 'choice') {
			setState('signing-password-choice');
		} else {
			setState('signing-password-input');
		}
	};

	// Check if dev password is available (either from file or session)
	const hasDevPassword = Boolean(
		project.devProperties?.password || devPassword,
	);

	// Get effective dev properties with session password if needed
	const getEffectiveDevProperties = () => {
		if (!project.devProperties) return undefined;
		if (project.devProperties.password) return project.devProperties;
		return {...project.devProperties, password: devPassword};
	};

	const handleDevPasswordSubmit = (password: string, remember: boolean) => {
		setDevPassword(password);
		if (
			remember &&
			project.devProperties?.domain &&
			project.devProperties.username &&
			password
		) {
			saveDeployPassword(
				project.devProperties.domain,
				project.devProperties.username,
				password,
			);
		}
		// Continue to the intended command
		if (currentCommand === 'dev' || currentCommand === 'dev-signed') {
			if (currentCommand === 'dev-signed') {
				routeToSigningStep();
			} else {
				setState('dev');
			}
		} else if (currentCommand.startsWith('deploy')) {
			setState('deploy');
		}
	};

	const handleUseSavedSigning = () => {
		if (storedSigningPassword) {
			setSigningPassword(storedSigningPassword);
		}
		setState(signedDestination());
	};

	const handleEnterNewSigning = () => {
		setState('signing-password-input');
	};

	const handleSigningPasswordSubmit = (password: string, remember: boolean) => {
		setSigningPassword(password);
		if (remember && project.devProperties?.signingUsername && password) {
			saveSigningPassword(project.devProperties.signingUsername, password);
		}
		setState(signedDestination());
	};

	const handleCommandSelect = (command: string) => {
		setCurrentCommand(command);
		// Fresh selection from the menu — re-offer the saved keychain password.
		setSigningRetry(false);

		switch (command) {
			case 'info':
				setState('info');
				break;
			case 'setup-signing':
				setState('setup-signing');
				break;
			case 'dev':
				if (!project.hasDevProperties || !project.devProperties) {
					console.log(
						'\x1b[31mDevelopment properties not configured. Create a .dev_properties.json file first.\x1b[0m',
					);
					return;
				}
				if (!hasDevPassword) {
					setState('dev-password-input');
				} else {
					setState('dev');
				}
				break;
			case 'dev-signed':
				if (!project.hasDevProperties || !project.devProperties) {
					console.log(
						'\x1b[31mDevelopment properties not configured. Create a .dev_properties.json file first.\x1b[0m',
					);
					return;
				}
				if (!project.hasSigningProperties) {
					console.log(
						'\x1b[31mSigning credentials not configured. Run svc setup-signing first.\x1b[0m',
					);
					return;
				}
				// Need both dev password and signing password
				if (!hasDevPassword) {
					setState('dev-password-input');
				} else {
					routeToSigningStep(command);
				}
				break;
			case 'watch':
				// Build/sign-only: no deploy and no signing, so no credentials needed.
				setState('watch');
				break;
			case 'watch-signed':
				if (!project.hasDevProperties || !project.devProperties) {
					console.log(
						'\x1b[31mDevelopment properties not configured. Create a .dev_properties.json file first.\x1b[0m',
					);
					return;
				}
				if (!project.hasSigningProperties) {
					console.log(
						'\x1b[31mSigning credentials not configured. Run svc setup-signing first.\x1b[0m',
					);
					return;
				}
				routeToSigningStep(command);
				break;
			case 'sign':
				if (!project.hasDevProperties || !project.devProperties) {
					console.log(
						'\x1b[31mDevelopment properties not configured. Create a .dev_properties.json file first.\x1b[0m',
					);
					return;
				}
				if (!project.hasSigningProperties) {
					console.log(
						'\x1b[31mSigning credentials not configured. Run svc setup-signing first.\x1b[0m',
					);
					return;
				}
				routeToSigningStep(command);
				break;
			case 'build':
				setState('build');
				break;
			case 'deploy':
			case 'deploy-force':
			case 'deploy-production':
				if (!project.hasDevProperties || !project.devProperties) {
					console.log(
						'\x1b[31mDevelopment properties not configured. Create a .dev_properties.json file first.\x1b[0m',
					);
					return;
				}
				if (!hasDevPassword) {
					setState('dev-password-input');
				} else {
					setState('deploy');
				}
				break;
		}
	};

	if (state === 'setup') {
		return (
			<SetupFlow
				project={project}
				onReload={reloadProject}
				onComplete={() => setState('menu')}
			/>
		);
	}

	if (state === 'menu') {
		return <MainMenu project={project} onSelect={handleCommandSelect} />;
	}

	if (state === 'info') {
		return <InfoScreen project={project} onBack={() => setState('menu')} />;
	}

	if (state === 'dev-password-input') {
		return (
			<PasswordInput
				key="dev-password"
				label="Enter Development Password (usually Sitevision Cloud Password)"
				showRememberOption={Boolean(
					project.devProperties?.domain && project.devProperties?.username,
				)}
				onSubmit={handleDevPasswordSubmit}
				onCancel={() => setState('menu')}
			/>
		);
	}

	if (state === 'signing-password-choice') {
		return (
			<KeychainPasswordChoice
				key="signing-password-choice"
				onUseSaved={handleUseSavedSigning}
				onEnterNew={handleEnterNewSigning}
				onCancel={() => setState('menu')}
			/>
		);
	}

	if (state === 'signing-password-input') {
		return (
			<PasswordInput
				key="signing-password"
				label="Enter Signing Password (developer.sitevision.se)"
				showRememberOption={Boolean(project.devProperties?.signingUsername)}
				defaultRemember={Boolean(storedSigningPassword)}
				rememberLabel={
					storedSigningPassword
						? 'Update saved password in OS keychain: '
						: 'Save to OS keychain: '
				}
				onSubmit={handleSigningPasswordSubmit}
				onCancel={() => setState('menu')}
			/>
		);
	}

	if (state === 'dev') {
		return (
			<DevScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={getEffectiveDevProperties()!}
				signed={currentCommand === 'dev-signed'}
				onBack={() => setState('menu')}
				onRetryCredentials={() => {
					setDevPassword('');
					if (project.devProperties) project.devProperties.password = undefined;
					if (currentCommand === 'dev-signed') {
						setSigningPassword('');
						// The saved password may be what failed — don't re-offer it.
						setSigningRetry(true);
					}
					setState('dev-password-input');
				}}
				signingCredentials={
					currentCommand === 'dev-signed' &&
					project.devProperties?.signingUsername
						? {
								username: project.devProperties.signingUsername,
								password: signingPassword,
								certificateName: project.devProperties.certificateName,
							}
						: undefined
				}
			/>
		);
	}

	if (state === 'watch') {
		const watchSigned = currentCommand === 'watch-signed';
		return (
			<DevScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties}
				signed={watchSigned}
				deploy={false}
				onBack={() => setState('menu')}
				onRetryCredentials={
					watchSigned
						? () => {
								setSigningPassword('');
								// The saved password may be what failed — don't re-offer it.
								setSigningRetry(true);
								routeToSigningStep('watch-signed');
							}
						: undefined
				}
				signingCredentials={
					watchSigned && project.devProperties?.signingUsername
						? {
								username: project.devProperties.signingUsername,
								password: signingPassword,
								certificateName: project.devProperties.certificateName,
							}
						: undefined
				}
			/>
		);
	}

	if (state === 'build') {
		return (
			<BuildScreen
				projectRoot={project.root}
				manifest={project.manifest}
				createZip={true}
				onBack={() => setState('menu')}
			/>
		);
	}

	if (state === 'sign') {
		return (
			<SignScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties!}
				password={signingPassword}
				onBack={() => setState('menu')}
				onRetryCredentials={() => {
					setSigningPassword('');
					setState('signing-password-input');
				}}
			/>
		);
	}

	if (state === 'deploy') {
		return (
			<DeployScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={getEffectiveDevProperties()!}
				force={currentCommand === 'deploy-force'}
				production={currentCommand === 'deploy-production'}
				activate={currentCommand === 'deploy-production'}
				onBack={() => setState('menu')}
				onRetryCredentials={() => {
					setDevPassword('');
					if (project.devProperties) project.devProperties.password = undefined;
					setState('dev-password-input');
				}}
			/>
		);
	}

	if (state === 'setup-signing') {
		return (
			<SigningPropertiesForm
				projectRoot={project.root}
				onComplete={() => {
					// Re-detect so the newly written signing credentials are reflected
					// in memory (hasSigningProperties, keychain password) without a restart.
					reloadProject();
					setState('menu');
				}}
				onCancel={() => setState('menu')}
			/>
		);
	}

	return null;
}
