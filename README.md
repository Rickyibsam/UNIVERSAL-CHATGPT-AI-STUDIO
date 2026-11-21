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
3. Free-tier providers may be enabled only within their documented quotas and terms.
4. Paid provider calls must remain disabled until the owner explicitly approves the provider and spending.
5. Show provider, model, estimated cost, duration/resolution limits and account quota before paid generation.
6. Use asynchronous jobs, progress, retry, cancellation, idempotency and private asset storage.
7. Lip-sync is intentionally out of scope for the current build.
8. Do not claim a generation or export is complete until a real output has been generated and verified.

## Current implementation status
- [x] Responsive browser production workspace.
- [x] Supabase Auth, cloud projects, private project media and RLS-protected data tables.
- [x] Scene/character editing, timeline data, subtitles export and project version snapshots.
- [x] Supabase Edge Function `studio-gateway` deployed with JWT verification.
- [x] Cloud screenplay client wired to the gateway.
- [ ] Add the `GEMINI_API_KEY` Supabase Edge Function secret to activate the free-tier Gemini text adapter.
- [ ] Verify a real authenticated cloud screenplay request and confirm job persistence.
- [ ] Cloud image generation adapter and private asset ingestion.
- [ ] Cloud video provider adapters (Veo, Kling, Runway, MiniMax or alternatives), including provider-specific cost and quota gates.
- [ ] Hosted background worker / job polling for long-running image/video/audio tasks.
- [ ] Cloud voice and music generation adapters.
- [ ] Hosted timeline renderer for MP4 export; browser-side local FFmpeg is not part of the target architecture.
- [ ] Automated media QC, continuity checks, recovery tests and end-to-end workflow tests.

## Free-tier text provider
The gateway targets Gemini 2.5 Flash-Lite. Google's current pricing page lists a free tier for eligible model usage, subject to rate limits and terms. Free-tier prompts may be used by Google to improve products; do not send confidential content unless the applicable terms are acceptable.

To activate it, add `GEMINI_API_KEY` as a Supabase Edge Function secret for this project. The key must never be added to `public/index.html`, GitHub source, or browser storage. The gateway returns a clear provider-not-configured response until the secret exists. No paid provider is called automatically.

## Important limits
A static Render frontend is not a GPU video-rendering service. The cloud renderer and video-generation providers still need to be integrated and hosted. Free hosting does not imply unlimited free GPU inference; video providers commonly charge per second or by credits. The app must block paid jobs unless the owner has enabled that provider and approved its spend.

## Deployment
- GitHub: https://github.com/Rickyibsam/UNIVERSAL-CHATGPT-AI-STUDIO
- Branch: `main`
- Frontend: https://universal-chatgpt-ai-studio.onrender.com
- Supabase Edge Function: `studio-gateway`
