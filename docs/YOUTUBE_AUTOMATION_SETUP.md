# Daily Video Production (Manual YouTube Upload)

The Studio does not connect to YouTube and does not upload or publish videos. The user downloads generated files and manually uploads them.

## Current workflow
1. Sign in and create/save a cloud production.
2. Open **Daily Video Production**.
3. Enter a prompt or select one of the learning/story templates.
4. Queue a video generation job. It is stored in the existing project-scoped `generation_jobs` queue.
5. Follow status in Generation History. Failed jobs can be retried.
6. Download generated assets from private Supabase Storage using short-lived signed URLs.
7. Prepare and download the JSON metadata package (title, description, tags, format and disclosure reminder).
8. Upload manually on YouTube.

## Runtime requirements and honest limitations
- The worker supports Wan2.1 T2V 1.3B through Hugging Face Spaces ZeroGPU only when `HF_T2V_SPACE_ID` is configured on the worker and the Space is available. This path produces a short 832×480, 15 FPS clip (about 5.4 seconds), not a complete long-form video.
- Alternatively, `STUDIO_ENGINE_URL` must point to an owner-operated inference engine with installed, licensed model adapters.
- The engine registry currently has no default adapters. Do not mark a generation complete unless the worker returns a real artifact and it is stored and verified.
- Daily target/time preferences are saved in the current browser only. No unattended daily scheduler is deployed.
- Long-form scene generation, consistent character references, generated speech, music/SFX, lip-sync, thumbnail generation, complete final MP4 assembly and 1080p/4K quality verification are not yet verified end-to-end.
- The existing FFmpeg renderer can assemble project-owned timeline assets, but it does not create AI source media by itself.

## Legacy YouTube tables/function
Older database tables and the `youtube-automation` Edge Function may remain from an earlier experiment. The new UI does not call them. They are not needed for manual video generation or download. They are intentionally not dropped to avoid destructive changes to existing project data.
