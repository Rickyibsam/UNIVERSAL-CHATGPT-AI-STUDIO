# UNIVERSAL-CHATGPT-AI-STUDIO

A browser-based, cloud-first AI filmmaking studio. The user's laptop is a browser client only; model inference, provider orchestration, project data and final rendering are intended to run on hosted infrastructure.

## Infrastructure
- Frontend: Render Static Site, auto-deploying from `main`.
- Database, Auth and private media storage: Supabase project.
- Secure application gateway: Supabase Edge Function `studio-gateway` (JWT verification enabled).
- Generation jobs: `generation_jobs` table with provider, state, progress, retry and error metadata.
- Projects, scenes, characters, assets, versions and timeline: private Supabase tables with RLS.

## Cloud-first rules
1. Never require Ollama, ComfyUI, local GPU models, PowerShell or local FFmpeg from the user.
2. Never expose provider API keys in browser code or local storage.
3. Do not call any third-party hosted AI generation API, free or paid. Run open-weight models on owner-controlled cloud compute only.
4. Do not rent paid GPU infrastructure or activate paid services without explicit owner approval.
5. Show the selected self-hosted model, license, hardware needs and output limits before generation.
6. Use asynchronous jobs, progress, retry, cancellation, idempotency and private asset storage.
7. Lip-sync is intentionally out of scope for the current build.
8. Do not claim a generation or export is complete until a real output has been generated and verified.

## Current implementation status
- [x] Responsive browser production workspace.
- [x] Supabase Auth, cloud projects, private project media and RLS-protected data tables.
- [x] Scene/character editing, timeline data, subtitles export and project version snapshots.
- [x] Supabase Edge Function `studio-gateway` deployed with JWT verification.
- [x] Durable job-queue schema: retry schedule, attempt limits, worker locks/heartbeats, provider metadata and cost fields.
- [x] Atomic `claim_studio_jobs` database function restricted to `service_role`; browser roles cannot claim jobs.
- [x] Project-scoped locations and scene continuity fields for reusable visual references.
- [x] Corrected timeline clip RLS checks so tracks, scenes and assets must belong to the same project.
- [x] Screenplay gateway changed to enqueue a private self-hosted job; no external AI provider is called.
- [x] Worker source added for job polling, bounded retry, project/scene/character/location context, private media upload and structured screenplay results.
- [x] Self-hosted inference engine service skeleton added with a single `/v1/generate` contract, allowlisted adapter registry and authenticated capabilities endpoint. No model adapter is installed yet.
- [ ] Deploy the private worker and owner-operated inference engine; the current Render service is only a static frontend.
- [ ] Verify an authenticated screenplay job end-to-end after the private engine is online.
- [ ] Self-hosted image model adapter and private asset ingestion.
- [ ] Self-hosted video model adapters (open weights only, with license review); no third-party hosted generation APIs. No hosted third-party video generation API will be used.
- [x] Worker source and Docker image added: durable queue polling, bounded exponential retry, output ingestion into private Storage, and job progress updates. **Not deployed yet**; requires owner-controlled worker hosting and secrets.
- [x] Expired worker leases are recovered by the atomic claim function; after 45 minutes stale jobs are re-queued within attempt limits or marked failed.
- [ ] Self-hosted voice/TTS model adapter and private WAV ingestion; lip-sync remains out of scope.
- [ ] Self-hosted music/SFX model adapters with license review; no third-party hosted generation APIs.
- [x] Private worker MP4 renderer implemented: ordered visual clips, voice/music/SFX mix, subtitle burn-in and private MP4/SRT ingestion. **Not deployed or runtime-tested yet**.
- [ ] Advanced timeline renderer: true multi-track positioning, transitions, overlays and effects.
- [ ] Automated media QC, continuity checks, recovery tests and end-to-end workflow tests.

## Self-hosted AI runtime
The application does not use third-party hosted free-tier or paid generation APIs. The secure gateway validates the user and queues screenplay jobs. A private worker claims jobs, applies bounded retries, loads project/scene/character/location context, and stores generated artifacts in the private `studio-media` bucket. The worker calls only an owner-operated engine through `STUDIO_ENGINE_URL`.

The worker container is in `worker/`. It requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_ENGINE_URL` and optionally `STUDIO_ENGINE_TOKEN` as server-side environment variables. Never put secrets in the browser, repository, or chat. The self-hosted inference engine and GPU worker are not deployed yet, so AI generation is not yet live.

## Important limits
A static Render frontend is not a GPU video-rendering service. The self-hosted inference engine, cloud renderer and GPU worker still need to be integrated and hosted. Free hosting does not provide GPU inference capacity. The project must not start paid compute without explicit approval.

## Deployment
- GitHub: https://github.com/Rickyibsam/UNIVERSAL-CHATGPT-AI-STUDIO
- Branch: `main`
- Frontend: https://universal-chatgpt-ai-studio.onrender.com
- Supabase Edge Function: `studio-gateway`
