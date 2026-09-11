import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {DevProperties} from '../source/types/index.js';
import {
	environmentNames,
	isProductionEnvironment,
	resolveEnvironment,
	withEnvironmentOverride,
} from '../source/utils/environments.js';
import {detectProject} from '../source/utils/project-detection.js';
import {saveConfig} from '../source/shell/ConfigForm.js';

const base: DevProperties = {
	domain: 'acme-use.sitevision-cloud.se',
	siteName: 'Intranet',
	addonName: 'Booking',
	username: 'me@acme.se',
	authMethod: 'basic',
	environments: {
		test: {domain: 'acme-tse.sitevision-cloud.se'},
		prod: {domain: 'acme.sitevision-cloud.se', authMethod: 'oauth2'},
		staging: {domain: 'stage.acme.se', production: true},
	},
};

test('environments: names, production detection and resolution', t => {
	t.deepEqual(environmentNames(base), ['dev', 'test', 'prod', 'staging']);
	const prodFirst = {...base, baseEnvironment: 'prod', environments: {}};
	t.deepEqual(environmentNames(prodFirst), ['prod']);
	t.false(isProductionEnvironment('prod', prodFirst));
	t.true(isProductionEnvironment('prod', {...prodFirst, production: true}));
	t.is(resolveEnvironment(prodFirst, 'prod').environmentName, 'prod');
	t.false(isProductionEnvironment('dev', base));
	t.false(isProductionEnvironment('test', base));
	t.true(isProductionEnvironment('prod', base));
	t.true(isProductionEnvironment('staging', base));

	const prod = resolveEnvironment(base, 'prod');
	t.is(prod.domain, 'acme.sitevision-cloud.se');
	t.is(prod.siteName, 'Intranet');
	t.is(prod.authMethod, 'oauth2');
	t.is(prod.environmentName, 'prod');
	t.true(prod.productionEnvironment);

	const dev = resolveEnvironment(base, 'dev');
	t.is(dev.domain, base.domain);
	t.false(dev.productionEnvironment);
});

test('withEnvironmentOverride keeps only values that differ from the base', t => {
	const next = withEnvironmentOverride(base, 'test', {
		domain: 'acme-tse.sitevision-cloud.se',
		siteName: 'Intranet',
		username: 'other@acme.se',
		sessionLoginUrl: undefined,
	});
	t.deepEqual(next.environments?.['test'], {
		domain: 'acme-tse.sitevision-cloud.se',
		username: 'other@acme.se',
	});
	t.deepEqual(next.environments?.['prod'], base.environments?.['prod']);
});

test('saveConfig in a non-dev environment writes an override, not the base', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-env-'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id: 'x', name: 'X', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify(base),
	);
	const project = detectProject(root)!;
	const prod = resolveEnvironment(project.devProperties!, 'prod');
	saveConfig(
		{
			root,
			devProperties: prod,
			base: project.devProperties,
			environment: 'prod',
		},
		{
			domain: 'live.acme.se',
			siteName: 'Intranet',
			addonName: 'Booking',
			username: 'me@acme.se',
			authMethod: 'basic',
			password: '',
			clientId: '',
			authorizationEndpoint: '',
			tokenEndpoint: '',
			scopes: '',
			clientSecret: '',
			sessionLoginUrl: '',
			useHTTPForDevDeploy: 'no',
			signingUsername: 'signer@acme.se',
			certificateName: '',
			signingPassword: '',
		},
		new Set(['domain']),
	);
	const file = JSON.parse(
		fs.readFileSync(path.join(root, '.dev_properties.json'), 'utf8'),
	) as DevProperties;
	t.is(file.domain, base.domain);
	t.is(file.signingUsername, 'signer@acme.se');
	t.deepEqual(file.environments?.['prod'], {
		domain: 'live.acme.se',
		useHTTPForDevDeploy: false,
	});
	t.deepEqual(file.environments?.['test'], base.environments?.['test']);
});
