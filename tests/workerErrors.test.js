import test from 'node:test';
import assert from 'node:assert/strict';
import { workerErrorMessage } from '../scripts/lib/workerErrors.js';
import { CodexCompletion } from '../scripts/lib/codexCompletion.js';
test('download and inference timeouts have distinct messages', () => {
  assert.match(workerErrorMessage({ code: 'IMAGE_DOWNLOAD_TIMEOUT' }), /thumbnail download timed out/);
  assert.match(workerErrorMessage(new Error('Codex analysis timed out.')), /AI analysis took too long/);
});

test('temporary throttling and image failures are not reported as exhausted allowance', () => {
  assert.match(workerErrorMessage(new Error('429 rate limit')), /temporarily rate-limited/);
  const imageError = workerErrorMessage(new Error('Failed to download image https://private.example/photo?token=secret: 429'));
  assert.match(imageError, /could not read an input image/);
  assert.doesNotMatch(imageError, /private.example|secret|exhausted/);
  assert.match(workerErrorMessage(new Error('usage limit reached')), /has not confirmed/);
});

test('allowance checks fail closed and distinguish missing status from exhausted usage', async () => {
  const worker = new CodexCompletion();
  for (const [limits, code] of [
    [{}, 'ALLOWANCE_UNVERIFIED'],
    [{ ordinaryUsageAllowed: false }, 'INCLUDED_USAGE_EXHAUSTED'],
    [{ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 100 } } }, 'INCLUDED_USAGE_EXHAUSTED'],
  ]) {
    worker.request = async () => limits;
    await assert.rejects(worker.checkAllowance(), e => e.code === code);
  }
  worker.request = async () => ({ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 24 } } });
  await worker.checkAllowance();
});
