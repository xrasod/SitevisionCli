import {Fragment, useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import {BIG_LOGO, BIG_LOGO_WIDTH} from '../utils/branding.js';

interface Props {
	onDone: () => void;
}

const FRAME_MS = 45;
const REVEAL_COLS_PER_FRAME = 9; // how fast the wipe sweeps left → right
const HOLD_FRAMES = 20; // frames to keep cycling colours once fully revealed

const REVEAL_FRAMES = Math.ceil(BIG_LOGO_WIDTH / REVEAL_COLS_PER_FRAME);
const TOTAL_FRAMES = REVEAL_FRAMES + HOLD_FRAMES;

// Convert HSL (h in degrees, s/l in 0..1) to a #rrggbb string for ink/chalk.
function hslToHex(h: number, s: number, l: number): string {
	const hue = h / 360;
	const a = s * Math.min(l, 1 - l);
	const channel = (n: number): string => {
		const scaled = hue * 12;
		const k = (n + scaled) % 12;
		const offset = a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		const value = l - offset;
		return Math.round(255 * value)
			.toString(16)
			.padStart(2, '0');
	};

	return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// A run of identical-coloured characters, so we emit one <Text> per run rather
// than one per character.
type Span = {text: string; color?: string};

function buildSpans(
	line: string,
	y: number,
	frame: number,
	reveal: number,
): Span[] {
	const spans: Span[] = [];

	for (const [x, char] of [...line].entries()) {
		const hidden = x >= reveal;
		const blank = char === ' ' || hidden;

		// Moving diagonal rainbow: hue depends on column + row + time, quantised
		// so neighbouring characters share a colour and runs stay long.
		const col = x * 1.6;
		const row = y * 6;
		const time = frame * 7;
		const stepped = Math.round((col + row + time) / 8) * 8;
		const hue = blank ? undefined : stepped % 360;
		// Shadow characters sit darker than the solid blocks for a bit of depth.
		const color =
			hue === undefined
				? undefined
				: hslToHex(hue, 0.95, char === '░' ? 0.32 : 0.58);
		const text = hidden ? ' ' : char;

		const last = spans.at(-1);
		if (last && last.color === color) {
			last.text += text;
		} else {
			spans.push({text, color});
		}
	}

	return spans;
}

/**
 * One-shot startup flair: wipes the big wordmark in left-to-right while a
 * rainbow gradient drifts across it, then calls `onDone`. Purely decorative.
 */
export function AnimatedLogo({onDone}: Props) {
	const [frame, setFrame] = useState(0);
	const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

	useEffect(() => {
		intervalRef.current = setInterval(() => {
			setFrame(current => current + 1);
		}, FRAME_MS);

		return () => {
			clearInterval(intervalRef.current);
		};
	}, []);

	// Stop the loop and notify the parent exactly once, when the last frame is
	// reached. Kept out of the setFrame updater so that updater stays pure.
	useEffect(() => {
		if (frame >= TOTAL_FRAMES) {
			clearInterval(intervalRef.current);
			onDone();
		}
	}, [frame, onDone]);

	const reveal =
		frame >= REVEAL_FRAMES
			? BIG_LOGO_WIDTH
			: (frame + 1) * REVEAL_COLS_PER_FRAME;

	return (
		<Box flexDirection="column" padding={1}>
			{BIG_LOGO.map((line, y) => (
				<Text key={y}>
					{buildSpans(line, y, frame, reveal).map((span, index) => (
						<Fragment key={index}>
							{span.color ? (
								<Text color={span.color}>{span.text}</Text>
							) : (
								<Text>{span.text}</Text>
							)}
						</Fragment>
					))}
				</Text>
			))}
		</Box>
	);
}
