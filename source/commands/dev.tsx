import React from 'react';
import {render, Box, Text, useApp, useInput, useStdin, useStdout} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {promptPassword, promptYesNo} from '../utils/password-prompt.js';
import {setDeployPassword} from '../utils/keychain.js';
import {resolveSigningPassword} from '../utils/signing-password.js';
import {startDev, useTasks, type DevOptions} from '../utils/tasks.js';
import {toDeployConfig} from '../utils/workspace.js';
import {Log} from '../shell/Tabs.js';
import type {
	DevProperties,
	ProjectInfo,
	SigningCredentials,
} from '../types/index.js';

interface DevScreenProps {
	project: ProjectInfo;
	options: DevOptions;
}

/** Standalone `svc dev` / `svc watch`: one task, its log, Ctrl+C or q to stop. */
export function DevScreen({project, options}: DevScreenProps) {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const tasks = useTasks();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const task = React.useMemo(() => startDev(project, options), []);
	const live = tasks.find(t => t.id === task.id) ?? task;

	const {isRawModeSupported} = useStdin();
	useInput(
		(input, key) => {
			if (key.escape || input === 'q') {
				live.stop();
				exit();
			}
		},
		// Undefined, not false, on a pipe; and useInput reads undefined as active.
		{isActive: Boolean(isRawModeSupported)},
	);

	const status =
		live.status === 'running'
			? live.phase === 'error'
				? 'error'
				: 'running'
			: live.status === 'success'
				? 'success'
				: 'error';

	return (
		<Box flexDirection="column" padding={1}>
			<StatusIndicator
				status={status}
				label={live.phase}
				message={`${live.label} ${live.appName}`}
			/>
			<Box marginTop={1}>
				<Log task={live} height={(stdout.rows || 24) - 6} scroll={0} wrap />
			</Box>
			<Text dimColor>Press q, Esc or Ctrl+C to stop</Text>
		</Box>
	);
}

/** Resolve signing credentials for signed dev/watch, prompting if needed. */
export async function resolveSigningForCli(
	project: ProjectInfo,
): Promise<SigningCredentials | undefined> {
	if (
		!project.hasSigningProperties ||
		!project.devProperties?.signingUsername
	) {
		console.log('\n\x1b[33mSigning credentials not configured.\x1b[0m');
		console.log('Run \x1b[36msetup-signing\x1b[0m to configure credentials.\n');
		process.exitCode = 1;
		return undefined;
	}

	const signingUsername = project.devProperties.signingUsername;
	const password = await resolveSigningPassword(signingUsername);
	if (!password) {
		console.log('\x1b[31mError: Password is required for signed mode\x1b[0m');
		process.exitCode = 1;
		return undefined;
	}

	return {
		username: signingUsername,
		password,
		certificateName: project.devProperties.certificateName,
	};
}

/** Basic auth without a stored password: ask for it. False when there is none. */
export async function resolveDeployPasswordForCli(
	dev: DevProperties,
): Promise<boolean> {
	if ((dev.authMethod ?? 'basic') !== 'basic' || dev.password) return true;
	const {domain, username} = dev;
	console.log('');
	const password = await promptPassword(
		`Deploy password for ${username}@${domain}: `,
	);
	if (!password) {
		console.log('\x1b[31mError: Password is required\x1b[0m');
		process.exitCode = 1;
		return false;
	}

	if (await promptYesNo('Save password to OS keychain? (y/N): ')) {
		setDeployPassword(domain, username, password);
	}

	dev.password = password;
	return true;
}

export const devCommand: Command = {
	name: 'dev',
	description: 'Start development server with watch mode',
	requiresProject: true,
	async execute({project, flags}) {
		const dev = project.devProperties;
		const incomplete = toDeployConfig(dev);
		if (!dev || 'error' in incomplete) {
			console.log(
				`\n\x1b[33m${'error' in incomplete ? incomplete.error : ''}\x1b[0m\n`,
			);
			process.exitCode = 1;
			return;
		}

		// The standalone command only prompts for a basic password; OAuth2/cookie
		// logins are interactive and live in the shell (`svc`) or `svc deploy`.
		if (
			(dev.authMethod ?? 'basic') !== 'basic' &&
			!dev.accessToken &&
			!dev.sessionCookie
		) {
			console.log(
				'\n\x1b[33mNo token/cookie available. Run `svc` and use Dev from the shell, or set SITEVISION_ACCESS_TOKEN / SITEVISION_SESSION_COOKIE.\x1b[0m\n',
			);
			process.exitCode = 1;
			return;
		}

		if (!(await resolveDeployPasswordForCli(dev))) return;

		let signingCredentials: SigningCredentials | undefined;
		if (flags['signed']) {
			signingCredentials = await resolveSigningForCli(project);
			if (!signingCredentials) return;
		}

		const {waitUntilExit} = render(
			<DevScreen
				project={project}
				options={{
					deploy: true,
					signingCredentials,
					deployConfig: {...incomplete.config, password: dev.password},
				}}
			/>,
		);

		await waitUntilExit();
	},
};
