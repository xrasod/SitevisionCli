// Without a terminal nobody can answer: prompts resolve to their "no answer"
// value (default, nothing, empty password) and the caller reports what is missing.
const interactive = () => Boolean(process.stdin.isTTY);

// 130 = 128 + SIGINT, so `svc sign && svc deploy` stops at a cancelled prompt.
const cancelled = () => process.exit(130);

/**
 * Prompt for a yes/no answer. Returns true for y/Y.
 * Pressing Enter (empty answer) returns `defaultYes` (default: false).
 */
export function promptYesNo(
	prompt: string,
	defaultYes = false,
): Promise<boolean> {
	return new Promise(resolve => {
		if (!interactive()) {
			resolve(defaultYes);
			return;
		}

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
				cancelled();
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
 * Wait for the user to press Enter (or Ctrl+C). Used to hand control to an
 * external browser and resume once the user says they're done.
 */
export function promptEnter(prompt: string): Promise<void> {
	return new Promise(resolve => {
		if (!interactive()) {
			resolve();
			return;
		}

		process.stdout.write(prompt);
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const onData = (data: string) => {
			const char = data[0] || '';
			const charCode = char.charCodeAt(0);
			if (charCode === 3) {
				cancelled();
			}

			if (char === '' || charCode === 13 || charCode === 10) {
				stdin.setRawMode(false);
				stdin.removeListener('data', onData);
				stdin.pause();
				process.stdout.write('\n');
				resolve();
			}
		};

		stdin.on('data', onData);
	});
}

/**
 * Prompt for password input with masked display
 */
export function promptPassword(prompt: string): Promise<string> {
	return new Promise(resolve => {
		if (!interactive()) {
			resolve('');
			return;
		}

		process.stdout.write(prompt);
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		let password = '';
		const onData = (data: string) => {
			// Arrow keys and the like arrive as escape sequences, not as text.
			if (data.startsWith('\u001B')) return;
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
					cancelled();
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
