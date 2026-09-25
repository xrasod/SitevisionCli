import type {
	ProjectInfo,
	DeployConfig,
	SigningCredentials,
} from '../types/index.js';
import {
	getPackageJsonSyncChanges,
	syncDevPropertiesToPackageJson,
	migrateLegacyPassword,
	getAppType,
} from '../utils/project-detection.js';
import {createAddon} from '../utils/sitevision-api.js';
import {
	getSigningPassword,
	setSigningPassword,
	setDeployPassword,
	deleteDeployPassword,
	deleteOAuth2RefreshToken,
	deleteSessionCookie,
	getOAuth2RefreshToken,
} from '../utils/keychain.js';
import {resolveOAuth2AccessToken} from '../utils/oauth2-auth.js';
import {t} from '../utils/i18n.js';
import {toDeployConfig} from '../utils/workspace.js';
import {
	startBuild,
	startDev,
	startDeploy,
	startInstall,
	startSign,
	runningTasks,
	stoppableTasks,
	type Task,
} from '../utils/tasks.js';

export type Tab = 'overview' | 'config' | 'versions' | 'log';
export type Credential = {accessToken?: string; sessionCookie?: string};

export interface ActionContext {
	project: ProjectInfo;
	reload: () => void;
	askPassword: (
		label: string,
		rememberLabel?: string,
	) => Promise<{password: string; remember: boolean} | null>;
	login: (method: 'oauth2' | 'cookie') => Promise<Credential | null>;
	confirm: (message: string) => Promise<boolean>;
	// Index of the picked choice, null when cancelled.
	choose: (label: string, choices: string[]) => Promise<number | null>;
	setTab: (tab: Tab) => void;
	// Workspace mode only: jump to the shared root config.
	openWorkspaceSettings?: () => void;
	openSettings: () => void;
	openHelp: () => void;
	openChangelog: () => void;
	// Active environment (name of the resolved ctx.project.devProperties).
	environment: string;
	isProduction: boolean;
	cycleEnvironment: () => void;
	addEnvironment: () => Promise<void>;
	// Scaffold a new app with Sitevision's create tool.
	createApp: () => Promise<void>;
	notify: (text: string, level?: 'info' | 'ok' | 'warn' | 'error') => void;
	quit: () => void;
}

export interface Action {
	id: string;
	key?: string;
	group: 'app' | 'setup' | 'auth';
	label: string;
	detail?: (project: ProjectInfo) => string | undefined;
	enabled?: (project: ProjectInfo) => boolean;
	// Left out of the palette entirely, not just dimmed.
	hidden?: (project: ProjectInfo) => boolean;
	run: (ctx: ActionContext) => Promise<void>;
}

// Credentials obtained during this run, so a password or token is asked for
// once per app rather than once per action. Never written to disk here.
const session = {
	deployPassword: new Map<string, string>(),
	signingPassword: new Map<string, string>(),
	credential: new Map<string, Credential>(),
	// Addons a deploy confirmed missing; only these offer "Create addon".
	missingAddons: new Set<string>(),
};

const deployKey = (p: ProjectInfo) =>
	`${p.devProperties?.domain}\0${p.devProperties?.username}`;

const addonKey = (p: ProjectInfo) =>
	`${p.devProperties?.domain} ${p.devProperties?.siteName} ${p.devProperties?.addonName}`;

const askCreateAddon =
	(ctx: ActionContext) =>
	async (addon: string): Promise<boolean> => {
		session.missingAddons.add(addonKey(ctx.project));
		const yes = await ctx.confirm(
			t(
				'Addon {addon} does not exist on {domain}. Create it and deploy again?',
				{
					addon,
					domain: ctx.project.devProperties?.domain ?? '',
				},
			),
		);
		if (yes) session.missingAddons.delete(addonKey(ctx.project));
		return yes;
	};

export function forgetSession(project: ProjectInfo): void {
	session.deployPassword.delete(deployKey(project));
	session.credential.delete(deployKey(project));
	if (project.devProperties?.signingUsername) {
		session.signingPassword.delete(project.devProperties.signingUsername);
	}
}

/** Top-bar auth state without prompting for anything. */
export function authState(project: ProjectInfo): {
	ready: boolean;
	label: string;
} {
	const dev = project.devProperties;
	if (!dev) return {ready: false, label: t('not configured')};
	const method = dev.authMethod ?? 'basic';
	const key = deployKey(project);
	const who = dev.username ? ` ${dev.username}` : '';
	if (method === 'basic') {
		const ready = Boolean(dev.password || session.deployPassword.has(key));
		return {ready, label: ready ? `basic${who}` : t('basic · password needed')};
	}

	if (method === 'oauth2') {
		const ready = Boolean(
			dev.accessToken ||
			session.credential.get(key)?.accessToken ||
			(dev.oauth2?.clientId &&
				getOAuth2RefreshToken(dev.domain, dev.oauth2.clientId)),
		);
		return {ready, label: ready ? `oauth2${who}` : t('oauth2 · not logged in')};
	}

	const ready = Boolean(
		dev.sessionCookie || session.credential.get(key)?.sessionCookie,
	);
	return {ready, label: ready ? `sso${who}` : t('sso · not logged in')};
}

