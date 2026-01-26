import React, {useState, useEffect} from 'react';
import {Box, Text, useApp} from 'ink';
import {type ProjectInfo} from './utils/project-detection.js';
import {MainMenu} from './components/MainMenu.js';
import {InfoScreen} from './components/InfoScreen.js';
import {SetupFlow} from './components/SetupFlow.js';
import {runNpmScript} from './utils/process-runner.js';
import {ProcessOutputComponent} from './components/ProcessOutput.js';
import {StatusIndicator} from './components/StatusIndicator.js';
import {promptPassword} from './utils/password-prompt.js';

type Props = {
	project: ProjectInfo;
};

type AppState = 'setup' | 'menu' | 'running' | 'info' | 'signing-prompt';

export default function App({project}: Props) {
	const {exit} = useApp();
	const [state, setState] = useState<AppState>('setup');
	const [currentCommand, setCurrentCommand] = useState<string>('');
	const [runner, setRunner] = useState<any>(null);
	const [commandStatus, setCommandStatus] = useState<
		'running' | 'success' | 'error'
	>('running');

	// Handle signing password prompt
	useEffect(() => {
		if (state === 'signing-prompt') {
			// Exit Ink temporarily to prompt for password
			exit();

			const signingUsername = project.devProperties?.signingUsername || '';
			const certificateName = project.devProperties?.certificateName || '';

			console.log('\n\x1b[36m\x1b[1mSigning Credentials\x1b[0m');
			console.log(`Username: ${signingUsername}\n`);

			promptPassword('Password: ').then((password) => {
				if (!password) {
					console.log('\x1b[31mPassword is required for signing\x1b[0m');
					process.exit(1);
				}

				// Set env vars and continue
				const env: Record<string, string> = {
					SIGNING_USERNAME: signingUsername,
					SIGNING_PASSWORD: password,
				};
				if (certificateName) {
					env['SIGNING_CERTIFICATE_NAME'] = certificateName;
				}

				// Re-import and run the dev-signed script with env vars
				const {ProcessRunner} = require('./utils/process-runner.js');
				const newRunner = new ProcessRunner('npm', ['run', 'dev-signed'], project.root, false, env);

				newRunner.on('exit', (code: number) => {
					process.exit(code);
				});

				newRunner.on('output', (output: {type: string; data: string}) => {
					if (output.type === 'stdout') {
						process.stdout.write(output.data);
					} else {
						process.stderr.write(output.data);
					}
				});

				console.log('\n\x1b[36mStarting dev-signed...\x1b[0m\n');
				newRunner.run().catch((err: Error) => {
					console.error('Failed to start:', err);
					process.exit(1);
				});
			});
		}
	}, [state, project, exit]);

	const handleCommandSelect = (command: string) => {
		// Handle commands that need password prompts specially
		if (command === 'dev-signed' || command === 'sign') {
			if (!project.hasSigningProperties) {
				console.log('\x1b[31mSigning credentials not configured. Run svc setup-signing first.\x1b[0m');
				return;
			}
			// Exit Ink and run the command via CLI
			exit();
			const {spawn} = require('child_process');
			const svcCommand = command === 'sign' ? ['sign'] : ['dev', '--signed'];
			const child = spawn('svc', svcCommand, {
				cwd: project.root,
				stdio: 'inherit',
			});
			child.on('exit', (code: number) => {
				process.exit(code || 0);
			});
			return;
		}

		setCurrentCommand(command);
		setCommandStatus('running');
		setState('running');

		let scriptName = '';
		let args: string[] = [];

		// Map menu commands to npm scripts
		switch (command) {
			case 'dev':
				scriptName = 'dev';
				break;
			case 'build':
				scriptName = 'build';
				break;
			case 'deploy':
				scriptName = 'deploy';
				break;
			case 'deploy-force':
				scriptName = 'deploy';
				args = ['force'];
				break;
			case 'deploy-production':
				scriptName = 'deploy-prod';
				break;
			case 'info':
				// Show info screen
				setState('info');
				return;
		}

		const newRunner = runNpmScript(scriptName, args, project.root);

		newRunner.on('exit', (code: number) => {
			setCommandStatus(code === 0 ? 'success' : 'error');
		});

		setRunner(newRunner);

		newRunner.run().catch(() => {
			setCommandStatus('error');
		});
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

	if (state === 'signing-prompt') {
		// Handled by useEffect - will exit Ink and prompt for password
		return null;
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={commandStatus}
					label={`Running: ${currentCommand}`}
				/>
			</Box>

			{runner && <ProcessOutputComponent runner={runner} />}

			<Box marginTop={1}>
				<Text dimColor>Press Ctrl+C to stop</Text>
			</Box>
		</Box>
	);
}
