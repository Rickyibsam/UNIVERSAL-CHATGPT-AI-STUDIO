# Self-hosted Studio AI engine contract

This project intentionally does **not** call Gemini, OpenAI, Replicate, Hugging Face Inference, or another hosted free-tier generation API. The worker calls only the owner-operated engine configured with `STUDIO_ENGINE_URL`.

## Worker contract

The worker sends `POST /v1/generate` with:

```json
{
  "contract_version": "1",
  "job": {
    "id": "uuid",
    "type": "image | video | voice | music | sfx | render",
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
  "metadata": {"engine": "self-hosted", "model": "model-id"}
}
```

The worker stores returned files in the private `studio-media` bucket, inserts rows in `assets`, and completes the generation job with asset IDs. The engine must enforce output limits and must not return arbitrary URLs for the worker to fetch.

## Supported job families

- `image`: text-to-image / reference-guided image generation.
- `video`: text/image-to-video, with character and location references supplied in context.
- `voice`: speech generation; lip-sync is intentionally out of scope.
- `music` / `sfx`: soundtrack and effects.
- `render`: final assembly, subtitles, audio mixing and MP4.

One engine endpoint provides a common model interface. Model adapters are selected internally by job input and an allowlisted model registry. Never accept arbitrary model download URLs or arbitrary shell commands from a user job.

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
