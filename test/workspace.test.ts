import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	detectProject,
	writeDevProperties,
	appTypeOf,
	getApiEndpoints,
} from '../source/utils/project-detection.js';
import {discoverApps, appGroup} from '../source/utils/workspace.js';

function app(root: string, id: string, extra: Record<string, unknown> = {}) {
	fs.mkdirSync(root, {recursive: true});
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id, name: id, version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	for (const [file, content] of Object.entries(extra)) {
		fs.writeFileSync(path.join(root, file), JSON.stringify(content));
	}
}

function workspace() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-ws-'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({
			domain: 'site.example',
			siteName: 'Site',
			username: 'me@example.com',
			authMethod: 'basic',
		}),
	);
	app(path.join(root, 'webapps', 'one'), 'one', {
		'.dev_properties.json': {addonName: 'One'},
	});
	app(path.join(root, 'restapps', 'two'), 'two');
	app(path.join(root, 'node_modules', 'ignored'), 'ignored');
	return root;
}

test('an app inherits shared dev properties from the workspace root', t => {
	const root = workspace();
	const one = detectProject(path.join(root, 'webapps', 'one'))!;
	t.is(one.devProperties?.domain, 'site.example');
	t.is(one.devProperties?.addonName, 'One');
	t.deepEqual(one.inheritedKeys.toSorted(), [
		'authMethod',
		'domain',
		'siteName',
		'username',
	]);

	const two = detectProject(path.join(root, 'restapps', 'two'))!;
	t.true(two.hasDevProperties);
	t.is(two.devProperties?.addonName, undefined);
});

test('writing dev properties keeps only values that differ from the root', t => {
	const root = workspace();
	const oneRoot = path.join(root, 'webapps', 'one');
	const one = detectProject(oneRoot)!;
	writeDevProperties(oneRoot, {
		...one.devProperties!,
		addonName: 'Renamed',
		password: 'never-written',
	});
	const file = JSON.parse(
		fs.readFileSync(path.join(oneRoot, '.dev_properties.json'), 'utf8'),
	);
	t.deepEqual(file, {addonName: 'Renamed'});
});

test('discoverApps finds apps below the root and skips node_modules', t => {
	const root = workspace();
	const apps = discoverApps(root);
	t.deepEqual(
		apps.map(a => a.manifest.id),
		['two', 'one'],
	);
	t.is(appGroup(root, apps[1]!.root), 'webapps');
});

test('an MCPServer manifest is a known app type and an unknown type does not crash detection', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-mcp-'));
	app(path.join(root, 'mcp'), 'my-mcp');
	fs.writeFileSync(
		path.join(root, 'mcp', 'manifest.json'),
		JSON.stringify({
			id: 'my-mcp',
			name: 'MCP',
			version: '1.0.0',
			type: 'MCPServer',
		}),
	);
	app(path.join(root, 'odd'), 'odd');
	fs.writeFileSync(
		path.join(root, 'odd', 'manifest.json'),
		JSON.stringify({
			id: 'odd',
			name: 'Odd',
			version: '1.0.0',
			type: 'Hologram',
		}),
	);
	const apps = discoverApps(root);
	t.is(appTypeOf(apps[0]!.manifest), 'mcp');
	t.is(appTypeOf(apps[1]!.manifest), undefined);
	t.is(getApiEndpoints('mcp').import, 'mcpServerImport');
});
