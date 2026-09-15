import React from 'react';
import {render, Box, Text, useInput} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {deployApp, deployProduction} from '../utils/sitevision-api.js';
import {
	getDeployZipPath,
	getSignedZipPath,
	getAppType,
} from '../utils/project-detection.js';
import {zipExists} from '../utils/zip.js';
import {promptPassword, promptYesNo} from '../utils/password-prompt.js';
import {
	setDeployPassword,
	deleteSessionCookie,
	deleteOAuth2RefreshToken,
} from '../utils/keychain.js';
import {resolveOAuth2AccessToken} from '../utils/oauth2-auth.js';
import {AuthLoginScreen} from '../components/AuthLoginScreen.js';
import type {
	SitevisionManifest,
	DevProperties,
	DeployConfig,
	DeployResponse,
	ProductionDeployConfig,
} from '../types/index.js';

interface DeployScreenProps {
	projectRoot: string;
	manifest: SitevisionManifest;
	devProperties: DevProperties;
	force: boolean;
	production: boolean;
	activate: boolean;
	onBack?: () => void;
	onRetryCredentials?: () => void;
	onChangeAuthMethod?: () => void;
}

type DeployStatus = 'deploying' | 'success' | 'error';

interface DeployState {
	status: DeployStatus;
	message?: string;
	executableId?: string;
	error?: string;
}

