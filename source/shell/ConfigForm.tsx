import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {DevProperties} from '../types/index.js';
import {
	getPackageJsonSyncChanges,
	readInheritedDevProperties,
	writeDevProperties,
} from '../utils/project-detection.js';
import {
	setDeployPassword,
	deleteDeployPassword,
	getOAuth2ClientSecret,
	setOAuth2ClientSecret,
	deleteOAuth2ClientSecret,
	getSigningPassword,
	setSigningPassword,
	deleteSigningPassword,
} from '../utils/keychain.js';
import {DEFAULT_SCOPES, discoverOAuth2Config} from '../utils/oauth2-auth.js';
import {ACCENT} from './Frame.js';
import {
	baseEnvironment,
	withEnvironmentOverride,
} from '../utils/environments.js';
import {t} from '../utils/i18n.js';

type Method = 'basic' | 'oauth2' | 'cookie';
const METHODS: Method[] = ['basic', 'oauth2', 'cookie'];

interface Field {
	key: string;
	label: string;
	kind?: 'text' | 'method' | 'bool' | 'secret';
	// `true` = always; a method name = required only for that auth method.
	required?: boolean | Method;
	when?: Method;
	section?: string;
	hint?: string;
	// Only meaningful for an app, hidden when editing the workspace root.
	perApp?: boolean;
	// Guidance shown in the help panel while the row is focused.
	help: string;
}

const FIELDS: Field[] = [
	{
		key: 'domain',
		help: "Domain of this environment's site (USE or TSE) without https://, e.g. myorg-use.sitevision-cloud.se. Deploys and version lookups go here.",
		label: 'Domain',
		required: true,
	},
	{
		key: 'siteName',
		help: "Name of the site's root node in Sitevision, exactly as shown in the site tree. It becomes part of the REST API path.",
		label: 'Site name',
		required: true,
	},
	{
		key: 'addonName',
		help: "Name of the addon (custom module) in the site's Addon Repository that this app is uploaded into. Ctrl+O lists the existing ones.",
		label: 'Addon name',
		required: true,
		hint: '^O pick from repo',
		perApp: true,
	},
	{
		key: 'username',
		help: 'Sitevision account used for deploys, usually your Sitevision Cloud e-mail. It needs DEVELOPER or MANAGE_ADDONS permission on the site. Required for basic auth; with oauth2 or cookie it only labels the stored credential.',
		label: 'Username',
		required: 'basic',
	},
	{
		key: 'authMethod',
		help: "How deploys authenticate: basic = username and password; oauth2 = bearer token from the site's OAuth2 provider (PKCE, opens a browser); cookie = reuse a browser SSO/SAML session.",
		label: 'Auth method',
		kind: 'method',
	},
	{
		key: 'password',
		help: 'Deploy password for the account above. Stored in the OS keychain, never in a file. Leave empty to be asked on each run.',
		label: 'Password',
		kind: 'secret',
		when: 'basic',
	},
	{
		key: 'clientId',
		help: 'Client id of the OAuth2 client registered on the site. Its redirect URI must be http://127.0.0.1:8137/callback.',
		label: 'OAuth2 client id',
		required: true,
		when: 'oauth2',
	},
	{
		key: 'authorizationEndpoint',
		help: "The provider's authorization URL. Filled in from the site's OpenID configuration when it can be discovered.",
		label: 'Authorization endpoint',
		required: true,
		when: 'oauth2',
	},
	{
		key: 'tokenEndpoint',
		help: "The provider's token URL. Filled in from the site's OpenID configuration when it can be discovered.",
		label: 'Token endpoint',
		required: true,
		when: 'oauth2',
	},
	{
		key: 'scopes',
		help: 'Space-separated scopes to request. ALL grants the Sitevision API and offline_access adds a refresh token so later runs log in silently. Match the casing your client expects.',
		label: 'Scopes',
		when: 'oauth2',
		hint: 'ALL offline_access',
	},
	{
		key: 'clientSecret',
		help: 'Secret of a confidential OAuth2 client, stored in the OS keychain. Leave empty for a public client.',
		label: 'Client secret',
		kind: 'secret',
		when: 'oauth2',
	},
	{
		key: 'sessionLoginUrl',
		help: 'Page opened in the browser for the SSO login. Leave empty to use the site root.',
		label: 'Login URL',
		when: 'cookie',
		hint: 'blank = site root',
	},
	{
		key: 'useHTTPForDevDeploy',
		help: 'Use plain HTTP instead of HTTPS for deploys. Only for local or test servers without TLS.',
		label: 'Use HTTP',
		kind: 'bool',
	},
	{
		key: 'baseEnvironment',
		label: 'Environment name',
		section: 'ENVIRONMENT',
		hint: 'dev',
		help: 'What this base configuration is: dev, test, prod… Other environments are added on top of it with E or the palette and override only what differs.',
	},
	{
		key: 'production',
		label: 'Production',
		kind: 'bool',
		section: 'ENVIRONMENT',
		help: 'Treat deploys to this base environment as production: signed zip, confirmation, activation, and no dev loop. Off by default even when the name says prod, so a repo with only a production site still gets a dev loop.',
	},
	{
		key: 'signingUsername',
		help: 'Your developer.sitevision.se account. Production deploys need the app signed by it.',
		label: 'Signing user',
		section: 'SIGNING',
		hint: 'required for signed deploys',
	},
	{
		key: 'certificateName',
		help: 'Which certificate to sign with when your developer account has several. Leave empty for the default.',
		label: 'Certificate',
		section: 'SIGNING',
	},
	{
		key: 'signingPassword',
		help: 'Password for the signing account, stored in the OS keychain. Leave empty to be asked on each run.',
		label: 'Signing password',
		kind: 'secret',
		section: 'SIGNING',
		hint: 'blank = prompt each run',
	},
];

