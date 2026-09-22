import {useEffect, useState} from 'react';
import {render, Box, Text, useApp, useInput, useStdin} from 'ink';
import {type Command} from './types.js';
import {TaskScreen} from './TaskScreen.js';
import {useFinish} from './use-finish.js';
import {resolveDeployPasswordForCli} from './dev.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {AuthLoginScreen} from '../components/AuthLoginScreen.js';
import {
	deleteSessionCookie,
	deleteOAuth2RefreshToken,
} from '../utils/keychain.js';
import {resolveOAuth2AccessToken} from '../utils/oauth2-auth.js';
import {startDeploy, useTasks, type Task} from '../utils/tasks.js';
import {toDeployConfig} from '../utils/workspace.js';
import type {ProjectInfo} from '../types/index.js';
import {say} from '../utils/debug.js';

interface DeployScreenProps {
	project: ProjectInfo;
	force: boolean;
	production: boolean;
	activate: boolean;
}

interface Credential {
	accessToken?: string;
	sessionCookie?: string;
}

/** Standalone `svc deploy`: log in if needed, then run the shell's deploy task. */
export function DeployScreen({
	project,
	force,
	production,
	activate,
}: DeployScreenProps) {
	const devProperties = project.devProperties!;
	const {exit} = useApp();
	// Undefined, not false, on a pipe; and useInput reads undefined as active.
	const interactive = Boolean(useStdin().isRawModeSupported);
	// 'init' resolves cached credentials, 'login' shows the login screen,
	// 'deploy' starts the task.
	const [phase, setPhase] = useState<'init' | 'login' | 'deploy'>('init');
	const [credential, setCredential] = useState<Credential>({
		accessToken: devProperties.accessToken,
		sessionCookie: devProperties.sessionCookie,
	});
	const [task, setTask] = useState<Task>();
	// Anything that goes wrong before there is a task to show it.
	const [failure, setFailure] = useState<string>();

	const authMethod = devProperties.authMethod ?? 'basic';
	// OAuth2 and cookie can re-authenticate in place, given a terminal to do it in.
	const canRelogin =
		interactive && (authMethod === 'oauth2' || authMethod === 'cookie');
	const live = useTasks().find(t => t.id === task?.id) ?? task;
	const failed = Boolean(failure) || live?.status === 'error';

	useFinish(failure && !task ? 'error' : undefined, canRelogin);

	// A browser login needs a terminal; without one only env credentials work.
	const startLogin = () => {
		if (interactive) {
			setPhase('login');
		} else {
			setFailure(
				'No stored login and no terminal to log in from. Set SITEVISION_ACCESS_TOKEN or SITEVISION_SESSION_COOKIE.',
			);
		}
	};

	// Drop the stored credential and log in again: the usual fix for an expired
	// session or token, which Sitevision reports as a 400 rather than a 401.
	const retryWithFreshLogin = () => {
		const {domain, username} = devProperties;
		if (authMethod === 'cookie') {
			deleteSessionCookie(domain, username);
		} else if (devProperties.oauth2?.clientId) {
			deleteOAuth2RefreshToken(domain, devProperties.oauth2.clientId);
		}

		setCredential({});
		setFailure(undefined);
		setTask(undefined);
		setPhase('login');
	};

	useInput(
		(input, key) => {
			if (!failed) return;
			if (input === 'r') retryWithFreshLogin();
			if (key.escape || input === 'q') exit();
		},
		{isActive: canRelogin},
	);

	// Decide once whether to deploy straight away or log in first.
	useEffect(() => {
		if (authMethod === 'basic' || credential.sessionCookie) {
			setPhase('deploy');
		} else if (authMethod === 'cookie') {
			startLogin();
		} else if (credential.accessToken) {
			setPhase('deploy');
		} else {
			void (async () => {
				const token = await resolveOAuth2AccessToken(devProperties);
				if (token) {
					setCredential({accessToken: token});
					setPhase('deploy');
				} else {
					startLogin();
				}
			})();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (phase !== 'deploy' || task) return;
		const complete = toDeployConfig({...devProperties, ...credential});
		if ('error' in complete) {
			setFailure(complete.error);
			return;
		}

		setTask(
			startDeploy(project, complete.config, {force, production, activate}),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase, task]);

	if (phase === 'login' && !failure) {
		return (
			<AuthLoginScreen
				method={authMethod === 'cookie' ? 'cookie' : 'oauth2'}
				devProperties={devProperties}
				onComplete={next => {
					setCredential(next);
					setPhase('deploy');
				}}
				onError={setFailure}
				onCancel={() => {
					setFailure('Login cancelled.');
				}}
			/>
		);
	}

	const retryHint = failed && canRelogin && (
		<Box marginTop={1} flexDirection="column">
			<Text color="yellow">
				This can happen when your session or token has expired.
			</Text>
			<Text dimColor>
				Press r to log in again with fresh credentials, q to quit
			</Text>
		</Box>
	);

	if (task) {
		return (
			<TaskScreen task={task} stay={canRelogin}>
				{retryHint}
			</TaskScreen>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<StatusIndicator
				status={failure ? 'error' : 'running'}
				label={failure ? 'Failed' : 'Preparing'}
				message={failure}
			/>
			{retryHint}
		</Box>
	);
}

export const deployCommand: Command = {
	name: 'deploy',
	description: 'Deploy the application',
	requiresProject: true,
	async execute({project, flags}) {
		const complete = toDeployConfig(project.devProperties);
		if ('error' in complete) {
			say(`\n\x1b[33m${complete.error}\x1b[0m\n`);
			process.exitCode = 1;
			return;
		}

		// OAuth2 and cookie log in inside DeployScreen; basic asks here.
		if (!(await resolveDeployPasswordForCli(project.devProperties!))) return;

		// Production deploys use the already-signed zip; `sign` is run separately.
		await render(
			<DeployScreen
				project={project}
				force={Boolean(flags['force'])}
				production={Boolean(flags['production'])}
				activate={Boolean(flags['activate'])}
			/>,
		).waitUntilExit();
	},
};
