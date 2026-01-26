import {type Command} from './types.js';
import {devCommand} from './dev.js';
import {buildCommand} from './build.js';
import {deployCommand} from './deploy.js';
import {infoCommand} from './info.js';
import {setupSigningCommand} from './setup-signing.js';

export const commands: Command[] = [
	devCommand,
	buildCommand,
	deployCommand,
	infoCommand,
	setupSigningCommand,
];

export function getCommand(name: string): Command | undefined {
	return commands.find((cmd) => cmd.name === name);
}

export function getAllCommands(): Command[] {
	return commands;
}
