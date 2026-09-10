import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {TextInput} from './TextInput.js';
import type {DevProperties, PackageJson} from '../types/index.js';
import {writeDevProperties} from '../utils/project-detection.js';
import {
	setDeployPassword,
	deleteDeployPassword,
	setOAuth2ClientSecret,
} from '../utils/keychain.js';
import {DEFAULT_REDIRECT_PORT} from '../utils/oauth2-auth.js';

interface Props {
	projectRoot: string;
	initialProperties?: DevProperties;
	packageJson: PackageJson;
	onComplete: () => void;
	onCancel: () => void;
}

type Step =
	| 'domain'
	| 'siteName'
	| 'addonName'
	| 'username'
	| 'authMethod'
	| 'password'
	| 'oauthClientId'
	| 'oauthAuthEndpoint'
	| 'oauthTokenEndpoint'
	| 'oauthScopes'
	| 'oauthClientSecret'
	| 'sessionLoginUrl'
	| 'useHTTP';

const LABELS: Record<Step, string> = {
	domain: 'Domain',
	siteName: 'Site Name',
	addonName: 'Addon Name',
	username: 'Username',
	authMethod: 'Auth Method',
	password: 'Password',
	oauthClientId: 'Client ID',
	oauthAuthEndpoint: 'Authorization Endpoint',
	oauthTokenEndpoint: 'Token Endpoint',
	oauthScopes: 'Scopes',
	oauthClientSecret: 'Client Secret',
	sessionLoginUrl: 'Login URL',
	useHTTP: 'Use HTTP',
};

type AuthMethod = 'basic' | 'oauth2' | 'cookie';

const AUTH_METHODS: {value: AuthMethod; label: string}[] = [
	{value: 'basic', label: 'Basic auth (username + password)'},
	{value: 'oauth2', label: 'OAuth2 bearer token (PKCE)'},
	{value: 'cookie', label: 'Session cookie (SAML / SSO login)'},
];

interface OAuthFields {
	authorizationEndpoint: string;
	tokenEndpoint: string;
	clientId: string;
	scopes: string;
	clientSecret: string;
}

function parseScopes(raw: string): string[] | undefined {
	const scopes = raw
		.split(/[\s,]+/)
		.map(s => s.trim())
		.filter(Boolean);
	return scopes.length > 0 ? scopes : undefined;
}

