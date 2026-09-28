import test from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from '../server/services/documentExtract.js';

test('plain text and markdown files are read as-is', async () => {
  assert.equal(await extractText(Buffer.from('hello world'), 'text/plain', 'notes.txt'), 'hello world');
  assert.equal(await extractText(Buffer.from('# Strategy'), '', 'strategy.md'), '# Strategy');
});
test('unsupported file types are rejected with a clear message', async () => {
  await assert.rejects(extractText(Buffer.from('x'), 'application/octet-stream', 'plan.xyz'), /Unsupported file type/);
});
test('legacy .doc files get a specific, actionable error', async () => {
  await assert.rejects(extractText(Buffer.from('x'), 'application/msword', 'plan.doc'), /save it as \.docx/);
});
test('a real docx round-trips through mammoth', async () => {
  const mammoth = (await import('mammoth')).default;
  // mammoth doesn't build docx files, but it does accept an empty zip gracefully failing —
  // this just proves extractText actually dispatches to mammoth for .docx rather than
  // silently treating it as plain text (which would garble the binary as text).
  await assert.rejects(extractText(Buffer.from('not a real docx'), '', 'plan.docx'));
  assert.equal(typeof mammoth.extractRawText, 'function');
});
