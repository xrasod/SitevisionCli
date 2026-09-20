import http from 'node:http';
import {type AddressInfo} from 'node:net';
import test from 'ava';
import {
	oauth2ConfigProblem,
	resolveOAuth2AccessToken,
} from '../source/utils/oauth2-auth.js';
import {
	getOAuth2RefreshToken,
	setOAuth2RefreshToken,
} from '../source/utils/keychain.js';
import type {DevProperties} from '../source/types/index.js';

// A token endpoint on 127.0.0.1 answering every request the same way.
async function tokenServer(status: number, body: unknown) {
	let requests = 0;
	const server = http.createServer((req, res) => {
		requests++;
		req.resume();
		res.writeHead(status, {'content-type': 'application/json'});
		res.end(JSON.stringify(body));
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;
	const domain = `127.0.0.1:${port}`;
	const dev = {
		domain,
		siteName: 'Site',
		addonName: 'Addon',
		username: 'me',
		authMethod: 'oauth2',
		useHTTPForDevDeploy: true,
		oauth2: {
			authorizationEndpoint: `http://${domain}/authorize`,
			tokenEndpoint: `http://${domain}/token`,
			clientId: 'client',
		},
	} as DevProperties;
	setOAuth2RefreshToken(domain, 'client', 'refresh-1');
	return {server, dev, domain, requests: () => requests};
}

test('a refresh rotates the stored token', async t => {
	const {server, dev, domain} = await tokenServer(200, {
		access_token: 'access',
		refresh_token: 'refresh-2',
	});
	t.is(await resolveOAuth2AccessToken(dev), 'access');
	server.close();
	t.is(getOAuth2RefreshToken(domain, 'client'), 'refresh-2');
});

test('a rejected refresh token is dropped', async t => {
	const {server, dev, domain} = await tokenServer(400, {
		error: 'invalid_grant',
	});
	t.is(await resolveOAuth2AccessToken(dev), null);
	server.close();
	t.is(getOAuth2RefreshToken(domain, 'client'), null);
});

test('a provider outage keeps the refresh token', async t => {
	const {server, dev, domain} = await tokenServer(502, {});
	t.is(await resolveOAuth2AccessToken(dev), null);
	server.close();
	t.is(getOAuth2RefreshToken(domain, 'client'), 'refresh-1');
});

test('an unreachable token endpoint keeps the refresh token', async t => {
	const {server, dev, domain} = await tokenServer(200, {});
	server.closeAllConnections();
	await new Promise(resolve => {
		server.close(resolve);
	});
	t.is(await resolveOAuth2AccessToken(dev), null);
	t.is(getOAuth2RefreshToken(domain, 'client'), 'refresh-1');
});

test('secrets are never sent to a token endpoint on another host', async t => {
	const {server, dev, domain, requests} = await tokenServer(200, {
		access_token: 'stolen',
	});
	const evil = {
		...dev,
		domain: 'site.example',
		oauth2: {...dev.oauth2!},
	};
	setOAuth2RefreshToken('site.example', 'client', 'refresh-1');
	t.is(await resolveOAuth2AccessToken(evil), null);
	server.close();
	t.is(requests(), 0);
	t.is(getOAuth2RefreshToken('site.example', 'client'), 'refresh-1');
	t.is(getOAuth2RefreshToken(domain, 'client'), 'refresh-1');
});

test('a plain-http token endpoint needs useHTTPForDevDeploy', async t => {
	const {server, dev, requests} = await tokenServer(200, {
		access_token: 'access',
	});
	t.is(
		await resolveOAuth2AccessToken({...dev, useHTTPForDevDeploy: false}),
		null,
	);
	server.close();
	t.is(requests(), 0);
});

test('OAuth2 settings without a domain are a problem, not a crash', t => {
	const problem = oauth2ConfigProblem({
		authMethod: 'oauth2',
		oauth2: {
			authorizationEndpoint: 'https://site.example/authorize',
			tokenEndpoint: 'https://site.example/token',
			clientId: 'client',
		},
	} as DevProperties);
	t.regex(problem ?? '', /domain/i);
});