export function DeployScreen({
	projectRoot,
	manifest,
	devProperties,
	force,
	production,
	activate,
	onBack,
	onRetryCredentials,
	onChangeAuthMethod,
}: DeployScreenProps) {
	const [state, setState] = React.useState<DeployState>({
		status: 'deploying',
		message: production ? 'Deploying to production...' : 'Deploying to dev...',
	});
	// 'init' resolves cached credentials, 'login' shows the Ink login screen,
	// 'deploy' runs the upload. Token/cookie login now happens here, so both the
	// TUI and the standalone command reach it.
	const [phase, setPhase] = React.useState<'init' | 'login' | 'deploy'>('init');
	const [credential, setCredential] = React.useState<{
		accessToken?: string;
		sessionCookie?: string;
	}>({
		accessToken: devProperties.accessToken,
		sessionCookie: devProperties.sessionCookie,
	});
	const deployStartedRef = React.useRef(false);

	const authMethod = devProperties.authMethod ?? 'basic';
	// OAuth2 and cookie can re-authenticate in-place; basic re-prompts via the
	// parent (TUI password entry).
	const canRelogin = authMethod === 'oauth2' || authMethod === 'cookie';

	// Discard the stored credential and force a fresh login. This is the
	// "retry with new credentials" action for token/cookie auth — the usual fix
	// when a session/token has expired (Sitevision reports that as a 400, not a
	// 401, so it isn't auto-cleared).
	const retryWithFreshLogin = () => {
		const {domain, username} = devProperties;
		if (authMethod === 'cookie' && domain && username) {
			deleteSessionCookie(domain, username);
			devProperties.sessionCookie = undefined;
		} else if (
			authMethod === 'oauth2' &&
			domain &&
			devProperties.oauth2?.clientId
		) {
			deleteOAuth2RefreshToken(domain, devProperties.oauth2.clientId);
			devProperties.accessToken = undefined;
		}

		setCredential({});
		deployStartedRef.current = false;
		setState({
			status: 'deploying',
			message: production
				? 'Deploying to production...'
				: 'Deploying to dev...',
		});
		setPhase('login');
	};

	useInput((input, key) => {
		if (state.status !== 'deploying') {
			if (onBack && (key.escape || input === 'q')) {
				onBack();
			}
			if (state.status === 'error' && input === 'r') {
				if (canRelogin) {
					retryWithFreshLogin();
				} else if (onRetryCredentials) {
					onRetryCredentials();
				}
			}

			if (state.status === 'error' && input === 'm' && onChangeAuthMethod) {
				onChangeAuthMethod();
			}
		}
	});

	// Decide once whether we can deploy straight away or must log in first.
	React.useEffect(() => {
		if (authMethod === 'basic' || devProperties.sessionCookie) {
			setPhase('deploy');
			return;
		}

		if (authMethod === 'cookie') {
			// env/keychain cookie is already loaded in devProperties; none here.
			setPhase('login');
			return;
		}

		if (authMethod === 'oauth2') {
			if (devProperties.accessToken) {
				setPhase('deploy');
				return;
			}

			void (async () => {
				const token = await resolveOAuth2AccessToken(devProperties);
				if (token) {
					setCredential({accessToken: token});
					setPhase('deploy');
				} else {
					setPhase('login');
				}
			})();
			return;
		}

		setPhase('deploy');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	React.useEffect(() => {
		if (phase !== 'deploy' || deployStartedRef.current) return;
		deployStartedRef.current = true;

		async function runDeploy() {
			try {
				const appType = getAppType(manifest);
				// Credential resolved in the init effect / login screen.
				const {accessToken, sessionCookie} = credential;

				// A stale session fails without a clean 401 — clear the stored cookie
				// so the next run re-authenticates. Skip when SITEVISION_SESSION_COOKIE
				// is set: detection re-reads it first, so clearing would just replay
				// the same dead cookie in a loop.
				const clearStaleCookie = (result: DeployResponse) => {
					if (
						result.authExpired &&
						authMethod === 'cookie' &&
						!process.env['SITEVISION_SESSION_COOKIE'] &&
						devProperties.domain &&
						devProperties.username
					) {
						deleteSessionCookie(devProperties.domain, devProperties.username);
					}
				};

				if (production) {
					// Production deployment requires a signed zip
					const signedZipPath = getSignedZipPath(projectRoot, manifest);

					if (!zipExists(signedZipPath)) {
						setState({
							status: 'error',
							error: `Signed zip not found: ${signedZipPath}\nRun 'sign' first to create the signed zip.`,
						});
						return;
					}

					const config: ProductionDeployConfig = {
						domain: devProperties.domain,
						siteName: devProperties.siteName,
						addonName: devProperties.addonName,
						username: devProperties.username,
						password: devProperties.password,
						accessToken,
						sessionCookie,
						useHTTP: devProperties.useHTTPForDevDeploy,
						activate,
					};

					const result = await deployProduction(signedZipPath, config, appType);

					if (!result.success) {
						clearStaleCookie(result);
						setState({
							status: 'error',
							error: result.error || 'Deployment failed',
						});
						return;
					}

					setState({
						status: 'success',
						message: result.message || 'Deployed to production successfully',
						executableId: result.executableId,
					});
				} else {
					const zipPath = getDeployZipPath(projectRoot, manifest);

					if (!zipExists(zipPath)) {
						setState({
							status: 'error',
							error: `Zip not found: ${zipPath}\nRun 'build' first to create the zip.`,
						});
						return;
					}

					const config: DeployConfig = {
						domain: devProperties.domain,
						siteName: devProperties.siteName,
						addonName: devProperties.addonName,
						username: devProperties.username,
						password: devProperties.password,
						accessToken,
						sessionCookie,
						useHTTP: devProperties.useHTTPForDevDeploy,
					};

					const result = await deployApp(zipPath, config, appType, force);

					if (!result.success) {
						clearStaleCookie(result);
						setState({
							status: 'error',
							error: result.error || 'Deployment failed',
						});
						return;
					}

					setState({
						status: 'success',
						message: 'Deployed to dev successfully',
						executableId: result.executableId,
					});
				}
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		runDeploy();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase]);

	if (phase === 'login' && state.status !== 'error') {
		return (
			<AuthLoginScreen
				method={
					(devProperties.authMethod ?? 'basic') === 'cookie'
						? 'cookie'
						: 'oauth2'
				}
				devProperties={devProperties}
				onComplete={cred => {
					setCredential(cred);
					setPhase('deploy');
				}}
				onError={message => {
					setState({status: 'error', error: message});
				}}
				onCancel={() => {
					if (onBack) {
						onBack();
					} else {
						setState({status: 'error', error: 'Login cancelled.'});
					}
				}}
			/>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<StatusIndicator
					status={state.status === 'deploying' ? 'running' : state.status}
					label={
						state.status === 'deploying'
							? 'Deploying'
							: state.status === 'success'
								? 'Deployed'
								: 'Failed'
					}
					message={state.message}
				/>
			</Box>

			{/* Deployment info on success */}
			{state.status === 'success' && (
				<Box flexDirection="column" marginLeft={2}>
					<Text color="green">
						{production ? 'Production deployment' : 'Dev deployment'} complete
					</Text>
					{state.executableId && (
						<Text dimColor>Executable ID: {state.executableId}</Text>
					)}
					{force && <Text dimColor>(Force mode - overwrote existing)</Text>}
					{activate && production && <Text dimColor>(Activated)</Text>}
				</Box>
			)}

			{/* Error display */}
			{state.status === 'error' && state.error && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red">{state.error}</Text>
					{canRelogin && (
						<Text color="yellow">
							This can happen when your session or token has expired — log in
							again to get fresh credentials.
						</Text>
					)}
				</Box>
			)}

			{state.status !== 'deploying' && (
				<Box marginTop={1} flexDirection="column">
					{state.status === 'error' && canRelogin && (
						<Text dimColor>Press r to log in again with fresh credentials</Text>
					)}
					{state.status === 'error' && !canRelogin && onRetryCredentials && (
						<Text dimColor>Press r to retry with new credentials</Text>
					)}
					{state.status === 'error' && onChangeAuthMethod && (
						<Text dimColor>Press m to change auth method</Text>
					)}
					{onBack && <Text dimColor>Press q or Esc to return to menu</Text>}
				</Box>
			)}
		</Box>
	);
}

export const deployCommand: Command = {
	name: 'deploy',
	description: 'Deploy the application',
	requiresProject: true,
	flags: {
		force: {
			type: 'boolean',
			description: 'Force deployment (overwrite existing)',
			alias: 'f',
			default: false,
		},
		production: {
			type: 'boolean',
			description: 'Deploy to production (requires signed app)',
			alias: 'p',
			default: false,
		},
		activate: {
			type: 'boolean',
			description: 'Activate the app after production deployment',
			alias: 'a',
			default: false,
		},
	},
	async execute({project, flags}) {
		// Check if dev properties are configured
		if (!project.hasDevProperties || !project.devProperties) {
			console.log('\n\x1b[33mDeployment credentials not configured.\x1b[0m');
			console.log(
				'Create a .dev_properties.json file with domain, siteName, addonName, and username, then run setup.\n',
			);
			return;
		}

		// Basic auth prompts for a password here; OAuth2 and cookie resolve or log
		// in inside DeployScreen (Ink-native), so both the TUI and this command
		// share one login path. env/--flag token/cookie are already loaded.
		const authMethod = project.devProperties.authMethod ?? 'basic';
		if (authMethod === 'basic' && !project.devProperties.password) {
			const {domain, username} = project.devProperties;
			console.log('');
			const password = await promptPassword(
				`Deploy password for ${username}@${domain}: `,
			);
			if (!password) {
				console.log('\x1b[31mError: Password is required\x1b[0m');
				return;
			}
			const remember = await promptYesNo(
				'Save password to OS keychain? (y/N): ',
			);
			if (remember && domain && username) {
				setDeployPassword(domain, username, password);
			}
			project.devProperties.password = password;
		}

		const production = Boolean(flags['production']);
		const force = Boolean(flags['force']);
		const activate = Boolean(flags['activate']);

		// Production deploys use the already-signed zip; `sign` is run separately.
		const {waitUntilExit} = render(
			<DeployScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties}
				force={force}
				production={production}
				activate={activate}
			/>,
		);

		await waitUntilExit();
	},
};
