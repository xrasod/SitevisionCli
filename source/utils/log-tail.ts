import https from 'https';
import http from 'http';
import zlib from 'zlib';
import {type RequestAuth, authHeaders} from './sitevision-api.js';

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

export type TailEnd = 'aborted' | 'closed';

/**
 * Incremental parser for the admin log tail stream. Feed it raw chunks; it
 * emits one plain-text line per `<div>` inside the log container and reports
 * when the server writes its "Log tail aborted" marker.
 */
export class LogTailParser {
	private buffer = '';
	private inContainer = false;
	private aborted = false;
	private readonly onLine: (line: string) => void;

	constructor(onLine: (line: string) => void) {
		this.onLine = onLine;
	}

	push(chunk: string): void {
		this.buffer += chunk;
		if (!this.inContainer) {
			const i = this.buffer.indexOf(CONTAINER);
			if (i === -1) return;
			this.buffer = this.buffer.slice(i + CONTAINER.length);
			this.inContainer = true;
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
		return this.aborted ? 'aborted' : 'closed';
	}
}

export interface TailOptions {
	domain: string;
	useHTTP?: boolean;
	auth: RequestAuth;
	app?: boolean;
	onConnect?: (info: string) => void;
	// Filled in from the first response and sent back on reconnect, so a long
	// tail reuses one server session instead of opening a new one every 5 min.
	session?: {cookie?: string};
}

const debug = process.env['SVC_DEBUG_LOG_TAIL'] ? console.error : undefined;

export class LogTailAuthError extends Error {}

/** Stream one tail session; resolves when the server ends it. */
export function tailLog(
	options: TailOptions,
	onLine: (line: string) => void,
): Promise<TailEnd> {
	const transport = options.useHTTP ? http : https;
	const path = options.app ? '/admin-log-app/tail' : '/admin-log/tail';
	return new Promise((resolve, reject) => {
		const req = transport.get(
			{
				hostname: options.domain,
				path,
				headers: {
					...authHeaders(options.auth),
					...(options.session?.cookie && {Cookie: options.session.cookie}),
					'Accept-Encoding': 'identity',
				},
			},
			res => {
				const status = res.statusCode ?? 0;
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
				options.onConnect?.(
					`HTTP ${status}, ${encoding ?? 'no'} encoding, waiting for log lines`,
				);
				debug?.('[log-tail] headers', res.headers);
				const parser = new LogTailParser(onLine);
				const body = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
				body.setEncoding('utf8');
				body.on('data', (chunk: string) => {
					debug?.(
						'[log-tail] chunk',
						chunk.length,
						JSON.stringify(chunk.slice(0, 200)),
					);
					parser.push(chunk);
				});
				body.on('end', () => resolve(parser.end()));
				body.on('error', reject);
				res.on('error', reject);
			},
		);
		req.on('error', reject);
	});
}
