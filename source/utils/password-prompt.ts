/**
 * Prompt for password input with masked display
 */
export function promptPassword(prompt: string): Promise<string> {
	return new Promise((resolve) => {
		process.stdout.write(prompt);
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		let password = '';
		const onData = (char: string) => {
			const charCode = char.charCodeAt(0);

			if (charCode === 13 || charCode === 10) {
				// Enter key
				stdin.setRawMode(false);
				stdin.removeListener('data', onData);
				stdin.pause();
				process.stdout.write('\n');
				resolve(password);
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
				// Only add printable characters
				password += char;
				process.stdout.write('*');
			}
		};

		stdin.on('data', onData);
	});
}
