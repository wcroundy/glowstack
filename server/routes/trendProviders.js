import { Router } from 'express';
import { trendStatus, saveTrendSettings, disconnectTrend, refreshTrend, TREND_FEEDS, TREND_SOURCES } from '../services/trendProviders.js';
const router=Router();
router.get('/',async(req,res)=>{
  try {res.json({providers:await trendStatus(req.userId),feeds:TREND_FEEDS,sources:TREND_SOURCES});}
  catch(e){res.status(503).json({message:e.message});}
});
router.put('/:provider',async(req,res)=>{
  try{res.json(await saveTrendSettings(req.userId,req.params.provider,req.body));}
  catch(e){res.status(400).json({message:e.message});}
});
router.delete('/:provider',async(req,res)=>{
  try{await disconnectTrend(req.userId,req.params.provider);res.json({disconnected:true});}
  catch(e){res.status(400).json({message:e.message});}
});
router.post('/:provider/refresh',async(req,res)=>{
  try{res.json(await refreshTrend(req.userId,req.params.provider));}
  catch(e){res.status(400).json({message:e.message});}
});
export default router;
