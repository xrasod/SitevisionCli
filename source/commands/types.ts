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
	// Honors -e/--environment. The CLI refuses the flag for commands without
	// it, rather than silently acting on the base environment.
	supportsEnvironment?: boolean;
	execute: (context: CommandContext) => Promise<void>;
}
