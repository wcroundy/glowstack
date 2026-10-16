import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeMediaSearch, sanitizeConcepts, extractJson } from '../server/services/mediaSearch.js';

test('recognises requests to find photos and refinements of a previous search', () => {
  assert.ok(looksLikeMediaSearch("I'm looking for images of a cream shirt with floral print that I wore with camo pants"));
  assert.ok(looksLikeMediaSearch('find me photos in a black dress'));
  assert.ok(looksLikeMediaSearch('photos from last October'));
  assert.ok(looksLikeMediaSearch('only the ones outdoors', { previousWasSearch: true }));
  assert.ok(!looksLikeMediaSearch('only the ones outdoors'));
  assert.ok(!looksLikeMediaSearch('How am I performing this month?'));
  assert.ok(!looksLikeMediaSearch('Write me a few caption ideas for my latest post.'));
});

test('sanitizeConcepts cleans words, caps sizes and keeps at least one required concept', () => {
  const out = sanitizeConcepts([
    { label: 'cream', words: ['Cream', 'IVORY', 'off-white', 'cream', '<script>', 'x'], required: false },
    { label: '', words: [] },
    { label: 'no words', words: [] },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].words, ['cream', 'ivory', 'off-white', 'script']);
  assert.equal(out[0].required, true, 'an all-soft list is promoted so there is something to scan with');
  assert.equal(sanitizeConcepts('nope').length, 0);
  assert.equal(sanitizeConcepts(Array.from({ length: 20 }, (_, i) => ({ label: `c${i}`, words: [`w${i}`] }))).length, 8);
});

test('extractJson finds JSON inside fences and chatter', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":[1,2]}\n```\nDone'), { a: [1, 2] });
  assert.deepEqual(extractJson('[{"n":1}] trailing'), [{ n: 1 }]);
  assert.equal(extractJson('no json here'), null);
});
