import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	detectProject,
	requireProject,
	ManifestParseError,
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
