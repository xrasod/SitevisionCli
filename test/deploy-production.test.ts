import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {type AddressInfo} from 'node:net';
import test from 'ava';
import {deployApp, deployProduction} from '../source/utils/sitevision-api.js';

type Reply = (res: http.ServerResponse, req: http.IncomingMessage) => void;

// Answers successive requests with the given replies, in order.
async function serve(...replies: Reply[]) {
	let count = 0;
	const server = http.createServer((req, res) => {
		req.resume();
		req.on('end', () => {
			replies[count++]!(res, req);
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-prod-'));
	const zip = path.join(dir, 'app-signed.zip');
	fs.writeFileSync(zip, 'PK fake zip');
	return {
		zip,
		server,
		config: {
			domain: `127.0.0.1:${port}`,
			siteName: 'Site',
			addonName: 'Addon',
			username: 'u',
			password: 'p',
			useHTTP: true,
			activate: true,
		},
	};
}

const json =
	(status: number, body: unknown): Reply =>
	res => {
		res.writeHead(status, {'content-type': 'application/json'});
		res.end(JSON.stringify(body));
	};

test('deployProduction reports activated only when activation succeeded', async t => {
	const {zip, config, server} = await serve(
		json(200, {id: '360.1'}),
		json(200, {}),
	);
	const result = await deployProduction(zip, config, 'web');
	server.close();
	t.true(result.success);
	t.true(result.activated);
});

test('a rejected activation is not reported as activated', async t => {
	const {zip, config, server} = await serve(
		json(200, {id: '360.1'}),
		json(403, {message: 'forbidden'}),
	);
	const result = await deployProduction(zip, config, 'web');
	server.close();
	t.true(result.success);
	t.false(result.activated);
	t.regex(result.message ?? '', /activation failed/i);
});

test('an import response without an id cannot be activated, and says so', async t => {
	const {zip, config, server} = await serve(json(200, {}));
	const result = await deployProduction(zip, config, 'web');
	server.close();
	t.true(result.success);
	t.false(result.activated);
	t.regex(result.message ?? '', /not activated/i);
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
