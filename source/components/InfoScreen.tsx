import {Box, Text, useInput} from 'ink';
import {
	type ProjectInfo,
	getAppType,
	localizedText,
} from '../utils/project-detection.js';
import {checkSitevisionScriptsCompatibility} from '../utils/sitevision-scripts-runner.js';

interface Props {
	project: ProjectInfo;
	onBack: () => void;
}

export function InfoScreen({project, onBack}: Props) {
	const appType = getAppType(project.manifest);
	const scriptsCompat = checkSitevisionScriptsCompatibility(project.root);

	useInput((input, key) => {
		if (key.escape || input === 'q' || key.return) {
			onBack();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Sitevision Project Information
				</Text>
			</Box>

			<Box flexDirection="column" marginLeft={2}>
				<Box>
					<Text bold>Name: </Text>
					<Text>{localizedText(project.manifest.name)}</Text>
				</Box>
				<Box>
					<Text bold>ID: </Text>
					<Text>{project.manifest.id}</Text>
				</Box>
				<Box>
					<Text bold>Version: </Text>
					<Text>{project.manifest.version}</Text>
				</Box>
				<Box>
					<Text bold>Type: </Text>
					<Text color="green">{project.manifest.type}</Text>
					<Text dimColor> ({appType})</Text>
				</Box>
				<Box>
					<Text bold>Bundled: </Text>
					<Text>{project.manifest.bundled ? 'Yes' : 'No'}</Text>
				</Box>
			</Box>

			<Box marginTop={1} marginBottom={1}>
				<Text bold color="cyan">
					Build Tooling
				</Text>
			</Box>

			<Box flexDirection="column" marginLeft={2}>
				<Box>
					<Text bold>sitevision-scripts: </Text>
					<Text>{scriptsCompat.installed ?? 'not installed'}</Text>
					<Text dimColor> (supported {scriptsCompat.supportedRange})</Text>
				</Box>
				{scriptsCompat.warning && (
					<Box marginTop={1}>
						<Text color="yellow">⚠ {scriptsCompat.warning}</Text>
					</Box>
				)}
			</Box>

			{project.hasDevProperties && project.devProperties && (
				<>
					<Box marginTop={1} marginBottom={1}>
						<Text bold color="cyan">
							Development Configuration
						</Text>
					</Box>

					<Box flexDirection="column" marginLeft={2}>
						<Box>
							<Text bold>Domain: </Text>
							<Text>{project.devProperties.domain}</Text>
						</Box>
						<Box>
							<Text bold>Site: </Text>
							<Text>{project.devProperties.siteName}</Text>
						</Box>
						<Box>
							<Text bold>Addon: </Text>
							<Text>{project.devProperties.addonName}</Text>
						</Box>
						<Box>
							<Text bold>Username: </Text>
							<Text>{project.devProperties.username}</Text>
						</Box>
						<Box>
							<Text bold>Use HTTP: </Text>
							<Text>
								{project.devProperties.useHTTPForDevDeploy ? 'Yes' : 'No'}
							</Text>
						</Box>
					</Box>
				</>
			)}

			{!project.hasDevProperties && (
				<Box marginTop={1}>
					<Text color="yellow">
						⚠ No dev properties found. Run setup-dev-properties to configure.
					</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text bold>Project Root: </Text>
				<Text dimColor>{project.root}</Text>
			</Box>

			<Box marginTop={2}>
				<Text dimColor>Press Enter or ESC to return to menu</Text>
			</Box>
		</Box>
	);
}