type Values = Record<string, string>;

/** What the form edits: an app, or the workspace root (no addon, no package.json). */
export interface ConfigTarget {
	root: string;
	// Effective values for the environment being edited.
	devProperties?: Partial<DevProperties>;
	// The raw base (with `environments`) when editing a non-dev environment.
	base?: Partial<DevProperties>;
	environment?: string;
	workspace?: boolean;
}

const ENV_KEYS = new Set([
	'domain',
	'siteName',
	'addonName',
	'username',
	'authMethod',
	'useHTTPForDevDeploy',
	'clientId',
	'authorizationEndpoint',
	'tokenEndpoint',
	'scopes',
	'clientSecret',
	'sessionLoginUrl',
	'password',
]);

// Wide enough for the longest source text ("^O pick from repo").
const SOURCE_WIDTH = 18;

function fromProject(project: ConfigTarget): Values {
	const dev = project.devProperties ?? ({} as Partial<DevProperties>);
	return {
		domain: dev.domain ?? '',
		siteName: dev.siteName ?? '',
		addonName: dev.addonName ?? '',
		username: dev.username ?? '',
		authMethod: dev.authMethod ?? 'basic',
		password: '',
		clientId: dev.oauth2?.clientId ?? '',
		authorizationEndpoint: dev.oauth2?.authorizationEndpoint ?? '',
		tokenEndpoint: dev.oauth2?.tokenEndpoint ?? '',
		scopes: (dev.oauth2?.scopes ?? DEFAULT_SCOPES).join(' '),
		clientSecret: '',
		sessionLoginUrl: dev.sessionLoginUrl ?? '',
		useHTTPForDevDeploy: dev.useHTTPForDevDeploy ? 'yes' : 'no',
		baseEnvironment: dev.baseEnvironment ?? '',
		production: dev.production ? 'yes' : 'no',
		signingUsername: dev.signingUsername ?? '',
		certificateName: dev.certificateName ?? '',
		signingPassword: '',
	};
}

function storedSecret(project: ConfigTarget, key: string): boolean {
	const dev = project.devProperties;
	if (!dev) return false;
	if (key === 'password') return Boolean(dev.password);
	if (key === 'clientSecret') {
		return Boolean(
			dev.domain &&
			dev.oauth2?.clientId &&
			getOAuth2ClientSecret(dev.domain, dev.oauth2.clientId),
		);
	}

	return Boolean(
		dev.signingUsername && getSigningPassword(dev.signingUsername),
	);
}

