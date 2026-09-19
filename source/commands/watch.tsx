import {render} from 'ink';
import {type Command} from './types.js';
import {DevScreen, resolveSigningForCli} from './dev.js';
import type {SigningCredentials} from '../types/index.js';

export const watchCommand: Command = {
	name: 'watch',
	description: 'Watch and rebuild (optionally signing) without deploying',
	requiresProject: true,
	async execute({project, flags}) {
		let signingCredentials: SigningCredentials | undefined;
		if (flags['signed']) {
			signingCredentials = await resolveSigningForCli(project);
			if (!signingCredentials) return;
		}

		const {waitUntilExit} = render(
			<DevScreen
				project={project}
				options={{deploy: false, signingCredentials}}
			/>,
		);

		await waitUntilExit();
	},
};
