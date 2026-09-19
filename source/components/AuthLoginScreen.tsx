import React from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import {t} from '../utils/i18n.js';
import type {DevProperties} from '../types/index.js';
import {
	beginOAuth2Login,
	oauth2ConfigProblem,
	openBrowser,
} from '../utils/oauth2-auth.js';
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
	const [loginUrl, setLoginUrl] = React.useState('');
	const cookieRef = React.useRef<CookieLoginSession | null>(null);
	const cancelOAuthRef = React.useRef<(() => void) | null>(null);

	React.useEffect(() => {
		// Set by the cleanup: the screen went away while a login was starting.
		let gone = false;
		void (async () => {
			if (method === 'oauth2') {
				const session = beginOAuth2Login(devProperties);
				if (!session) {
					onError(
						oauth2ConfigProblem(devProperties) ?? 'Could not start the login.',
					);
					return;
				}

				cancelOAuthRef.current = session.cancel;
				setAuthUrl(session.authUrl);
				openBrowser(session.authUrl);
				setPhase('awaiting');
				const {token, error} = await session.complete();
				cancelOAuthRef.current = null;
				if (gone) return;
				if (token) {
					onComplete({accessToken: token});
				} else {
					onError(error ?? 'OAuth2 login failed.');
				}
			} else {
				const session = await beginCookieLogin(devProperties);
				if (gone) {
					void session?.close();
					return;
				}

				if (!session) {
					onError(
						'Could not open a login browser (is Chrome installed?). Set SITEVISION_SESSION_COOKIE to a cookie copied from your browser.',
					);
					return;
				}

				cookieRef.current = session;
				setLoginUrl(session.loginUrl);
				setPhase('awaiting');
			}
		})();

		// Release resources if the screen unmounts before completing: close the
		// browser (cookie) and the loopback server (oauth2, frees the port).
		return () => {
			gone = true;
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
				try {
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
				} catch (error) {
					// The browser window was closed: nothing left to capture from.
					onError(
						`Could not read the session from the browser: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			})();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{method === 'oauth2' ? t('OAuth2 login') : t('Session cookie login')}
				</Text>
			</Box>

			{method === 'oauth2' ? (
				<Box flexDirection="column">
					<Box>
						<Text color="green">
							<Spinner type="dots" />
						</Text>
						<Text> {t('Waiting for you to finish login in the browser…')}</Text>
					</Box>
					{authUrl && (
						<Box marginTop={1} flexDirection="column">
							<Text dimColor>{t("If the browser didn't open, visit:")}</Text>
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
							<Text> {t('Opening browser…')}</Text>
						</Box>
					)}
					{phase === 'awaiting' && (
						<Box flexDirection="column">
							<Text>{t('A Chrome window is open at:')}</Text>
							<Text color="cyan">{loginUrl}</Text>
							<Box marginTop={1} flexDirection="column">
								<Text>
									{t('1. Log in to the site there, single sign-on included.')}
								</Text>
								<Text>
									{t('2. Wait until the site itself has finished loading.')}
								</Text>
								<Text>{t('3. Come back here and press Enter.')}</Text>
							</Box>
							<Box marginTop={1}>
								<Text dimColor>
									{t(
										'Leave the browser window open; it closes once the session is captured.',
									)}
								</Text>
							</Box>
						</Box>
					)}
					{phase === 'capturing' && (
						<Box>
							<Text color="green">
								<Spinner type="dots" />
							</Text>
							<Text> {t('Capturing session…')}</Text>
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
				<Text dimColor>{t('Press Esc to cancel.')}</Text>
			</Box>
		</Box>
	);
}
