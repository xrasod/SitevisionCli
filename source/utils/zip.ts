/**
 * Zip Utilities
 *
 * Handles creating zip archives for Sitevision app distribution.
 * Also handles webpack chunk organization.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {ensureDistDir} from './project-detection.js';

// =============================================================================
// ZIP CREATION
// =============================================================================

/**
 * Create a zip archive of a directory.
 *
 * In-house, dependency-free implementation: walks the directory, deflates each
 * file with Node's built-in zlib, and assembles a standard ZIP container (local
 * file headers + central directory + end-of-central-directory record). This
 * removes the previous reliance on the external `zip`/`tar`/PowerShell binaries
 * and behaves identically across macOS, Linux, and Windows.
 *
 * Mirrors `zip -r <out> .` run from inside `sourceDir`: archive paths are
 * relative to `sourceDir`, use forward slashes, and directory entries are
 * emitted so empty directories are preserved.
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

	const entries = collectZipEntries(sourceDir);
	const buffer = await buildZipBuffer(entries);
	fs.writeFileSync(outputPath, buffer);

	return outputPath;
}

// =============================================================================
// IN-HOUSE ZIP WRITER
// =============================================================================

interface ZipEntry {
	/** Archive path (forward slashes; trailing slash for directories) */
	name: string;
	isDirectory: boolean;
	/** Absolute path on disk (files only) */
	absolutePath?: string;
	mtime: Date;
}

/**
 * Recursively collect file and directory entries for the archive.
 * Directories are emitted before their contents, matching `zip -r`.
 */
function collectZipEntries(sourceDir: string): ZipEntry[] {
	const entries: ZipEntry[] = [];

	const walk = (dir: string, prefix: string): void => {
		const dirEntries = fs.readdirSync(dir, {withFileTypes: true});

		for (const entry of dirEntries) {
			const absolutePath = path.join(dir, entry.name);
			const archiveName = prefix + entry.name;

			if (entry.isDirectory()) {
				const stat = fs.statSync(absolutePath);
				entries.push({
					name: archiveName + '/',
					isDirectory: true,
					mtime: stat.mtime,
				});
				walk(absolutePath, archiveName + '/');
			} else if (entry.isFile()) {
				const stat = fs.statSync(absolutePath);
				entries.push({
					name: archiveName,
					isDirectory: false,
					absolutePath,
					mtime: stat.mtime,
				});
			}
			// Symlinks and special files are skipped (matches prior `zip` defaults
			// closely enough for Sitevision build output, which has neither).
		}
	};

	walk(sourceDir, '');
	return entries;
}

/**
 * Assemble the full ZIP byte buffer from collected entries.
 */
