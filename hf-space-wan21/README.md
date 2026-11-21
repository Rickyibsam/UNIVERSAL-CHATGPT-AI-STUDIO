---
title: Universal Studio Wan2.1 Text-to-Video
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: gradio
sdk_version: 6.27.0
python_version: "3.12"
app_file: app.py
pinned: false
license: apache-2.0
startup_duration_timeout: 1h
---

# Universal Studio — Wan2.1 Text-to-Video

This Space runs the Apache-2.0 Wan-AI/Wan2.1-T2V-1.3B-Diffusers model. It produces a real MP4 from a text prompt (832×480, 15 FPS, 81 frames / about 5.4 seconds).

## Setup

1. Create a Hugging Face Space using the Gradio SDK.
2. In Space Settings, select ZeroGPU hardware. Free personal accounts in good standing can host up to two ZeroGPU Spaces; usage remains subject to daily quota and queue limits.
3. Upload the files in this folder to the Space root, or use the repository's manual Deploy Wan2.1 Space GitHub Action after configuring its HF_TOKEN secret and HF_SPACE_ID repository variable.
4. Wait for the initial model download/build. The model is large, so first startup may take a while.
5. The Gradio API endpoint is /generate and accepts prompt, negative prompt, seed, guidance scale, and inference steps.

## Runtime notes

- The app requests up to 300 seconds of ZeroGPU execution per generation.
- A free Hugging Face account currently has a limited daily ZeroGPU allowance; this is not unlimited hosting.
- This Space does not use the user's local computer or local GPU.
- Model weights are not bundled in this repository; they are downloaded from the official model repository at Space startup.
- No paid inference provider is called.

## License

The model is published under Apache-2.0. See the model card and license for full terms: https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B-Diffusers