export async function resolveDeployConfig(
	ctx: ActionContext,
	fresh = false,
	// Site-level calls (list addons, log in) work before an addon is chosen.
	{addon = true}: {addon?: boolean} = {},
): Promise<DeployConfig | null> {
	const dev = ctx.project.devProperties;
	const complete = toDeployConfig(dev, {addon});
	if (!dev || 'error' in complete) {
		ctx.notify(
			dev && 'error' in complete
				? complete.error
				: t('Dev properties not configured. Edit config first.'),
			'warn',
		);
		ctx.setTab('config');
		return null;
	}

	const key = deployKey(ctx.project);
	// Credentials are resolved below, per auth method.
	const base: DeployConfig = {
		...complete.config,
		password: undefined,
		accessToken: undefined,
		sessionCookie: undefined,
	};
	const method = dev.authMethod ?? 'basic';

	if (method === 'basic') {
		let password = fresh
			? undefined
			: (dev.password ?? session.deployPassword.get(key));
		if (!password) {
			const answer = await ctx.askPassword(
				t('Deploy password for {user}@{domain}', {
					user: dev.username,
					domain: dev.domain,
				}),
				t('Save to OS keychain'),
			);
			if (!answer?.password) return null;
			password = answer.password;
			session.deployPassword.set(key, password);
			if (answer.remember)
				setDeployPassword(dev.domain, dev.username, password);
		}

		return {...base, password};
	}

	let credential = fresh ? undefined : session.credential.get(key);
	if (!credential && !fresh) {
		if (method === 'cookie' && dev.sessionCookie) {
			credential = {sessionCookie: dev.sessionCookie};
		} else if (method === 'oauth2') {
			const token = dev.accessToken ?? (await resolveOAuth2AccessToken(dev));
			if (token) credential = {accessToken: token};
		}
	}

	credential ??= (await ctx.login(method)) ?? undefined;
	if (!credential) return null;
	session.credential.set(key, credential);
	return {...base, ...credential};
}

async function resolveSigning(
	ctx: ActionContext,
): Promise<SigningCredentials | null> {
	const dev = ctx.project.devProperties;
	if (!dev?.signingUsername) {
		ctx.notify(t('Signing credentials not configured.'), 'warn');
		ctx.setTab('config');
		return null;
	}

	const username = dev.signingUsername;
	let password =
		process.env['SITEVISION_SIGNING_PASSWORD'] ??
		session.signingPassword.get(username) ??
		getSigningPassword(username) ??
		undefined;
	if (!password) {
		const answer = await ctx.askPassword(
			t('Signing password for {user} (developer.sitevision.se)', {
				user: username,
			}),
			t('Save to OS keychain'),
		);
		if (!answer?.password) return null;
		password = answer.password;
		if (answer.remember) setSigningPassword(username, password);
	}

	session.signingPassword.set(username, password);
	return {username, password, certificateName: dev.certificateName};
}

const hasDev = (p: ProjectInfo) => Boolean(p.devProperties);

const deployDetail = (p: ProjectInfo) => {
	const dev = p.devProperties;
	const env = t('to {env}', {env: dev?.environmentName ?? 'dev'});
	return dev?.productionEnvironment
		? `${env} · ${t('signed zip · confirms first')}`
		: env;
};

/** Deploy to the active environment; production means signed, and asks whether to activate. */
async function deployTo(ctx: ActionContext, force: boolean): Promise<void> {
	let activate = false;
	if (ctx.isProduction) {
		const pick = await ctx.choose(
			t('Deploy the signed {id} to {env} (addon {addon})', {
				id: ctx.project.manifest.id,
				env: ctx.environment,
				addon: ctx.project.devProperties?.addonName ?? '?',
			}),
			[t('Deploy and activate'), t('Deploy only')],
		);
		if (pick === null) return;
		activate = pick === 0;
	}

	const config = await resolveDeployConfig(ctx);
	if (!config) return;
	startDeploy(ctx.project, config, {
		force,
		...(ctx.isProduction && {production: true, activate}),
		onAddonMissing: askCreateAddon(ctx),
	});
	ctx.setTab('log');
}
const hasSigning = (p: ProjectInfo) =>
	Boolean(p.devProperties?.signingUsername);

