import {render} from 'ink';
import {type Command} from './types.js';
import {TaskScreen} from './TaskScreen.js';
import {startBuild} from '../utils/tasks.js';

export const buildCommand: Command = {
	name: 'build',
	description: 'Build the application for production',
	requiresProject: true,
	async execute({project, flags}) {
		const task = startBuild(project, {zip: flags['zip'] !== false});
		await render(<TaskScreen task={task} />).waitUntilExit();
	},
};
