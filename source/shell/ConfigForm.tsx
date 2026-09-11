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
import {discoverOAuth2Config} from '../utils/oauth2-auth.js';
import {ACCENT} from './Frame.js';

type Method = 'basic' | 'oauth2' | 'cookie';
const METHODS: Method[] = ['basic', 'oauth2', 'cookie'];

interface Field {
	key: string;
	label: string;
	kind?: 'text' | 'method' | 'bool' | 'secret';
	required?: boolean;
	when?: Method;
	section?: string;
	hint?: string;
	// Only meaningful for an app, hidden when editing the workspace root.
	perApp?: boolean;
}

const FIELDS: Field[] = [
	{key: 'domain', label: 'Development domain', required: true},
	{key: 'siteName', label: 'Site name', required: true},
	{
		key: 'addonName',
		label: 'Addon name',
		required: true,
		hint: '^O pick from repo',
		perApp: true,
	},
	{key: 'username', label: 'Username', required: true},
	{key: 'authMethod', label: 'Auth method', kind: 'method'},
	{key: 'password', label: 'Password', kind: 'secret', when: 'basic'},
	{key: 'clientId', label: 'OAuth2 client id', required: true, when: 'oauth2'},
	{
		key: 'authorizationEndpoint',
		label: 'Authorization endpoint',
		required: true,
		when: 'oauth2',
	},
	{
		key: 'tokenEndpoint',
		label: 'Token endpoint',
		required: true,
		when: 'oauth2',
	},
	{
		key: 'scopes',
		label: 'Scopes',
		when: 'oauth2',
		hint: 'blank = client default',
	},
	{key: 'clientSecret', label: 'Client secret', kind: 'secret', when: 'oauth2'},
	{
		key: 'sessionLoginUrl',
		label: 'Login URL',
		when: 'cookie',
		hint: 'blank = site root',
	},
	{key: 'useHTTPForDevDeploy', label: 'Use HTTP', kind: 'bool'},
	{
		key: 'signingUsername',
		label: 'Signing user',
		section: 'SIGNING',
		hint: 'required for signed deploys',
	},
	{key: 'certificateName', label: 'Certificate', section: 'SIGNING'},
	{
		key: 'signingPassword',
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
	devProperties?: Partial<DevProperties>;
	workspace?: boolean;
}

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
		scopes: dev.oauth2?.scopes?.join(' ') ?? '',
		clientSecret: '',
		sessionLoginUrl: dev.sessionLoginUrl ?? '',
		useHTTPForDevDeploy: dev.useHTTPForDevDeploy ? 'yes' : 'no',
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

	writeDevProperties(project.root, next);

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

export function visibleFields(method: Method, workspace = false): Field[] {
	return FIELDS.filter(
		f => (!f.when || f.when === method) && !(workspace && f.perApp),
	);
}

export function ConfigForm({
	project,
	active,
	width,
	pickAddon,
	onSaved,
	onEditingChange,
}: {
	project: ConfigTarget;
	active: boolean;
	// Pane width in columns; the value column takes whatever the label and
	// source columns leave.
	width: number;
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
	const fields = visibleFields(method, project.workspace);
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
		setNote(`Saved ${label}.`);
		onSaved();
	};

	// Auto-fill OAuth2 endpoints from the site's OpenID configuration.
	useEffect(() => {
		if (method !== 'oauth2' || !values['domain']) return;
		if (values['authorizationEndpoint'] && values['tokenEndpoint']) return;
		let cancelled = false;
		setNote('Looking up OAuth2 endpoints…');
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
				setNote('Endpoints filled from the site OpenID config.');
			} else {
				setNote('Could not discover OAuth2 endpoints; enter them by hand.');
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
				} else if (key.backspace || key.delete) {
					setDraft(d => d.slice(0, -1));
				} else if (input && !key.ctrl && !key.meta) {
					setDraft(d => d + input);
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
				setDraft(current.kind === 'secret' ? '' : (values[current.key] ?? ''));
				setEditing(true);
			}
		},
		{isActive: active},
	);

	const source = (f: Field): {text: string; color?: string} => {
		if (f.required && !(values[f.key] ?? ''))
			return {text: '✗ required', color: 'red'};
		if (f.kind === 'secret') {
			return {text: storedSecret(project, f.key) ? 'keychain' : '—'};
		}

		const value = f.kind === 'bool' ? values[f.key] === 'yes' : values[f.key];
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
			return {text: '↑ root'};
		}

		return {text: (values[f.key] ?? '') ? 'local' : ''};
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
						{f.section}
					</Text>
				</Box>,
			);
			lastSection = f.section;
		}

		const focused = active && f === current;
		const typing = focused && editing;
		// Keep the end of a long value (where the cursor is) visible while typing.
		const tail = (text: string) =>
			typing && text.length > valueWidth - 1
				? `…${text.slice(-(valueWidth - 2))}`
				: text;
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
						{m}
					</Text>
					{i < choices.length - 1 && <Text dimColor> · </Text>}
				</Text>
			));
		} else if (f.kind === 'secret') {
			display = typing ? (
				<Text>{tail('•'.repeat(draft.length))}</Text>
			) : (
				<Text dimColor>
					{storedSecret(project, f.key) ? '•••••••• keychain' : (f.hint ?? '')}
				</Text>
			);
		} else {
			const value = typing ? draft : values[f.key]!;
			display = value ? (
				<Text>{tail(value)}</Text>
			) : (
				<Text dimColor>{typing ? '' : (f.hint ?? '—')}</Text>
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
					{(focused ? '▸ ' : '  ') + f.label.padEnd(22)}
				</Text>
				<Box width={valueWidth} flexShrink={0}>
					<Text wrap="truncate">
						{display}
						{typing && options(f).length === 0 && <Text inverse> </Text>}
					</Text>
				</Box>
				<Box width={SOURCE_WIDTH} flexShrink={0}>
					<Text dimColor={!src.color} color={src.color} wrap="truncate">
						{focused && f.hint && f.key === 'addonName' ? f.hint : src.text}
					</Text>
				</Box>
			</Box>,
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} overflow="hidden">
			<Text dimColor>
				{'  FIELD'.padEnd(24)}
				{'VALUE'.padEnd(valueWidth)}SOURCE
			</Text>
			{rows}
			{project.workspace && (
				<Box marginTop={1}>
					<Text dimColor>
						Shared by every app below {project.root}. An app's own value wins.
					</Text>
				</Box>
			)}
			{!project.workspace && (
				<Box marginTop={1} flexDirection="column">
					<Text bold dimColor>
						PACKAGE.JSON SYNC{' '}
						<Text color={changes.length > 0 ? 'yellow' : 'green'}>
							{changes.length > 0
								? `${changes.length} diff${changes.length === 1 ? '' : 's'} · y to apply`
								: 'in sync'}
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
			<Box marginTop={1}>
				<Text color="yellow">{note}</Text>
			</Box>
			<Text dimColor>
				{editing
					? options(current).length > 0
						? '←→ choose · Enter confirm · Esc cancel'
						: 'Enter save · Esc cancel'
					: active
						? '↑↓ field · Enter edit · ^O pick addon'
						: 'Tab to edit'}
			</Text>
		</Box>
	);
}
