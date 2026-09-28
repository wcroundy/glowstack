import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineWorkerImage } from '../scripts/lib/workerImages.js';

const url = 'https://example.supabase.co/storage/v1/object/public/thumbnails/test.jpg';
test('thumbnail timeouts retry once and then report a specific failure', async () => {
  let calls = 0;
  const timeout = () => new DOMException('Timed out', 'TimeoutError');
  const recovered = await inlineWorkerImage(url, async () => {
    if (++calls === 1) throw timeout();
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
  });
  assert.equal(calls, 2);
  assert.equal(recovered, 'data:image/png;base64,AQ==');
  calls = 0;
  await assert.rejects(inlineWorkerImage(url, async () => { calls++; throw timeout(); }), e => e.code === 'IMAGE_DOWNLOAD_TIMEOUT');
  assert.equal(calls, 2);
});
test('public thumbnails become inline image data without credentials or redirects', async () => {
  const result = await inlineWorkerImage(url, async (address, options) => {
    assert.equal(address.href, url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  });
  assert.equal(result, 'data:image/jpeg;base64,AQID');
});
test('internal, external, authenticated and non-public storage URLs are rejected before fetch', async () => {
  for (const value of ['http://127.0.0.1/image', 'https://example.com/image', 'https://example.supabase.co/rest/v1/users', 'https://user:pass@example.supabase.co/storage/v1/object/public/a', 'https://example.supabase.co:8443/storage/v1/object/public/a']) {
    await assert.rejects(inlineWorkerImage(value, () => { throw new Error('Unexpected network access'); }), /Image access/);
  }
});
test('access denied, non-images and oversized bodies fail with an image-specific error', async () => {
  await assert.rejects(inlineWorkerImage(url, async () => new Response('denied', { status: 403 })), /Image download failed \(HTTP 403\)/);
  await assert.rejects(inlineWorkerImage(url, async () => new Response('html')), /Invalid image/);
  await assert.rejects(inlineWorkerImage(url, async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } })), /size limit/);
});
