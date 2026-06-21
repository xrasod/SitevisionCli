/**
 * Shared CLI branding — the logo art and author line. Used both by the Ink
 * first-run welcome screen and the non-interactive "what's new" update banner,
 * so the two stay identical.
 */

const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export const LOGO = [
	'  ┌──────────┐',
	'  │          │            ▐              ▗                             ▗',
	'  │  ▄▖   ▞  │   ▄▖  ▄▖  ▄▟  ▄▖  ▖▄  ▄▖ ▗▟▄  ▖▄  ▄▖ ▗▄▄  ▄▖    ▗▄  ▄▖ ▗▟▄',
	'  │ ▐ ▝  ▞   │  ▐ ▝ ▐▘▜ ▐▘▜ ▐▘▐  ▛ ▘▐ ▝  ▐   ▛ ▘▐▘▜ ▐▐▐ ▐ ▝    ▐▐ ▐▘▐  ▐',
	'  │  ▀▚ ▞    │   ▀▚ ▐ ▐ ▐ ▐ ▐▀▀  ▌   ▀▚  ▐   ▌  ▐ ▐ ▐▐▐  ▀▚    ▐▐ ▐▀▀  ▐',
	'  │ ▝▄▞▞     │  ▝▄▞ ▝▙▛ ▝▙█ ▝▙▞  ▌  ▝▄▞  ▝▄  ▌  ▝▙▛ ▐▐▐ ▝▄▞  ▖ ▐▐ ▝▙▞  ▝▄',
	'  └──────────┘  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
];

export const AUTHOR = 'Rasmus Söderström';

/**
 * Big block-shadow "Sitevision CLI" wordmark, used by the animated startup
 * intro (see components/AnimatedLogo). It's ~120 columns wide, so callers
 * should only render it when the terminal is at least that wide — otherwise it
 * wraps and looks broken.
 */
export const BIG_LOGO = [
	' █████████   ███   █████                          ███           ███                           █████████  █████       █████',
	' ███░░░░░███ ░░░   ░░███                          ░░░           ░░░                           ███░░░░░███░░███       ░░███ ',
	'░███    ░░░  ████  ███████    ██████  █████ █████ ████   █████  ████   ██████  ████████      ███     ░░░  ░███        ░███ ',
	'░░█████████ ░░███ ░░░███░    ███░░███░░███ ░░███ ░░███  ███░░  ░░███  ███░░███░░███░░███    ░███          ░███        ░███ ',
	' ░░░░░░░░███ ░███   ░███    ░███████  ░███  ░███  ░███ ░░█████  ░███ ░███ ░███ ░███ ░███    ░███          ░███        ░███ ',
	' ███    ░███ ░███   ░███ ███░███░░░   ░░███ ███   ░███  ░░░░███ ░███ ░███ ░███ ░███ ░███    ░░███     ███ ░███      █ ░███ ',
	'░░█████████  █████  ░░█████ ░░██████   ░░█████    █████ ██████  █████░░██████  ████ █████    ░░█████████  ███████████ █████',
	' ░░░░░░░░░  ░░░░░    ░░░░░   ░░░░░░     ░░░░░    ░░░░░ ░░░░░░  ░░░░░  ░░░░░░  ░░░░ ░░░░░      ░░░░░░░░░  ░░░░░░░░░░░ ░░░░░ ',
];

/** Display width of the widest BIG_LOGO line. */
export const BIG_LOGO_WIDTH = Math.max(...BIG_LOGO.map(line => line.length));

/**
 * Print the logo + author line straight to stdout (non-interactive), mirroring
 * how the masthead is printed. Used for the update banner.
 */
export function printBranding(): void {
	for (const line of LOGO) {
		console.log(`${CYAN}${line}${RESET}`);
	}

	console.log(`${DIM}  a tool by ${RESET}${BOLD}${AUTHOR}${RESET}`);
}
