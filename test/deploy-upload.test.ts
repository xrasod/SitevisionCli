import http from 'http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AddressInfo} from 'net';
import test from 'ava';
import {deployApp} from '../source/utils/sitevision-api.js';

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