/** Apply the form to disk and the keychain. Exported for the test. */
export function saveConfig(
	project: ConfigTarget,
	values: Values,
	edited: Set<string>,
): void {
	const method = values['authMethod'] as Method;
	const next: DevProperties = {
		domain: values['domain']!,
		siteName: values['siteName']!,
		addonName: values['addonName']!,
		username: values['username']!,
		authMethod: method,
		useHTTPForDevDeploy: values['useHTTPForDevDeploy'] === 'yes',
	};
	if (values['baseEnvironment'])
		next.baseEnvironment = values['baseEnvironment'].trim().toLowerCase();
	if (values['production'] === 'yes') next.production = true;
	if (values['signingUsername'])
		next.signingUsername = values['signingUsername'];
	if (values['certificateName'])
		next.certificateName = values['certificateName'];
	if (method === 'oauth2') {
		const scopes = values['scopes']!.split(/[\s,]+/).filter(Boolean);
		next.oauth2 = {
			authorizationEndpoint: values['authorizationEndpoint']!,
			tokenEndpoint: values['tokenEndpoint']!,
			clientId: values['clientId']!,
			...(scopes.length > 0 && {scopes}),
			...(project.devProperties?.oauth2?.redirectPort && {
				redirectPort: project.devProperties.oauth2.redirectPort,
			}),
		};
	} else if (method === 'cookie' && values['sessionLoginUrl']) {
		next.sessionLoginUrl = values['sessionLoginUrl'];
	}

	const env = project.environment;
	if (env && env !== baseEnvironment(project.base) && project.base) {
		// Non-dev environment: site/auth fields become an override, signing
		// fields still live on the base.
		const base = {...project.base} as DevProperties;
		base.signingUsername = next.signingUsername;
		base.certificateName = next.certificateName;
		base.baseEnvironment = next.baseEnvironment;
		base.production = next.production;
		writeDevProperties(
			project.root,
			withEnvironmentOverride(base, env, {
				domain: next.domain,
				siteName: next.siteName,
				addonName: next.addonName,
				username: next.username,
				authMethod: next.authMethod,
				useHTTPForDevDeploy: next.useHTTPForDevDeploy,
				oauth2: next.oauth2,
				sessionLoginUrl: next.sessionLoginUrl,
			}),
		);
	} else {
		writeDevProperties(project.root, {
			...next,
			environments:
				project.base?.environments ?? project.devProperties?.environments,
		});
	}

	const secret = (
		key: string,
		set: (v: string) => unknown,
		del: () => unknown,
	) => {
		if (!edited.has(key)) return;
		const value = values[key] ?? '';
		if (value) set(value);
		else del();
	};

	secret(
		'password',
		v => setDeployPassword(next.domain, next.username, v),
		() => deleteDeployPassword(next.domain, next.username),
	);
	if (next.oauth2) {
		const {clientId} = next.oauth2;
		secret(
			'clientSecret',
			v => setOAuth2ClientSecret(next.domain, clientId, v),
			() => deleteOAuth2ClientSecret(next.domain, clientId),
		);
	}

	if (next.signingUsername) {
		const user = next.signingUsername;
		secret(
			'signingPassword',
			v => setSigningPassword(user, v),
			() => deleteSigningPassword(user),
		);
	}
}

export function visibleFields(
	method: Method,
	workspace = false,
	envMode = false,
): Field[] {
	return FIELDS.filter(
		f =>
			(!f.when || f.when === method) &&
			!(workspace && f.perApp) &&
			!(envMode && (f.section === 'SIGNING' || f.section === 'ENVIRONMENT')),
	);
}

