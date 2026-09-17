// Explicit local snapshot import. Does not upload anything or follow links.
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { importKnowledge } from '../server/services/contentKnowledge.js';

const root = process.argv[2];
if (!root) throw new Error('Usage: node tools/import-content-knowledge.mjs <source-project-folder>');
const base = resolve(root);
const documents = [];
const skipped = [];
const folders = ['00 Project Context', '04 Operating Procedures'];
function category(name) {
  if (/coverage|source register|gap|access attempt/i.test(name)) return 'coverage';
  if (/decision|contract|business context|blueprint|start here|cadence|brand|protocol/i.test(name)) return 'strategy';
  if (/sale|routing|conversion|affiliate/i.test(name)) return 'sales';
  if (/haul|retail|return|product|intake/i.test(name)) return 'products';
  if (/calendar|schedule|content bones|week map|morning map|production queue/i.test(name)) return 'schedule';
  if (/audit|reuse|reserve|repurpos/i.test(name)) return 'reuse';
  if (/opportunity|idea|radar|creator pattern/i.test(name)) return 'opportunities';
  return 'performance';
}
for (const folder of folders) {
  for (const name of await readdir(join(base, folder))) {
    if (!name.endsWith('.md') || name.startsWith('build_')) continue;
    const path = join(base, folder, name);
    const info = await stat(path);
    const content = await readFile(path, 'utf8');
    if (content.length > 200000) { skipped.push(name); continue; }
    documents.push({ title: name.replace(/\.md$/, ''), source: relative(base, path).replaceAll('\\', '/'),
      category: category(name), captured_at: info.mtime.toISOString(), content });
  }
}
// Current reconciled plan is more useful than old scheduled briefs.
const desk = join(base, '04 Operating Procedures/Publishing Readiness/CONTENT DESK.md');
try { documents.push({ title: 'Current content desk', source: '04 Operating Procedures/Publishing Readiness/CONTENT DESK.md', category: 'schedule', captured_at: (await stat(desk)).mtime.toISOString(), content: await readFile(desk, 'utf8') }); }
catch(e) { if (e.code !== 'ENOENT') throw e; skipped.push('Current content desk'); }
await mkdir('.local', { recursive: true });
await writeFile('.local/knowledge-import.json', JSON.stringify({ documents }, null, 2));
const count = await importKnowledge('default', documents);
console.log(JSON.stringify({ imported: count, skipped, note: 'Markdown snapshot only. Capture dates reflect file modification; measurement dates remain in source text. Full raw CSV history and transcripts are not imported.' }));
