import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {type ProjectInfo} from './utils/project-detection.js';
import {MainMenu} from './components/MainMenu.js';
import {InfoScreen} from './components/InfoScreen.js';
import {SetupFlow} from './components/SetupFlow.js';
import {runNpmScript} from './utils/process-runner.js';
import {ProcessOutputComponent} from './components/ProcessOutput.js';
import {StatusIndicator} from './components/StatusIndicator.js';

type Props = {
	project: ProjectInfo;
};

type AppState = 'setup' | 'menu' | 'running' | 'info';

export default function App({project}: Props) {
	const [state, setState] = useState<AppState>('setup');
	const [currentCommand, setCurrentCommand] = useState<string>('');
	const [runner, setRunner] = useState<any>(null);
	const [commandStatus, setCommandStatus] = useState<
		'running' | 'success' | 'error'
	>('running');

	const handleCommandSelect = (command: string) => {
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
			case 'dev-signed':
				scriptName = 'dev-signed';
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
