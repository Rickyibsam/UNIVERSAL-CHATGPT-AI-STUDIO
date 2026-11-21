# Self-hosted cloud AI setup

This project does not use another company's hosted free-tier or paid AI generation API. The browser is only the user interface. Inference must run on an owner-operated cloud GPU engine.

## Current state
- Supabase Auth, database, private storage and the authenticated queue gateway are deployed.
- `studio-gateway` accepts screenplay requests and inserts a `queued` job. It does not call Gemini or another external provider.
- The worker source and Docker image are in `worker/`.
- The private inference engine and GPU worker are not deployed yet. Until both are online and verified, generated media is not available.

## Worker deployment environment
Build the worker container from the repository root:

```sh
docker build -f worker/Dockerfile -t universal-studio-worker worker
```

Run it as a private background worker with these server-side environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STUDIO_ENGINE_URL` (private URL of the owner-operated inference engine)
- `STUDIO_ENGINE_TOKEN` (optional shared secret)
- `STUDIO_STORAGE_BUCKET=studio-media`

Never place the service-role key or engine token in frontend JavaScript, GitHub, or chat. The worker requires network access to Supabase and the private engine.

## Self-hosted inference engine contract
See [SELF_HOSTED_ENGINE_CONTRACT.md](./SELF_HOSTED_ENGINE_CONTRACT.md). The engine exposes `POST /v1/generate` and returns structured results and/or generated artifacts. It must use an allowlisted registry of open-weight models with license checks. It must not proxy to third-party hosted inference APIs.

## Hardware and cost reality
Image and especially video diffusion models need substantial GPU VRAM, disk space and sustained compute. The user's laptop is not used for inference. A static website host and a database do not provide GPU capacity. Do not deploy a CPU-only service and claim that it can generate production video. Do not silently rent paid GPU capacity; obtain explicit approval first.

## Acceptance requirements
Do not mark a media feature active until a real authenticated request:
1. enters the queue,
2. is claimed by the private worker,
3. runs on the owner-operated engine,
4. writes the artifact to private Storage,
5. inserts the matching `assets` row,
6. updates job status/progress,
7. can be retrieved and played back by the owning user only.
