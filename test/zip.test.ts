import test from 'ava';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import {createBuildZip, createZip} from '../source/utils/zip.js';

interface ParsedEntry {
	name: string;
	method: number;
	content: Buffer;
}

/**
 * Minimal, self-contained ZIP reader used to verify the in-house writer.
 * Walks the central directory, then inflates each entry from its local header.
 */
function parseZip(buf: Buffer): ParsedEntry[] {
	let eocd = -1;
	for (let i = buf.length - 22; i >= 0; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}

	if (eocd < 0) {
		throw new Error('No end-of-central-directory record found');
	}

	const total = buf.readUInt16LE(eocd + 10);
	let off = buf.readUInt32LE(eocd + 16);
	const entries: ParsedEntry[] = [];

	for (let n = 0; n < total; n++) {
		if (buf.readUInt32LE(off) !== 0x02014b50) {
			throw new Error('Bad central directory header');
		}

		const method = buf.readUInt16LE(off + 10);
		const compSize = buf.readUInt32LE(off + 20);
		const nameLen = buf.readUInt16LE(off + 28);
		const extraLen = buf.readUInt16LE(off + 30);
		const commentLen = buf.readUInt16LE(off + 32);
		const localOff = buf.readUInt32LE(off + 42);
		const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

		const lhNameLen = buf.readUInt16LE(localOff + 26);
		const lhExtraLen = buf.readUInt16LE(localOff + 28);
		const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
		const compData = buf.subarray(dataStart, dataStart + compSize);
		const content =
			method === 0 ? Buffer.from(compData) : zlib.inflateRawSync(compData);

		entries.push({name, method, content});
		off += 46 + nameLen + extraLen + commentLen;
	}

	return entries;
}

function makeFixture(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-zip-'));
	fs.mkdirSync(path.join(dir, 'nested'));
	fs.mkdirSync(path.join(dir, 'emptydir'));
	fs.writeFileSync(path.join(dir, 'a.txt'), 'hello world\n');
	fs.writeFileSync(path.join(dir, 'empty.txt'), '');
	fs.writeFileSync(
		path.join(dir, 'nested', 'b.js'),
		'console.log("chunk content repeated repeated repeated");\n',
	);
	return dir;
}

test('createZip produces a valid ZIP container', async t => {
	const src = makeFixture();
	const out = path.join(src, 'out.zip');

	await createZip(src, out);

	const buf = fs.readFileSync(out);
	// Local file header magic: PK\x03\x04
	t.deepEqual(buf.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
});

test('createZip round-trips files, empty files and empty directories', async t => {
	const src = makeFixture();
	const out = path.join(src, 'out.zip');

	await createZip(src, out);

	const entries = parseZip(fs.readFileSync(out));
	const byName = new Map(entries.map(e => [e.name, e]));

	// Directory entries are present (trailing slash) so empty dirs survive.
	t.true(byName.has('emptydir/'));
	t.true(byName.has('nested/'));

	// File contents inflate back to exactly what went in.
	t.is(byName.get('a.txt')?.content.toString(), 'hello world\n');
	t.is(
		byName.get('nested/b.js')?.content.toString(),
		'console.log("chunk content repeated repeated repeated");\n',
	);

	// Empty files are stored (method 0) with zero-length content.
	const empty = byName.get('empty.txt');
	t.is(empty?.method, 0);
	t.is(empty?.content.length, 0);
});

test('createZip overwrites an existing archive', async t => {
	const src = makeFixture();
	const out = path.join(src, 'out.zip');

	fs.writeFileSync(out, 'stale contents that are not a zip');
	await createZip(src, out);

	const buf = fs.readFileSync(out);
	t.deepEqual(buf.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
});

test('createBuildZip refuses a build without a manifest', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-zip-'));
	fs.mkdirSync(path.join(root, 'build'));
	fs.writeFileSync(path.join(root, 'build', 'index.js'), '');
	await t.throwsAsync(createBuildZip(root, 'app'), {message: /manifest\.json/});

	fs.writeFileSync(path.join(root, 'build', 'manifest.json'), '{}');
	t.true(fs.existsSync(await createBuildZip(root, 'app')));
});

test('createZip marks file names as UTF-8 so å, ä and ö survive', async t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-zip-'));
	const src = path.join(dir, 'src');
	fs.mkdirSync(src);
	fs.writeFileSync(path.join(src, 'räksmörgås.js'), '');
	const zip = await createZip(src, path.join(dir, 'out.zip'));
	const data = fs.readFileSync(zip);
	// General-purpose flag bit 11 in the local header and the central directory.
	t.is(data.readUInt16LE(6), 0x08_00);
	const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
	t.is(data.readUInt16LE(central + 8), 0x08_00);
});
