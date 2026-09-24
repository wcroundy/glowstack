// Opt-in live subscription smoke test using synthetic data and an isolated pairing.
// Run: node scripts/smoke-ai-worker.js. Does not change the real user's AI settings.
import express from 'express';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import bridgeRouter from '../server/routes/aiBridge.js';
import { pairBridge, bridgeStatus, disconnectBridge } from '../server/services/aiBridge.js';
import { saveAiSettings, chatComplete, visionComplete } from '../server/services/aiProviders.js';
import { updateLocal } from '../server/services/contentKnowledge.js';
import { isSupabaseConfigured } from '../server/services/supabase.js';
if (isSupabaseConfigured()) throw new Error('Run this isolated smoke test without live Supabase configuration.');

function redImage() {
  function chunk(type, bytes) {
    const data = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const header = Buffer.alloc(4), tail = Buffer.alloc(4); header.writeUInt32BE(bytes.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, data, tail]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(64); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(64 * (64 * 3 + 1));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) pixels[y * 193 + 1 + x * 3] = 255;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const userId = `smoke-${randomUUID()}`;
const app = express(); app.use(express.json({ limit: '25mb' })); app.use('/api/ai-bridge/mcp', bridgeRouter);
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
let child;
try {
  const { token } = await pairBridge(userId);
  await saveAiSettings(userId, { chat_transport: 'mcp', vision_transport: 'mcp' });
  child = spawn(process.execPath, ['scripts/ai-worker.js'], { windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, GLOWSTACK_URL: `http://127.0.0.1:${listener.address().port}`, GLOWSTACK_WORKER_TOKEN: token } });
  child.stdout.on('data', b => process.stdout.write(b)); child.stderr.on('data', b => process.stderr.write(b));
  for (let attempt = 0; attempt < 40 && !(await bridgeStatus(userId)).online; attempt++) await sleep(500);
  assert.equal((await bridgeStatus(userId)).online, true, 'Worker did not come online');
  const text = await chatComplete(userId, [{ role: 'system', content: 'Reply with only the requested text.' }, { role: 'user', content: 'Reply exactly GLOWSTACK_OK' }]);
  assert.equal(text.trim(), 'GLOWSTACK_OK'); console.log('PASS: actual chat via MCP and ChatGPT-authenticated worker.');
  const recommendationCheck = await chatComplete(userId, [{ role: 'system', content: 'Reply with only the requested text.' }, { role: 'user', content: 'Reply exactly SOL_OK' }], { task: 'recommendations' });
  assert.equal(recommendationCheck.trim(), 'SOL_OK'); console.log('PASS: recommendation routing through GPT-6 Sol.');
  const source = await readFile(new URL('../server/routes/ai.js', import.meta.url), 'utf8');
  const systemPrompt = source.match(/: `(You are a media tagging assistant[\s\S]*?)`;/)?.[1];
  assert.ok(systemPrompt, 'Could not locate original image tagging prompt');
  const result = await visionComplete(userId, { systemPrompt, userText: 'Existing tags: Red, Blue\n\nFilename: synthetic-color.png\nTitle: Color sample\n\nReturn JSON with "existing" matches and "suggested" new tags.', imageUrls: [redImage()], maxTokens: 500, temperature: 0.3 });
  const tags = JSON.parse(result.text.match(/\{[\s\S]*\}/)?.[0] || 'null');
  assert.ok(Array.isArray(tags?.existing) && Array.isArray(tags?.suggested));
  assert.ok(tags.existing.some(t => t.toLowerCase() === 'red'));
  console.log('PASS: actual image tagging via MCP, using the unchanged image prompt and a synthetic red image.');
} finally {
  if (child?.exitCode === null) {
    // Revoke pairing so the worker exits normally and can remove its temp files.
    await disconnectBridge(userId);
    await Promise.race([once(child, 'exit'), sleep(5000)]);
    if (child.exitCode === null) child.kill();
  }
  listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve));
  for (const kind of ['ai-bridge','ai-jobs','ai-settings']) await updateLocal(userId, kind, () => []);
}