export function DevPropertiesForm({
	projectRoot,
	initialProperties,
	packageJson,
	onComplete,
	onCancel,
}: Props) {
	const [stepIndex, setStepIndex] = useState(0);
	const [properties, setProperties] = useState<Partial<DevProperties>>(() => {
		const defaults = {
			domain: packageJson.developmentDomain || '',
			addonName: packageJson.addonName || '',
			siteName: packageJson.siteName || '',
			authMethod: 'basic' as const,
		};
		return {...defaults, ...initialProperties};
	});
	const [oauth, setOauth] = useState<OAuthFields>(() => ({
		authorizationEndpoint:
			initialProperties?.oauth2?.authorizationEndpoint ?? '',
		tokenEndpoint: initialProperties?.oauth2?.tokenEndpoint ?? '',
		clientId: initialProperties?.oauth2?.clientId ?? '',
		scopes: initialProperties?.oauth2?.scopes?.join(' ') ?? '',
		clientSecret: '',
	}));

	const method: AuthMethod = properties.authMethod ?? 'basic';
	const isOAuth = method === 'oauth2';
	const methodSteps: Step[] =
		method === 'oauth2'
			? [
					'oauthClientId',
					'oauthAuthEndpoint',
					'oauthTokenEndpoint',
					'oauthScopes',
					'oauthClientSecret',
				]
			: method === 'cookie'
				? ['sessionLoginUrl']
				: ['password'];
	const steps: Step[] = [
		'domain',
		'siteName',
		'addonName',
		'username',
		'authMethod',
		...methodSteps,
		'useHTTP',
	];

	const currentStep = steps[stepIndex];
	const redirectPort =
		initialProperties?.oauth2?.redirectPort ?? DEFAULT_REDIRECT_PORT;

	const advance = () => {
		if (stepIndex < steps.length - 1) {
			setStepIndex(stepIndex + 1);
		}
	};

	const finalize = (props: Partial<DevProperties>, fields: OAuthFields) => {
		const authMethod = props.authMethod ?? 'basic';
		const domain = props.domain ?? '';
		const username = props.username ?? '';

		const finalProps: DevProperties = {
			domain,
			siteName: props.siteName ?? '',
			addonName: props.addonName ?? '',
			username,
			authMethod,
			useHTTPForDevDeploy: props.useHTTPForDevDeploy ?? false,
		};

		if (authMethod === 'oauth2') {
			finalProps.oauth2 = {
				authorizationEndpoint: fields.authorizationEndpoint,
				tokenEndpoint: fields.tokenEndpoint,
				clientId: fields.clientId,
				scopes: parseScopes(fields.scopes),
				...(initialProperties?.oauth2?.redirectPort && {
					redirectPort: initialProperties.oauth2.redirectPort,
				}),
			};
			if (fields.clientSecret && domain && fields.clientId) {
				setOAuth2ClientSecret(domain, fields.clientId, fields.clientSecret);
			}
		} else if (authMethod === 'cookie') {
			if (props.sessionLoginUrl) {
				finalProps.sessionLoginUrl = props.sessionLoginUrl;
			}
		} else if (props.password && domain && username) {
			setDeployPassword(domain, username, props.password);
		} else if (domain && username) {
			// Empty password — clear any stale keychain entry so deploy prompts.
			deleteDeployPassword(domain, username);
		}

		writeDevProperties(projectRoot, finalProps);
		onComplete();
	};

	// Update a top-level DevProperties field, then advance or finalize.
	const submitProperty = (key: keyof DevProperties, value: any) => {
		const next = {...properties, [key]: value};
		setProperties(next);
		if (steps[stepIndex] === steps[steps.length - 1]) {
			finalize(next, oauth);
		} else {
			advance();
		}
	};

	// Update an OAuth field, then advance or finalize.
	const submitOAuth = (key: keyof OAuthFields, value: string) => {
		const next = {...oauth, [key]: value};
		setOauth(next);
		if (steps[stepIndex] === steps[steps.length - 1]) {
			finalize(properties, next);
		} else {
			advance();
		}
	};

	const renderInput = () => {
		switch (currentStep) {
			case 'domain':
				return (
					<TextInput
						key="domain"
						label="Development Domain (e.g. www.sitevision.se)"
						defaultValue={properties.domain}
						placeholder="sitevision.se"
						onSubmit={value => submitProperty('domain', value)}
						onCancel={onCancel}
					/>
				);
			case 'siteName':
				return (
					<TextInput
						key="siteName"
						label="Site Name (Root node name)"
						defaultValue={properties.siteName}
						onSubmit={value => submitProperty('siteName', value)}
						onCancel={onCancel}
					/>
				);
			case 'addonName':
				return (
					<TextInput
						key="addonName"
						label="Addon Name"
						defaultValue={properties.addonName}
						onSubmit={value => submitProperty('addonName', value)}
						onCancel={onCancel}
					/>
				);
			case 'username':
				return (
					<TextInput
						key="username"
						label="Username (usually your Sitevision Cloud email)"
						defaultValue={properties.username}
						onSubmit={value => submitProperty('username', value)}
						onCancel={onCancel}
					/>
				);
			case 'authMethod':
				return (
					<MethodSelect
						key="authMethod"
						defaultValue={method}
						onSubmit={value => submitProperty('authMethod', value)}
					/>
				);
			case 'password':
				return (
					<TextInput
						key="password"
						label="Password (saved in OS keychain — leave empty to prompt on each run)"
						type="password"
						defaultValue={properties.password}
						onSubmit={value => submitProperty('password', value)}
						onCancel={onCancel}
					/>
				);
			case 'oauthClientId':
				return (
					<TextInput
						key="oauthClientId"
						label="OAuth2 Client ID"
						defaultValue={oauth.clientId}
						onSubmit={value => submitOAuth('clientId', value)}
						onCancel={onCancel}
					/>
				);
			case 'oauthAuthEndpoint':
				return (
					<TextInput
						key="oauthAuthEndpoint"
						label="Authorization Endpoint URL"
						defaultValue={oauth.authorizationEndpoint}
						onSubmit={value => submitOAuth('authorizationEndpoint', value)}
						onCancel={onCancel}
					/>
				);
			case 'oauthTokenEndpoint':
				return (
					<TextInput
						key="oauthTokenEndpoint"
						label="Token Endpoint URL"
						defaultValue={oauth.tokenEndpoint}
						onSubmit={value => submitOAuth('tokenEndpoint', value)}
						onCancel={onCancel}
					/>
				);
			case 'oauthScopes':
				return (
					<TextInput
						key="oauthScopes"
						label="Scopes (space-separated, optional)"
						defaultValue={oauth.scopes}
						onSubmit={value => submitOAuth('scopes', value)}
						onCancel={onCancel}
					/>
				);
			case 'oauthClientSecret':
				return (
					<TextInput
						key="oauthClientSecret"
						label="Client Secret (OS keychain — leave empty for a public/PKCE client)"
						type="password"
						defaultValue={oauth.clientSecret}
						onSubmit={value => submitOAuth('clientSecret', value)}
						onCancel={onCancel}
					/>
				);
			case 'sessionLoginUrl':
				return (
					<TextInput
						key="sessionLoginUrl"
						label="Login URL (opened in a browser; blank = site root)"
						defaultValue={
							properties.sessionLoginUrl ??
							(properties.domain ? `https://${properties.domain}/` : '')
						}
						onSubmit={value => submitProperty('sessionLoginUrl', value)}
						onCancel={onCancel}
					/>
				);
			case 'useHTTP':
				return (
					<BooleanInput
						key="useHTTP"
						label="Use HTTP for deployment? (y/n)"
						defaultValue={properties.useHTTPForDevDeploy ?? false}
						onSubmit={value => submitProperty('useHTTPForDevDeploy', value)}
					/>
				);
			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Setup Development Properties
				</Text>
				<Text>
					{' '}
					Step {stepIndex + 1} of {steps.length}:{' '}
					{currentStep ? LABELS[currentStep] : ''}
				</Text>
			</Box>

			{isOAuth && (
				<Box marginBottom={1}>
					<Text dimColor>
						Whitelist this redirect URI on the OAuth2 client: http://127.0.0.1:
						{redirectPort}/callback
					</Text>
				</Box>
			)}

			{/* Progress Bar */}
			<Box marginBottom={1}>
				{steps.map((s, i) => (
					<Box key={s} marginRight={1}>
						<Text color={i <= stepIndex ? 'green' : 'gray'}>
							{i < stepIndex ? '✓' : i === stepIndex ? '●' : '○'}
						</Text>
					</Box>
				))}
			</Box>

			<Box borderStyle="single" borderColor="gray" padding={1}>
				{renderInput()}
			</Box>
		</Box>
	);
}

function MethodSelect({
	defaultValue,
	onSubmit,
}: {
	defaultValue: AuthMethod;
	onSubmit: (value: AuthMethod) => void;
}) {
	const [index, setIndex] = useState(() =>
		Math.max(
			0,
			AUTH_METHODS.findIndex(m => m.value === defaultValue),
		),
	);

	useInput((_input, key) => {
		if (key.upArrow) {
			setIndex(p => (p === 0 ? AUTH_METHODS.length - 1 : p - 1));
		} else if (key.downArrow) {
			setIndex(p => (p === AUTH_METHODS.length - 1 ? 0 : p + 1));
		} else if (key.return) {
			onSubmit(AUTH_METHODS[index]!.value);
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Authentication method
				</Text>
			</Box>
			{AUTH_METHODS.map((m, i) => (
				<Text key={m.value} color={i === index ? 'green' : undefined}>
					{i === index ? '❯ ' : '  '}
					{m.label}
				</Text>
			))}
			<Box marginTop={1}>
				<Text dimColor>↑/↓ to move, Enter to select</Text>
			</Box>
		</Box>
	);
}

function BooleanInput({
	label,
	defaultValue,
	onSubmit,
}: {
	label: string;
	defaultValue?: boolean;
	onSubmit: (val: boolean) => void;
}) {
	useInput(input => {
		if (input === 'y' || input === 'Y') {
			onSubmit(true);
		} else if (input === 'n' || input === 'N') {
			onSubmit(false);
		} else if (input === '\r' && defaultValue !== undefined) {
			onSubmit(defaultValue);
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{label}
				</Text>
			</Box>
			<Box>
				<Text dimColor>
					Press Y for Yes, N for No
					{defaultValue !== undefined
						? ` (Default: ${defaultValue ? 'Yes' : 'No'})`
						: ''}
				</Text>
			</Box>
		</Box>
	);
}
