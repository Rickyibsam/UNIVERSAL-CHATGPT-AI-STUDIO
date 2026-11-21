# Self-hosted Studio AI engine contract

This project intentionally does **not** call any other company's free-tier or paid hosted AI generation API. No Gemini, OpenAI, Replicate, Hugging Face Inference, or hosted demo endpoints. The worker calls only the owner-operated engine configured with `STUDIO_ENGINE_URL`; the laptop browser remains a thin client.

## Worker contract

The worker sends `POST /v1/generate` with:

```json
{
  "contract_version": "1",
  "job": {
    "id": "uuid",
    "type": "script | image | video | speech | music | sfx | render",
    "scene_id": "uuid-or-null",
    "attempt": 1,
    "input": {}
  },
  "context": {
    "project": {},
    "scene": {},
    "characters": [],
    "location": {}
  }
}
```

The engine returns JSON:

```json
{
  "artifacts": [
    {
      "filename": "scene-001.png",
      "mime_type": "image/png",
      "asset_type": "image",
      "content_base64": "base64-file-content",
      "width": 1024,
      "height": 1024,
      "duration_seconds": null,
      "license_metadata": {"model": "model-id", "license": "license-id"}
    }
  ],
  "result_payload": {},
  "metadata": {"engine": "self-hosted", "model": "model-id"}
}
```

The worker stores returned files in the private `studio-media` bucket, inserts rows in `assets`, stores structured screenplay data in `generation_jobs.result_payload`, and completes the generation job with asset IDs. The engine must enforce output limits and must not return arbitrary URLs for the worker to fetch.

## Cloud MP4 renderer input

A `render` job is handled inside the private worker with FFmpeg; it does not call the AI engine. The worker downloads only project-owned asset IDs from the private Storage bucket.

```json
{
  "width": 1920,
  "height": 1080,
  "fps": 24,
  "burn_subtitles": true,
  "subtitle_srt": "1\n00:00:00,000 --> 00:00:02,000\nExample caption\n",
  "clips": [
    {"track_type": "video", "asset_id": "project-owned-asset-uuid", "duration_seconds": 5},
    {"track_type": "image", "asset_id": "project-owned-image-uuid", "duration_seconds": 4},
    {"track_type": "voice", "asset_id": "project-owned-audio-uuid", "start_seconds": 0, "volume": 1.0},
    {"track_type": "music", "asset_id": "project-owned-music-uuid", "start_seconds": 0, "volume": 0.18},
    {"track_type": "sfx", "asset_id": "project-owned-sfx-uuid", "start_seconds": 3.2, "volume": 0.7}
  ]
}
```

The current renderer concatenates visual clips in supplied order, normalizes video size/FPS, mixes voice/music/SFX tracks, can burn subtitles, and stores MP4 plus optional SRT output in private Storage. It enforces a 15-minute render limit and 4K maximum dimensions. More advanced multi-track positioning, transitions and effects remain future renderer work.

## Supported job families

- `script`: structured screenplay JSON in `result_payload` (no binary artifact required).
- `image`: text-to-image / reference-guided image generation.
- `video`: text/image-to-video, with character and location references supplied in context.
- `speech`: speech generation; lip-sync is intentionally out of scope.
- `music` / `sfx`: soundtrack and effects.
- `render`: final assembly, subtitles, audio mixing and MP4.

One engine endpoint provides a common model interface. Model adapters are selected internally by job input and an allowlisted model registry. Never accept arbitrary model download URLs or arbitrary shell commands from a user job.

## Worker container
Build from the repository root with `docker build -f worker/Dockerfile -t studio-worker worker`. Run it as a private background process, not as a public browser endpoint. The current Render service is a static site and is not a GPU worker; do not attach this worker to it or claim generation is live until a separate worker and self-hosted inference engine are actually running.

## Self-hosted engine service
The FastAPI service and allowlisted adapter registry are in `engine/`. Build its container with `docker build -f engine/Dockerfile -t universal-studio-engine engine`. Run it on the same private network as the worker and set `STUDIO_ENGINE_TOKEN` on both services. The engine exposes authenticated `GET /v1/capabilities` and `POST /v1/generate`. Server operators install adapter modules using `STUDIO_ADAPTER_MODULES`; request bodies cannot supply Python imports, model URLs or shell commands. No adapters are registered by default, so the engine correctly reports `MODEL_NOT_READY` until a model adapter is installed.

## Deployment secrets

Worker environment variables (server-side only):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STUDIO_ENGINE_URL` (private network URL)
- `STUDIO_ENGINE_TOKEN` (optional shared secret)
- `STUDIO_STORAGE_BUCKET=studio-media`

Do not add any of these secrets to the frontend, GitHub source, or chat. The service-role key must remain a secret.

## Retry policy

Jobs use the database's atomic `claim_studio_jobs` RPC and are retried with bounded exponential backoff. Permanent input/engine contract errors fail immediately. Retryable network/engine failures are retried up to each job's configured `max_attempts`.

## Honest runtime status

The worker is deployable code, not proof that a GPU inference engine is running. The engine itself still needs to be deployed on owner-controlled GPU compute with appropriately licensed open-weight models. Render's existing static-site service does not provide GPU inference. Never mark image/video/audio generation active until a real generation request, storage write, and playback test pass.
