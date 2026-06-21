import https from 'node:https';

/**
 * True if version `a` is strictly greater than `b`, comparing the numeric
 * MAJOR.MINOR.PATCH core. Pre-release suffixes (e.g. `-beta.1`) are ignored.
 */
function isNewer(a: string, b: string): boolean {
	const core = (v: string) => (v.split('-')[0] ?? '').split('.');
	const pa = core(a);
	const pb = core(b);
	for (let i = 0; i < 3; i++) {
		const da = Number.parseInt(pa[i] ?? '0', 10) || 0;
		const db = Number.parseInt(pb[i] ?? '0', 10) || 0;
		if (da > db) return true;
		if (da < db) return false;
	}
	return false;
}

/**
 * Check the npm registry for a newer published version of `packageName`.
 *
 * Resolves to the latest version string when it is newer than
 * `currentVersion`, otherwise `null`. Never rejects — network errors,
 * timeouts, non-200 responses and parse failures all resolve to `null`, so a
 * failed check never blocks startup or surfaces an error to the user.
 */
export function checkForUpdate(
	packageName: string,
	currentVersion: string,
	timeoutMs = 1500,
): Promise<string | null> {
	return new Promise((resolve) => {
		const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
		const request = https.get(
			url,
			{timeout: timeoutMs, headers: {accept: 'application/json'}},
			(response) => {
				if (response.statusCode !== 200) {
					response.resume();
					resolve(null);
					return;
				}

				let body = '';
				response.setEncoding('utf8');
				response.on('data', (chunk) => {
					body += chunk;
				});
				response.on('end', () => {
					try {
						const latest = (JSON.parse(body) as {version?: string}).version;
						resolve(latest && isNewer(latest, currentVersion) ? latest : null);
					} catch {
						resolve(null);
					}
				});
			},
		);

		request.on('timeout', () => {
			request.destroy();
			resolve(null);
		});
		request.on('error', () => {
			resolve(null);
		});
	});
}
