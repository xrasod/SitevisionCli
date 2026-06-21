import {render} from 'ink';
import {type Command} from './types.js';
import {DevScreen} from './dev.js';
import {resolveSigningPassword} from '../utils/signing-password.js';
import type {SigningCredentials} from '../types/index.js';

export const watchCommand: Command = {
	name: 'watch',
	description: 'Watch and rebuild (optionally signing) without deploying',
	requiresProject: true,
	flags: {
		signed: {
			type: 'boolean',
			description: 'Sign after each build',
			alias: 's',
			default: false,
		},
	},
	async execute({project, flags}) {
		const signed = Boolean(flags['signed']);
		let signingCredentials: SigningCredentials | undefined;

		// Signed mode: resolve signing credentials (keychain → env → prompt).
		// No deploy credentials are needed — watch never deploys.
		if (signed) {
			if (
				!project.hasSigningProperties ||
				!project.devProperties?.signingUsername
			) {
				console.log('\n\x1b[33mSigning credentials not configured.\x1b[0m');
				console.log(
					'Run \x1b[36msetup-signing\x1b[0m to configure credentials.\n',
				);
				return;
			}

			const signingUsername = project.devProperties.signingUsername;
			const password = await resolveSigningPassword(signingUsername);

			if (!password) {
				console.log(
					'\x1b[31mError: Password is required for signed mode\x1b[0m',
				);
				return;
			}

			signingCredentials = {
				username: signingUsername,
				password,
				certificateName: project.devProperties.certificateName,
			};
		}

		const {waitUntilExit} = render(
			<DevScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties}
				signed={signed}
				deploy={false}
				signingCredentials={signingCredentials}
			/>,
		);

		await waitUntilExit();
	},
};
