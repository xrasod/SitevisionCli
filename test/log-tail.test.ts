import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import {type AddressInfo} from 'node:net';
import test from 'ava';
import {
	LogTailAuthError,
	LogTailParser,
	isFatalEnd,
	tailLog,
} from '../source/utils/log-tail.js';

const preamble =
	'<!DOCTYPE html>\r\n<html><head><title>Log</title></head><body>\r\n' +
	'<div class="log-header">Log for host</div>\r\n' +
	'<div class="log-tools"><a href="#">Hide</a></div>\r\n' +
	'<div id="log-message-container">\r\n';

const line =
	'<div class="WARN ScriptPortlet"><span class="date">2026-09-22 10:36:08.672</span> ' +
	'<a href="javascript:toggle(\'WARN\')"><span style="color:tomato">WARN</span></a> ' +
	'[<a href="javascript:toggle(\'ScriptPortlet\')">ScriptPortlet</a>] ' +
	'Executing &lt;b&gt; &amp; stuff</div>\r\n';

test('parser skips the preamble and yields one text line per div, across chunk boundaries', t => {
	const lines: string[] = [];
	const parser = new LogTailParser(l => {
		lines.push(l);
	});
	const stream = preamble + line + line;
	for (let i = 0; i < stream.length; i += 7)
		parser.push(stream.slice(i, i + 7));

	t.deepEqual(lines, [
		'2026-09-22 10:36:08.672 WARN [ScriptPortlet] Executing <b> & stuff',
		'2026-09-22 10:36:08.672 WARN [ScriptPortlet] Executing <b> & stuff',
	]);
	t.is(parser.end(), 'closed');
});

test('parser reports the server abort marker', t => {
	const parser = new LogTailParser(() => {});
	parser.push(preamble + line + '<strong>Log tail aborted</strong>');
	t.is(parser.end(), 'aborted');
});

test('a stream that carries nothing at all is not a log page', t => {
	const parser = new LogTailParser(() => {});
	t.is(parser.end(), 'nolog');
});

test('a sign-in bounce served with 200 is not a log page', t => {
	// An expired session gets this instead of a redirect, which otherwise
	// reads as a log stream that ended straight away.
	const parser = new LogTailParser(() => {});
	parser.push(
		'<html><head><meta http-equiv="refresh" content="0;url=/sso/login"></head>' +
			'<body>Signing in</body></html>',
	);
	t.is(parser.end(), 'nolog');
	t.regex(parser.describe(), /log page no/);
});

test('a stream cut before the log page arrives is not a log page either', t => {
	const parser = new LogTailParser(() => {});
	parser.push('<!DOCTYPE html>\r\n<html><head><title>Log</title>');
	t.is(parser.end(), 'nolog');
});

test('a log page that ends without the abort marker is a normal close', t => {
	const parser = new LogTailParser(() => {});
	parser.push(preamble + line);
	t.is(parser.end(), 'closed');
});

test('a first connect without the log page is fatal, a later single one is not', t => {
	t.true(isFatalEnd('nolog', {connects: 1, nologStreak: 1}));
	t.false(
		isFatalEnd('nolog', {connects: 2, nologStreak: 1}),
		'a tail that already worked reconnects through one bad stream',
	);
	t.false(isFatalEnd('aborted', {connects: 1, nologStreak: 0}));
	t.false(isFatalEnd('closed', {connects: 1, nologStreak: 0}));
});

test('a credential that stops working does not reconnect forever', t => {
	// Two such streams in a row is a credential that died mid-tail, not a
	// hiccup, so the loop has to give up instead of spinning.
	t.true(isFatalEnd('nolog', {connects: 3, nologStreak: 2}));
});

test('an out-of-range character escape is left alone instead of throwing', t => {
	const lines: string[] = [];
	const parser = new LogTailParser(l => {
		lines.push(l);
	});
	parser.push(preamble);
	t.notThrows(() => {
		parser.push('<div>bad &#x110000; and good &#x2713; here</div>\r\n');
	});
	t.deepEqual(lines, ['bad &#x110000; and good \u2713 here']);
});