async function startDevOrWatch(
	ctx: ActionContext,
	deploy: boolean,
): Promise<void> {
	if (deploy && ctx.isProduction) {
		if (!hasSigning(ctx.project)) {
			ctx.notify(
				t(
					'Dev on {env} needs signing credentials: production only takes the signed zip. / sets them up.',
					{env: ctx.environment},
				),
				'warn',
			);
			return;
		}

		const go = await ctx.confirm(
			t(
				'{env} is PRODUCTION. Dev will sign and deploy every build of {id} there (addon {addon}). Start it?',
				{
					env: ctx.environment,
					id: ctx.project.manifest.id,
					addon: ctx.project.devProperties?.addonName ?? '?',
				},
			),
		);
		if (!go) return;
	}

	if (
		runningTasks(ctx.project.root).some(
			task => task.kind === 'dev' || task.kind === 'watch',
		)
	) {
		ctx.notify(
			t('A dev/watch task is already running for this app (K stops it).'),
			'warn',
		);
		ctx.setTab('log');
		return;
	}

	const signingCredentials = hasSigning(ctx.project)
		? ((await resolveSigning(ctx)) ?? undefined)
		: undefined;
	if (hasSigning(ctx.project) && !signingCredentials) return;
	const deployConfig = deploy ? await resolveDeployConfig(ctx) : undefined;
	if (deploy && !deployConfig) return;
	startDev(ctx.project, {
		deploy,
		signingCredentials,
		deployConfig: deployConfig ?? undefined,
		onAddonMissing: askCreateAddon(ctx),
	});
	ctx.setTab('log');
}

