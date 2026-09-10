import React from 'react';
import {render, Box, Text, useInput} from 'ink';
import {type Command} from './types.js';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {deployApp, deployProduction} from '../utils/sitevision-api.js';
import {
	getZipPath,
	getSignedZipPath,
	getAppType,
} from '../utils/project-detection.js';
import {zipExists} from '../utils/zip.js';
import {promptPassword, promptYesNo} from '../utils/password-prompt.js';
import {setDeployPassword, deleteSessionCookie} from '../utils/keychain.js';
import {resolveOAuth2AccessToken} from '../utils/oauth2-auth.js';
import {resolveSessionCookie} from '../utils/session-cookie-auth.js';
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
	signingPassword?: string;
	onBack?: () => void;
	onRetryCredentials?: () => void;
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
	signingPassword,
	onBack,
	onRetryCredentials,
}: DeployScreenProps) {
	const [state, setState] = React.useState<DeployState>({
		status: 'deploying',
		message: production ? 'Deploying to production...' : 'Deploying to dev...',
	});

	useInput((input, key) => {
		if (state.status !== 'deploying') {
			if (onBack && (key.escape || input === 'q')) {
				onBack();
			}
			if (onRetryCredentials && state.status === 'error' && input === 'r') {
				onRetryCredentials();
			}
		}
	});

	React.useEffect(() => {
		async function runDeploy() {
			try {
				const appType = getAppType(manifest);

				// Resolve an OAuth2 token silently (env/keychain refresh). A fresh
				// browser login happens only in the direct `svc deploy` command, which
				// sets accessToken before rendering — the Ink menu can't own the
				// terminal for a login, so it resolves refresh-only here.
				const authMethod = devProperties.authMethod ?? 'basic';
				let accessToken = devProperties.accessToken;
				if (authMethod === 'oauth2' && !accessToken) {
					accessToken =
						(await resolveOAuth2AccessToken(devProperties, {
							interactive: false,
						})) ?? undefined;
					if (!accessToken) {
						setState({
							status: 'error',
							error:
								'No OAuth2 access token. Run `svc deploy` from a terminal to log in, or set SITEVISION_ACCESS_TOKEN.',
						});
						return;
					}
				}

				let sessionCookie = devProperties.sessionCookie;
				if (authMethod === 'cookie' && !sessionCookie) {
					sessionCookie =
						(await resolveSessionCookie(devProperties, {
							interactive: false,
						})) ?? undefined;
					if (!sessionCookie) {
						setState({
							status: 'error',
							error:
								'No session cookie. Run `svc deploy` from a terminal to log in, or set SITEVISION_SESSION_COOKIE.',
						});
						return;
					}
				}

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
					// Dev deployment can use unsigned zip
					const zipPath = getZipPath(projectRoot, manifest);

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
	}, [
		projectRoot,
		manifest,
		devProperties,
		force,
		production,
		activate,
		signingPassword,
	]);

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
				</Box>
			)}

			{state.status !== 'deploying' && (
				<Box marginTop={1} flexDirection="column">
					{state.status === 'error' && onRetryCredentials && (
						<Text dimColor>Press r to retry with new credentials</Text>
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

		// Resolve deploy credentials. A token/cookie from env/--flag (already
		// loaded in detectProject / cli) short-circuits everything.
		const authMethod = project.devProperties.authMethod ?? 'basic';
		if (
			project.devProperties.accessToken ||
			project.devProperties.sessionCookie
		) {
			// Nothing to acquire — a bearer token or session cookie is in hand.
		} else if (authMethod === 'oauth2') {
			const token = await resolveOAuth2AccessToken(project.devProperties);
			if (!token) {
				console.log(
					'\n\x1b[31mError: No OAuth2 access token available.\x1b[0m',
				);
				console.log(
					'Set SITEVISION_ACCESS_TOKEN, pass --token, or configure the oauth2 endpoints in .dev_properties.json to log in.\n',
				);
				return;
			}
			project.devProperties.accessToken = token;
		} else if (authMethod === 'cookie') {
			const cookie = await resolveSessionCookie(project.devProperties);
			if (!cookie) {
				console.log('\n\x1b[31mError: No session cookie available.\x1b[0m');
				console.log(
					'Log in when the browser opens, or set SITEVISION_SESSION_COOKIE / pass --cookie.\n',
				);
				return;
			}
			project.devProperties.sessionCookie = cookie;
		} else if (!project.devProperties.password) {
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

		// For production, we need the signed zip, which requires signing credentials
		let signingPassword: string | undefined;
		if (
			production &&
			project.hasSigningProperties &&
			project.devProperties.signingUsername
		) {
			// We already have a signed zip, no need to prompt for password here
			// The sign command should have been run separately
		}

		const {waitUntilExit} = render(
			<DeployScreen
				projectRoot={project.root}
				manifest={project.manifest}
				devProperties={project.devProperties}
				force={force}
				production={production}
				activate={activate}
				signingPassword={signingPassword}
			/>,
		);

		await waitUntilExit();
	},
};
