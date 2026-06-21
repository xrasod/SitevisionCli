import http from 'http';
import {AddressInfo} from 'net';
import test from 'ava';
import {
	looksLikeZip,
	isRetryableStatus,
	summarizeErrorBody,
	makeRequest,
} from '../source/utils/sitevision-api.js';

test('looksLikeZip accepts ZIP magic and rejects other content', t => {
	const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
	const html = Buffer.from('<html>error</html>');

	t.true(looksLikeZip(zip));
	t.false(looksLikeZip(html));
	t.false(looksLikeZip(Buffer.from([0x50, 0x4b]))); // too short
});

test('isRetryableStatus retries transient failures only', t => {
	t.true(isRetryableStatus(500));
	t.true(isRetryableStatus(503));
	t.true(isRetryableStatus(429));
	t.true(isRetryableStatus(408));
	t.false(isRetryableStatus(200));
	t.false(isRetryableStatus(401));
	t.false(isRetryableStatus(409));
});

test('summarizeErrorBody trims text bodies and labels binary ones', t => {
	const text = summarizeErrorBody(Buffer.from('  some   error\n\n text  '), {
		'content-type': 'text/plain',
	});
	t.is(text, 'some error text');

	const long = summarizeErrorBody(Buffer.from('x'.repeat(500)), {
		'content-type': 'application/json',
	});
	t.true(long.endsWith('…'));

	const binary = summarizeErrorBody(Buffer.alloc(2048), {
		'content-type': 'application/octet-stream',
	});
	t.is(binary, '(application/octet-stream, 2048 bytes)');
});

test('makeRequest aborts a hung request after the timeout', async t => {
	// A server that accepts the connection but never responds.
	const server = http.createServer(() => {
		// Intentionally no response.
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;

	try {
		await t.throwsAsync(
			makeRequest(`http://127.0.0.1:${port}/`, {
				method: 'GET',
				timeoutMs: 150,
			}),
			{message: /timed out/},
		);
	} finally {
		server.close();
	}
});

test('makeRequest returns status and body for a normal response', async t => {
	const server = http.createServer((_req, res) => {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('ok');
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;

	try {
		const response = await makeRequest(`http://127.0.0.1:${port}/`, {
			method: 'GET',
		});
		t.is(response.statusCode, 200);
		t.is(response.body.toString(), 'ok');
	} finally {
		server.close();
	}
});