/** A fake admin-log endpoint; `handlers` is one response per connect. */
async function fakeLogServer(
	handlers: Array<(req: IncomingMessage, res: ServerResponse) => void>,
) {
	const seen: Array<{url?: string; cookie?: string; authorization?: string}> =
		[];
	let connect = 0;
	const server = http.createServer((req, res) => {
		seen.push({
			url: req.url,
			cookie: req.headers.cookie,
			authorization: req.headers.authorization,
		});
		const handler = handlers[connect++] ?? handlers.at(-1)!;
		handler(req, res);
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;
	return {
		server,
		seen,
		options: {
			domain: `127.0.0.1:${port}`,
			useHTTP: true,
			auth: {username: 'u', password: 'p'},
		},
	};
}

const streamPage = (res: ServerResponse, body = '') => {
	res.writeHead(200, {'Content-Type': 'text/html;charset=UTF-8'});
	res.end(preamble + body + '<strong>Log tail aborted</strong>\r\n');
};

test('a login redirect is reported as an auth failure, not a dead stream', async t => {
	const {server, options} = await fakeLogServer([
		(_req, res) => {
			res.writeHead(302, {Location: '/login.html'});
			res.end();
		},
	]);

	try {
		await t.throwsAsync(
			tailLog(options, () => {}),
			{
				instanceOf: LogTailAuthError,
			},
		);
	} finally {
		server.close();
	}
});

test('the server session is reused on the next connect', async t => {
	const {server, seen, options} = await fakeLogServer([
		(_req, res) => {
			res.setHeader('Set-Cookie', 'JSESSIONID=abc123; Path=/; HttpOnly');
			streamPage(res);
		},
	]);

	try {
		const session = {};
		t.is(await tailLog({...options, session}, () => {}), 'aborted');
		t.is(await tailLog({...options, session}, () => {}), 'aborted');

		t.is(seen[0]?.cookie, undefined);
		t.is(seen[1]?.cookie, 'JSESSIONID=abc123');
	} finally {
		server.close();
	}
});

test('a stale session is dropped and the credentials are retried once', async t => {
	const {server, seen, options} = await fakeLogServer([
		(_req, res) => {
			res.setHeader('Set-Cookie', 'JSESSIONID=stale; Path=/');
			streamPage(res);
		},
		// The reused session has expired: the log paths answer that with a
		// redirect, exactly as they answer bad credentials.
		(req, res) => {
			if (req.headers.cookie) {
				res.writeHead(302, {Location: '/login.html'});
				res.end();
				return;
			}

			streamPage(res);
		},
	]);

	try {
		const session = {};
		t.is(await tailLog({...options, session}, () => {}), 'aborted');
		t.is(await tailLog({...options, session}, () => {}), 'aborted');

		t.is(seen[1]?.cookie, 'JSESSIONID=stale');
		t.is(seen[2]?.cookie, undefined, 'retried without the stale session');
		t.is(seen.length, 3);
	} finally {
		server.close();
	}
});

test('cookie authentication keeps its own cookie instead of the served one', async t => {
	const {server, seen, options} = await fakeLogServer([
		(_req, res) => {
			res.setHeader('Set-Cookie', 'JSESSIONID=served; Path=/');
			streamPage(res);
		},
	]);

	try {
		const session = {};
		const auth = {cookie: 'JSESSIONID=mine'};
		t.is(await tailLog({...options, auth, session}, () => {}), 'aborted');
		t.is(await tailLog({...options, auth, session}, () => {}), 'aborted');

		t.deepEqual(session, {});
		t.is(seen[1]?.cookie, 'JSESSIONID=mine');
	} finally {
		server.close();
	}
});

test('log lines stream through to the caller', async t => {
	const {server, options} = await fakeLogServer([
		(_req, res) => {
			streamPage(res, line);
		},
	]);

	try {
		const lines: string[] = [];
		await tailLog(options, l => {
			lines.push(l);
		});
		t.deepEqual(lines, [
			'2026-09-22 10:36:08.672 WARN [ScriptPortlet] Executing <b> & stuff',
		]);
	} finally {
		server.close();
	}
});

test('--app follows the app log endpoint', async t => {
	const {server, seen, options} = await fakeLogServer([
		(_req, res) => {
			streamPage(res);
		},
	]);

	try {
		t.is(await tailLog({...options, app: true}, () => {}), 'aborted');
		t.is(await tailLog(options, () => {}), 'aborted');
		t.is(seen[0]?.url, '/admin-log-app/tail');
		t.is(seen[1]?.url, '/admin-log/tail');
	} finally {
		server.close();
	}
});

test('an expired session is reported, not retried forever', async t => {
	const {server, options} = await fakeLogServer([
		(_req, res) => {
			// A stale session gets a 200 whose body sends the browser to the
			// login provider, not a redirect status.
			res.writeHead(200, {'Content-Type': 'text/html;charset=UTF-8'});
			res.end(
				'<html><head><meta http-equiv="refresh" content="0;url=/sso/login"></head></html>',
			);
		},
	]);

	try {
		const auth = {cookie: 'JSESSIONID=expired'};
		t.is(await tailLog({...options, auth}, () => {}), 'nolog');
	} finally {
		server.close();
	}
});