export function ConfigForm({
	project,
	active,
	width,
	height,
	pickAddon,
	onSaved,
	onEditingChange,
}: {
	project: ConfigTarget;
	active: boolean;
	// Pane width in columns; the value column takes whatever the label and
	// source columns leave.
	width: number;
	height: number;
	pickAddon: () => Promise<string | null>;
	onSaved: () => void;
	// True while a text field is being typed into; the shell then leaves every
	// key to the form.
	onEditingChange: (editing: boolean) => void;
}) {
	const [values, setValues] = useState<Values>(() => fromProject(project));
	const [cursor, setCursor] = useState(0);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [caret, setCaret] = useState(0);
	const [note, setNote] = useState('');

	// Values always mirror the project; edits are committed field by field.
	useEffect(() => {
		setValues(fromProject(project));
	}, [project]);

	useEffect(() => {
		onEditingChange(editing);
		return () => {
			onEditingChange(false);
		};
	}, [editing, onEditingChange]);

	const method = values['authMethod'] as Method;
	const envMode = Boolean(
		project.environment &&
		project.environment !==
			baseEnvironment(project.base ?? project.devProperties),
	);
	const fields = visibleFields(method, project.workspace, envMode);
	const current = fields[Math.min(cursor, fields.length - 1)]!;
	const inherited = readInheritedDevProperties(project.root) as Record<
		string,
		unknown
	>;
	const changes =
		project.devProperties && !project.workspace
			? getPackageJsonSyncChanges(
					project.root,
					project.devProperties as DevProperties,
				)
			: [];

	// Write one field to disk (and the keychain for secrets) right away.
	const commit = (key: string, value: string, label = current.label) => {
		const next = {...values, [key]: value};
		setValues(next);
		saveConfig(project, next, new Set([key]));
		setNote(t('Saved {label}.', {label: t(label)}));
		onSaved();
	};

	// Auto-fill OAuth2 endpoints from the site's OpenID configuration.
	useEffect(() => {
		if (method !== 'oauth2' || !values['domain']) return;
		if (values['authorizationEndpoint'] && values['tokenEndpoint']) return;
		let cancelled = false;
		setNote(t('Looking up OAuth2 endpoints…'));
		void discoverOAuth2Config(
			values['domain'],
			values['useHTTPForDevDeploy'] === 'yes',
		).then(found => {
			if (cancelled) return;
			if (found) {
				const next = {
					...values,
					authorizationEndpoint:
						values['authorizationEndpoint'] || found.authorizationEndpoint,
					tokenEndpoint: values['tokenEndpoint'] || found.tokenEndpoint,
				};
				setValues(next);
				saveConfig(project, next, new Set());
				onSaved();
				setNote(t('Endpoints filled from the site OpenID config.'));
			} else {
				setNote(t('Could not discover OAuth2 endpoints; enter them by hand.'));
			}
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [method, values['domain']]);

	// Options for a choice row; the draft holds the highlighted one while editing.
	const options = (f: Field): string[] =>
		f.kind === 'method' ? METHODS : f.kind === 'bool' ? ['yes', 'no'] : [];

	const openPicker = () => {
		void pickAddon().then(name => {
			if (name) {
				setEditing(false);
				commit('addonName', name, 'Addon name');
			}
		});
	};

	useInput(
		(input, key) => {
			if (editing) {
				const choices = options(current);
				if (key.escape) {
					setEditing(false);
				} else if (key.return) {
					setEditing(false);
					if (draft !== values[current.key]) commit(current.key, draft);
				} else if (choices.length > 0) {
					const step =
						key.leftArrow || key.upArrow
							? -1
							: key.rightArrow || key.downArrow || input === ' '
								? 1
								: 0;
					if (step !== 0) {
						const i = choices.indexOf(draft);
						setDraft(choices[(i + step + choices.length) % choices.length]!);
					}
				} else if (key.ctrl && input === 'o' && current.key === 'addonName') {
					openPicker();
				} else if (key.leftArrow) {
					setCaret(Math.max(0, caret - 1));
				} else if (key.rightArrow) {
					setCaret(Math.min(draft.length, caret + 1));
				} else if (key.backspace || key.delete) {
					if (caret > 0) {
						setDraft(draft.slice(0, caret - 1) + draft.slice(caret));
						setCaret(caret - 1);
					}
				} else if (input && !key.ctrl && !key.meta) {
					setDraft(draft.slice(0, caret) + input + draft.slice(caret));
					setCaret(caret + input.length);
				}

				return;
			}

			if ((key.tab && !key.shift) || key.downArrow) {
				setCursor(c => (c + 1) % fields.length);
			} else if ((key.tab && key.shift) || key.upArrow) {
				setCursor(c => (c - 1 + fields.length) % fields.length);
			} else if (key.ctrl && input === 'o' && current.key === 'addonName') {
				openPicker();
			} else if (key.return) {
				const start =
					current.kind === 'secret' ? '' : (values[current.key] ?? '');
				setDraft(start);
				setCaret(start.length);
				setEditing(true);
			}
		},
		{isActive: active},
	);

	const source = (f: Field): {text: string; color?: string} => {
		const required = f.required === true || f.required === method;
		if (required && !(values[f.key] ?? ''))
			return {text: t('✗ required'), color: 'red'};
		if (f.kind === 'secret') {
			return {text: storedSecret(project, f.key) ? t('keychain') : '—'};
		}

		const value = f.kind === 'bool' ? values[f.key] === 'yes' : values[f.key];
		if (envMode && ENV_KEYS.has(f.key)) {
			const override = project.base?.environments?.[project.environment!];
			const overridden =
				override &&
				([
					'clientId',
					'authorizationEndpoint',
					'tokenEndpoint',
					'scopes',
				].includes(f.key)
					? Object.hasOwn(override, 'oauth2')
					: Object.hasOwn(override, f.key));
			return {
				text: overridden ? project.environment! : t('↑ dev'),
				color: overridden ? 'yellow' : undefined,
			};
		}

		const inheritedValue = [
			'clientId',
			'authorizationEndpoint',
			'tokenEndpoint',
		].includes(f.key)
			? (inherited['oauth2'] as Record<string, unknown> | undefined)?.[f.key]
			: inherited[f.key];
		if (
			inheritedValue !== undefined &&
			JSON.stringify(inheritedValue) === JSON.stringify(value)
		) {
			return {text: t('↑ root')};
		}

		return {text: (values[f.key] ?? '') ? t('local') : ''};
	};

	// label column (24) + source column + paddings; never below 20.
	const valueWidth = Math.max(20, width - 24 - SOURCE_WIDTH - 2);
	const rows: React.ReactNode[] = [];
	let lastSection: string | undefined;
	for (const f of fields) {
		if (f.section && f.section !== lastSection) {
			rows.push(
				<Box key={`s-${f.section}`} marginTop={1}>
					<Text bold dimColor>
						{t(f.section)}
					</Text>
				</Box>,
			);
			lastSection = f.section;
		}

		const focused = active && f === current;
		const typing = focused && editing;
		// A value being typed into, scrolled so the caret stays in view and drawn
		// with the caret as an inverted cell.
		const withCaret = (text: string) => {
			const max = Math.max(1, valueWidth - 1);
			const start =
				text.length > max
					? Math.min(Math.max(0, caret - max + 1), text.length - max)
					: 0;
			const shown = text.slice(start, start + max);
			const at = caret - start;
			return (
				<Text>
					{shown.slice(0, at)}
					<Text inverse>{shown[at] ?? ' '}</Text>
					{shown.slice(at + 1)}
				</Text>
			);
		};
		let display: React.ReactNode;
		if (f.kind === 'method' || f.kind === 'bool') {
			const choices = options(f);
			const chosen = typing ? draft : values[f.key];
			display = choices.map((m, i) => (
				<Text key={m}>
					<Text
						bold={m === chosen}
						color={m === chosen ? ACCENT : undefined}
						inverse={typing && m === chosen}
						dimColor={m !== chosen}
					>
						{f.kind === 'bool' ? t(m) : m}
					</Text>
					{i < choices.length - 1 && <Text dimColor> · </Text>}
				</Text>
			));
		} else if (f.kind === 'secret') {
			display = typing ? (
				withCaret('•'.repeat(draft.length))
			) : (
				<Text dimColor>
					{storedSecret(project, f.key)
						? t('•••••••• keychain')
						: f.hint
							? t(f.hint)
							: ''}
				</Text>
			);
		} else {
			const value = values[f.key]!;
			display = typing ? (
				withCaret(draft)
			) : value ? (
				<Text>{value}</Text>
			) : (
				<Text dimColor>{f.hint ? t(f.hint) : '—'}</Text>
			);
		}

		const src = source(f);
		rows.push(
			<Box key={f.key} height={1}>
				<Text
					color={focused ? ACCENT : undefined}
					bold={focused}
					dimColor={!focused}
				>
					{(focused ? '▸ ' : '  ') + t(f.label).padEnd(22)}
				</Text>
				<Box width={valueWidth} flexShrink={0}>
					<Text wrap="truncate">{display}</Text>
				</Box>
				<Box width={SOURCE_WIDTH} flexShrink={0}>
					<Text dimColor={!src.color} color={src.color} wrap="truncate">
						{focused && f.hint && f.key === 'addonName' ? t(f.hint) : src.text}
					</Text>
				</Box>
			</Box>,
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden" height={height}>
			<Text dimColor>
				{('  ' + t('FIELD')).padEnd(24)}
				{t('VALUE').padEnd(valueWidth)}
				{t('SOURCE')}
			</Text>
			{rows}
			{project.workspace && (
				<Box marginTop={1}>
					<Text dimColor>
						{t("Shared by every app below {root}. An app's own value wins.", {
							root: project.root,
						})}
					</Text>
				</Box>
			)}
			{!project.workspace && (
				<Box marginTop={1} flexDirection="column">
					<Text bold dimColor>
						{t('PACKAGE.JSON SYNC')}{' '}
						<Text color={changes.length > 0 ? 'yellow' : 'green'}>
							{changes.length === 0
								? t('in sync')
								: changes.length === 1
									? t('1 diff · y to apply')
									: t('{n} diffs · y to apply', {n: changes.length})}
						</Text>
					</Text>
					{changes.map(c => (
						<Text key={c.key} wrap="truncate">
							<Text color={c.from === undefined ? 'green' : 'yellow'}>
								{c.from === undefined ? '+ ' : '~ '}
							</Text>
							{c.key}:{' '}
							{c.from !== undefined && <Text dimColor>{c.from} → </Text>}
							{c.to}
						</Text>
					))}
				</Box>
			)}
			<Box flexGrow={1} />
			<Box
				flexDirection="column"
				borderStyle="single"
				borderDimColor
				borderLeft={false}
				borderRight={false}
				borderBottom={false}
			>
				<Text wrap="wrap">
					<Text bold color={ACCENT}>
						{t(current.label)}
					</Text>
					<Text dimColor> · {t(current.help)}</Text>
				</Text>
			</Box>
			<Text color="yellow">{note}</Text>
		</Box>
	);
}
