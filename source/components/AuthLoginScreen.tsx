import React from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import type {DevProperties} from '../types/index.js';
import {beginOAuth2Login, openBrowser} from '../utils/oauth2-auth.js';
import {
	beginCookieLogin,
	type CookieLoginSession,
} from '../utils/session-cookie-auth.js';

interface Credential {
	accessToken?: string;
	sessionCookie?: string;
}

interface Props {
	method: 'oauth2' | 'cookie';
	devProperties: DevProperties;
	onComplete: (credential: Credential) => void;
	onError: (message: string) => void;
	onCancel: () => void;
}

type Phase = 'starting' | 'awaiting' | 'capturing';

/**
 * Ink-native interactive login for OAuth2 and session-cookie auth. Drives the
 * browser and (for cookie) the "press Enter to capture" handoff through Ink's
 * own input, so it works inside the TUI as well as the standalone command —
 * neither needs to own raw stdin the way the old console prompt did.
 */
export function AuthLoginScreen({
	method,
	devProperties,
	onComplete,
	onError,
	onCancel,
}: Props) {
	const [phase, setPhase] = React.useState<Phase>('starting');
	const [authUrl, setAuthUrl] = React.useState('');
	const [note, setNote] = React.useState('');
	const cookieRef = React.useRef<CookieLoginSession | null>(null);
	const cancelOAuthRef = React.useRef<(() => void) | null>(null);

	React.useEffect(() => {
		void (async () => {
			if (method === 'oauth2') {
				const session = beginOAuth2Login(devProperties);
				if (!session) {
					onError(
						'OAuth2 is not fully configured (authorization/token endpoint or client ID missing).',
					);
					return;
				}

				cancelOAuthRef.current = session.cancel;
				setAuthUrl(session.authUrl);
				openBrowser(session.authUrl);
				setPhase('awaiting');
				const token = await session.complete();
				cancelOAuthRef.current = null;
				if (token) {
					onComplete({accessToken: token});
				} else {
					onError('OAuth2 login failed, timed out, or was rejected.');
				}
			} else {
				const session = await beginCookieLogin(devProperties);
				if (!session) {
					onError(
						'Could not open a login browser (is Chrome installed?). Set SITEVISION_SESSION_COOKIE or pass --cookie with a cookie copied from your browser.',
					);
					return;
				}

				cookieRef.current = session;
				setPhase('awaiting');
			}
		})();

		// Release resources if the screen unmounts before completing: close the
		// browser (cookie) and the loopback server (oauth2, frees the port).
		return () => {
			void cookieRef.current?.close();
			cookieRef.current = null;
			cancelOAuthRef.current?.();
			cancelOAuthRef.current = null;
		};
		// Run once: the parent mounts this fresh when a login is needed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useInput((_input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}

		if (method === 'cookie' && phase === 'awaiting' && key.return) {
			const session = cookieRef.current;
			if (!session) return;
			setPhase('capturing');
			void (async () => {
				const result = await session.capture();
				if (result.cookie) {
					cookieRef.current = null;
					await session.close();
					onComplete({sessionCookie: result.cookie});
				} else {
					// Keep the browser open so the user can navigate and retry.
					setNote(result.error ?? 'No session cookie found.');
					setPhase('awaiting');
				}
			})();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{method === 'oauth2' ? 'OAuth2 login' : 'Session cookie login'}
				</Text>
			</Box>

			{method === 'oauth2' ? (
				<Box flexDirection="column">
					<Box>
						<Text color="green">
							<Spinner type="dots" />
						</Text>
						<Text> Waiting for you to finish login in the browser…</Text>
					</Box>
					{authUrl && (
						<Box marginTop={1} flexDirection="column">
							<Text dimColor>If the browser didn't open, visit:</Text>
							<Text>{authUrl}</Text>
						</Box>
					)}
				</Box>
			) : (
				<Box flexDirection="column">
					{phase === 'starting' && (
						<Box>
							<Text color="green">
								<Spinner type="dots" />
							</Text>
							<Text> Opening browser…</Text>
						</Box>
					)}
					{phase === 'awaiting' && (
						<Text>
							Log in in the opened browser, then press Enter to capture the
							session.
						</Text>
					)}
					{phase === 'capturing' && (
						<Box>
							<Text color="green">
								<Spinner type="dots" />
							</Text>
							<Text> Capturing session…</Text>
						</Box>
					)}
					{note && (
						<Box marginTop={1}>
							<Text color="yellow">{note}</Text>
						</Box>
					)}
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>Press Esc to cancel.</Text>
			</Box>
		</Box>
	);
}
