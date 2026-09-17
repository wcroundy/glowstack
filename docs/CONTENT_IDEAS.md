# Evidence-backed content ideas

Create Content → Start New → Generate Ideas now uses an authenticated knowledge library and the existing configured Chat AI provider. It returns one primary recommendation and an alternative. Every supporting quote must match an excerpt sent to the provider; this checks provenance, not the truth of every generated inference. Review recommendations before production.

## Setup

1. Apply `supabase/migrations/019_content_knowledge.sql` to the intended database. Use a server-side service-role key; no browser-readable policy is created for knowledge.
2. In local development without Supabase, sources and drafts persist in gitignored `.local/content/`. Do not deploy that directory, commit it, or serve it as public assets.
3. Import `{ "documents": [...] }` in the source library. Each document needs `title`, `source` (stable relative identifier), `category`, `captured_at` (ISO date), and `content`. Categories: strategy, performance, sales, reuse, products, schedule, opportunities, coverage. Reimport replaces matching source identifiers for that user.
4. For the existing local source project, run `node tools/import-content-knowledge.mjs "<source-project-folder>"`. It writes a private `.local/knowledge-import.json` for deliberate import into another environment. Never commit this file. It imports top-level context/procedure Markdown and the current content desk, not raw media, all CSV rows or full conversations. File modification dates are snapshot dates; measurement dates remain in the text.
5. Connect a Chat AI provider in Integrations. No key means no recommendations; saved evidence remains reviewable. The provider receives selected excerpts when Generate is clicked.

## Behavior and limits

- Focus and source categories select up to 20 imported excerpts of 4,500 characters, preserving key strategy/coverage documents. Instagram and Facebook each contribute up to 15 recent published posts, 5 historical candidates per metric (reach, shares, and Instagram saves or Facebook clicks; older than 30 days), plus up to 15 caption matches to optional focus terms. Queries scan the stored archive for their ranking/filter, deduplicate overlapping posts, and preserve selection reasons. Available media and upcoming calendar entries remain capped at 15 rows each. Per-post insights provide last_synced_at and detailed-metric availability. Unknown timestamps and snapshots older than 48 hours are flagged; this is a freshness heuristic, not a universal data expiry. A bounded targeted Meta refresh runs before generation by default; the checkbox disables it. It discovers at most 50 recent post records per platform, then refreshes at most 10 recent and 5 historical candidates per platform. Recent posts have a 6-hour cache; historical candidates a 48-hour cache. A 5-minute retry cooldown and in-process single-flight limit repeat work (not a distributed lock). Metadata and supported insight values only; no images or videos are downloaded. The Graph request phase has a 60-second deadline, 8-second request timeouts and three workers per platform; rate/auth errors stop further Graph requests. Discovery caps, stale values and failures remain visible. This is not a complete full-history sync, Story archive recovery, or affiliate sales sync. Historical totals and caption matches are candidate evidence, not equal-age comparisons or verified causal winners. The UI reports selected versus total counts. This is not full-history synthesis; improve retrieval as coverage grows.
- Snapshots are not live monitoring. Sales, stock, offers, publishing history and historical plans need fresh verification. No automated chat sync, sale crawler, posting or ManyChat changes are included.
- Formats are distinct from channels. Selected ideas populate editable shooting, editing, links and platform notes, and retain per-piece proposed dates/progress in the draft. Selection never completes production steps.
- The calendar currently receives the overall plan, not automated publication jobs. Per-piece dates are draft planning fields. Drafts retain the structured evidence and plan.
- Existing app authentication is single-tenant (`default` user). Knowledge queries are scoped by the authenticated server user; this feature does not introduce multi-user login.
- Source text is untrusted model input. The prompt prohibits embedded instructions; exact citation validation rejects invented source IDs/quotes. Human review is still required for unsupported inferences.

## Verification

`node --test tests/contentIdeas.test.js tests/postEvidence.test.js tests/targetedRefresh.test.js` and `npm run build`.
No live provider, production migration or public deployment is required for unit tests.

## Production rollout

Apply migration 019 (including posts.metrics_refresh) before live testing. Import the private knowledge JSON through the authenticated source library; it is deliberately absent from Git and deployments. Connect Chat AI in Integrations and keep the existing Meta connection. Generation attempts a targeted metrics refresh before collecting evidence. A failed refresh retains prior metric values and successful field timestamps; missing data is never written as zero. A partial metric response updates only returned numeric fields. No Graph API success, account permissions, SQL migration execution or AI completion has been live-validated locally. Meta may reject unavailable metrics; the refresh receipt reports this instead of silently declaring success.