export const actions: Action[] = [
	{
		id: 'dev',
		key: 'd',
		group: 'app',
		label: 'Dev',
		detail(p) {
			const base = hasSigning(p)
				? t('build, sign and deploy on change')
				: t('build and deploy on change');
			return p.devProperties?.productionEnvironment
				? `${base} · ${t('confirms first')}`
				: base;
		},
		enabled: hasDev,
		async run(ctx) {
			await startDevOrWatch(ctx, true);
		},
	},
	{
		id: 'watch',
		key: 'w',
		group: 'app',
		label: 'Watch',
		detail: p =>
			hasSigning(p) ? t('rebuild and sign only') : t('rebuild only'),
		async run(ctx) {
			await startDevOrWatch(ctx, false);
		},
	},
	{
		id: 'build',
		key: 'b',
		group: 'app',
		label: 'Build',
		async run(ctx) {
			startBuild(ctx.project);
			ctx.setTab('log');
		},
	},
	{
		id: 'sign',
		key: 's',
		group: 'app',
		label: 'Sign',
		detail: p => (hasSigning(p) ? undefined : t('credentials missing')),
		async run(ctx) {
			const credentials = await resolveSigning(ctx);
			if (!credentials) return;
			startSign(ctx.project, credentials);
			ctx.setTab('log');
		},
	},
	{
		id: 'deploy',
		key: 'p',
		group: 'app',
		label: 'Deploy',
		detail: deployDetail,
		enabled: hasDev,
		async run(ctx) {
			await deployTo(ctx, false);
		},
	},
	{
		id: 'deploy-force',
		key: 'P',
		group: 'app',
		label: 'Deploy (force)',
		detail: deployDetail,
		enabled: hasDev,
		async run(ctx) {
			await deployTo(ctx, true);
		},
	},
	{
		id: 'environment',
		key: 'v',
		group: 'app',
		label: 'Switch environment',
		detail: p => p.devProperties?.environmentName ?? 'dev',
		enabled: hasDev,
		async run(ctx) {
			ctx.cycleEnvironment();
		},
	},
	{
		id: 'add-environment',
		group: 'setup',
		label: 'Add environment',
		detail: () => t('e.g. test or prod, overriding domain and auth'),
		enabled: hasDev,
		async run(ctx) {
			await ctx.addEnvironment();
		},
	},
	{
		id: 'versions',
		key: 'a',
		group: 'app',
		label: 'Activate a remote version',
		enabled: hasDev,
		async run(ctx) {
			ctx.setTab('versions');
		},
	},
	{
		id: 'stop',
		key: 'K',
		group: 'app',
		label: 'Stop running task',
		enabled: p => stoppableTasks(p.root).length > 0,
		async run(ctx) {
			const running: Task[] = stoppableTasks(ctx.project.root);
			for (const task of running) task.stop();
			ctx.notify(
				running.length > 0
					? t('stopped {n} task(s)', {n: running.length})
					: t('nothing running'),
			);
		},
	},
	{
		id: 'workspace-settings',
		group: 'setup',
		label: 'Workspace settings',
		detail: () => t('shared auth and site config for every app'),
		async run(ctx) {
			if (ctx.openWorkspaceSettings) ctx.openWorkspaceSettings();
			else
				ctx.notify(t('Not in a workspace: run svc at the repo root.'), 'warn');
		},
	},
	{
		id: 'help',
		key: '?',
		group: 'setup',
		label: 'Help',
		detail: () => t('every key in one place'),
		async run(ctx) {
			ctx.openHelp();
		},
	},
	{
		id: 'changelog',
		group: 'setup',
		label: "What's new",
		detail: () => t('changelog for every release'),
		async run(ctx) {
			ctx.openChangelog();
		},
	},
	{
		id: 'settings',
		key: ',',
		group: 'setup',
		label: 'Settings',
		detail: () => t('language, intro animation, workspace config'),
		async run(ctx) {
			ctx.openSettings();
		},
	},
	{
		id: 'config',
		key: 'e',
		group: 'setup',
		label: 'Edit config',
		detail: () => t('dev properties, auth method, signing'),
		async run(ctx) {
			ctx.setTab('config');
		},
	},
	{
		id: 'new-app',
		group: 'setup',
		label: 'New app',
		detail: () => 'create-sitevision-app',
		async run(ctx) {
			await ctx.createApp();
		},
	},
	{
		id: 'create-addon',
		group: 'setup',
		label: 'Create addon',
		detail: p => p.devProperties?.addonName,
		enabled: hasDev,
		hidden: p => !session.missingAddons.has(addonKey(p)),
		async run(ctx) {
			const config = await resolveDeployConfig(ctx);
			if (!config) return;
			const result = await createAddon(
				config,
				getAppType(ctx.project.manifest),
			);
			if (!result.success) {
				ctx.notify(result.error ?? t('Create addon failed'), 'error');
				return;
			}

			session.missingAddons.delete(addonKey(ctx.project));
			ctx.notify(t('addon {addon} created', {addon: config.addonName}), 'ok');
		},
	},
	{
		id: 'sync-package',
		key: 'y',
		group: 'setup',
		label: 'Sync package.json',
		detail(p) {
			const n = getPackageJsonSyncChanges(p.root).length;
			return n === 0
				? t('in sync')
				: n === 1
					? t('1 diff')
					: t('{n} diffs', {n});
		},
		enabled: p => getPackageJsonSyncChanges(p.root).length > 0,
		async run(ctx) {
			syncDevPropertiesToPackageJson(ctx.project.root);
			ctx.reload();
			ctx.notify(t('package.json updated'), 'ok');
		},
	},
	{
		id: 'migrate-password',
		group: 'setup',
		label: 'Migrate password to OS keychain',
		enabled: p => p.hasLegacyPassword,
		async run(ctx) {
			const moved = migrateLegacyPassword(ctx.project);
			ctx.reload();
			ctx.notify(
				moved
					? t('password moved to keychain')
					: t('could not access keychain'),
				moved ? 'ok' : 'error',
			);
		},
	},
	{
		id: 'install',
		key: 'i',
		group: 'setup',
		label: 'Install dependencies',
		detail: () => 'npm install',
		async run(ctx) {
			startInstall(ctx.project);
			ctx.setTab('log');
		},
	},
	{
		id: 'login',
		key: 'l',
		group: 'auth',
		label: 'Log in',
		detail: p => p.devProperties?.authMethod ?? 'basic',
		enabled: hasDev,
		async run(ctx) {
			forgetSession(ctx.project);
			if (await resolveDeployConfig(ctx, true, {addon: false}))
				ctx.notify(t('logged in'), 'ok');
		},
	},
	{
		id: 'logout',
		group: 'auth',
		label: 'Log out',
		detail: () => t('forget stored credentials for this site'),
		enabled: hasDev,
		async run(ctx) {
			const dev = ctx.project.devProperties!;
			forgetSession(ctx.project);
			deleteDeployPassword(dev.domain, dev.username);
			deleteSessionCookie(dev.domain, dev.username);
			if (dev.oauth2?.clientId)
				deleteOAuth2RefreshToken(dev.domain, dev.oauth2.clientId);
			dev.password = undefined;
			dev.accessToken = undefined;
			dev.sessionCookie = undefined;
			ctx.reload();
			ctx.notify(t('credentials removed'), 'ok');
		},
	},
	{
		id: 'quit',
		key: 'q',
		group: 'app',
		label: 'Quit',
		async run(ctx) {
			ctx.quit();
		},
	},
];

export function actionForKey(key: string): Action | undefined {
	return actions.find(a => a.key === key);
}

/** Subsequence match, case-insensitive: "dpp" matches "Deploy to production". */
export function fuzzyMatch(query: string, text: string): boolean {
	const q = query.toLowerCase();
	const haystack = text.toLowerCase();
	let i = 0;
	for (const ch of haystack) {
		if (ch === q[i]) i++;
		if (i === q.length) return true;
	}

	return q.length === 0;
}
