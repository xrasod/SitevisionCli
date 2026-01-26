import React, {useState} from 'react';
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

type Props = {
	project: ProjectInfo;
};

type AppState =
	| 'setup'
	| 'menu'
	| 'info'
	| 'password-input'
	| 'dev'
	| 'build'
	| 'deploy'
	| 'sign'
	| 'setup-signing';

export default function App({project}: Props) {
	const [state, setState] = useState<AppState>('setup');
	const [currentCommand, setCurrentCommand] = useState<string>('');
	const [signingPassword, setSigningPassword] = useState<string>('');

	const handlePasswordSubmit = (password: string) => {
		setSigningPassword(password);
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
				setState('dev');
				break;
			case 'dev-signed':
			case 'sign':
				if (!project.hasSigningProperties) {
					// This should ideally be handled by a UI alert, but for now we'll just log
					console.log(
						'\x1b[31mSigning credentials not configured. Run svc setup-signing first.\x1b[0m',
					);
					return;
				}

				if (signingPassword) {
					if (command === 'dev-signed') {
						setState('dev');
					} else {
						setState('sign');
					}
				} else {
					setState('password-input');
				}
				break;
			case 'build':
				setState('build');
				break;
			case 'deploy':
			case 'deploy-force':
			case 'deploy-production':
				setState('deploy');
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

	if (state === 'password-input') {
		return (
			<PasswordInput
				onSubmit={handlePasswordSubmit}
				onCancel={() => setState('menu')}
			/>
		);
	}

	if (state === 'dev') {
		return (
			<DevScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties!}
				signed={currentCommand === 'dev-signed'}
				onBack={() => setState('menu')}
				signingCredentials={
					currentCommand === 'dev-signed' && project.devProperties?.signingUsername
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
			/>
		);
	}

	if (state === 'deploy') {
		return (
			<DeployScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties!}
				force={currentCommand === 'deploy-force'}
				production={currentCommand === 'deploy-production'}
				activate={currentCommand === 'deploy-production'}
				onBack={() => setState('menu')}
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

