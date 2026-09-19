/**
 * JSONC helpers.
 *
 * Sitevision's own manifest documentation shows manifest.json with line and
 * block comments (e.g. `"name": { // Multilingual-manifest requires SV 10.1`),
 * so real-world manifests copied from the docs contain them. Strict JSON.parse
 * rejects those, so we strip comments before parsing.
 */

/**
 * Remove line comments (//...) and block comments from a JSON string, leaving
 * everything inside string literals untouched (so values like
 * `"https://example.com"` survive).
 */
export function stripJsonComments(input: string): string {
	let result = '';
	let inString = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		const next = input[i + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
				result += char;
			}

			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				i++;
			}

			continue;
		}

		if (inString) {
			result += char;
			// Copy escaped characters verbatim so an escaped quote (\") does not
			// end the string early.
			if (char === '\\') {
				result += next ?? '';
				i++;
			} else if (char === '"') {
				inString = false;
			}

			continue;
		}

		if (char === '"') {
			inString = true;
			result += char;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			i++;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			i++;
			continue;
		}

		result += char;
	}

	return result;
}

/**
 * Parse a JSON string that may contain comments (JSONC). Throws the underlying
 * SyntaxError if the content is invalid even after comments are removed.
 */
export function parseJsonc<T>(input: string): T {
	// Editors on Windows may prepend a BOM, which JSON.parse rejects.
	return JSON.parse(stripJsonComments(input.replace(/^\uFEFF/, ''))) as T;
}
