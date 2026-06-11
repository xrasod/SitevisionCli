import React from 'react';
import {render} from 'ink';
import {Box, Text} from 'ink';
import {type Command} from './types.js';
import {getAppType} from '../utils/project-detection.js';
import {resolveLocalizedString} from '../types/index.js';

interface InfoScreenProps {
	project: any;
}

function InfoScreen({project}: InfoScreenProps) {
	const appType = getAppType(project.manifest);

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
					<Text>{resolveLocalizedString(project.manifest.name)}</Text>
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
						⚠ No dev properties found. Run{' '}
						<Text bold>setup-dev-properties</Text> to configure.
					</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text bold>Project Root: </Text>
				<Text dimColor>{project.root}</Text>
			</Box>
		</Box>
	);
}

export const infoCommand: Command = {
	name: 'info',
	description: 'Show project information',
	requiresProject: true,
	async execute({project}) {
		render(<InfoScreen project={project} />);
	},
};
