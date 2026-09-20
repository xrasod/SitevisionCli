import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	detectProject,
	requireProject,
	addonNameDrift,
	ManifestParseError,
	getPackageJsonSyncChanges,
	syncDevPropertiesToPackageJson,
	readSvcConfig,
	writeSvcConfig,
	getDeployZipPath,
	getZipPath,
	getSignedZipPath,
} from '../source/utils/project-detection.js';

function projectDir(manifest: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-detect-'));
	fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	return dir;
}

test('deploy uses the signed zip unless the build is newer', t => {
	const dir = projectDir('{"id": "x", "version": "1.0.0", "type": "RESTApp"}');
	const {manifest} = detectProject(dir)!;
	const zip = getZipPath(dir, manifest);
	const signed = getSignedZipPath(dir, manifest);
	fs.mkdirSync(path.dirname(zip));
	const touch = (file: string, seconds: number) => {
		fs.writeFileSync(file, '');
		fs.utimesSync(file, seconds, seconds);
	};

	touch(zip, 1000);
	t.is(getDeployZipPath(dir, manifest), zip);
	touch(signed, 2000);
	t.is(getDeployZipPath(dir, manifest), signed);
	touch(zip, 3000);
	t.is(getDeployZipPath(dir, manifest), zip);
});

test('a manifest with // comments (as the Sitevision docs show) is accepted', t => {
	const dir = projectDir(
		'{\n  "id": "x",\n  "version": "0.0.1",\n  "name": { // Multilingual-manifest requires SV 10.1\n    "sv": "Namn",\n    "en": "Name"\n  },\n  "helpUrl": "https://example.com/restapps",\n  "type": "RESTApp"\n}',
	);
	const project = detectProject(dir);
	t.truthy(project);
	t.deepEqual(project!.manifest.name, {sv: 'Namn', en: 'Name'});
	// The // inside the URL must be preserved, not stripped as a comment.
	t.is(project!.manifest.helpUrl, 'https://example.com/restapps');
});

test('a manifest that is broken beyond comments reports invalid JSON', t => {
	const dir = projectDir('{\n  "id": "x",\n  "name": "Name",,\n}');
	const error = t.throws(() => requireProject(dir), {
		instanceOf: ManifestParseError,
	});
	t.true(error!.message.includes('not valid JSON'));
	t.true(error!.message.includes('manifest.json'));
});

test('a valid localized manifest is detected', t => {
	const dir = projectDir(
		'{"id":"x","version":"1.0.0","name":{"sv":"Namn","en":"Name"},"type":"RESTApp"}',
	);
	const project = detectProject(dir);
	t.truthy(project);
	t.deepEqual(project!.manifest.name, {sv: 'Namn', en: 'Name'});
});

test('a directory without a manifest is simply not a project (null)', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-detect-'));
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	t.is(detectProject(dir), null);
});

test('package.json sync copies shared values only, and preserves formatting', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-sync-'));
	const original =
		'{\n\t"name": "my-app",\n\t"siteName": "OldSite",\n\t"scripts": {\n\t\t"build": "x"\n\t}\n}\n';
	fs.writeFileSync(path.join(dir, 'package.json'), original);
	fs.writeFileSync(
		path.join(dir, '.dev_properties.json'),
		JSON.stringify({
			domain: 'test.sitevision.se',
			siteName: 'MySite',
			addonName: 'MyAddon',
			username: 'user@example.com',
			signingUsername: 'signer@example.com',
			certificateName: 'Mine',
			authMethod: 'oauth2',
			environments: {
				prod: {domain: 'live.example', username: 'other@example.com'},
			},
		}),
	);

	t.deepEqual(getPackageJsonSyncChanges(dir), [
		{key: 'developmentDomain', to: 'test.sitevision.se'},
		{key: 'siteName', from: 'OldSite', to: 'MySite'},
		{key: 'addonName', to: 'MyAddon'},
		{key: 'svc.authMethod', to: 'oauth2'},
		{key: 'svc.environments', to: '{"prod":{"domain":"live.example"}}'},
	]);

	t.true(syncDevPropertiesToPackageJson(dir));

	const written = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
	t.true(written.includes('\n\t"name": "my-app"'), 'tab indent preserved');
	t.true(written.endsWith('}\n'), 'trailing newline preserved');

	const parsed = JSON.parse(written) as Record<string, unknown>;
	t.is(parsed['developmentDomain'], 'test.sitevision.se');
	t.is(parsed['siteName'], 'MySite');
	t.is(parsed['addonName'], 'MyAddon');
	t.is(parsed['name'], 'my-app');
	t.deepEqual(parsed['scripts'], {build: 'x'});
	t.deepEqual(parsed['svc'], {
		authMethod: 'oauth2',
		environments: {prod: {domain: 'live.example'}},
	});
	t.false(written.includes('example.com'), 'user values stay out');
	t.false(written.includes('Mine'), 'user values stay out');

	t.deepEqual(getPackageJsonSyncChanges(dir), []);
	t.false(syncDevPropertiesToPackageJson(dir));
});

