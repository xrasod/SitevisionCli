import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {type AddressInfo} from 'node:net';
import test from 'ava';
import {detectProject} from '../source/utils/project-detection.js';
import {getTasks, type Task} from '../source/utils/tasks.js';
import {actions, type ActionContext} from '../source/shell/actions.js';

// A site that accepts every import and activation, and remembers the URLs.
async function serve(t: {teardown: (fn: () => void) => void}) {
	const urls: string[] = [];
	const server = http.createServer((req, res) => {
		urls.push(req.url ?? '');
		req.resume();
		req.on('end', () => {
			res.writeHead(200, {'content-type': 'application/json'});
			res.end(JSON.stringify(urls.length === 1 ? {id: '360.1'} : {}));
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	t.teardown(() => server.close());
	return {urls, domain: `127.0.0.1:${(server.address() as AddressInfo).port}`};
}

function productionContext(domain: string, pick: number | null) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-actions-'));
	fs.mkdirSync(path.join(root, 'dist'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id: 'app', name: 'App', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	fs.writeFileSync(path.join(root, 'dist', 'app-signed.zip'), 'PK fake zip');
	const project = detectProject(root)!;
	project.devProperties = {
		domain,
		siteName: 'Site',
		addonName: 'Addon',
		username: 'me',
		authMethod: 'basic',
		password: 'pw',
		useHTTPForDevDeploy: true,
	};
	const labels: string[] = [];
	const ctx = {
		project,
		environment: 'prod',
		isProduction: true,
		async choose(label: string) {
			labels.push(label);
			return pick;
		},
		notify() {},
		setTab() {},
	} as unknown as ActionContext;
	return {ctx, root, labels};
}

async function settled(task: Task): Promise<Task> {
	while (task.status === 'running') {
		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 20);
		});
	}

	return task;
}

const action = (id: string) => actions.find(a => a.id === id)!;
const tasksFor = (root: string) => getTasks().filter(t => t.appRoot === root);

test('p on production: plain import, then activation when picked', async t => {
	const {urls, domain} = await serve(t);
	const {ctx, root, labels} = productionContext(domain, 0);
	await action('deploy').run(ctx);
	const task = await settled(tasksFor(root)[0]!);
	t.is(task.status, 'success', task.error);
	t.regex(labels[0] ?? '', /prod.*Addon/);
	t.is(urls.length, 2);
	t.notRegex(urls[0]!, /force=true/);
	t.regex(urls[1]!, /activateCustomModuleExecutable$/);
});

test('P on production: forced import, no activation when "deploy only" is picked', async t => {
	const {urls, domain} = await serve(t);
	const {ctx, root} = productionContext(domain, 1);
	await action('deploy-force').run(ctx);
	const task = await settled(tasksFor(root)[0]!);
	t.is(task.status, 'success', task.error);
	t.deepEqual(
		urls.map(u => u.includes('force=true')),
		[true],
	);
});

test('Esc in the production picker starts nothing', async t => {
	const {urls, domain} = await serve(t);
	const {ctx, root} = productionContext(domain, null);
	await action('deploy').run(ctx);
	await action('deploy-force').run(ctx);
	t.deepEqual(tasksFor(root), []);
	t.deepEqual(urls, []);
});
