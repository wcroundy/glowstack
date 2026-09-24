import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TASK_MODELS, taskModel, validateTaskModel } from '../shared/aiModelPolicy.js';
import { CodexCompletion } from '../scripts/lib/codexCompletion.js';

const catalog = ['gpt-6-luna', 'gpt-6-sol'].map(model => ({ model, inputModalities: ['text','image'], supportedReasoningEfforts: ['low','medium'].map(reasoningEffort => ({ reasoningEffort })) }));
test('unknown tasks, incompatible modalities and unavailable models cannot silently fall back', () => {
  assert.throws(() => taskModel({ kind: 'vision', task: 'recommendations' }));
  assert.throws(() => taskModel({ kind: 'chat', task: 'toString' }));
  assert.throws(() => validateTaskModel(AI_TASK_MODELS.chat, []), /No model substitution/);
  assert.throws(() => validateTaskModel(AI_TASK_MODELS.auto_tag, [{ ...catalog[0], inputModalities: ['text'] }]), /incompatible/);
  assert.throws(() => validateTaskModel(AI_TASK_MODELS.recommendations, [{ ...catalog[1], supportedReasoningEfforts: [] }]), /incompatible/);
});
test('each task reaches Codex with its pinned model, effort and standard speed while preserving prompts', async () => {
  for (const [task, policy] of Object.entries(AI_TASK_MODELS)) {
    const worker = new CodexCompletion({ model: 'expensive-override-is-ignored' });
    worker.catalog = catalog; worker.config = {}; worker.directory = process.cwd();
    worker.checkAuth = async () => {}; worker.checkAllowance = async () => {};
    const calls = [];
    worker.request = async (method, params) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'test-thread' } };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          worker.onEvent({ method: 'item/completed', params: { threadId: 'test-thread', item: { type: 'agentMessage', text: 'unchanged result', phase: 'final_answer' } } });
          worker.onEvent({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { status: 'completed' } } });
        });
        return { turn: { id: 'test-turn' } };
      }
      return {};
    };
    const payload = policy.kind === 'chat'
      ? { kind: 'chat', task, messages: [{ role: 'system', content: 'Original prompt' }, { role: 'user', content: 'Original question' }] }
      : { kind: 'vision', task, systemPrompt: 'Original prompt', userText: 'Original question', imageUrls: ['https://example.com/image.png'] };
    assert.equal((await worker.complete(payload)).text, 'unchanged result');
    const start = calls.find(c => c.method === 'thread/start').params;
    const turn = calls.find(c => c.method === 'turn/start').params;
    assert.equal(start.model, policy.model); assert.equal(start.baseInstructions, 'Original prompt');
    assert.equal(turn.model, policy.model); assert.equal(turn.effort, policy.effort); assert.equal(turn.serviceTierForTurn, 'default');
    if (policy.kind === 'vision') assert.deepEqual(turn.input, [{ type: 'text', text: 'Original question' }, { type: 'image', url: 'https://example.com/image.png' }]);
  }
});
