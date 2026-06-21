import {useState} from 'react';
import {type ProjectInfo} from './utils/project-detection.js';
import {MainMenu} from './components/MainMenu.js';
import {InfoScreen} from './components/InfoScreen.js';
import {SetupFlow} from './components/SetupFlow.js';
import {PasswordInput} from './components/PasswordInput.js';
import {DevScreen} from './commands/dev.js';
import {BuildScreen} from './commands/build.js';
import {DeployScreen} from './commands/deploy.js';
import {SignScreen} from './commands/sign.js';
import {SigningPropertiesForm} from './components/SigningPropertiesForm.js';
import {
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
	| 'dev'
	| 'build'
	| 'deploy'
	| 'sign'
	| 'setup-signing';

export default function App({project}: Props) {
	const [state, setState] = useState<AppState>('setup');
	const [currentCommand, setCurrentCommand] = useState<string>('');
	const [signingPassword, setSigningPassword] = useState<string>('');
	const [devPassword, setDevPassword] = useState<string>('');

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
			if (currentCommand === 'dev-signed' && !signingPassword) {
				setState('signing-password-input');
			} else {
				setState('dev');
			}
		} else if (currentCommand.startsWith('deploy')) {
			setState('deploy');
		}
	};

	const handleSigningPasswordSubmit = (password: string, remember: boolean) => {
		setSigningPassword(password);
		if (remember && project.devProperties?.signingUsername && password) {
			saveSigningPassword(project.devProperties.signingUsername, password);
		}
		if (currentCommand === 'dev-signed') {
			setState('dev');
		} else {
			setState('sign');
		}
	};

	const handleCommandSelect = (command: string) => {
		setCurrentCommand(command);

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
				} else if (!signingPassword) {
					setState('signing-password-input');
				} else {
					setState('dev');
				}
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
				if (signingPassword) {
					setState('sign');
				} else {
					setState('signing-password-input');
				}
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
		return <SetupFlow project={project} onComplete={() => setState('menu')} />;
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

	if (state === 'signing-password-input') {
		return (
			<PasswordInput
				key="signing-password"
				label="Enter Signing Password (developer.sitevision.se)"
				showRememberOption={Boolean(project.devProperties?.signingUsername)}
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
					// We can't easily update project info here without full reload,
					// but since we are just returning to menu, it's fine.
					// The user might need to restart CLI or we implement a reload mechanism.
					setState('menu');
				}}
				onCancel={() => setState('menu')}
			/>
		);
	}

	return null;
}
