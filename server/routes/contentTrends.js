import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { collectExternalEvidence, safeReferenceUrl } from '../services/externalEvidence.js';
import { importKnowledge } from '../services/contentKnowledge.js';
const router=Router();
router.get('/',async(req,res)=>{
  try {
    if(!isSupabaseConfigured())return res.json({documents:[],coverage:[],gaps:['Connect the database to use saved creator and hashtag watchlists. Saved references can still be added locally.']});
    res.json(await collectExternalEvidence(supabase,req.userId));
  }catch{res.status(503).json({message:'Outside evidence is temporarily unavailable.'});}
});
router.post('/references',async(req,res)=>{
  try {
    const {url,title,notes,observed_on}=req.body;
    const safe=safeReferenceUrl(url);
    const date = typeof observed_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(observed_on) ? new Date(observed_on) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== observed_on) return res.status(400).json({message:'Use a valid calendar date for the observation.'});
    if(!safe || typeof title!=='string' || !title.trim() || title.length>200 || typeof notes!=='string' || !notes.trim() || notes.length>5000 || !/^\d{4}-\d{2}-\d{2}$/.test(observed_on || '') || !Number.isFinite(Date.parse(observed_on)) || Date.parse(observed_on)>Date.now()) return res.status(400).json({message:'Add an HTTPS link, title, notes, and a valid observation date (not in the future).'});
    await importKnowledge(req.userId,[{title:`Saved reference: ${title.trim()}`,source:safe,category:'opportunities',captured_at:new Date(observed_on).toISOString(),content:`Owner-saved outside reference, not independently verified or automatically fetched.\nURL: ${safe}\nObserved: ${observed_on}\nNotes: ${notes}\nTreat as inspiration. Recheck freshness and evidence before claiming a current trend. No sales or momentum established.`}]);
    res.json({saved:true});
  }catch(e){res.status(400).json({message:e.message});}
});
export default router;
