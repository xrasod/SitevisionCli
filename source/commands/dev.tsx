import React from 'react';
import {render} from 'ink';
import {Box, Text} from 'ink';
import {type Command} from './types.js';
import {runNpmScript} from '../utils/process-runner.js';
import {ProcessOutputComponent} from '../components/ProcessOutput.js';
import {StatusIndicator} from '../components/StatusIndicator.js';

interface DevScreenProps {
	projectRoot: string;
	signed?: boolean;
}

function DevScreen({projectRoot, signed}: DevScreenProps) {
	const [status, setStatus] = React.useState<'running' | 'error'>('running');
	const runner = React.useMemo(
		() => runNpmScript(signed ? 'dev-signed' : 'dev', [], projectRoot),
		[projectRoot, signed],
	);

	React.useEffect(() => {
		runner.on('exit', (code) => {
			setStatus(code === 0 ? 'running' : 'error');
		});

		runner.run().catch((error) => {
			console.error('Failed to start dev server:', error);
			setStatus('error');
		});

		return () => {
			runner.kill();
		};
	}, [runner]);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={status === 'running' ? 'running' : 'error'}
					label="Development Server"
					message={signed ? '(with signing)' : '(watching for changes)'}
				/>
			</Box>

			<ProcessOutputComponent runner={runner} />

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
			description: 'Use dev-signed mode (automatic signing)',
			default: false,
		},
	},
	async execute({project, flags}) {
		const {waitUntilExit} = render(
			<DevScreen projectRoot={project.root} signed={flags['signed']} />,
		);

		await waitUntilExit();
	},
};
