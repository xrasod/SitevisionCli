import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	detectProject,
	requireProject,
	ManifestParseError,
	getPackageJsonSyncChanges,
	syncDevPropertiesToPackageJson,
	readSvcConfig,
	writeSvcConfig,
} from '../source/utils/project-detection.js';

function projectDir(manifest: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-detect-'));
	fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	return dir;
}

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

test('package.json sync reports missing and differing fields, and preserves formatting', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-sync-'));
	const original =
		'{\n\t"name": "my-app",\n\t"siteName": "OldSite",\n\t"scripts": {\n\t\t"build": "x"\n\t}\n}\n';
	fs.writeFileSync(path.join(dir, 'package.json'), original);

	const properties = {
		domain: 'test.sitevision.se',
		siteName: 'MySite',
		addonName: 'MyAddon',
		username: 'user@example.com',
	};

	t.deepEqual(getPackageJsonSyncChanges(dir, properties), [
		{key: 'developmentDomain', to: 'test.sitevision.se'},
		{key: 'siteName', from: 'OldSite', to: 'MySite'},
		{key: 'addonName', to: 'MyAddon'},
	]);

	t.true(syncDevPropertiesToPackageJson(dir, properties));

	const written = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
	t.true(written.includes('\n\t"name": "my-app"'), 'tab indent preserved');
	t.true(written.endsWith('}\n'), 'trailing newline preserved');

	const parsed = JSON.parse(written) as Record<string, unknown>;
	t.is(parsed['developmentDomain'], 'test.sitevision.se');
	t.is(parsed['siteName'], 'MySite');
	t.is(parsed['addonName'], 'MyAddon');
	t.is(parsed['name'], 'my-app');
	t.deepEqual(parsed['scripts'], {build: 'x'});

	t.deepEqual(getPackageJsonSyncChanges(dir, properties), []);
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
