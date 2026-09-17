import { Router } from 'express';
import { getKnowledge, importKnowledge, getAppEvidence, CATEGORIES } from '../services/contentKnowledge.js';
import { selectEvidence, parseIdeas, IDEA_PROMPT } from '../services/contentIdeas.js';
import { getChatConfig, chatComplete } from '../services/aiProviders.js';
import { refreshForIdeas } from '../services/targetedRefresh.js';
const router = Router();
router.get('/', async (req, res) => {
  try {
    const docs = await getKnowledge(req.userId);
    const config = await getChatConfig(req.userId);
    res.json({ documents: docs.map(({ content, user_id, ...d }) => ({ ...d, characters: content.length })), categories: CATEGORIES, ai_ready: !!config,
      missing_categories: CATEGORIES.filter(c => !docs.some(d => d.category === c)), snapshot: true });
  } catch (e) { res.status(503).json({ message: e.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const d = (await getKnowledge(req.userId)).find(d => d.id === req.params.id);
    if (!d) return res.status(404).json({ message: 'Source not found.' });
    const { user_id, ...document } = d;
    res.json(document);
  } catch (e) { res.status(503).json({ message: e.message }); }
});
router.post('/import', async (req, res) => {
  try { res.json({ imported: await importKnowledge(req.userId, req.body.documents) }); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
export async function generateContentIdeas(req, res) {
  try {
    const focus = req.body.focus || '';
    if (typeof focus !== 'string' || focus.length > 1500) return res.status(400).json({ message: 'Keep your focus under 1,500 characters.' });
    const documents = await getKnowledge(req.userId);
    if (!documents.length) return res.status(409).json({ message: 'Import your strategy and measurement sources first.' });
    if (!await getChatConfig(req.userId)) return res.status(409).json({ message: 'Connect a Chat AI provider in Integrations to generate ideas. Your imported evidence is saved and available to review.' });
    const refresh = req.body.refresh === false ? { status:'skipped', gaps:[] } : await refreshForIdeas(req.userId,focus);
    const app = await getAppEvidence(req.userId, focus);
    app.gaps.push(...refresh.gaps);
    const evidence = [...selectEvidence(documents, focus), ...app.documents.map(d => ({ ...d, content: d.content.slice(0, 12000), excerpted: d.content.length > 12000 }))];
    const text = await chatComplete(req.userId, [{ role: 'system', content: IDEA_PROMPT }, { role: 'user', content: JSON.stringify({ today: new Date().toISOString(), focus, missing_categories: CATEGORIES.filter(c => !documents.some(d => d.category === c)), data_gaps: app.gaps, refresh_receipt: refresh, evidence }) }], { maxTokens: 4000 });
    res.json({ ideas: parseIdeas(text || '', evidence), refresh, post_coverage: app.coverage, data_gaps: app.gaps, reviewed_sources: evidence.length, total_sources: documents.length + app.documents.length, excerpted_sources: evidence.filter(e => e.excerpted).length, snapshot: true });
  } catch (e) { res.status(502).json({ message: e.message || 'Idea generation failed. Your draft is unchanged.' }); }
}
export default router;