test('package.json sync mirrors manifest version, description and author', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-mirror-'));
	fs.writeFileSync(
		path.join(dir, 'manifest.json'),
		JSON.stringify({
			id: 'one',
			version: '1.2.0',
			type: 'WebApp',
			name: {sv: 'Ett', en: 'One'},
			description: {sv: 'Beskrivning', en: 'Description'},
			author: 'Me',
		}),
	);
	// Without a package.json there is nothing to mirror into.
	t.deepEqual(getPackageJsonSyncChanges(dir), []);

	fs.writeFileSync(
		path.join(dir, 'package.json'),
		JSON.stringify({name: 'one', version: '1.0.0', author: {name: 'Team'}}),
	);
	t.deepEqual(getPackageJsonSyncChanges(dir), [
		{key: 'version', from: '1.0.0', to: '1.2.0'},
		{key: 'description', to: 'Description'},
	]);
	t.true(syncDevPropertiesToPackageJson(dir));
	const parsed = JSON.parse(
		fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
	) as Record<string, unknown>;
	t.is(parsed['version'], '1.2.0');
	t.is(parsed['description'], 'Description');
	t.deepEqual(parsed['author'], {name: 'Team'}, 'author object left alone');
	t.deepEqual(getPackageJsonSyncChanges(dir), []);
});

test('sync creates a missing package.json and throws on a broken one', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-nopkg-'));
	fs.mkdirSync(path.join(dir, '.git'));
	fs.writeFileSync(
		path.join(dir, '.dev_properties.json'),
		JSON.stringify({siteName: 'Site', username: 'me@example.com'}),
	);
	t.deepEqual(getPackageJsonSyncChanges(dir), [{key: 'siteName', to: 'Site'}]);
	t.true(syncDevPropertiesToPackageJson(dir));
	const created = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
	t.deepEqual(JSON.parse(created), {private: true, siteName: 'Site'});

	fs.writeFileSync(path.join(dir, 'package.json'), '{ broken');
	t.throws(() => syncDevPropertiesToPackageJson(dir), {
		message: /Could not update/,
	});
});

test('.svcconfig round-trips and preserves unknown keys', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-config-'));
	t.deepEqual(readSvcConfig(dir), {});

	fs.writeFileSync(path.join(dir, '.svcconfig'), '{\n  "other": 1\n}\n');
	writeSvcConfig(dir, {syncPackageJson: false});

	t.deepEqual(readSvcConfig(dir), {other: 1, syncPackageJson: false});
});

test('a domain read from a file loses any scheme or path', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-dom-'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id: 'x', name: 'X', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({domain: 'https://site.example/start', siteName: 'Site'}),
	);
	t.is(detectProject(root)?.devProperties?.domain, 'site.example');
});

test('a manifest saved with a UTF-8 BOM is accepted', t => {
	const dir = projectDir('﻿{"id": "x", "version": "1.0.0", "type": "WebApp"}');
	t.is(detectProject(dir)?.manifest.id, 'x');
});

test('a manifest missing id, version or type is rejected by name', t => {
	for (const [manifest, missing] of [
		['{"version": "1.0.0", "type": "WebApp"}', 'id'],
		['{"id": "x", "type": "WebApp"}', 'version'],
		['{"id": "x", "version": "1.0.0"}', 'type'],
		['null', 'object'],
	] as const) {
		const error = t.throws(() => detectProject(projectDir(manifest)), {
			instanceOf: ManifestParseError,
		});
		t.true(error.message.includes(missing), error.message);
	}
});

test('addonNameDrift lists the manifest names an addon name matches none of', t => {
	const names = {sv: 'Länsväljare', en: 'County picker'};
	t.deepEqual(addonNameDrift('Regionsväljare', {name: names}), [
		'Länsväljare',
		'County picker',
	]);
	// Any language's name counts, however it is cased or padded.
	t.is(addonNameDrift('county picker ', {name: names}), undefined);
	t.is(addonNameDrift('Länsväljare', {name: 'Länsväljare'}), undefined);
	t.deepEqual(addonNameDrift('Old', {name: 'New'}), ['New']);
	// Nothing to compare is not a difference.
	t.is(addonNameDrift('', {name: names}), undefined);
	t.is(addonNameDrift('Addon', undefined), undefined);
	t.is(addonNameDrift('Addon', {name: ''}), undefined);
});
