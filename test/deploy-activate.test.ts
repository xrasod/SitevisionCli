import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {type AddressInfo} from 'node:net';
import test from 'ava';
import {detectProject} from '../source/utils/project-detection.js';
import {startDeploy, type Task} from '../source/utils/tasks.js';
import {deployApp} from '../source/utils/sitevision-api.js';

type Reply = (res: http.ServerResponse, req: http.IncomingMessage) => void;

// Answers successive requests with the given replies, in order.
async function serve(...replies: Reply[]) {
	const urls: string[] = [];
	const server = http.createServer((req, res) => {
		urls.push(req.url ?? '');
		req.resume();
		req.on('end', () => {
			replies[urls.length - 1]!(res, req);
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-prod-'));
	fs.mkdirSync(path.join(root, 'dist'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id: 'app', name: 'App', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	const zip = path.join(root, 'dist', 'app-signed.zip');
	fs.writeFileSync(zip, 'PK fake zip');
	return {
		zip,
		urls,
		server,
		project: detectProject(root)!,
		config: {
			domain: `127.0.0.1:${port}`,
			siteName: 'Site',
			addonName: 'Addon',
			username: 'u',
			password: 'p',
			useHTTP: true,
		},
	};
}

const json =
	(status: number, body: unknown): Reply =>
	res => {
		res.writeHead(status, {'content-type': 'application/json'});
		res.end(JSON.stringify(body));
	};

async function settled(task: Task): Promise<Task> {
	while (task.status === 'running') {
		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 20);
		});
	}

	return task;
}

test('a production deploy with activate uploads, then activates the returned id', async t => {
	const {project, config, server, urls} = await serve(
		json(200, {id: '360.1'}),
		json(200, {}),
	);
	const task = await settled(
		startDeploy(project, config, {production: true, activate: true}),
	);
	server.close();
	t.is(task.status, 'success', task.error);
	t.is(urls.length, 2);
	t.notRegex(urls[0]!, /force=true/);
	t.regex(urls[1]!, /activateCustomModuleExecutable$/);
	t.true(task.lines.some(l => l.tag === 'act' && l.level === 'ok'));
});

test('a production deploy without activate only uploads', async t => {
	const {project, config, server, urls} = await serve(json(200, {id: '360.1'}));
	const task = await settled(startDeploy(project, config, {production: true}));
	server.close();
	t.is(task.status, 'success', task.error);
	t.is(urls.length, 1);
});

test('a rejected activation fails the task after a successful upload', async t => {
	const {project, config, server} = await serve(
		json(200, {id: '360.1'}),
		json(403, {message: 'forbidden'}),
	);
	const task = await settled(
		startDeploy(project, config, {production: true, activate: true}),
	);
	server.close();
	t.is(task.status, 'error');
	t.regex(task.error ?? '', /403/);
	t.true(task.lines.some(l => l.tag === 'dep' && l.level === 'ok'));
});

test('an import response without an id cannot be activated, and says so', async t => {
	const {project, config, server} = await serve(json(200, {}));
	const task = await settled(
		startDeploy(project, config, {production: true, activate: true}),
	);
	server.close();
	t.is(task.status, 'error');
	t.regex(task.error ?? '', /not activated/i);
});

test('a production deploy refuses to run without the signed zip', async t => {
	const {project, config, server, zip, urls} = await serve();
	fs.rmSync(zip);
	const task = await settled(startDeploy(project, config, {production: true}));
	server.close();
	t.is(task.status, 'error');
	t.regex(task.error ?? '', /Signed zip not found/);
	t.is(urls.length, 0);
});

test('a response cut off mid-body rejects instead of hanging', async t => {
	const {zip, config, server} = await serve(res => {
		res.writeHead(200, {'content-length': '1000'});
		res.write('{"');
		res.socket?.end();
	});
	const result = await Promise.race([
		deployApp(zip, config, 'web'),
		new Promise<'hung'>(resolve => {
			setTimeout(resolve, 3000, 'hung');
		}),
	]);
	server.close();
	t.not(result, 'hung');
	t.false((result as {success: boolean}).success);
});
