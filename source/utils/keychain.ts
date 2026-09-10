import {Entry} from '@napi-rs/keyring';

const SERVICE = 'sitevision-cli';

function deployAccount(domain: string, username: string): string {
	return `deploy:${username}@${domain}`;
}

function signingAccount(username: string): string {
	return `signing:${username}`;
}

function oauthRefreshAccount(domain: string, clientId: string): string {
	return `oauth2-refresh:${clientId}@${domain}`;
}

function oauthSecretAccount(domain: string, clientId: string): string {
	return `oauth2-secret:${clientId}@${domain}`;
}

function sessionCookieAccount(domain: string, username: string): string {
	return `session:${username}@${domain}`;
}

function safeGet(account: string): string | null {
	try {
		return new Entry(SERVICE, account).getPassword();
	} catch {
		return null;
	}
}

function safeSet(account: string, password: string): boolean {
	try {
		new Entry(SERVICE, account).setPassword(password);
		return true;
	} catch {
		return false;
	}
}

function safeDelete(account: string): void {
	try {
		new Entry(SERVICE, account).deletePassword();
	} catch {
		// ignore
	}
}

export function getDeployPassword(
	domain: string,
	username: string,
): string | null {
	if (!domain || !username) return null;
	return safeGet(deployAccount(domain, username));
}

export function setDeployPassword(
	domain: string,
	username: string,
	password: string,
): boolean {
	if (!domain || !username || !password) return false;
	return safeSet(deployAccount(domain, username), password);
}

export function deleteDeployPassword(domain: string, username: string): void {
	if (!domain || !username) return;
	safeDelete(deployAccount(domain, username));
}

export function getSigningPassword(username: string): string | null {
	if (!username) return null;
	return safeGet(signingAccount(username));
}

export function setSigningPassword(
	username: string,
	password: string,
): boolean {
	if (!username || !password) return false;
	return safeSet(signingAccount(username), password);
}

export function deleteSigningPassword(username: string): void {
	if (!username) return;
	safeDelete(signingAccount(username));
}

export function getOAuth2RefreshToken(
	domain: string,
	clientId: string,
): string | null {
	if (!domain || !clientId) return null;
	return safeGet(oauthRefreshAccount(domain, clientId));
}

export function setOAuth2RefreshToken(
	domain: string,
	clientId: string,
	token: string,
): boolean {
	if (!domain || !clientId || !token) return false;
	return safeSet(oauthRefreshAccount(domain, clientId), token);
}

export function deleteOAuth2RefreshToken(
	domain: string,
	clientId: string,
): void {
	if (!domain || !clientId) return;
	safeDelete(oauthRefreshAccount(domain, clientId));
}

export function getOAuth2ClientSecret(
	domain: string,
	clientId: string,
): string | null {
	if (!domain || !clientId) return null;
	return safeGet(oauthSecretAccount(domain, clientId));
}

export function setOAuth2ClientSecret(
	domain: string,
	clientId: string,
	secret: string,
): boolean {
	if (!domain || !clientId || !secret) return false;
	return safeSet(oauthSecretAccount(domain, clientId), secret);
}

export function deleteOAuth2ClientSecret(
	domain: string,
	clientId: string,
): void {
	if (!domain || !clientId) return;
	safeDelete(oauthSecretAccount(domain, clientId));
}

export function getSessionCookie(
	domain: string,
	username: string,
): string | null {
	if (!domain || !username) return null;
	return safeGet(sessionCookieAccount(domain, username));
}

export function setSessionCookie(
	domain: string,
	username: string,
	cookie: string,
): boolean {
	if (!domain || !username || !cookie) return false;
	return safeSet(sessionCookieAccount(domain, username), cookie);
}

export function deleteSessionCookie(domain: string, username: string): void {
	if (!domain || !username) return;
	safeDelete(sessionCookieAccount(domain, username));
}
