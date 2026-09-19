import {type ProjectInfo} from '../utils/project-detection.js';

export interface CommandContext {
	project: ProjectInfo;
	flags: Record<string, any>;
	args: string[];
}

export interface Command {
	name: string;
	description: string;
	requiresProject: boolean;
	execute: (context: CommandContext) => Promise<void>;
}
