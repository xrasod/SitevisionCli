import {type Command} from './types.js';
import {resolveDeployPasswordForCli} from './dev.js';
import {configAuth, delay} from '../utils/sitevision-api.js';
import {LogTailAuthError, tailLog} from '../utils/log-tail.js';

const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export const logsCommand: Command = {
	name: 'logs',
	description: 'Tail the server log (or the app log with --app)',
	requiresProject: true,
	async execute({project, flags}) {
		const dev = project.devProperties;
		if (!dev?.domain) {
			console.log(`\n${YELLOW}Deploy config is missing "domain".${RESET}\n`);
			process.exitCode = 1;
			return;
		}

		if (!(await resolveDeployPasswordForCli(dev))) return;
		const {auth, kind} = configAuth(dev);
		if (kind !== 'basic' && !dev.accessToken && !dev.sessionCookie) {
			console.log(
				`\n${YELLOW}No ${dev.authMethod} credential available. Run svc deploy once to log in.${RESET}\n`,
			);
			process.exitCode = 1;
			return;
		}

		const app = Boolean(flags['app']);
		const options = {
			domain: dev.domain,
			useHTTP: dev.useHTTPForDevDeploy,
			auth,
			app,
			onConnect: (info: string) => console.log(`${DIM}${info}${RESET}`),
			session: {},
		};
		console.log(
			`${DIM}Tailing ${app ? 'app' : 'server'} log on ${dev.domain} (${kind}). Ctrl+C to stop.${RESET}`,
		);

		while (true) {
			try {
				// eslint-disable-next-line no-await-in-loop
				const end = await tailLog(options, line => console.log(line));
				console.log(`${DIM}-- stream ${end}, reconnecting --${RESET}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`${RED}${message}${RESET}`);
				if (error instanceof LogTailAuthError) {
					process.exitCode = 1;
					return;
				}
				console.log(`${DIM}-- retrying in 3s --${RESET}`);
				// eslint-disable-next-line no-await-in-loop
				await delay(3000);
			}
		}
	},
};
