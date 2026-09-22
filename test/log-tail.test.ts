import test from 'ava';
import {LogTailParser} from '../source/utils/log-tail.js';

const preamble =
	'<!DOCTYPE html>\r\n<html><head><title>Log</title></head><body>\r\n' +
	'<div class="log-header">Log for host</div>\r\n' +
	'<div class="log-tools"><a href="#">Hide</a></div>\r\n' +
	'<div id="log-message-container">\r\n';

const line =
	'<div class="WARN ScriptPortlet"><span class="date">2026-09-22 10:36:08.672</span> ' +
	'<a href="javascript:toggle(\'WARN\')"><span style="color:tomato">WARN</span></a> ' +
	'[<a href="javascript:toggle(\'ScriptPortlet\')">ScriptPortlet</a>] ' +
	'Executing &lt;b&gt; &amp; stuff</div>\r\n';

test('parser skips the preamble and yields one text line per div, across chunk boundaries', t => {
	const lines: string[] = [];
	const parser = new LogTailParser(l => {
		lines.push(l);
	});
	const stream = preamble + line + line;
	for (let i = 0; i < stream.length; i += 7)
		parser.push(stream.slice(i, i + 7));

	t.deepEqual(lines, [
		'2026-09-22 10:36:08.672 WARN [ScriptPortlet] Executing <b> & stuff',
		'2026-09-22 10:36:08.672 WARN [ScriptPortlet] Executing <b> & stuff',
	]);
	t.is(parser.end(), 'closed');
});

test('parser reports the server abort marker', t => {
	const parser = new LogTailParser(() => {});
	parser.push(preamble + line + '<strong>Log tail aborted</strong>');
	t.is(parser.end(), 'aborted');
});
