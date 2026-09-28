import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { incrementTagUsage } from '../server/services/tagUsage.js';

test('usage updates work with real Supabase thenables lacking catch()', async () => {
  const calls = [];
  const client = createClient('https://example.supabase.co', 'test', {
    global: { fetch: async (url, options) => {
      calls.push(JSON.parse(options.body).tag_uuid);
      return new Response('null', { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  assert.equal(typeof client.rpc('increment_tag_usage', { tag_uuid: 'a' }).catch, 'undefined');
  await incrementTagUsage(client, ['a', 'b', 'a']);
  assert.deepEqual(calls, ['a', 'b']);
});

test('optional counter failures do not abort remaining updates or tagging', async () => {
  const calls = [];
  await incrementTagUsage({ rpc: (_, { tag_uuid }) => {
    calls.push(tag_uuid);
    return { then(resolve, reject) { tag_uuid === 'a' ? reject(new Error('offline')) : resolve({ error: { message: 'missing function' } }); } };
  } }, ['a', 'b']);
  assert.deepEqual(calls, ['a', 'b']);
});
