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

### Live and deployed
- [x] Canva-style browser editor with left-side tools, preview canvas and bottom timeline.
- [x] Render web service deployed on Render free plan: `https://universal-studio-renderer.onrender.com`.
- [x] Supabase Edge Function `studio-gateway` active with JWT verification; render jobs are project-scoped.
- [x] Private media uploads, editor clip persistence, timeline restore and version snapshot integration.
- [x] Debounced cloud autosave and explicit editor save; first cloud project save triggers media/timeline persistence.
- [x] FFmpeg MP4 renderer with video/image clips, audio mixing, text overlays, speed, fit/crop, rotation, static scale, filter presets, fades/dissolves, slide, zoom, wipe, green/blue chroma key and opacity keyframes.
- [x] 30fps timeline timing increments.
- [x] Automated FFmpeg smoke-test script for 720p keyframes/wipe, 1080p chroma/slide and 4K zoom; sample 1080p and 4K MP4 outputs were generated and ffprobe-verified in a Linux test environment.
- [x] User-scoped Supabase JWT is used by the render web service; no service-role secret is shipped to the browser or renderer.

### Not yet complete / not verified
- [ ] Full authenticated end-to-end test using a real user project: upload → autosave → close/reopen → render → download.
- [ ] 4K render stability on Render free instance; CI sample output does not guarantee a long 4K render will fit the free service's memory.
- [ ] Keyframe support beyond opacity (e.g. position, rotation and more transform curves).
- [ ] More advanced 3D transitions, motion tracking, masks and compositing.
- [ ] Permanent background queue worker for non-render jobs.
- [ ] Owner-operated self-hosted inference engine and licensed model adapters for real AI screenplay, image, video, speech, music and SFX generation. The current engine registry has no adapters; `STUDIO_ENGINE_URL` is not configured.
- [ ] Real consistency generation across characters and locations using model references.
- [ ] Full browser regression/E2E and database workflow tests with authenticated project data.

Lip-sync is intentionally out of scope. No third-party hosted AI APIs, paid GPU, or paid worker have been enabled. The Render renderer runs on the free web-service tier and may sleep while idle; long/high-resolution jobs are subject to its memory and execution limits.

## Self-hosted AI runtime
The application does not use third-party hosted free-tier or paid generation APIs. The secure gateway validates user sessions and queues render jobs. The deployed render web service accepts a user-scoped Supabase JWT, processes only project-owned assets, applies FFmpeg timeline operations, and stores the final MP4 in private Storage. It does not require a service-role key.

The separate polling worker and self-hosted inference engine are not deployed. The engine registry in `engine/` currently has no model adapters, and `STUDIO_ENGINE_URL` is not configured on the renderer. Therefore real AI screenplay, image, video, speech, music and SFX generation is not live yet. A model adapter must be installed on owner-controlled cloud compute with an approved model license before those features can be marked complete.

## Important limits
The static frontend is not a GPU inference service. A separate FFmpeg render web service is deployed on Render's free tier, but free hosting does not provide GPU inference capacity and may impose memory/sleep limits on long or 4K jobs. The self-hosted AI inference engine and its model adapters are not deployed. The project must not start paid compute without explicit approval.

## Deployment
- GitHub: https://github.com/Rickyibsam/UNIVERSAL-CHATGPT-AI-STUDIO
- Branch: `main`
- Frontend: https://universal-chatgpt-ai-studio.onrender.com
- Supabase Edge Function: `studio-gateway`