async function buildZipBuffer(entries: ZipEntry[]): Promise<Buffer> {
	const localChunks: Buffer[] = [];
	const centralChunks: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBuffer = Buffer.from(entry.name, 'utf8');
		const {dosTime, dosDate} = toDosDateTime(entry.mtime);

		let rawData: Buffer;
		let compressed: Buffer;
		let method: number;

		if (entry.isDirectory) {
			rawData = Buffer.alloc(0);
			compressed = Buffer.alloc(0);
			method = 0; // stored
		} else {
			rawData = fs.readFileSync(entry.absolutePath!);
			if (rawData.length === 0) {
				compressed = Buffer.alloc(0);
				method = 0; // stored (deflating empty data is wasteful)
			} else {
				compressed = await deflateRaw(rawData);
				method = 8; // deflate
			}
		}

		const crc = crc32(rawData);
		const localHeaderOffset = offset;

		// Local file header (signature 0x04034b50)
		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4); // version needed to extract
		localHeader.writeUInt16LE(0x08_00, 6); // general purpose flag: UTF-8 names
		localHeader.writeUInt16LE(method, 8);
		localHeader.writeUInt16LE(dosTime, 10);
		localHeader.writeUInt16LE(dosDate, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(rawData.length, 22);
		localHeader.writeUInt16LE(nameBuffer.length, 26);
		localHeader.writeUInt16LE(0, 28); // extra field length

		localChunks.push(localHeader, nameBuffer, compressed);
		offset += localHeader.length + nameBuffer.length + compressed.length;

		// Central directory header (signature 0x02014b50)
		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4); // version made by
		centralHeader.writeUInt16LE(20, 6); // version needed
		centralHeader.writeUInt16LE(0x08_00, 8); // general purpose flag: UTF-8 names
		centralHeader.writeUInt16LE(method, 10);
		centralHeader.writeUInt16LE(dosTime, 12);
		centralHeader.writeUInt16LE(dosDate, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(compressed.length, 20);
		centralHeader.writeUInt32LE(rawData.length, 24);
		centralHeader.writeUInt16LE(nameBuffer.length, 28);
		centralHeader.writeUInt16LE(0, 30); // extra field length
		centralHeader.writeUInt16LE(0, 32); // comment length
		centralHeader.writeUInt16LE(0, 34); // disk number start
		centralHeader.writeUInt16LE(0, 36); // internal attributes
		// External attributes: directory vs file unix-ish mode in high bytes.
		centralHeader.writeUInt32LE(
			entry.isDirectory ? 0x41ed0010 : 0x81a40000,
			38,
		);
		centralHeader.writeUInt32LE(localHeaderOffset, 42);

		centralChunks.push(centralHeader, nameBuffer);
	}

	const centralDirectory = Buffer.concat(centralChunks);
	const centralDirectoryOffset = offset;

	// End of central directory record (signature 0x06054b50)
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(0, 4); // disk number
	eocd.writeUInt16LE(0, 6); // disk with central directory
	eocd.writeUInt16LE(entries.length, 8); // entries on this disk
	eocd.writeUInt16LE(entries.length, 10); // total entries
	eocd.writeUInt32LE(centralDirectory.length, 12);
	eocd.writeUInt32LE(centralDirectoryOffset, 16);
	eocd.writeUInt16LE(0, 20); // comment length

	return Buffer.concat([...localChunks, centralDirectory, eocd]);
}

/**
 * Deflate (raw, no zlib header) a buffer.
 */
async function deflateRaw(data: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		zlib.deflateRaw(data, (error, result) => {
			if (error) {
				reject(error);
			} else {
				resolve(result);
			}
		});
	});
}

/**
 * Convert a Date to DOS date/time fields used by the ZIP format.
 * ZIP timestamps only span 1980–2107 with 2-second resolution.
 */
function toDosDateTime(date: Date): {dosTime: number; dosDate: number} {
	const year = date.getFullYear();
	if (year < 1980) {
		// Clamp to the ZIP epoch (1980-01-01 00:00:00).
		return {dosTime: 0, dosDate: (1 << 5) | 1};
	}

	const dosTime =
		(date.getHours() << 11) |
		(date.getMinutes() << 5) |
		Math.floor(date.getSeconds() / 2);
	const dosDate =
		((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

	return {dosTime, dosDate};
}

// CRC-32 table (IEEE polynomial 0xEDB88320), built once and reused.
const crc32Table = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}

		table[n] = c >>> 0;
	}

	return table;
})();

/**
 * Compute the CRC-32 checksum of a buffer.
 */
function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	}

	return (crc ^ 0xffffffff) >>> 0;
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

	if (!fs.existsSync(path.join(buildDir, 'manifest.json'))) {
		throw new Error(
			`${buildDir} has no manifest.json, so the zip would not be an app. Keep manifest.json in src/ or static/.`,
		);
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
	fs.mkdirSync(buildDir, {recursive: true});

	// A manifest kept at the project root is detected, so it has to ship too;
	// one in src/ or static/ is copied over it.
	const rootManifest = path.join(projectRoot, 'manifest.json');
	if (fs.existsSync(rootManifest)) {
		fs.copyFileSync(rootManifest, path.join(buildDir, 'manifest.json'));
	}

	if (fs.existsSync(srcDir)) copyDirRecursive(srcDir, buildDir);
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
