import React from 'react';
import {useApp} from 'ink';

/**
 * Standalone commands end themselves: once `result` is set the Ink app exits,
 * and a failure becomes a non-zero exit code. `stay` keeps the screen up (for a
 * retry key) while still recording the failure.
 */
export function useFinish(
	result: 'success' | 'error' | undefined,
	stay = false,
): void {
	const {exit} = useApp();
	React.useEffect(() => {
		if (!result) return;
		process.exitCode = result === 'error' ? 1 : 0;
		if (!stay) exit();
	}, [result, stay, exit]);
}
