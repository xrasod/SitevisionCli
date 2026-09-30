import https from 'https';
import http from 'http';
import zlib from 'zlib';
import {type RequestAuth, authHeaders} from './sitevision-api.js';
import {debug} from './debug.js';

const CONTAINER = '<div id="log-message-container">';
const ABORTED = 'Log tail aborted';

const ENTITIES: Record<string, string> = {
	lt: '<',
	gt: '>',
	amp: '&',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

function decodeEntity(match: string, code: string): string {
	if (code.startsWith('#')) {
		const n = /^#x/i.test(code)
			? Number.parseInt(code.slice(2), 16)
			: Number.parseInt(code.slice(1), 10);
		return Number.isNaN(n) ? match : String.fromCodePoint(n);
	}

	return ENTITIES[code.toLowerCase()] ?? match;
}

function htmlToText(html: string): string {
	const stripped = html
		.replaceAll(/<br\s*\/?>/gi, '\n')
		.replaceAll(/<[^<>]*>/g, '');
	let out = '';
	let last = 0;
	for (const m of stripped.matchAll(/&(?<code>#x?[0-9a-f]+|[a-z]+);/gi)) {
		out +=
			stripped.slice(last, m.index) + decodeEntity(m[0], m.groups!['code']!);
		last = m.index + m[0].length;
	}

	return (out + stripped.slice(last)).trim();
}

export type TailEnd = 'aborted' | 'closed' | 'empty';

/**
 * Incremental parser for the admin log tail stream. Feed it raw chunks; it
 * emits one plain-text line per `<div>` inside the log container and reports
 * when the server writes its "Log tail aborted" marker.
 */
export class LogTailParser {
	private buffer = '';
	private inContainer = false;
	private sawContainer = false;
	private gotBytes = false;
	private aborted = false;
	private readonly onLine: (line: string) => void;

	constructor(onLine: (line: string) => void) {
		this.onLine = onLine;
	}

	push(chunk: string): void {
		if (chunk.length > 0) this.gotBytes = true;
		this.buffer += chunk;
		if (!this.inContainer) {
			const i = this.buffer.indexOf(CONTAINER);
			if (i === -1) return;
			this.buffer = this.buffer.slice(i + CONTAINER.length);
			this.inContainer = true;
			this.sawContainer = true;
		}
		for (;;) {
			const end = this.buffer.indexOf('</div>');
			if (end === -1) break;
			const line = htmlToText(this.buffer.slice(0, end));
			this.buffer = this.buffer.slice(end + 6);
			if (line) this.onLine(line);
		}
		if (this.buffer.includes(ABORTED)) this.aborted = true;
	}

	end(): TailEnd {
		// A 200 that carries no bytes at all is how a rejected token looks
		// here. A stream cut part way through the page is just a cut, so it
		// stays 'closed' and the caller reconnects.
		if (!this.gotBytes && !this.sawContainer) return 'empty';
		return this.aborted ? 'aborted' : 'closed';
	}
}

export interface TailOptions {
	/** Host, optionally with a port, exactly as the deploy config carries it. */
	domain: string;
	useHTTP?: boolean;
	auth: RequestAuth;
	app?: boolean;
	/** Called once per established stream, for a "connected" message. */
	onConnect?: () => void;
	/**
	 * Carries the server session between reconnects, so a tail that runs for
	 * hours reuses one session instead of opening a new one every 5 minutes.
	 */
	session?: {cookie?: string};
}

export class LogTailAuthError extends Error {}

function connectOnce(
	options: TailOptions,
	onLine: (line: string) => void,
): Promise<TailEnd> {
	const path = options.app ? '/admin-log-app/tail' : '/admin-log/tail';
	const url = new URL(
		`${options.useHTTP ? 'http' : 'https'}://${options.domain}${path}`,
	);
	const transport = url.protocol === 'http:' ? http : https;
	return new Promise((resolve, reject) => {
		const req = transport.get(
			url,
			{
				headers: {
					...authHeaders(options.auth),
					...(options.session?.cookie && {Cookie: options.session.cookie}),
					'Accept-Encoding': 'identity',
				},
			},
			res => {
				const status = res.statusCode ?? 0;
				debug(
					'log-tail',
					`GET ${path} -> ${status} ${res.headers['content-type'] ?? ''}`,
				);
				// The log paths answer a dead session or bad credentials with a
				// redirect to the site login page, never a 401.
				if (status >= 300 && status < 400) {
					res.resume();
					reject(
						new LogTailAuthError(
							'Redirected to login. Wrong credentials or missing developer permission.',
						),
					);
					return;
				}

				if (status !== 200) {
					res.resume();
					reject(new Error(`Log tail failed with HTTP ${status}`));
					return;
				}

				const setCookie = res.headers['set-cookie']
					?.map(c => c.split(';')[0]!)
					.find(c => c.startsWith('JSESSIONID='));
				if (options.session && setCookie && !('cookie' in options.auth)) {
					options.session.cookie = setCookie;
				}

				const encoding = res.headers['content-encoding'];
				options.onConnect?.();
				const parser = new LogTailParser(onLine);
				const body = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
				body.setEncoding('utf8');
				body.on('data', (chunk: string) => {
					parser.push(chunk);
				});
				body.on('end', () => {
					const end = parser.end();
					debug('log-tail', `stream ${end}`);
					resolve(end);
				});
				body.on('error', reject);
				res.on('error', reject);
			},
		);
		req.on('error', reject);
	});
}

/**
 * Whether to give up on a stream that carried nothing. Only the first connect
 * proves anything about the credential; later on, a tail that has already
 * worked should reconnect rather than exit.
 */
export function isFatalEnd(end: TailEnd, connects: number): boolean {
	return end === 'empty' && connects <= 1;
}

/** Stream one tail session; resolves when the server ends it. */
export async function tailLog(
	options: TailOptions,
	onLine: (line: string) => void,
): Promise<TailEnd> {
	try {
		return await connectOnce(options, onLine);
	} catch (error) {
		// A reused session goes stale eventually, and a stale one is refused
		// exactly like bad credentials. Drop it and try the configured
		// credentials alone before calling this an auth failure.
		if (error instanceof LogTailAuthError && options.session?.cookie) {
			debug('log-tail', 'refused with a reused session; retrying without it');
			options.session.cookie = undefined;
			return connectOnce(options, onLine);
		}

		throw error;
	}
}
