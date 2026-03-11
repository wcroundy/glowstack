import { Router } from 'express';

const router = Router();

const demoReports = [];

router.get('/', (req, res) => {
  res.json({ data: demoReports });
});

router.post('/generate', (req, res) => {
  const { report_type = 'weekly', platforms = ['all'] } = req.body;
  const report = {
    id: 'rpt-' + Date.now(),
    title: `${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Performance Report`,
    report_type,
    platforms,
    status: 'ready',
    date_from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
    content: `# ${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Performance Report\n\n## Overview\nTotal reach: 2.84M (+12.8%)\nAvg engagement: 8.6% (+1.3%)\nRevenue: $7,431.50 (+22.5%)\n\n## Top Content\n1. GRWM Date Night (TikTok) — 1.65M views, 12.1% engagement\n2. Summer Glam Look (Instagram) — 285K reach, 9.2% engagement\n3. Fall OOTD (Pinterest) — 125K reach, $2,100 revenue\n\n## Recommendations\n- Increase GRWM content frequency on TikTok\n- Leverage Pinterest for affiliate revenue\n- Post during identified peak engagement windows`,
    created_at: new Date().toISOString(),
  };
  demoReports.push(report);
  res.json(report);
});

export default router;
