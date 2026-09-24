# API and MCP AI connections

Integrations now offers independent **API / MCP** selections for Chat & Research
(including content recommendations) and Media Processing (auto-tagging and video
breakdown). Existing installations default to API. Switching transport preserves
the saved API provider and model choices. Disconnecting the worker does not turn
API billing on automatically.

## Fixed MCP model policy

`shared/aiModelPolicy.js` defines the model and reasoning effort for each task:

| Task | Model | Reasoning |
| --- | --- | --- |
| General chat | GPT-6 Luna | Low |
| Image/video auto-tagging | GPT-6 Luna | Medium |
| Content recommendations | GPT-6 Sol | Medium |
| Video scene analysis (both entry points) | GPT-6 Sol | Medium |

Every turn explicitly uses Standard speed. These are cost-conscious starting
defaults, not a measured claim of optimal cost/quality for your content. Luna is
the efficient repeatable-task model; Sol handles the more demanding synthesis
and comparisons. See [model guidance](https://developers.openai.com/api/docs/guides/latest-model)
and [Codex usage rates](https://learn.chatgpt.com/docs/pricing).

The worker validates catalog availability, reasoning support and image capability
and refuses incompatible models. No automatic model upgrades/fallbacks occur.
Task models are independent of the desktop default and the former
`GLOWSTACK_CODEX_MODEL` variable (now ignored). Restart the worker after updating.
Saved API-mode model selections are unchanged. Integrations displays the fixed
MCP assignments; no per-job model selection is necessary.

## What is preserved

The original system/user prompts, tag list, selected images and their ordering,
scene extraction, response parsing, managed-tag matching, suggested-tag review,
and content-idea validation remain in their existing routes/services. The new
transport branches only at `chatComplete` / `visionComplete`.

The worker passes the original system prompt as Codex base instructions. For chat,
it sends all supplied conversation messages, in order with their original roles
and text, inside a JSON conversation envelope. Each inference uses an ephemeral,
isolated thread to avoid unrelated history or tagging instructions leaking between
requests. Glowstack continues to supply the chat history/evidence it already uses.
This does not reuse the development conversation or introduce new research sources.

Codex has a different model/runtime from Chat Completions. Results are not guaranteed
identical. App-server does not offer equivalent temperature or max-output-token
controls; those values remain in the job payload for provenance but are not enforced
by Codex. Compare actual tagging/scene output before switching large workloads.

## Deployment and pairing

1. Apply `supabase/migrations/021_ai_mcp_bridge.sql` in the project's Supabase SQL
   editor, after the existing AI settings migrations. Use the server service-role
   key; worker credentials/jobs are private tables with no browser DB access.
2. Deploy this code. API remains selected until explicitly changed.
3. On the worker computer install Node and Codex, run `npm ci`, and run
   `codex login` using **ChatGPT sign-in**. The worker refuses API-key authentication.
4. In Glowstack Integrations, create a pairing credential. Copy it once to the
   worker computer's ignored `.env`:

   ```dotenv
   GLOWSTACK_URL=https://your-glowstack-site.example
   GLOWSTACK_WORKER_TOKEN=the-credential-from-integrations
   # Optional, if codex is not on PATH:
   # CODEX_BIN=C:/path/to/codex.exe
   ```

5. Run `npm run ai:worker`. Keep the process running and the computer awake.
   Refresh status in Integrations, then choose MCP for either or both engines.
6. Test one image, a short video, a chat reply, and a recommendation. Switch back to
   API explicitly whenever needed. Never paste ChatGPT session tokens into Glowstack.

Local development uses `http://localhost:3001` and ignored local storage when no
Supabase is configured. Hosted production requires Supabase; it never silently
stores jobs on a serverless filesystem. No migration or remote deployment is performed
by starting the worker. A personal worker serves the user/account it is paired to;
this is not a shared subscription backend for unrelated customers.

## Architecture and limits

Glowstack stores a short-lived job -> worker claims it over authenticated MCP
Streamable HTTP -> Codex app-server performs the inference using ChatGPT sign-in ->
worker returns text/usage over MCP -> original Glowstack code parses and saves it.

- The official MCP SDK handles protocol negotiation. Only heartbeat, claim, and
  finish tools are exposed. The worker makes outbound HTTPS requests, so no computer
  port forwarding or public local inference server is required.
- Pairing secrets are randomly generated and stored only as hashes. Re-pairing or
  disconnecting revokes old credentials. Atomic status/claim-token updates prevent
  duplicate claims/results; jobs are scoped to the authenticated user and pairing.
- Requests expire after 90 seconds; worker inference is limited to 80 seconds.
  Serialized inputs are capped at 4 MB to fit hosted HTTP response limits when
  the worker claims a job. Oversized video-frame sets fail with an actionable error.
  Auto-tagging uses one asset per HTTP batch in MCP mode to fit Vercel request limits.
  Existing batch continuation and suggestion aggregation still apply. Video frame
  extraction is still performed by the existing server code, not moved to the worker.
- A slow/large video may exceed the existing overall 300-second Vercel limit.
  There is no background retry or automatic paid fallback. Retry explicitly or use
  API mode for workloads that do not fit these bounds.
- Prompts/results are deleted after delivery/failure. Expired orphan jobs left by
  a crashed server are inaccessible to workers and removed on the next enqueue for
  that user. Database backups follow the project's retention policy.
- Inline images use temporary local files, deleted after each job. The worker uses
  ephemeral threads, a temporary working directory, read-only sandbox, disabled
  configured MCP/plugins/apps, disabled shell tools/web search, and declines interactive
  tool requests. Only OS/runtime paths pass into its inference child process, not
  Glowstack API/database credentials. Codex's own diagnostic retention still applies.
- The worker verifies ChatGPT authentication and backend permission for included
  usage before each completion. Unknown or exhausted allowance stops work, even
  when the account has extra credits. Subscription limits still
  apply. It does not buy credits, consume reset credits, or fall back to API billing.
  Hosting and third-party data-provider costs are unaffected.

## Verification

`node --test tests/*.test.js` covers prompt/image preservation, independent transport
settings, no API fallback, pairing/revocation, timeout cleanup, tenant isolation,
atomic local claims, and a real MCP SDK HTTP handshake. `npm run build` checks the UI.
Production Supabase and representative live media acceptance tests remain deployment
checks, not claims made by the local tests.

The opt-in `node scripts/smoke-ai-worker.js` uses a temporary local MCP server and
isolated pairing to exercise the complete worker process with real subscription
inference: short chat and recommendation-routing checks plus the existing image-tagging prompt on a synthetic red
image. It consumes a small amount of Codex allowance and does not change real user
settings or media. These checks passed during development; no real video/library
acceptance test or production migration has been run.

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server),
[Codex authentication](https://learn.chatgpt.com/docs/auth).
