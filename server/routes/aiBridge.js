import { Router } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { authenticateBridge, heartbeatBridge, claimBridgeJob, finishBridgeJob } from '../services/aiBridge.js';

const router = Router();
// A stateless Streamable HTTP MCP endpoint for the purpose-built worker.
// It has its own revocable, user-scoped credential, not the application's session.
router.post('/', async (req, res) => {
  let server, transport;
  try {
    if (req.headers.origin) return res.status(403).json({ error: 'Worker connections only.' });
    const c = await authenticateBridge(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!c) return res.status(401).json({ error: 'Invalid or revoked worker credential.' });
    server = new McpServer({ name: 'glowstack-ai-jobs', version: '1.0.0' });
    const tool = (name, description, inputSchema, run) => server.registerTool(name, { description, inputSchema }, async args => {
      try { const result = await run(args); return { content: [{ type: 'text', text: JSON.stringify(result) }] }; }
      catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }
    });
    tool('worker_heartbeat', 'Mark the authenticated worker online after checking ChatGPT authentication.', { model: z.string().min(1).max(150) }, a => heartbeatBridge(c, a.model));
    tool('claim_ai_job', 'Atomically claim one unexpired AI job belonging to this pairing.', {}, () => claimBridgeJob(c));
    tool('finish_ai_job', 'Return the result of a claimed job. Does not directly edit content or tags.', {
      id: z.string().uuid(), claimToken: z.string().uuid(), text: z.string().min(1).max(200000).optional(),
      error: z.string().min(1).max(500).optional(), totalTokens: z.number().int().nonnegative().optional(),
    }, a => {
      if ((!a.text && !a.error) || (a.text && a.error)) throw new Error('Return text or an error.');
      return finishBridgeJob(c, a);
    });
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(503).json({ error: 'MCP bridge unavailable. Check pairing and migration 021.' });
    if (transport) await transport.close();
    if (server) await server.close();
  }
});
router.all('/', (req, res) => res.status(405).end());
export default router;
