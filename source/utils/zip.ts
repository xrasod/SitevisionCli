/**
 * Zip Utilities
 *
 * Handles creating zip archives for Sitevision app distribution.
 * Also handles webpack chunk organization.
 */

import fs from 'fs';
import path from 'path';
import {spawn} from 'child_process';
import {ensureDistDir} from './project-detection.js';

// =============================================================================
// ZIP CREATION
// =============================================================================

/**
 * Create a zip archive of a directory
 *
 * Uses the system `zip` command for cross-platform compatibility.
 * Falls back to a basic implementation if zip is not available.
 *
 * @param sourceDir - Directory to zip
 * @param outputPath - Path for the output zip file
 * @returns Promise resolving to the output path
 */
export async function createZip(
	sourceDir: string,
	outputPath: string,
): Promise<string> {
	// Ensure the output directory exists
	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, {recursive: true});
	}

	// Remove existing zip if present
	if (fs.existsSync(outputPath)) {
		fs.unlinkSync(outputPath);
	}

	return new Promise((resolve, reject) => {
		// Try using system zip command (works on macOS, Linux, and Windows with Git Bash)
		const zipProcess = spawn('zip', ['-r', outputPath, '.'], {
			cwd: sourceDir,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stderr = '';

		zipProcess.stderr?.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		zipProcess.on('error', error => {
			// If zip command not found, try alternative methods
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				// Fall back to tar on systems without zip
				createZipWithTar(sourceDir, outputPath).then(resolve).catch(reject);
			} else {
				reject(new Error(`Zip process error: ${error.message}`));
			}
		});

		zipProcess.on('close', code => {
			if (code === 0) {
				resolve(outputPath);
			} else {
				reject(new Error(`Zip failed with code ${code}: ${stderr}`));
			}
		});
	});
}

/**
 * Fallback: Create zip using tar (converts to zip format)
 * This is a fallback for systems without the zip command.
 */
async function createZipWithTar(
	sourceDir: string,
	outputPath: string,
): Promise<string> {
	// On Windows without zip, we might need to use PowerShell
	const isWindows = process.platform === 'win32';

	if (isWindows) {
		return createZipWithPowerShell(sourceDir, outputPath);
	}

	// On Unix without zip, this is unlikely but we'll throw an error
	throw new Error(
		'zip command not found. Please install zip: apt-get install zip (Linux) or brew install zip (macOS)',
	);
}

/**
 * Create zip using PowerShell on Windows
 */
async function createZipWithPowerShell(
	sourceDir: string,
	outputPath: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const absoluteSourceDir = path.resolve(sourceDir);
		const absoluteOutputPath = path.resolve(outputPath);

		const command = `Compress-Archive -Path "${absoluteSourceDir}\\*" -DestinationPath "${absoluteOutputPath}" -Force`;

		const psProcess = spawn('powershell', ['-Command', command], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stderr = '';

		psProcess.stderr?.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		psProcess.on('error', error => {
			reject(new Error(`PowerShell error: ${error.message}`));
		});

		psProcess.on('close', code => {
			if (code === 0) {
				resolve(absoluteOutputPath);
			} else {
				reject(new Error(`PowerShell zip failed with code ${code}: ${stderr}`));
			}
		});
	});
}

/**
 * Create a zip of the build directory for deployment
 *
 * @param projectRoot - Project root directory
 * @param manifest - App manifest for naming
 * @returns Path to the created zip file
 */
export async function createBuildZip(
	projectRoot: string,
	appId: string,
): Promise<string> {
	const buildDir = path.join(projectRoot, 'build');
	const distDir = ensureDistDir(projectRoot);
	const zipPath = path.join(distDir, `${appId}.zip`);

	if (!fs.existsSync(buildDir)) {
		throw new Error(`Build directory not found: ${buildDir}. Run build first.`);
	}

	return createZip(buildDir, zipPath);
}

// =============================================================================
// WEBPACK CHUNK UTILITIES
// =============================================================================

/**
 * Copy webpack chunks to the resource directory
 *
 * Webpack outputs chunk files (chunk-*.js) in the build directory.
 * These need to be moved to a resource/ subdirectory for Sitevision.
 *
 * @param buildDir - The build directory containing webpack output
 */
export function copyChunksToResources(buildDir: string): void {
	const resourceDir = path.join(buildDir, 'resource');

	// Create resource directory if it doesn't exist
	if (!fs.existsSync(resourceDir)) {
		fs.mkdirSync(resourceDir, {recursive: true});
	}

	// Find and move chunk files
	const files = fs.readdirSync(buildDir);
	const chunkPattern = /^chunk-.*\.js$/;

	for (const file of files) {
		if (chunkPattern.test(file)) {
			const sourcePath = path.join(buildDir, file);
			const destPath = path.join(resourceDir, file);

			// Move file (copy then delete)
			fs.copyFileSync(sourcePath, destPath);
			fs.unlinkSync(sourcePath);
		}
	}
}

/**
 * Copy static files to build directory
 *
 * @param projectRoot - Project root directory
 */
export function copyStaticToBuild(projectRoot: string): void {
	const staticDir = path.join(projectRoot, 'static');
	const buildDir = path.join(projectRoot, 'build');

	if (!fs.existsSync(staticDir)) {
		return;
	}

	// Ensure build directory exists
	if (!fs.existsSync(buildDir)) {
		fs.mkdirSync(buildDir, {recursive: true});
	}

	// Copy static directory contents to build
	copyDirRecursive(staticDir, buildDir);
}

/**
 * Copy source files to build directory (for non-bundled apps)
 *
 * @param projectRoot - Project root directory
 */
export function copySrcToBuild(projectRoot: string): void {
	const srcDir = path.join(projectRoot, 'src');
	const buildDir = path.join(projectRoot, 'build');

	if (!fs.existsSync(srcDir)) {
		return;
	}

	// Ensure build directory exists
	if (!fs.existsSync(buildDir)) {
		fs.mkdirSync(buildDir, {recursive: true});
	}

	// Copy src directory contents to build
	copyDirRecursive(srcDir, buildDir);
}

/**
 * Recursively copy a directory
 */
function copyDirRecursive(src: string, dest: string): void {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, {recursive: true});
	}

	const entries = fs.readdirSync(src, {withFileTypes: true});

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

/**
 * Clean the build directory
 *
 * @param projectRoot - Project root directory
 */
export function cleanBuild(projectRoot: string): void {
	const buildDir = path.join(projectRoot, 'build');

	if (fs.existsSync(buildDir)) {
		fs.rmSync(buildDir, {recursive: true, force: true});
	}
}

/**
 * Check if a zip file exists
 */
export function zipExists(zipPath: string): boolean {
	return fs.existsSync(zipPath);
}

/**
 * Get zip file size in bytes
 */
export function getZipSize(zipPath: string): number {
	if (!fs.existsSync(zipPath)) {
		return 0;
	}

	const stats = fs.statSync(zipPath);
	return stats.size;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);

	return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}
