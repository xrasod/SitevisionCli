/**
 * Prompt for a yes/no answer. Returns true for y/Y.
 * Pressing Enter (empty answer) returns `defaultYes` (default: false).
 */
export function promptYesNo(
	prompt: string,
	defaultYes = false,
): Promise<boolean> {
	return new Promise(resolve => {
		process.stdout.write(prompt);
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const onData = (data: string) => {
			const char = data[0] || '';
			stdin.setRawMode(false);
			stdin.removeListener('data', onData);
			stdin.pause();
			process.stdout.write(`${char}\n`);
			const charCode = char.charCodeAt(0);
			if (charCode === 3) {
				process.exit();
			}
			// Enter (CR/LF) or empty input → use the default
			if (char === '' || charCode === 13 || charCode === 10) {
				resolve(defaultYes);
				return;
			}
			resolve(char === 'y' || char === 'Y');
		};

		stdin.on('data', onData);
	});
}

/**
 * Prompt for password input with masked display
 */
export function promptPassword(prompt: string): Promise<string> {
	return new Promise(resolve => {
		process.stdout.write(prompt);
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		let password = '';
		const onData = (data: string) => {
			// Handle each character in the input (supports paste)
			for (const char of data) {
				const charCode = char.charCodeAt(0);

				if (charCode === 13 || charCode === 10) {
					// Enter key
					stdin.setRawMode(false);
					stdin.removeListener('data', onData);
					stdin.pause();
					process.stdout.write('\n');
					resolve(password);
					return;
				} else if (charCode === 127 || charCode === 8) {
					// Backspace
					if (password.length > 0) {
						password = password.slice(0, -1);
						process.stdout.write('\b \b');
					}
				} else if (charCode === 3) {
					// Ctrl+C
					process.exit();
				} else if (charCode >= 32) {
					// Printable characters
					password += char;
					process.stdout.write('*');
				}
			}
		};

		stdin.on('data', onData);
	});
}
