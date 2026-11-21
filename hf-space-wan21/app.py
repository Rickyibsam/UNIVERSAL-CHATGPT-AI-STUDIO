import os
import tempfile

import gradio as gr
import spaces
import torch
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
from diffusers.utils import export_to_video

MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"

vae = AutoencoderKLWan.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(MODEL_ID, vae=vae, torch_dtype=torch.bfloat16)
pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=5.0)
pipe.to("cuda")


@spaces.GPU(duration=300)
def generate_video(prompt: str, negative_prompt: str, seed: int, guidance_scale: float, inference_steps: int):
    prompt = (prompt or "").strip()
    if not prompt:
        raise gr.Error("Enter a video prompt.")
    if len(prompt) > 6000:
        raise gr.Error("Prompt is too long (maximum 6000 characters).")
    seed = max(0, min(2147483647, int(seed)))
    guidance_scale = max(1.0, min(10.0, float(guidance_scale)))
    inference_steps = max(8, min(30, int(inference_steps)))
    generator = torch.Generator(device="cuda").manual_seed(seed)
    result = pipe(
        prompt=prompt,
        negative_prompt=(negative_prompt or "")[:1500],
        height=480,
        width=832,
        num_frames=81,
        guidance_scale=guidance_scale,
        num_inference_steps=inference_steps,
        generator=generator,
    )
    frames = result.frames[0]
    handle, output_path = tempfile.mkstemp(prefix="wan21-", suffix=".mp4")
    os.close(handle)
    export_to_video(frames, output_path, fps=15)
    if not os.path.isfile(output_path) or os.path.getsize(output_path) < 1024:
        raise gr.Error("The model did not produce a valid MP4 file.")
    return output_path


demo = gr.Interface(
    fn=generate_video,
    inputs=[
        gr.Textbox(label="Video prompt", lines=5, max_lines=12),
        gr.Textbox(label="Negative prompt", lines=2, value="low quality, blurry, flicker, distorted anatomy, duplicate subjects, text, watermark"),
        gr.Number(label="Seed", value=42, precision=0),
        gr.Slider(label="Guidance scale", minimum=1, maximum=10, value=5, step=0.5),
        gr.Slider(label="Inference steps", minimum=8, maximum=30, value=20, step=1),
    ],
    outputs=gr.Video(label="Generated MP4"),
    title="Universal Studio — Wan2.1 Text to Video",
    description="Real text-to-video generation with Wan2.1 1.3B. Output: 832×480, 15 FPS, approximately 5.4 seconds. Free ZeroGPU capacity is shared and rate-limited.",
    api_name="generate",
)

if __name__ == "__main__":
    demo.launch()
