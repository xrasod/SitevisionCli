import {render} from 'ink';
import {type Command} from './types.js';
import {TaskScreen} from './TaskScreen.js';
import {resolveSigningForCli} from './dev.js';
import {startSign} from '../utils/tasks.js';

export const signCommand: Command = {
	name: 'sign',
	description: 'Sign the app for production deployment',
	requiresProject: true,
	async execute({project}) {
		const credentials = await resolveSigningForCli(project);
		if (!credentials) return;
		const task = startSign(project, credentials);
		await render(<TaskScreen task={task} />).waitUntilExit();
	},
};
