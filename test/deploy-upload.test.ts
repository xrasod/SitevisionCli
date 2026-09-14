import http from 'http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AddressInfo} from 'net';
import test from 'ava';
import {activateApp, deployApp} from '../source/utils/sitevision-api.js';

// Regression: the import endpoints read the archive from a multipart part named
// "data" (confirmed against a live Sitevision server). Sending "file" 400s with
// "invalid parameter (request body)".
test('deployApp uploads the archive in a multipart part named "data"', async t => {
	let received = '';
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => {
			chunks.push(c);
		});
		req.on('end', () => {
			received = Buffer.concat(chunks).toString('latin1');
			res.writeHead(200, {'content-type': 'text/plain'});
			res.end(JSON.stringify({id: '360.1', type: 'sv:webApp'}));
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-deploy-'));
	const zip = path.join(dir, 'app.zip');
	fs.writeFileSync(zip, 'PK fake zip');

	const result = await deployApp(
		zip,
		{
			domain: `127.0.0.1:${port}`,
			siteName: 'Site',
			addonName: 'My Module',
			username: 'u',
			password: 'p',
			useHTTP: true,
		},
		'web',
	);

	server.close();

	t.true(result.success);
	t.regex(received, /name="data"/);
	t.notRegex(received, /name="file"/);
});

// Regression: the PUT body property is customModuleExecutableId. Sending
// executableId 400s with "Missing property customModuleExecutableId".
test('activateApp PUTs the id as customModuleExecutableId', async t => {
	let request = {method: '', url: '', body: ''};
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => {
			chunks.push(c);
		});
		req.on('end', () => {
			request = {
				method: req.method ?? '',
				url: req.url ?? '',
				body: Buffer.concat(chunks).toString('utf8'),
			};
			res.writeHead(200, {'content-type': 'application/json'});
			res.end('{"success":true}');
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;

	const result = await activateApp(
		'361.6f1f0231189da6e86eeb',
		{
			domain: `127.0.0.1:${port}`,
			siteName: 'Site',
			addonName: 'My Module',
			username: 'u',
			password: 'p',
			useHTTP: true,
		},
		'web',
	);

	server.close();

	t.true(result.success);
	t.is(request.method, 'PUT');
	t.regex(request.url, /\/activateCustomModuleExecutable$/);
	t.deepEqual(JSON.parse(request.body), {
		customModuleExecutableId: '361.6f1f0231189da6e86eeb',
	});
});
