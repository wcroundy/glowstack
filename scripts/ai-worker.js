import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CodexCompletion } from './lib/codexCompletion.js';
import { taskModel } from '../shared/aiModelPolicy.js';

const base = new URL(process.env.GLOWSTACK_URL || 'http://localhost:3001');
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('Use HTTPS for a hosted Glowstack worker connection.');
if (base.username || base.password) throw new Error('Do not put credentials in GLOWSTACK_URL.');
const token = process.env.GLOWSTACK_WORKER_TOKEN;
if (!token) throw new Error('Set GLOWSTACK_WORKER_TOKEN using the pairing credential from Integrations.');
const client = new Client({ name: 'glowstack-ai-worker', version: '1.0.0' });
const codex = new CodexCompletion();
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find(c => c.type === 'text')?.text;
  if (result.isError) throw new Error(text || 'MCP job operation failed.');
  return JSON.parse(text);
}
try {
  const model = await codex.start();
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/ai-bridge/mcp', base), {
    requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
  }));
  console.log(`Glowstack MCP worker connected (${model}). ChatGPT authentication verified; no API fallback.`);
  let lastHeartbeat = 0;
  while (!stopping) {
    if (Date.now() - lastHeartbeat > 10000) { await codex.checkAuth(); await call('worker_heartbeat', { model }); lastHeartbeat = Date.now(); }
    const job = await call('claim_ai_job');
    if (!job) { await sleep(2000); continue; }
    const policy = taskModel(job.payload);
    console.log(`Processing ${policy.task} job ${job.id}: ${policy.model}, ${policy.effort} reasoning, standard speed.`);
    let heartbeatFailed = false;
    const heartbeat = setInterval(() => call('worker_heartbeat', { model }).catch(() => { heartbeatFailed = true; }), 10000);
    try {
      const remaining = Date.parse(job.expiresAt) - Date.now() - 5000;
      if (remaining < 5000) throw new Error('Job expired before processing.');
      const result = await codex.complete(job.payload, Math.min(80000, remaining));
      if (heartbeatFailed) throw new Error('Worker connection was interrupted.');
      await call('finish_ai_job', { id: job.id, claimToken: job.claimToken, ...result });
      console.log(`Completed job ${job.id}.`);
    } catch (err) {
      // Keep provider errors local and do not return potentially sensitive raw responses.
      const limit = /usage.?limit|rate.?limit|quota/i.test(err.message);
      const error = limit ? 'Codex usage limit reached. Wait for the allowance to reset or explicitly switch to API in Integrations.' : 'MCP analysis failed. Check the worker connection, Codex login, model access, and input images. No API fallback was used.';
      await call('finish_ai_job', { id: job.id, claimToken: job.claimToken, error }).catch(() => {});
      console.error(error);
      // Stop on failures instead of repeatedly consuming allowance on a bad job.
      stopping = true;
    } finally { clearInterval(heartbeat); }
  }
} catch (err) {
  console.error(`Worker stopped: ${err.message}`);
  process.exitCode = 1;
} finally { await client.close(); await codex.close(); }
