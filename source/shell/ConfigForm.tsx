import {useEffect, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {
	DevProperties,
	EnvironmentOverride,
	SitevisionManifest,
} from '../types/index.js';
import {
	addonNameDrift,
	findDevPropertiesPath,
	getPackageJsonSyncChanges,
	hasPackageJson,
	IMPLICIT_VALUES,
	normalizeDomain,
	readAncestorDevProperties,
	readInheritedDevProperties,
	readWorkspaceDevProperties,
	updatePackageJson,
	writeDevProperties,
	writeManifestField,
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
import {getGlobalSigning, getSettings} from '../utils/config.js';

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
	// A manifest.json field, and the language of a localized one.
	manifestKey?: string;
	lang?: string;
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
		help: "Name of the addon (custom module) in the site's Addon Repository that this app is uploaded into. Ctrl+O lists the existing ones. It is separate from the manifest name: to make them match, rename the addon in Sitevision (Addons, General, Settings) and pick it again with Ctrl+O. For a RESTApp the addon name is part of its endpoint URL.",
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

const MANIFEST_FIELDS: Field[] = [
	{
		key: 'id',
		label: 'App id',
		required: true,
		help: 'Identifier of the app in Sitevision; it also names the zip. Changing it makes the next deploy a new app instead of an update.',
	},
	{
		key: 'version',
		label: 'Version',
		required: true,
		help: 'Version of the app. Id and version together identify an upload, so bump it to deploy a new version instead of overwriting the current one.',
	},
	{
		key: 'name',
		label: 'Name',
		required: true,
		help: 'Name shown when importing and administering the app in the Sitevision editor. A multilingual manifest needs at least English.',
	},
	{
		key: 'description',
		label: 'Description',
		help: 'Short description shown next to the name in the Sitevision editor.',
	},
	{
		key: 'author',
		label: 'Author',
		help: 'Who made the app, shown in the Sitevision editor.',
	},
	{
		key: 'helpUrl',
		label: 'Help URL',
		help: "Link to the app's documentation, shown in the Sitevision editor.",
	},
];

/** Rows for manifest.json: one per text field, one per language of a localized one. */
const LOCALIZABLE = new Set(['name', 'description']);

export function manifestFields(manifest?: SitevisionManifest): Field[] {
	if (!manifest) return [];
	const raw = manifest as unknown as Record<string, unknown>;
	return MANIFEST_FIELDS.flatMap(f => {
		const value = raw[f.key];
		const base = {...f, section: 'MANIFEST', manifestKey: f.key};
		const localized = (lang: string) => ({
			...base,
			key: `manifest.${f.key}.${lang}`,
			lang,
			required: f.required && lang === 'en',
		});
		if (value && typeof value === 'object') {
			const langs = Object.keys(value);
			if (!langs.includes('sv')) langs.push('sv');
			return langs.map(lang => localized(lang));
		}

		const plain = {...base, key: `manifest.${f.key}`};
		return LOCALIZABLE.has(f.key) ? [plain, localized('sv')] : [plain];
	});
}

const labelOf = (f: Field) => t(f.label) + (f.lang ? ` (${f.lang})` : '');

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
	// Set for an app shown in workspace mode.
	workspaceRoot?: string;
	manifest?: SitevisionManifest;
	manifestPath?: string;
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
		...Object.fromEntries(
			manifestFields(project.manifest).map(f => {
				const value = (project.manifest as unknown as Record<string, unknown>)[
					f.manifestKey!
				];
				const text =
					f.lang && value && typeof value === 'object'
						? (value as Record<string, unknown>)[f.lang]
						: f.lang
							? undefined
							: value;
				return [f.key, typeof text === 'string' ? text : ''];
			}),
		),
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

const errorText = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const sameValue = (key: string, a: unknown, b: unknown) =>
	JSON.stringify(a === '' || a === undefined ? IMPLICIT_VALUES[key] : a) ===
	JSON.stringify(b === '' || b === undefined ? IMPLICIT_VALUES[key] : b);

/**
 * App mode writes the app's complete file. Workspace mode never creates an
 * app's .dev_properties.json: changes go to the root file, and addon names (the
 * base one and each environment's) to the app's package.json, since the root
 * file is shared by every app. An app that already has its own file keeps it.
 */
function writeConfigFile(project: ConfigTarget, file: DevProperties): void {
	const {workspaceRoot} = project;
	if (
		!workspaceRoot ||
		project.workspace ||
		findDevPropertiesPath(project.root)
	) {
		writeDevProperties(project.root, file, {
			complete: !workspaceRoot && !project.workspace,
		});
		return;
	}

	const before = (project.base ?? project.devProperties ?? {}) as Record<
		string,
		unknown
	>;
	const after = file as unknown as Record<string, unknown>;
	const root = readWorkspaceDevProperties(workspaceRoot) as Record<
		string,
		unknown
	>;
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (sameValue(key, after[key], before[key])) continue;
		if (key === 'addonName') {
			updatePackageJson(project.root, packageJson => {
				packageJson['addonName'] = after[key] || undefined;
			});
		} else if (key === 'environments') {
			// `after` is this app's merged view. Only the environment being edited
			// goes to the shared file, or the app's own overrides would reach
			// every other app.
			const environments = Object.entries(
				(after[key] ?? {}) as Record<string, EnvironmentOverride>,
			).filter(
				([name]) => !project.environment || name === project.environment,
			);
			root[key] = {
				...(root[key] as Record<string, EnvironmentOverride>),
				...Object.fromEntries(
					environments.map(([name, {addonName: _addonName, ...shared}]) => [
						name,
						shared,
					]),
				),
			};
			updatePackageJson(project.root, packageJson => {
				const svc = {...(packageJson['svc'] as Record<string, unknown>)};
				const own = new Map(
					Object.entries(
						(svc['environments'] ?? {}) as Record<string, EnvironmentOverride>,
					),
				);
				for (const [name, {addonName}] of environments) {
					const override = {
						...own.get(name),
						addonName: addonName || undefined,
					};
					if (Object.values(override).every(value => value === undefined)) {
						own.delete(name);
					} else {
						own.set(name, override);
					}
				}

				svc['environments'] =
					own.size > 0 ? Object.fromEntries(own) : undefined;
				packageJson['svc'] = Object.values(svc).some(
					value => value !== undefined,
				)
					? svc
					: undefined;
			});
		} else {
			root[key] = after[key];
		}
	}

	writeDevProperties(workspaceRoot, root as unknown as DevProperties);
}

/** Apply the form to disk and the keychain. Exported for the test. */
export function saveConfig(
	project: ConfigTarget,
	values: Values,
	edited: Set<string>,
): void {
	const method = values['authMethod'] as Method;
	// Start from what is there: keys the form does not show, and the settings of
	// the auth methods not in use, survive a save.
	const next: DevProperties = {
		...project.devProperties,
		domain: values['domain']!,
		siteName: values['siteName']!,
		addonName: values['addonName']!,
		username: values['username']!,
		authMethod: method,
		useHTTPForDevDeploy: values['useHTTPForDevDeploy'] === 'yes',
		baseEnvironment:
			values['baseEnvironment']?.trim().toLowerCase() || undefined,
		production: values['production'] === 'yes' ? true : undefined,
		signingUsername: values['signingUsername'] || undefined,
		certificateName: values['certificateName'] || undefined,
	};
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
	} else if (method === 'cookie') {
		next.sessionLoginUrl = values['sessionLoginUrl'] || undefined;
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
		writeConfigFile(
			project,
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
		writeConfigFile(project, {
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
	// What the form holds when an async lookup lands, not when it started.
	const latest = useRef({values, project});
	useEffect(() => {
		latest.current = {values, project};
	});
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
	const fields = [
		...visibleFields(method, project.workspace, envMode),
		...manifestFields(project.manifest),
	];
	const current = fields[Math.min(cursor, fields.length - 1)]!;
	const inherited = readInheritedDevProperties(project.root) as Record<
		string,
		unknown
	>;
	const ancestors = readAncestorDevProperties(project.root);
	const globalSigning = getGlobalSigning() as Record<string, unknown>;
	const changes = getPackageJsonSyncChanges(project.root);
	const packageJsonExists = hasPackageJson(project.root);

	// Write one field to disk (and the keychain for secrets) right away.
	const commit = (key: string, value: string, label = labelOf(current)) => {
		const clean = key === 'domain' ? normalizeDomain(value) : value;
		const field = fields.find(f => f.key === key);
		if (field?.manifestKey && field.required && !clean) {
			setNote(t('Not saved: {label} is required.', {label}));
			return;
		}

		const next = {...values, [key]: clean};
		setValues(next);
		try {
			if (field?.manifestKey) {
				writeManifestField(
					project.manifestPath!,
					field.manifestKey,
					clean,
					field.lang,
				);
			} else {
				saveConfig(project, next, new Set([key]));
			}
		} catch (error) {
			setNote(t('Not saved: {error}', {error: errorText(error)}));
			return;
		}

		setNote(
			clean === value
				? t('Saved {label}.', {label})
				: t('Saved {label} as {value} — a domain is a host only.', {
						label,
						value: clean,
					}),
		);
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
				const now = latest.current.values;
				const next = {
					...now,
					authorizationEndpoint:
						now['authorizationEndpoint'] || found.authorizationEndpoint,
					tokenEndpoint: now['tokenEndpoint'] || found.tokenEndpoint,
				};
				setValues(next);
				try {
					saveConfig(latest.current.project, next, new Set());
				} catch (error) {
					setNote(t('Not saved: {error}', {error: errorText(error)}));
					return;
				}

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
				commit('addonName', name, t('Addon name'));
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
					// A secret row always starts empty, so Enter on an empty one means
					// "remove the stored secret", not "no change".
					if (
						draft !== values[current.key] ||
						(current.kind === 'secret' && storedSecret(project, current.key))
					) {
						commit(current.key, draft);
					}
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

	// An environment's addon name differs from the app's name on purpose.
	const drift =
		envMode || !getSettings().addonNameDriftWarning
			? undefined
			: addonNameDrift(values['addonName'], project.manifest);

	const source = (f: Field): {text: string; color?: string} => {
		const required = f.required === true || f.required === method;
		if (required && !(values[f.key] ?? ''))
			return {text: t('✗ required'), color: 'red'};
		if (f.key === 'addonName' && drift)
			return {text: t('≠ manifest'), color: 'yellow'};
		if (f.kind === 'secret') {
			return {text: storedSecret(project, f.key) ? t('keychain') : '—'};
		}

		if (f.manifestKey)
			return {text: (values[f.key] ?? '') ? 'manifest.json' : ''};

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

		const inOAuth2 = [
			'clientId',
			'authorizationEndpoint',
			'tokenEndpoint',
		].includes(f.key);
		const inheritedValue = inOAuth2
			? (inherited['oauth2'] as Record<string, unknown> | undefined)?.[f.key]
			: inherited[f.key];
		if (
			inheritedValue !== undefined &&
			JSON.stringify(inheritedValue) === JSON.stringify(value)
		) {
			// A parent .dev_properties.json outranks package.json when it has the key.
			return {
				text: Object.hasOwn(ancestors, inOAuth2 ? 'oauth2' : f.key)
					? t('↑ root')
					: 'package.json',
			};
		}

		if (value && globalSigning[f.key] === value) return {text: t('global')};

		return {text: (values[f.key] ?? '') ? t('local') : ''};
	};

	// label column (24) + source column + paddings; never below 20.
	const valueWidth = Math.max(20, width - 24 - SOURCE_WIDTH - 2);
	const rows: React.ReactNode[] = [];
	let focusRow = 0;
	let lastSection: string | undefined;
	for (const f of fields) {
		if (f.section && f.section !== lastSection) {
			rows.push(
				<Box key={`g-${f.section}`} height={1} flexShrink={0} />,
				<Box key={`s-${f.section}`} height={1} flexShrink={0}>
					<Text bold dimColor>
						{t(f.section)}
					</Text>
				</Box>,
			);
			lastSection = f.section;
		}

		if (f === current) focusRow = rows.length;
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
			<Box key={f.key} height={1} flexShrink={0}>
				<Text
					color={focused ? ACCENT : undefined}
					bold={focused}
					dimColor={!focused}
				>
					{(focused ? '▸ ' : '  ') + labelOf(f).padEnd(22)}
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

	// ponytail: the help panel is assumed to wrap to three lines; measure it if
	// a narrow pane ever clips the note.
	const room = Math.max(
		3,
		height - 9 - changes.length - (project.workspace ? 2 : 0),
	);
	const firstRow = Math.max(
		0,
		Math.min(focusRow - Math.floor(room / 2), rows.length - room),
	);

	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden" height={height}>
			<Box height={1} flexShrink={0}>
				<Text dimColor wrap="truncate">
					{('  ' + t('FIELD')).padEnd(24)}
					{t('VALUE').padEnd(valueWidth)}
					{t('SOURCE')}
				</Text>
			</Box>
			{rows.slice(firstRow, firstRow + room)}
			{project.workspace && (
				<Box marginTop={1} flexShrink={0}>
					<Text dimColor>
						{t("Shared by every app below {root}. An app's own value wins.", {
							root: project.root,
						})}
					</Text>
				</Box>
			)}
			<Box marginTop={1} flexDirection="column" flexShrink={0}>
				<Text bold dimColor>
					{t('PACKAGE.JSON SYNC')}{' '}
					<Text
						color={
							changes.length > 0 || !packageJsonExists ? 'yellow' : 'green'
						}
					>
						{!packageJsonExists
							? t('no workspace package.json · y to set up')
							: changes.length === 0
								? t('in sync')
								: changes.length === 1
									? t('1 diff · y to apply')
									: t('{n} diffs · y to apply', {n: changes.length})}
					</Text>
				</Text>
				{drift && (
					<Text wrap="truncate">
						<Text color="yellow">≠ </Text>
						{t('addon name {addon} · manifest name {names}', {
							addon: values['addonName'] ?? '',
							names: drift.join(' / '),
						})}
					</Text>
				)}
				{changes.map(c => (
					<Text key={c.key} wrap="truncate">
						<Text color={c.from === undefined ? 'green' : 'yellow'}>
							{c.from === undefined ? '+ ' : '~ '}
						</Text>
						{c.key}: {c.from !== undefined && <Text dimColor>{c.from} → </Text>}
						{c.to}
					</Text>
				))}
			</Box>
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
						{labelOf(current)}
					</Text>
					<Text dimColor> · {t(current.help)}</Text>
				</Text>
			</Box>
			<Text color="yellow">{note}</Text>
		</Box>
	);
}
