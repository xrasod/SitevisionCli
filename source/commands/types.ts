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
	flags?: Record<string, {
		type: 'string' | 'boolean';
		description: string;
		alias?: string;
		default?: any;
	}>;
	execute: (context: CommandContext) => Promise<void>;
}
