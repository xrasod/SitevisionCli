import {type Command} from './types.js';
import {resolveDeployPasswordForCli} from './dev.js';
import {configAuth, delay} from '../utils/sitevision-api.js';
import {resolveOAuth2AccessToken} from '../utils/oauth2-auth.js';
import {LogTailAuthError, isFatalEnd, tailLog} from '../utils/log-tail.js';
import {say} from '../utils/debug.js';
import {baseEnvironment} from '../utils/environments.js';

const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const RETRY_DELAY_MS = 3000;

export const logsCommand: Command = {
	name: 'logs',
	description: 'Tail the server log (or the app log with --app)',
	requiresProject: true,
	supportsEnvironment: true,
	async execute({project, flags}) {
		const dev = project.devProperties;
		if (!dev?.domain) {
			say(`\n${YELLOW}Deploy config is missing "domain".${RESET}\n`);
			process.exitCode = 1;
			return;
		}

		const method = dev.authMethod ?? 'basic';
		// OAuth2 refreshes silently from the keychain, exactly as deploy does.
		if (method === 'oauth2' && !dev.accessToken) {
			dev.accessToken = (await resolveOAuth2AccessToken(dev)) ?? undefined;
		}

		if (method !== 'basic' && !dev.accessToken && !dev.sessionCookie) {
			say(
				`\n${YELLOW}No ${method} credential for ${dev.domain}. Log in with svc deploy, or set SITEVISION_ACCESS_TOKEN or SITEVISION_SESSION_COOKIE.${RESET}\n`,
			);
			process.exitCode = 1;
			return;
		}

		if (!(await resolveDeployPasswordForCli(dev))) return;

		const app = Boolean(flags['app']);
		let connects = 0;
		let emptyStreak = 0;
		const options = {
			domain: dev.domain,
			useHTTP: dev.useHTTPForDevDeploy,
			auth: configAuth(dev).auth,
			app,
			session: {},
			onConnect() {
				connects++;
				if (connects === 1) {
					say(`${DIM}connected, waiting for log lines${RESET}`);
				}
			},
		};

		say(
			`${DIM}Tailing ${app ? 'app' : 'server'} log on ${dev.domain} (${dev.environmentName ?? baseEnvironment(dev)}, ${configAuth(dev).kind}). Ctrl+C to stop.${RESET}`,
		);

		while (true) {
			try {
				// eslint-disable-next-line no-await-in-loop
				const end = await tailLog(options, line => {
					say(line);
				});
				emptyStreak = end === 'empty' ? emptyStreak + 1 : 0;
				if (isFatalEnd(end, {connects, emptyStreak})) {
					say(
						`\n${RED}The server accepted the request and then sent no log page. The credential has no access to the log.${RESET}\n`,
					);
					process.exitCode = 1;
					return;
				}

				say(`${DIM}-- stream ${end}, reconnecting --${RESET}`);
				// The server cuts a healthy tail every few minutes, and
				// reconnecting at once is what keeps the log gapless. Any other
				// ending may be failing immediately, so pace those instead of
				// hammering the site.
				if (end !== 'aborted') {
					// eslint-disable-next-line no-await-in-loop
					await delay(RETRY_DELAY_MS);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				say(`${RED}${message}${RESET}`);
				if (error instanceof LogTailAuthError) {
					process.exitCode = 1;
					return;
				}

				say(`${DIM}-- retrying in 3s --${RESET}`);
				// eslint-disable-next-line no-await-in-loop
				await delay(RETRY_DELAY_MS);
			}
		}
	},
};
