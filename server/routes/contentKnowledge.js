import { Router } from 'express';
import multer from 'multer';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { getKnowledge, importKnowledge, getAppEvidence, CATEGORIES } from '../services/contentKnowledge.js';
import { extractText } from '../services/documentExtract.js';
import { selectEvidence, parseIdeas, IDEA_PROMPT } from '../services/contentIdeas.js';
import { getChatConfig, chatComplete } from '../services/aiProviders.js';
import { refreshForIdeas, refreshWatchlistForIdeas } from '../services/targetedRefresh.js';
import { generalTrendEvidence, refreshGeneralTrendsForIdeas } from '../services/trendProviders.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB — plenty for a text/PDF/docx source doc

async function getWatchlistCounts(userId) {
  if (!isSupabaseConfigured()) return { influencers: 0, hashtags: 0 };
  const [{ count: influencers }, { count: hashtags }] = await Promise.all([
    supabase.from('watched_influencers').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('watched_hashtags').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return { influencers: influencers || 0, hashtags: hashtags || 0 };
}

router.get('/', async (req, res) => {
  try {
    const docs = await getKnowledge(req.userId);
    const config = await getChatConfig(req.userId);
    const watchlist = await getWatchlistCounts(req.userId);
    res.json({ documents: docs.map(({ content, user_id, ...d }) => ({ ...d, characters: content.length })), categories: CATEGORIES, ai_ready: !!config,
      missing_categories: CATEGORIES.filter(c => !docs.some(d => d.category === c)), watchlist, snapshot: true });
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

// POST /api/content-knowledge/upload-document — upload a real file (.txt/.md/.pdf/.docx),
// extract its text, and store it as a knowledge source. This is the friendly alternative
// to hand-authoring the /import JSON shape below.
router.post('/upload-document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a file to upload.' });
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'strategy';
    const { originalname, mimetype, buffer } = req.file;
    const title = (req.body.title || '').trim() || originalname.replace(/\.[^/.]+$/, '');

    let content;
    try { content = await extractText(buffer, mimetype, originalname); }
    catch (extractErr) { return res.status(400).json({ message: extractErr.message }); }
    const truncated = content.length > 200000;
    if (truncated) content = content.slice(0, 200000);

    const imported = await importKnowledge(req.userId, [{
      title,
      source: `doc:${originalname}`, // re-uploading the same filename updates this source, same as JSON import
      category,
      captured_at: new Date().toISOString(),
      content,
    }]);
    res.json({ imported, title, category, truncated });
  } catch (e) { res.status(400).json({ message: e.message }); }
});
export async function generateContentIdeas(req, res) {
  try {
    const focus = req.body.focus || '';
    if (typeof focus !== 'string' || focus.length > 1500) return res.status(400).json({ message: 'Keep your focus under 1,500 characters.' });
    const documents = await getKnowledge(req.userId);
    if (!await getChatConfig(req.userId)) return res.status(409).json({ message: 'Connect a Chat AI provider in Integrations to generate ideas. Your imported evidence is saved and available to review.' });
    const shouldRefresh = req.body.refresh !== false;
    // Run all three bounded refreshes in parallel, then collect evidence so the freshly-synced
    // Watchlist/Trending/general-trend data is actually reflected below, not just the owner's own posts.
    const [refresh, watchlistRefresh, generalTrendsRefresh] = await Promise.all([
      shouldRefresh ? refreshForIdeas(req.userId, focus) : Promise.resolve({ status: 'skipped', gaps: [] }),
      shouldRefresh ? refreshWatchlistForIdeas(req.userId) : Promise.resolve({ status: 'skipped', refreshed: 0, skipped_fresh: 0, failed: 0, gaps: [] }),
      shouldRefresh ? refreshGeneralTrendsForIdeas(req.userId) : Promise.resolve({ status: 'skipped', refreshed: 0, skipped_fresh: 0, failed: 0, gaps: [] }),
    ]);
    const app = await getAppEvidence(req.userId, focus);
    const general = await generalTrendEvidence(req.userId);
    app.documents.push(...general.documents);
    app.gaps.push(...general.gaps);
    app.gaps.push(...refresh.gaps);
    app.gaps.push(...watchlistRefresh.gaps);
    app.gaps.push(...generalTrendsRefresh.gaps);
    const evidence = [...selectEvidence(documents, focus), ...app.documents.map(d => ({ ...d, content: d.content.slice(0, 12000), excerpted: d.content.length > 12000 }))];
    const text = await chatComplete(req.userId, [{ role: 'system', content: IDEA_PROMPT }, { role: 'user', content: JSON.stringify({ today: new Date().toISOString(), focus, missing_categories: CATEGORIES.filter(c => !documents.some(d => d.category === c)), data_gaps: app.gaps, refresh_receipt: refresh, watchlist_refresh_receipt: watchlistRefresh, general_trends_refresh_receipt: generalTrendsRefresh, evidence }) }], { maxTokens: 4000, task: 'recommendations' });
    res.json({ ideas: parseIdeas(text || '', evidence), refresh, watchlist_refresh: watchlistRefresh, general_trends_refresh: generalTrendsRefresh, post_coverage: app.coverage, external_coverage:app.external_coverage || [], external_examples:app.documents.filter(d=>d.external).map(({content,...d})=>d), data_gaps: app.gaps, reviewed_sources: evidence.length, total_sources: documents.length + app.documents.length, excerpted_sources: evidence.filter(e => e.excerpted).length, snapshot: true });
  } catch (e) {
    if (e.code === 'ai_insufficient_quota') return res.status(402).json({ error: 'ai_insufficient_quota', message: e.message, provider: e.provider });
    if (e.code === 'ai_rate_limited') return res.status(429).json({ error: 'ai_rate_limited', message: `Your AI provider is rate-limiting requests right now, not out of credits. ${e.message} Wait a moment and try again.`, provider: e.provider });
    res.status(502).json({ message: e.message || 'Idea generation failed. Your draft is unchanged.' });
  }
}
export default router;
