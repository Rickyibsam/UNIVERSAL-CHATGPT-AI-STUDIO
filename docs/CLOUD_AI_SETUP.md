# Cloud AI setup

The Studio is browser-operated. Do not install Ollama, ComfyUI, FFmpeg, GPU models or any local AI runtime on the user's laptop.

## Current cloud backend
- Supabase project: the existing Studio project.
- Edge Function: `studio-gateway`.
- JWT verification: enabled.
- Function URL: `https://xoitqhckliiuomreutmk.supabase.co/functions/v1/studio-gateway`.
- Browser calls require a signed-in user and an owned cloud project.
- The gateway records script-generation jobs in `generation_jobs`.
- Provider keys are read only from server-side Edge Function secrets.

## Enable the free-tier screenplay model
1. Open Google AI Studio: https://aistudio.google.com/app/apikey
2. Create a Gemini API key. Do not paste it into the website or GitHub.
3. Open the Supabase dashboard for this project: https://supabase.com/dashboard/project/xoitqhckliiuomreutmk
4. Open Edge Functions → Secrets (or Project Settings → Edge Functions → Secrets, depending on the dashboard layout).
5. Add a secret named `GEMINI_API_KEY` and paste the key as its value.
6. Save the secret, then retry screenplay generation from the website while signed in and with a cloud project selected.

The function targets `gemini-2.5-flash-lite`. Google's current pricing page lists free-tier input/output for this model subject to quotas and terms. The free tier can use submitted content to improve Google products; do not send confidential material unless those terms are acceptable. If a provider account changes to paid billing, the project must not silently upgrade or spend: keep paid billing disabled and review usage/quotas in Google AI Studio.

## Database queue and continuity foundation
The database now includes bounded retry metadata, scheduled availability, worker locks/heartbeats, provider metadata and estimated-cost fields on `generation_jobs`. The `claim_studio_jobs` RPC uses row locks with `SKIP LOCKED` and is executable only by `service_role`; browser roles are explicitly denied. A project-owned `locations` table and scene-level `location_id` / `continuity_prompt` fields provide the first persistence layer for recurring environments. Timeline clip policies also validate that referenced tracks, scenes and assets belong to the same project.

This is queue infrastructure, not a running worker: no worker service currently polls jobs or performs automatic retries. Do not mark background processing complete until a hosted worker is deployed and tested.

## What is not connected yet
- Cloud image generation and reference-conditioned image jobs.
- Cloud video generation adapters (Veo, Kling, Runway, MiniMax and alternatives).
- Cloud voice and music generation.
- A hosted background worker for long-running video jobs.
- Cloud FFmpeg/render worker and MP4/4K export.
- Automated media QC and full end-to-end tests.

These integrations require provider-specific APIs, server-side credentials, job polling/webhooks and storage handling. Some video APIs are paid per second or by credits; those providers remain disabled until the owner explicitly approves them.

## Security and privacy
- Never commit provider secrets to GitHub or put them in frontend JavaScript.
- Never use Supabase service-role keys in the browser.
- Every job must be authenticated, checked against project ownership and subject to quotas.
- Provider usage and estimated cost must be shown before any paid request.
- Generated assets must be saved in the private project bucket with owner-scoped access.
- Do not claim a render is finished until a real output file has been generated and validated.
