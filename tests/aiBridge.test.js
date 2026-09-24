import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { pairBridge, authenticateBridge, bridgeStatus, heartbeatBridge, bridgeComplete, claimBridgeJob, finishBridgeJob, disconnectBridge } from '../server/services/aiBridge.js';
import { getAiSettings, saveAiSettings, getChatConfig, getVisionConfig, chatComplete, visionComplete } from '../server/services/aiProviders.js';
import { readLocal, updateLocal } from '../server/services/contentKnowledge.js';
import { isSupabaseConfigured } from '../server/services/supabase.js';
import { prepareCompletion, CodexCompletion } from '../scripts/lib/codexCompletion.js';
const skip = isSupabaseConfigured() ? 'Tests require isolated local storage, not a live database.' : false;
test('worker rejects API-key authentication and unavailable or exhausted included allowance', async () => {
  const worker = new CodexCompletion();
  worker.request = async () => ({ account: { type: 'apiKey' } });
  await assert.rejects(worker.checkAuth(), /API-key authentication is not allowed/);
  for (const ordinaryUsageAllowed of [false, null, undefined]) {
    worker.request = async () => ({ ordinaryUsageAllowed, rateLimits: { credits: { balance: '100' } } });
    await assert.rejects(worker.checkAllowance(), /No paid fallback/);
  }
  worker.request = async () => ({ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 100 } } });
  await assert.rejects(worker.checkAllowance(), /No paid fallback/);
  worker.request = async () => ({ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 10 } } });
  await worker.checkAllowance();
});
async function fixture(t) {
  const id = `test-bridge-${randomUUID()}`;
  t.after(async () => { for (const kind of ['ai-bridge','ai-jobs','ai-settings']) await updateLocal(id, kind, () => []); });
  const { token } = await pairBridge(id);
  return { id, token, c: await authenticateBridge(token) };
}
async function claim(c) {
  for (let i = 0; i < 50; i++) { const j = await claimBridgeJob(c); if (j) return j; await sleep(10); }
  throw new Error('Job was not queued.');
}
test('pairing is scoped, revocable, hashed and status never reveals credentials', { skip }, async t => {
  const { id, token, c } = await fixture(t);
  assert.ok(c); assert.equal(await authenticateBridge(`${token.slice(0,-1)}!`), null);
  assert.equal(JSON.stringify(await readLocal(id, 'ai-bridge')).includes(token), false);
  assert.deepEqual(await bridgeStatus(id), { paired: true, online: false, lastSeen: null, model: null });
  await heartbeatBridge(c, 'test-model'); assert.equal((await bridgeStatus(id)).online, true);
  await pairBridge(id); assert.equal(await authenticateBridge(token), null);
  await heartbeatBridge(c, 'old-worker'); assert.equal((await bridgeStatus(id)).online, false);
  await disconnectBridge(id); assert.equal((await bridgeStatus(id)).paired, false);
});
test('MCP selection is independent, preserves API settings, and bypasses env API fallback', { skip }, async t => {
  const { id } = await fixture(t);
  await saveAiSettings(id, { chat_provider: 'openai', chat_model: 'saved-chat', vision_model: 'saved-vision', vision_transport: 'mcp' });
  assert.deepEqual(await getVisionConfig(id), { provider: 'codex', transport: 'mcp' });
  assert.equal((await getAiSettings(id)).chat_transport, 'api');
  await saveAiSettings(id, { chat_transport: 'mcp' });
  assert.equal((await getChatConfig(id)).transport, 'mcp');
  await saveAiSettings(id, { vision_transport: 'api' });
  assert.equal((await getAiSettings(id)).vision_model, 'saved-vision');
  assert.equal((await getAiSettings(id)).chat_model, 'saved-chat');
});
test('vision transport preserves exact prompt, image order, temperature and token intent; returns existing shape', { skip }, async t => {
  const { id, c } = await fixture(t); await heartbeatBridge(c, 'test-model');
  await saveAiSettings(id, { vision_transport: 'mcp' });
  const payload = { systemPrompt: 'Exact tagging instructions\nwith JSON rules.', userText: 'Existing tags: Beauty, Fashion', imageUrls: ['https://example.com/1.jpg','https://example.com/2.jpg'], maxTokens: 500, temperature: 0.3 };
  const pending = visionComplete(id, payload);
  const job = await claim(c); assert.deepEqual(job.payload, { kind: 'vision', task: 'auto_tag', ...payload });
  assert.equal(await claimBridgeJob(c), null);
  await assert.rejects(finishBridgeJob(c, { id: job.id, claimToken: randomUUID(), text: 'bad' }));
  const text = '{"existing":["Beauty"],"suggested":[]}';
  await finishBridgeJob(c, { id: job.id, claimToken: job.claimToken, text, totalTokens: 123 });
  assert.deepEqual(await pending, { text, usage: { totalTokens: 123 } });
  assert.deepEqual(await readLocal(id, 'ai-jobs'), []);
});
test('chat preserves system and conversation messages; response text passes through unchanged', { skip }, async t => {
  const { id, c } = await fixture(t); await heartbeatBridge(c, 'test-model');
  await saveAiSettings(id, { chat_transport: 'mcp' });
  const messages = [{ role: 'system', content: 'System' }, { role: 'user', content: 'First' }, { role: 'assistant', content: 'Earlier' }, { role: 'user', content: 'Now' }];
  const pending = chatComplete(id, messages, { maxTokens: 4000 });
  const job = await claim(c); assert.deepEqual(job.payload.messages, messages);
  const prepared = prepareCompletion(job.payload);
  assert.equal(prepared.instructions, 'System');
  assert.deepEqual(JSON.parse(prepared.text).conversation, messages.slice(1));
  await finishBridgeJob(c, { id: job.id, claimToken: job.claimToken, text: 'Final answer' });
  assert.equal(await pending, 'Final answer');
});
test('offline, timed out and worker-failed requests fail closed without API or keyword fallback', { skip }, async t => {
  const { id, c } = await fixture(t);
  await assert.rejects(bridgeComplete(id, {}), /offline/);
  await heartbeatBridge(c, 'test-model');
  await assert.rejects(bridgeComplete(id, {}, { timeoutMs: 50, pollMs: 10 }), /timed out/);
  assert.deepEqual(await readLocal(id, 'ai-jobs'), []);
  const pending = bridgeComplete(id, {}, { pollMs: 10 }); pending.catch(() => {});
  const job = await claim(c);
  await finishBridgeJob(c, { id: job.id, claimToken: job.claimToken, error: 'Usage limit reached' });
  await assert.rejects(pending, /Usage limit/);
});
test('other users cannot claim or complete jobs; concurrent claims have a single winner', { skip }, async t => {
  const a = await fixture(t), b = await fixture(t);
  await heartbeatBridge(a.c, 'test-model');
  const pending = bridgeComplete(a.id, {}, { pollMs: 10 });
  await sleep(30);
  assert.equal(await claimBridgeJob(b.c), null);
  const winners = (await Promise.all([claimBridgeJob(a.c), claimBridgeJob(a.c)])).filter(Boolean);
  assert.equal(winners.length, 1);
  const job = winners[0];
  await assert.rejects(finishBridgeJob(b.c, { id: job.id, claimToken: job.claimToken, text: 'bad' }));
  await finishBridgeJob(a.c, { id: job.id, claimToken: job.claimToken, text: 'ok' });
  assert.equal((await pending).text, 'ok');
});
