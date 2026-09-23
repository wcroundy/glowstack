import test from 'node:test';
import assert from 'node:assert/strict';
import { selectExternalExamples, collectExternalEvidence, safeReferenceUrl } from '../server/services/externalEvidence.js';
import { selectEvidence } from '../server/services/contentIdeas.js';

const now = Date.parse('2026-09-17T12:00:00Z');
const post = (id, extra={}) => ({id,platform_post_id:id,post_url:`https://www.instagram.com/p/${id}/`,caption:'Fall fashion layering',published_at:'2026-09-16T12:00:00Z',synced_at:'2026-09-17T10:00:00Z',likes:0,comments:4,...extra});
const source = (id, posts) => ({id,kind:'creator',label:`@${id}`,posts});

test('outside examples require safe links and fresh publication and observation dates', () => {
  const result=selectExternalExamples([source('one',[post('fresh'),post('old',{published_at:'2026-08-01'}),post('stale',{synced_at:'2026-09-01'}),post('unknown',{published_at:null}),post('future',{synced_at:'2027-01-01'}),post('unsafe',{post_url:'javascript:alert(1)'})])],'',now);
  assert.equal(result.documents.length,1);
  assert.equal(result.coverage[0].stale,2);
  assert.equal(result.coverage[0].undated,2);
  assert.match(result.documents[0].content,/missing-value defaults/);
  assert.match(result.documents[0].content,/No growth rate/);
});
test('overlapping creator and hashtag results are one example with both origins', () => {
  const result=selectExternalExamples([source('one',[post('same')]),{...source('two',[post('same')]),kind:'hashtag',label:'#fashion'}],'',now);
  assert.equal(result.documents.length,1);
  assert.deepEqual(result.documents[0].origins,['@one','#fashion']);
});
test('sample is bounded and focus matches take priority over unrelated posts', () => {
  const sources=Array.from({length:12},(_,i)=>source(`creator${i}`,Array.from({length:8},(_,j)=>post(`${i}-${j}`,{caption:j===7?'beauty tutorial':'outfit'}))));
  const result=selectExternalExamples(sources,'beauty',now);
  assert.equal(result.documents.length,12);
  assert.ok(result.documents.every(d=>d.caption==='beauty tutorial'));
  const one=selectExternalExamples([sources[0]],'',now);
  assert.equal(one.documents.length,2);
});
test('URLs reject executable schemes and embedded credentials', () => {
  for(const value of ['http://example.com','javascript:alert(1)','https://user:pass@example.com','invalid']) assert.equal(safeReferenceUrl(value),null);
  assert.equal(safeReferenceUrl('https://example.com/post'),'https://example.com/post');
});
test('outside reads scope parents to the authenticated user and children to owned parents', async () => {
  const queries=[];
  const db={from(table){const q={table,filters:[],select(columns){this.columns=columns;return this;},eq(...args){this.filters.push(args);return this;},order(){return this;},limit(){return this;},then(resolve){queries.push(this);return Promise.resolve({data:table==='watched_influencers'?[{id:'owned',username:'owner'}]:table==='watched_posts'?[post('one')]:[],error:null}).then(resolve);}};return q;}};
  const result=await collectExternalEvidence(db,'brooke','',now);
  assert.equal(result.documents.length,1);
  assert.ok(queries.filter(q=>q.table.startsWith('watched_') && q.table!=='watched_posts').every(q=>q.filters.some(([k,v])=>k==='user_id'&&v==='brooke')));
  assert.deepEqual(queries.find(q=>q.table==='watched_posts').filters,[['watched_influencer_id','owned']]);
  assert.ok(queries.every(q=>!q.columns.includes('thumbnail')));
});
test('outside source outages produce gaps rather than failing generation', async () => {
  const db={from(){return {select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.reject(new Error('offline'));}};}};
  const result=await collectExternalEvidence(db,'brooke','',now);
  assert.deepEqual(result.documents,[]);
  assert.ok(result.gaps.some(g=>g.includes('unavailable')));
});
test('saved references retain space in bounded retrieval alongside first-party categories', () => {
  const base={category:'performance',source:'local',captured_at:'2026-09-17',content:'Recorded observation'};
  const docs=Array.from({length:30},(_,i)=>({...base,id:String(i),title:'Fashion results'}));
  docs.push({...base,id:'reference',title:'Saved reference: an example',category:'opportunities',captured_at:'2026-09-01'});
  const evidence=selectEvidence(docs,'fashion');
  assert.equal(evidence.length,20);
  assert.ok(evidence.some(d=>d.id==='reference'));
  assert.ok(evidence.some(d=>d.category==='performance'));
});
