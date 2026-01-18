import React from 'react';
import {render} from 'ink';
import {Box} from 'ink';
import {type Command} from './types.js';
import {runNpmScript} from '../utils/process-runner.js';
import {ProcessOutputComponent} from '../components/ProcessOutput.js';
import {StatusIndicator} from '../components/StatusIndicator.js';

interface DeployScreenProps {
	projectRoot: string;
	force?: boolean;
	production?: boolean;
}

function DeployScreen({projectRoot, force, production}: DeployScreenProps) {
	const [status, setStatus] = React.useState<'running' | 'success' | 'error'>(
		'running',
	);

	const scriptName = production ? 'deploy-prod' : 'deploy';
	const args = force ? ['force'] : [];

	const runner = React.useMemo(
		() => runNpmScript(scriptName, args, projectRoot),
		[projectRoot, scriptName, args],
	);

	React.useEffect(() => {
		runner.on('exit', (code) => {
			setStatus(code === 0 ? 'success' : 'error');
		});

		runner.run().catch((error) => {
			console.error('Deployment failed:', error);
			setStatus('error');
		});
	}, [runner]);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={status}
					label={production ? 'Deploying to production' : 'Deploying to dev'}
					message={force ? '(force mode)' : undefined}
				/>
			</Box>

			<ProcessOutputComponent runner={runner} />
		</Box>
	);
}

export const deployCommand: Command = {
	name: 'deploy',
	description: 'Deploy the application',
	requiresProject: true,
	flags: {
		force: {
			type: 'boolean',
			description: 'Force deployment (overwrite existing)',
			alias: 'f',
			default: false,
		},
		production: {
			type: 'boolean',
			description: 'Deploy to production',
			alias: 'p',
			default: false,
		},
	},
	async execute({project, flags}) {
		const {waitUntilExit} = render(
			<DeployScreen
				projectRoot={project.root}
				force={flags['force']}
				production={flags['production']}
			/>,
		);

		await waitUntilExit();
	},
};
