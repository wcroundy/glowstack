import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEvidence, parseIdeas } from '../server/services/contentIdeas.js';
import { validateDocuments, CATEGORIES, updateLocal, readLocal } from '../server/services/contentKnowledge.js';
import { randomUUID } from 'node:crypto';

const source = { id: 'source-1', title: 'Example measurement', source: 'measurements/example.md', category: 'sales', captured_at: '2026-09-01T00:00:00Z', content: 'Link-level sales cannot be attributed to one Reel.' };
const idea = { title: 'A reuse test', hook: 'Test hook', why_now: 'Investigate a recorded pattern', goal: 'Shopping interest', tradeoff: 'Less new footage', mode: 'reuse', pieces: [{ format: 'Reel', channel: 'Instagram', purpose: 'Demonstrate fit' }], shoot_notes: 'Recover footage', edit_notes: 'New hook', link_notes: 'Verify exact variant', timing: 'After review', measurement: '24h baseline-building test', unknowns: ['Current stock unknown'], evidence: [{ source_id: source.id, quote: source.content }] };
const output = value => JSON.stringify({ ideas: [value, value] });
test('references must exist and quotes must match actual supplied evidence', () => {
  const parsed = parseIdeas(output(idea), [source]);
  assert.equal(parsed[0].evidence[0].captured_at, source.captured_at);
  assert.equal(parsed[0].pieces[0].status, 'planned');
  assert.throws(() => parseIdeas(output({ ...idea, evidence: [{ source_id: 'invented', quote: source.content }] }), [source]));
  assert.throws(() => parseIdeas(output({ ...idea, evidence: [{ source_id: source.id, quote: 'Invented sales success.' }] }), [source]));
});
test('format/channel separation and required uncertainty are enforced', () => {
  assert.throws(() => parseIdeas(output({ ...idea, pieces: [{ format: 'Instagram', channel: 'Reel' }] }), [source]));
  assert.throws(() => parseIdeas(output({ ...idea, unknowns: [] }), [source]));
  assert.throws(() => parseIdeas('{"ideas":[]}', [source]));
});
test('retrieval preserves category coverage with bounded, marked excerpts', () => {
  const docs = CATEGORIES.map((category,i) => ({ ...source, id: String(i), category, content: 'x'.repeat(5000) }));
  const selected = selectEvidence(docs, 'sales');
  assert.equal(new Set(selected.map(d => d.category)).size, CATEGORIES.length);
  assert.ok(selected.every(d => d.content.length === 4500 && d.excerpted));
});
test('imports reject invalid data and derive stable IDs from source, never supplied IDs', () => {
  const a = validateDocuments([source])[0];
  const b = validateDocuments([{ ...source, id: 'spoof', content: 'Updated observation' }])[0];
  assert.equal(a.id,b.id);
  assert.throws(() => validateDocuments([{ ...source, captured_at: 'yesterday' }]));
  assert.throws(() => validateDocuments([{ ...source, category: 'invented' }]));
});
test('local drafts persist and are isolated by user', async () => {
  const user = `test-${randomUUID()}`;
  await updateLocal(user, 'drafts', () => [{ id: 'draft', content_plan: idea }]);
  assert.equal((await readLocal(user, 'drafts'))[0].content_plan.title, idea.title);
  assert.deepEqual(await readLocal(`${user}-other`, 'drafts'), []);
  await updateLocal(user, 'drafts', () => []);
});
