import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import {ACCENT} from './Frame.js';

/**
 * A bordered box floating centred over the frame. Render it as the last child
 * of the root so it draws on top; Ink paints in tree order.
 */
export function Popover({
	columns,
	rows,
	width,
	height,
	children,
}: {
	columns: number;
	rows: number;
	width: number;
	height: number;
	children: ReactNode;
}) {
	const w = Math.max(20, Math.min(width, columns - 4));
	const h = Math.max(6, Math.min(height, rows - 2));
	// Ink only overwrites cells it writes to, so blank the interior first or the
	// content underneath shows through around shorter lines.
	const blank = ' '.repeat(w - 2);

	return (
		<Box
			position="absolute"
			top={Math.floor((rows - h) / 2)}
			left={Math.floor((columns - w) / 2)}
			width={w}
			height={h}
			flexDirection="column"
			borderStyle="round"
			borderColor={ACCENT}
		>
			<Box position="absolute" flexDirection="column">
				{Array.from({length: h - 2}, (_, i) => (
					<Text key={i}>{blank}</Text>
				))}
			</Box>
			<Box flexDirection="column" height={h - 2} overflow="hidden">
				{children}
			</Box>
		</Box>
	);
}
