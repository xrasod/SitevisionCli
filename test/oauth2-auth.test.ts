import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {createPkcePair} from '../source/utils/oauth2-auth.js';
import {
	configAuth,
	unauthorizedMessage,
	looksLikeAuthExpired,
} from '../source/utils/sitevision-api.js';
import {writeDevProperties} from '../source/utils/project-detection.js';
import type {DevProperties} from '../source/types/index.js';

function base64url(buffer: Buffer): string {
	return buffer
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

test('createPkcePair derives an S256 challenge from the verifier', t => {
	const {verifier, challenge} = createPkcePair();
	const expected = base64url(
		crypto.createHash('sha256').update(verifier).digest(),
	);
	t.is(challenge, expected);
	// URL-safe, unpadded.
	t.notRegex(verifier, /[+/=]/);
	t.notRegex(challenge, /[+/=]/);
});

test('configAuth prefers cookie, then bearer, then basic', t => {
	const base = {username: 'u', password: 'p'};

	const cookie = configAuth({
		...base,
		accessToken: 'tok',
		sessionCookie: 'JSESSIONID=abc',
	});
	t.deepEqual(cookie, {auth: {cookie: 'JSESSIONID=abc'}, kind: 'cookie'});

	const bearer = configAuth({...base, accessToken: 'tok'});
	t.deepEqual(bearer, {auth: {token: 'tok'}, kind: 'bearer'});

	const basic = configAuth(base);
	t.deepEqual(basic, {
		auth: {username: 'u', password: 'p'},
		kind: 'basic',
	});
});

test('unauthorizedMessage is worded for the auth kind', t => {
	t.regex(unauthorizedMessage('basic'), /username and password/);
	t.regex(unauthorizedMessage('bearer'), /token/);
	t.regex(unauthorizedMessage('cookie'), /session cookie/);
});

test('looksLikeAuthExpired catches redirects and HTML login pages', t => {
	const html = {'content-type': 'text/html'};
	const json = {'content-type': 'application/json'};

	t.true(looksLikeAuthExpired(401, Buffer.from(''), json));
	t.true(looksLikeAuthExpired(302, Buffer.from(''), json));
	t.true(looksLikeAuthExpired(200, Buffer.from('<html>login</html>'), html));
	t.true(looksLikeAuthExpired(200, Buffer.from('<!DOCTYPE html><html>'), json));
	// A real JSON success is not auth-expired.
	t.false(looksLikeAuthExpired(200, Buffer.from('{"id":"1"}'), json));
});

test('writeDevProperties never persists secrets', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-oauth-'));
	const properties: DevProperties = {
		domain: 'example.com',
		siteName: 'Site',
		addonName: 'addon',
		username: 'user',
		authMethod: 'oauth2',
		password: 'super-secret',
		accessToken: 'live-token',
		sessionCookie: 'JSESSIONID=deadbeef',
		oauth2: {
			authorizationEndpoint: 'https://example.com/auth',
			tokenEndpoint: 'https://example.com/token',
			clientId: 'client-1',
			scopes: ['deploy'],
		},
	};

	writeDevProperties(dir, properties);
	const raw = fs.readFileSync(path.join(dir, '.dev_properties.json'), 'utf-8');
	const parsed = JSON.parse(raw) as Record<string, unknown>;

	t.false('password' in parsed);
	t.false('accessToken' in parsed);
	t.false('sessionCookie' in parsed);
	// Non-secret config survives.
	t.is(parsed['authMethod'], 'oauth2');
	t.truthy(parsed['oauth2']);
	// And the secret strings appear nowhere in the file.
	t.false(raw.includes('super-secret'));
	t.false(raw.includes('live-token'));
	t.false(raw.includes('deadbeef'));
});
