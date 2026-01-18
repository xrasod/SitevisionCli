import React from 'react';
import {render} from 'ink';
import {Box} from 'ink';
import {type Command} from './types.js';
import {runNpmScript} from '../utils/process-runner.js';
import {ProcessOutputComponent} from '../components/ProcessOutput.js';
import {StatusIndicator} from '../components/StatusIndicator.js';

interface BuildScreenProps {
	projectRoot: string;
}

function BuildScreen({projectRoot}: BuildScreenProps) {
	const [status, setStatus] = React.useState<'running' | 'success' | 'error'>(
		'running',
	);
	const runner = React.useMemo(() => runNpmScript('build', [], projectRoot), [
		projectRoot,
	]);

	React.useEffect(() => {
		runner.on('exit', (code) => {
			setStatus(code === 0 ? 'success' : 'error');
		});

		runner.run().catch((error) => {
			console.error('Build failed:', error);
			setStatus('error');
		});
	}, [runner]);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={status}
					label="Building application"
					message={
						status === 'running' ? 'Compiling...' : undefined
					}
				/>
			</Box>

			<ProcessOutputComponent runner={runner} />
		</Box>
	);
}

export const buildCommand: Command = {
	name: 'build',
	description: 'Build the application for production',
	requiresProject: true,
	async execute({project}) {
		const {waitUntilExit} = render(<BuildScreen projectRoot={project.root} />);
		await waitUntilExit();
	},
};
