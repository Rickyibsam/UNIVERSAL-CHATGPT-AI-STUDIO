# Local AI setup (free-first)

This static website does not contain a GPU. The local adapters let your own computer run open models without sending generation requests to a paid hosted API.

## 1. Local screenplay generation with Ollama

1. Install Ollama for Windows from https://ollama.com/download.
2. Open PowerShell and download a small instruction model:
   `ollama pull qwen2.5:3b`
3. Confirm it is available:
   `ollama list`
4. Ollama normally serves its API at `http://127.0.0.1:11434`.
5. The hosted Studio page needs browser CORS access. Ollama documents `OLLAMA_ORIGINS` for allowing extra web origins. Configure the exact Studio origin:
   `https://universal-chatgpt-ai-studio.onrender.com`
   For example, in a PowerShell session before starting Ollama:
   `$env:OLLAMA_ORIGINS="https://universal-chatgpt-ai-studio.onrender.com"`
   `ollama serve`
6. In the Studio Story & Screenplay panel, enter the Ollama URL and model name, then click **Generate with my local AI model**.

If Ollama is already running as a Windows service, update its environment through Windows service settings and restart it instead of starting a second copy. Never expose port 11434 publicly or through an unauthenticated tunnel.

## 2. Optional local image generation with ComfyUI

1. Install ComfyUI locally using its official installation instructions: https://docs.comfy.org/installation.
2. Install only model workflows and custom nodes you trust. Check every model and node license before commercial use.
3. Start ComfyUI bound to localhost and allow only the Studio origin for CORS. Current ComfyUI server documentation describes `--enable-cors-header`; use the exact origin above, not a wildcard, where supported.
4. In ComfyUI, build and test a workflow for one task: image, video, speech, music or lip-sync.
5. Export the workflow in **API format** (not the regular UI workflow format).
6. Paste that JSON into the Studio Provider Connections panel. In the text node that receives your prompt, replace its prompt value with the literal placeholder `{{PROMPT}}`. Optional placeholders are `{{NEGATIVE_PROMPT}}`, `{{SEED}}`, `{{DURATION}}`, `{{WIDTH}}` and `{{HEIGHT}}`. For reference-conditioned workflows, select a project image in the Studio and use `{{REFERENCE_IMAGE}}` as the `LoadImage` node's image filename; connect that node to your model's IP-Adapter, ControlNet or reference-conditioning path.
7. Choose the generation type, enter the shot/audio prompt, save settings and run the local workflow.
8. When ComfyUI finishes and returns supported output nodes, the Studio downloads the output and saves it to the signed-in project's private media library.

The Studio pre-fills a basic text-to-image graph. Replace `YOUR_CHECKPOINT.safetensors` with the exact checkpoint filename installed in your ComfyUI models/checkpoints folder before running it. The workflow JSON must be valid for your installed ComfyUI version and custom nodes. Only image generation is exposed in the current Studio workflow selector. AI video generation and lip-sync are intentionally excluded from this build. The Studio cannot guess a valid graph for every custom node pack.

ComfyUI API reference: https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/comms_routes.mdx

## 3. Low-spec voice preview and procedural audio

The Audio Studio uses the browser Speech Synthesis API to preview narration with voices already installed on Windows. This is playback only; browser speech voices are not exported as audio files. The Studio can generate simple original procedural music beds and sound effects (cinematic, ambient, suspense, whoosh, impact, sparkle and rain) as WAV files using the browser OfflineAudioContext. These are synthesized audio patterns, not neural AI music generation. Download the WAV and upload it through Media Library to add it to the project.

For the i5-8265U / 8 GB RAM laptop, use this low-spec audio path and avoid running large local video diffusion models. The local Qwen 2.5 3B screenplay model may still be slow; close other applications and allow it time to respond.

## 4. Character and location consistency

- Create each recurring character in Character Studio with a detailed description, voice profile and continuity rules.
- Use the same character reference image(s) in the ComfyUI workflow for every shot when the chosen model supports image references, IP-Adapter, ControlNet, reference conditioning or character LoRAs.
- Keep the same seed and model-specific identity/reference settings where appropriate.
- Reuse the same world/location description and lighting/camera rules.
- A text prompt alone cannot guarantee identical faces or clothing across independently generated clips. Review every shot and regenerate failures.

## 5. Media, timeline and recovery

- Sign in and save a cloud project before uploading files.
- Uploaded files go to the private `studio-media` Storage bucket. Access is restricted by project ownership.
- Create a timeline from saved scenes. Link uploaded media assets to clips, adjust start, duration and trim, then save.
- Export the timeline manifest as an editable EDL-style JSON file and export draft subtitles as WebVTT.
- Create recovery points before major changes. Restoring a point loads its snapshot into the editor; save it after review to persist the restored version.

## 6. Rendering and quality

The hosted Studio does not run GPU video diffusion or a hosted MP4/4K render worker. It can download a local PowerShell FFmpeg render kit that assembles linked image/video clips, audio tracks and draft subtitles on the user's PC. This requires FFmpeg installed locally, generated media linked to timeline clips, and adequate disk space. It has not yet passed a full real-project render test. Media-level automated QC remains pending.

A browser page hosted on Render cannot use Render's CPU/static-site build to run your computer's GPU. For local generation, your computer must stay awake with Ollama/ComfyUI running. No paid provider is enabled by this project. Lip-sync is intentionally omitted.

## 7. Security

- Do not paste provider secrets or Supabase secret/service-role keys into the browser.
- Keep Ollama and ComfyUI bound to localhost; do not expose their ports to the public internet.
- Only use media you own or have permission to use.
- Review model, voice and music licenses, and obtain consent before voice cloning or using someone's likeness.
