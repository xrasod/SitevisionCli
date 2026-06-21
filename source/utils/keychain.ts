import {Entry} from '@napi-rs/keyring';

const SERVICE = 'sitevision-cli';

function deployAccount(domain: string, username: string): string {
	return `deploy:${username}@${domain}`;
}

function signingAccount(username: string): string {
	return `signing:${username}`;
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

export function getDeployPassword(domain: string, username: string): string | null {
	if (!domain || !username) return null;
	return safeGet(deployAccount(domain, username));
}

export function setDeployPassword(domain: string, username: string, password: string): boolean {
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

export function setSigningPassword(username: string, password: string): boolean {
	if (!username || !password) return false;
	return safeSet(signingAccount(username), password);
}

export function deleteSigningPassword(username: string): void {
	if (!username) return;
	safeDelete(signingAccount(username));
}
