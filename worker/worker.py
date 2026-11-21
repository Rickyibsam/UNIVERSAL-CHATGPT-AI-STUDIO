"""Cloud Studio queue worker.

No third-party hosted AI APIs are used. AI generation is delegated only to the
owner-operated inference engine configured by STUDIO_ENGINE_URL. The worker
owns durable queue polling, retry/backoff, artifact ingestion and job state.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote
import socket
import uuid
from typing import Any

import httpx

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("studio-worker")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ENGINE_URL = os.getenv("STUDIO_ENGINE_URL", "").rstrip("/")
ENGINE_TOKEN = os.getenv("STUDIO_ENGINE_TOKEN", "")
HF_T2V_SPACE_ID = os.getenv("HF_T2V_SPACE_ID", "").strip()
HF_TOKEN = os.getenv("HF_TOKEN", "").strip()
BUCKET = os.getenv("STUDIO_STORAGE_BUCKET", "studio-media")
WORKER_ID = os.getenv("WORKER_ID", f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}")
POLL_SECONDS = max(2, int(os.getenv("POLL_SECONDS", "5")))
BATCH_SIZE = max(1, min(10, int(os.getenv("BATCH_SIZE", "2"))))
HTTP_TIMEOUT = max(30, int(os.getenv("ENGINE_TIMEOUT_SECONDS", "1800")))

if not ENGINE_URL:
    log.warning("STUDIO_ENGINE_URL is not configured; generation jobs will be retried safely.")

from datetime import datetime, timedelta, timezone


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def frame_time(value: Any, fps: int, minimum_frames: int = 0) -> float:
    """Snap a non-negative timeline time to the nearest whole output frame."""
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        seconds = 0.0
    if not math.isfinite(seconds):
        seconds = 0.0
    frames = int(math.floor(max(0.0, seconds) * max(1, fps) + 0.5))
    return max(minimum_frames, frames) / max(1, fps)


headers = {
    "apikey": os.getenv("SUPABASE_PUBLISHABLE_KEY", SERVICE_KEY),
    "Authorization": f"Bearer {SERVICE_KEY}" if SERVICE_KEY else "",
    "Content-Type": "application/json",
}


class RetryableJobError(Exception):
    pass


class PermanentJobError(Exception):
    pass


async def request(client: httpx.AsyncClient, method: str, path: str, **kwargs: Any) -> httpx.Response:
    request_headers = kwargs.pop("headers", headers)
    response = await client.request(method, f"{SUPABASE_URL}{path}", headers=request_headers, **kwargs)
    response.raise_for_status()
    return response


async def patch_job(client: httpx.AsyncClient, job_id: str, payload: dict[str, Any]) -> None:
    await request(
        client, "PATCH", f"/rest/v1/generation_jobs?id=eq.{job_id}",
        params={"select": "id"}, json=payload,
        headers={**headers, "Prefer": "return=minimal"},
    )


async def claim_jobs(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await request(
        client, "POST", "/rest/v1/rpc/claim_studio_jobs",
        json={"p_worker_id": WORKER_ID, "p_limit": BATCH_SIZE},
    )
    return response.json() or []


async def load_project_context(client: httpx.AsyncClient, job: dict[str, Any]) -> dict[str, Any]:
    project_id = job["project_id"]
    project = (await request(
        client, "GET", f"/rest/v1/projects?id=eq.{project_id}&select=*"
    )).json()
    if not project:
        raise PermanentJobError("PROJECT_NOT_FOUND")
    context: dict[str, Any] = {"project": project[0]}
    if job.get("scene_id"):
        scenes = (await request(
            client, "GET", f"/rest/v1/scenes?id=eq.{job['scene_id']}&project_id=eq.{project_id}&select=*"
        )).json()
        if not scenes:
            raise PermanentJobError("SCENE_NOT_FOUND")
        context["scene"] = scenes[0]
        ids = scenes[0].get("character_ids") or []
        if ids:
            query = ",".join(ids)
            context["characters"] = (await request(
                client, "GET", f"/rest/v1/characters?id=in.({query})&project_id=eq.{project_id}&select=*"
            )).json()
        location_id = scenes[0].get("location_id")
        if location_id:
            locations = (await request(
                client, "GET", f"/rest/v1/locations?id=eq.{location_id}&project_id=eq.{project_id}&select=*"
            )).json()
            context["location"] = locations[0] if locations else None
    return context


async def upload_file_artifact(
    client: httpx.AsyncClient,
    job: dict[str, Any],
    path: Path,
    filename: str,
    mime: str,
    asset_type: str,
    metadata: dict[str, Any] | None = None,
) -> str:
    size = path.stat().st_size
    if size <= 0 or size > 2 * 1024 * 1024 * 1024:
        raise PermanentJobError("ARTIFACT_SIZE_INVALID")
    asset_id = str(uuid.uuid4())
    name = os.path.basename(filename)
    key = f"{job['project_id']}/{job['id']}/{asset_id}-{name}"

    async def file_chunks():
        with path.open("rb") as handle:
            while True:
                chunk = await asyncio.to_thread(handle.read, 1024 * 1024)
                if not chunk:
                    break
                yield chunk

    upload_headers = {
        **headers,
        "Content-Type": mime,
        "Content-Length": str(size),
        "x-upsert": "false",
    }
    response = await client.put(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}",
        content=file_chunks(),
        headers=upload_headers,
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()
    row = {
        "id": asset_id,
        "project_id": job["project_id"],
        "scene_id": job.get("scene_id"),
        "asset_type": asset_type,
        "storage_key": key,
        "mime_type": mime,
        "size_bytes": size,
        "duration_seconds": (metadata or {}).get("duration_seconds"),
        "width": (metadata or {}).get("width"),
        "height": (metadata or {}).get("height"),
        "source_provider": (metadata or {}).get("source_provider", "self_hosted"),
        "license_metadata": (metadata or {}).get("license_metadata", {"renderer": "ffmpeg"}),
    }
    await request(client, "POST", "/rest/v1/assets", json=row, headers={**headers, "Prefer": "return=minimal"})
    return asset_id


async def upload_artifact(
    client: httpx.AsyncClient, job: dict[str, Any], artifact: dict[str, Any]
) -> str:
    try:
        name = os.path.basename(str(artifact["filename"]))
        mime = str(artifact["mime_type"])
        raw = base64.b64decode(artifact["content_base64"], validate=True)
    except (KeyError, ValueError, TypeError) as exc:
        raise PermanentJobError("INVALID_ENGINE_ARTIFACT") from exc
    if not raw or len(raw) > 2 * 1024 * 1024 * 1024:
        raise PermanentJobError("ARTIFACT_SIZE_INVALID")
    asset_id = str(uuid.uuid4())
    key = f"{job['project_id']}/{job['id']}/{asset_id}-{name}"
    upload_headers = {
        **headers,
        "Content-Type": mime,
        "x-upsert": "false",
    }
    response = await client.put(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}",
        content=raw, headers=upload_headers, timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()
    row = {
        "id": asset_id,
        "project_id": job["project_id"],
        "scene_id": job.get("scene_id"),
        "asset_type": artifact.get("asset_type", job["job_type"]),
        "storage_key": key,
        "mime_type": mime,
        "size_bytes": len(raw),
        "duration_seconds": artifact.get("duration_seconds"),
        "width": artifact.get("width"),
        "height": artifact.get("height"),
        "source_provider": "self_hosted",
        "license_metadata": artifact.get("license_metadata", {}),
    }
    await request(client, "POST", "/rest/v1/assets", json=row,
                  headers={**headers, "Prefer": "return=minimal"})
    return asset_id


async def download_asset(client: httpx.AsyncClient, project_id: str, asset_id: str, folder: Path, index: int) -> tuple[Path, dict[str, Any]]:
    rows = (await request(
        client, "GET",
        f"/rest/v1/assets?id=eq.{asset_id}&project_id=eq.{project_id}&select=*",
    )).json()
    if not rows:
        raise PermanentJobError("RENDER_ASSET_NOT_FOUND")
    asset = rows[0]
    key = str(asset.get("storage_key") or "")
    if not key or not key.startswith(project_id + "/"):
        raise PermanentJobError("RENDER_ASSET_PATH_INVALID")
    response = await client.get(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quote(key, safe='/')}",
        headers=headers,
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()
    suffix = Path(key).suffix or ".bin"
    path = folder / f"input-{index}{suffix}"
    path.write_bytes(response.content)
    return path, asset


def run_ffmpeg(args: list[str]) -> None:
    completed = subprocess.run(args, capture_output=True, text=True, timeout=HTTP_TIMEOUT)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "FFmpeg failed")[-1800:]
        raise RetryableJobError("FFMPEG_RENDER_FAILED: " + detail)


def ffmpeg_text(value: Any) -> str:
    text = str(value or "")
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%").replace(",", ",").replace("[", "\\[").replace("]", "\\]").replace("\n", " ")


def atempo_filters(speed: float) -> str:
    speed = max(0.25, min(4.0, speed))
    factors: list[float] = []
    while speed > 2.0:
        factors.append(2.0)
        speed /= 2.0
    while speed < 0.5:
        factors.append(0.5)
        speed /= 0.5
    factors.append(speed)
    return ",".join(f"atempo={factor:.5f}" for factor in factors)


def keyframe_value_expression(clip: dict[str, Any], field: str, default: float, fps: int, time_var: str) -> str | None:
    raw = clip.get("keyframes")
    if not isinstance(raw, list) or not raw:
        return None
    points: list[tuple[float, float]] = []
    for item in raw[:100]:
        if not isinstance(item, dict):
            continue
        try:
            frame = max(0, min(27000, int(item.get("frame", 0))))
            value = float(item.get(field, default))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(value):
            continue
        if field == "opacity":
            value = max(0.0, min(1.0, value))
        elif field == "scale":
            value = max(0.5, min(2.0, value / 100.0))
        points.append((frame / max(1, fps), value))
    if not points:
        return None
    points.sort(key=lambda point: point[0])
    deduped: list[tuple[float, float]] = []
    for point in points:
        if deduped and point[0] == deduped[-1][0]:
            deduped[-1] = point
        else:
            deduped.append(point)
    if len(deduped) == 1:
        return f"{deduped[0][1]:.6f}"
    expression = f"{deduped[-1][1]:.6f}"
    for index in range(len(deduped) - 2, -1, -1):
        t0, v0 = deduped[index]
        t1, v1 = deduped[index + 1]
        span = max(0.000001, t1 - t0)
        expression = (
            f"if(lt({time_var},{t1:.6f}),"
            f"{v0:.6f}+({v1:.6f}-{v0:.6f})*({time_var}-{t0:.6f})/{span:.6f},"
            f"{expression})"
        )
    first_time, first_value = deduped[0]
    return f"if(lt({time_var},{first_time:.6f}),{first_value:.6f},{expression})"


def render_filter_chain(clip: dict[str, Any], width: int, height: int, fps: int, start: float, duration: float) -> str:
    filters: list[str] = []
    rotation = int(clip.get("rotation") or clip.get("rotate") or 0) % 360
    if rotation in (90, 270):
        filters.append("transpose=1" if rotation == 90 else "transpose=2")
    elif rotation == 180:
        filters.append("hflip,vflip")
    fit = str(clip.get("fit") or "contain")
    chroma = str(clip.get("chroma_key") or "off").lower()
    if chroma in ("green", "blue"):
        color = "0x00FF00" if chroma == "green" else "0x0000FF"
        similarity = max(0.05, min(0.8, float(clip.get("chroma_similarity") or 0.25)))
        blend = max(0.0, min(0.5, float(clip.get("chroma_blend") or 0.1)))
        filters.append(f"chromakey={color}:{similarity:.3f}:{blend:.3f}")
    if fit == "cover":
        filters.append(f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}")
    else:
        filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")
    preset = str(clip.get("filter") or "none")
    filter_map = {
        "none": "",
        "contrast(1.18) saturate(1.25)": "eq=contrast=1.18:saturation=1.25",
        "sepia(.75) contrast(1.1)": "colorchannelmixer=.393:.769:.189:.349:.686:.168:.272:.534:.131,eq=contrast=1.1",
        "grayscale(1)": "hue=s=0",
        "brightness(1.2) saturate(.8)": "eq=brightness=0.12:saturation=0.8",
        "contrast(1.35) saturate(.75)": "eq=contrast=1.35:saturation=0.75",
        "hue-rotate(35deg) saturate(1.4)": "hue=h=35:s=1.4",
        "blur(1.2px)": "gblur=sigma=1.2",
        "brightness(1.1) contrast(1.25) saturate(1.5)": "eq=brightness=0.08:contrast=1.25:saturation=1.5",
        "sepia(.35) hue-rotate(320deg) saturate(1.4)": "colorbalance=rs=.12:gs=.03:bs=-.08,eq=saturation=1.4",
        "grayscale(1) contrast(1.5)": "hue=s=0,eq=contrast=1.5",
        "saturate(1.8) contrast(1.08)": "eq=saturation=1.8:contrast=1.08",
        "brightness(.82) contrast(1.35)": "eq=brightness=-.12:contrast=1.35",
    }
    mapped = filter_map.get(preset)
    if mapped:
        filters.append(mapped)
    speed = max(0.25, min(4.0, float(clip.get("speed") or 1)))
    trim_in = max(0.0, min(3600.0, float(clip.get("trim_in_seconds", clip.get("trimIn", 0)) or 0)))
    filters.append("setpts=PTS-STARTPTS")
    filters.append("format=rgba")
    opacity_default = max(0.0, min(1.0, float(clip.get("opacity", 1) if clip.get("opacity") is not None else 1)))
    scale_default = max(0.5, min(2.0, float(clip.get("scale", 100) or 100) / 100.0))
    opacity_expr = keyframe_value_expression(clip, "opacity", opacity_default, fps, "T")
    scale_expr = keyframe_value_expression(clip, "scale", scale_default * 100.0, fps, "t")
    if scale_expr:
        filters.append(f"scale=w='iw*({scale_expr})':h='ih*({scale_expr})':eval=frame")
    elif abs(scale_default - 1.0) > 0.0001:
        filters.append(f"scale=iw*{scale_default:.6f}:ih*{scale_default:.6f}")
    if opacity_expr or abs(opacity_default - 1.0) > 0.0001:
        opacity_value = opacity_expr or f"{opacity_default:.6f}"
        filters.append(f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*({opacity_value})'")
    filters.extend([
        f"fps={fps}",
        "setsar=1",
        "format=rgba",
    ])
    fade = max(0.0, min(5.0, float(clip.get("fade_seconds", clip.get("fade", 0)) or 0)))
    transition = str(clip.get("transition") or "None").lower()
    if transition == "zoom":
        local_t = "max(0,min(1,t/0.5))"
        filters.append(f"scale=w='iw*(0.8+0.2*{local_t})':h='ih*(0.8+0.2*{local_t})':eval=frame")
    elif transition == "wipe":
        progress = "min(1,max(0,t/0.5))"
        filters.append(
            f"scale=w='max(1,iw*{progress})':h=ih:eval=frame,"
            f"pad={width}:{height}:0:0:color=black@0"
        )
    if fade > 0 or transition in ("fade", "dissolve"):
        fade_duration = min(fade if fade > 0 else 0.5, duration / 2)
        if fade_duration > 0:
            filters.append(f"fade=t=in:st=0:d={fade_duration:.5f}:alpha=1")
            filters.append(f"fade=t=out:st={max(0.0, duration - fade_duration):.5f}:d={fade_duration:.5f}:alpha=1")
    text = str(clip.get("text") or "")
    if text:
        safe_text = ffmpeg_text(text)[:500]
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        size = max(12, min(120, int(clip.get("text_size", 42) or 42)))
        position = str(clip.get("text_position") or clip.get("textPosition") or "center")
        y = "h-text_h-80" if position == "bottom" else "40" if position == "top" else "(h-text_h)/2"
        filters.append(
            f"drawtext=fontfile={font}:text='{safe_text}':fontcolor=white:fontsize={size}:"
            f"x=(w-text_w)/2:y={y}:box=1:boxcolor=black@0.38:boxborderw=12"
        )
    filters.append(f"setpts=PTS/{speed:.5f}+{start:.5f}/TB")
    return ",".join(filters)


async def render_timeline(client: httpx.AsyncClient, job: dict[str, Any]) -> dict[str, Any]:
    params = job.get("input_parameters") or {}
    timeline = params.get("timeline") if isinstance(params.get("timeline"), dict) else params
    clips = timeline.get("clips") if isinstance(timeline, dict) else None
    if not isinstance(clips, list) or not clips or len(clips) > 100:
        raise PermanentJobError("RENDER_TIMELINE_INVALID")

    width = max(320, min(3840, int(timeline.get("width") or 1920)))
    height = max(240, min(2160, int(timeline.get("height") or 1080)))
    fps = max(12, min(60, int(timeline.get("fps") or 30)))
    visual = [x for x in clips if x.get("track_type", x.get("track", "video")) in ("video", "image", "overlay")]
    audio = [x for x in clips if x.get("track_type", x.get("track")) in ("voice", "music", "sfx", "audio")]
    if not visual:
        raise PermanentJobError("RENDER_REQUIRES_VISUAL_CLIPS")

    visual_layout: list[tuple[dict[str, Any], float, float, float]] = []
    cursor = 0.0
    for clip in visual:
        source_duration = max(0.1, min(120, float(clip.get("duration_seconds") or (float(clip.get("trimOut", 0)) - float(clip.get("trimIn", 0))) or 5)))
        speed = max(0.25, min(4.0, float(clip.get("speed") or 1)))
        source_duration = frame_time(source_duration, fps, 1)
        display_duration = frame_time(source_duration / speed, fps, 1)
        start_seconds = min(900.0, frame_time(clip.get("start_seconds", clip.get("start", cursor)), fps))
        visual_layout.append((clip, start_seconds, source_duration, display_duration))
        cursor = max(cursor, start_seconds + display_duration)
    for clip in audio:
        audio_source_duration = max(0.1, min(900.0, float(clip.get("duration_seconds") or (float(clip.get("trimOut", 0)) - float(clip.get("trimIn", 0))) or 30)))
        audio_speed = max(0.25, min(4.0, float(clip.get("speed") or 1)))
        audio_source_duration = frame_time(audio_source_duration, fps, 1)
        audio_start = min(900.0, frame_time(clip.get("start_seconds", clip.get("start", 0)), fps))
        cursor = max(cursor, audio_start + frame_time(audio_source_duration / audio_speed, fps, 1))
    total_duration = cursor
    if total_duration <= 0 or total_duration > 900:
        raise PermanentJobError("RENDER_DURATION_LIMIT_EXCEEDED")

    with tempfile.TemporaryDirectory(prefix="studio-render-") as temp:
        folder = Path(temp)
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                   "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r={fps}:d={total_duration}"]
        visual_inputs: list[tuple[dict[str, Any], Path, dict[str, Any], float, float, float]] = []
        audio_inputs: list[tuple[dict[str, Any], Path, dict[str, Any]]] = []
        all_clips = [x[0] for x in visual_layout] + audio
        downloaded: dict[str, tuple[Path, dict[str, Any]]] = {}
        for index, clip in enumerate(all_clips):
            asset_id = str(clip.get("asset_id") or "")
            if not asset_id:
                raise PermanentJobError("RENDER_CLIP_ASSET_ID_REQUIRED")
            if asset_id not in downloaded:
                downloaded[asset_id] = await download_asset(client, str(job["project_id"]), asset_id, folder, index)
            path, asset = downloaded[asset_id]
            visual_entry = next((x for x in visual_layout if x[0] is clip), None)
            if visual_entry is not None:
                _, start_seconds, source_duration, display_duration = visual_entry
                visual_inputs.append((clip, path, asset, start_seconds, source_duration, display_duration))
            else:
                audio_inputs.append((clip, path, asset))

        for clip, path, asset, _start, source_duration, _display_duration in visual_inputs:
            if (asset.get("mime_type") or "").startswith("image/"):
                trim_in = max(0.0, float(clip.get("trim_in_seconds", clip.get("trimIn", 0)) or 0))
                command += ["-loop", "1", "-t", str(source_duration + trim_in), "-i", str(path)]
            else:
                command += ["-i", str(path)]

        for clip, path, _asset in audio_inputs:
            command += ["-i", str(path)]

        filters: list[str] = ["[0:v]format=rgba[base0]"]
        current_base = "base0"
        for index, (clip, _path, asset, start_seconds, source_duration, display_duration) in enumerate(visual_inputs):
            input_index = index + 1
            trim_in = min(3600.0, frame_time(clip.get("trim_in_seconds", clip.get("trimIn", 0)), fps))
            label = f"v{index}"
            chain = render_filter_chain(clip, width, height, fps, start_seconds, display_duration)
            filters.append(f"[{input_index}:v]trim=start={trim_in:.5f}:duration={source_duration:.5f},{chain}[{label}]")
            next_base = f"mixv{index}"
            end_seconds = start_seconds + display_duration
            transition = str(clip.get("transition") or "None").lower()
            if transition == "slide left":
                overlay_x = f"if(lt(t,{start_seconds + 0.5:.5f}),main_w*(1-(t-{start_seconds:.5f})/0.5),0)"
                overlay_y = "0"
            elif transition == "slide right":
                overlay_x = f"if(lt(t,{start_seconds + 0.5:.5f}),-main_w*(1-(t-{start_seconds:.5f})/0.5),0)"
                overlay_y = "0"
            elif transition == "zoom" or abs(float(clip.get("scale", 100) or 100) - 100.0) > 0.001 or any(isinstance(k, dict) and "scale" in k for k in (clip.get("keyframes") or [])):
                overlay_x = "(main_w-overlay_w)/2"
                overlay_y = "(main_h-overlay_h)/2"
            else:
                overlay_x = "0"
                overlay_y = "0"
            filters.append(
                f"[{current_base}][{label}]overlay=x='{overlay_x}':y='{overlay_y}':eof_action=pass:shortest=0:"
                f"enable='between(t,{start_seconds:.5f},{end_seconds:.5f})'[{next_base}]"
            )
            current_base = next_base

        audio_labels: list[str] = []
        input_offset = 1 + len(visual_inputs)
        for index, (clip, _path, _asset) in enumerate(audio_inputs):
            input_id = input_offset + index
            start_seconds = min(900.0, frame_time(clip.get("start_seconds", clip.get("start", 0)), fps))
            trim_in = min(3600.0, frame_time(clip.get("trim_in_seconds", clip.get("trimIn", 0)), fps))
            duration = min(900.0, frame_time(clip.get("duration_seconds") or (float(clip.get("trimOut", 0)) - float(clip.get("trimIn", 0))) or 30, fps, 1))
            volume = max(0.0, min(4.0, float(clip.get("volume", 1.0))))
            speed = max(0.25, min(4.0, float(clip.get("speed") or 1)))
            delay = round(start_seconds * 1000)
            label = f"a{index}"
            filters.append(
                f"[{input_id}:a]atrim=start={trim_in:.5f}:duration={duration:.5f},"
                f"asetpts=PTS-STARTPTS,{atempo_filters(speed)},adelay={delay}|{delay},"
                f"volume={volume:.4f},aresample=48000[{label}]"
            )
            audio_labels.append(f"[{label}]")
        if audio_labels:
            filters.append("".join(audio_labels) + f"amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=2,alimiter=limit=0.95[aout]")
        else:
            filters.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={total_duration}[aout]")

        subtitle_text = str(timeline.get("subtitle_srt") or "")
        subtitle_path = None
        video_map = f"[{current_base}]"
        if subtitle_text:
            if len(subtitle_text) > 2_000_000:
                raise PermanentJobError("SUBTITLE_FILE_TOO_LARGE")
            subtitle_path = folder / "captions.srt"
            subtitle_path.write_text(subtitle_text, encoding="utf-8")
            if timeline.get("burn_subtitles", True):
                filters.append(f"{video_map}subtitles='{subtitle_path.as_posix()}'[vsub]")
                video_map = "[vsub]"

        output = folder / "final.mp4"
        command += [
            "-filter_complex", ";".join(filters),
            "-map", video_map, "-map", "[aout]", "-t", str(total_duration),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", str(output),
        ]
        await asyncio.to_thread(run_ffmpeg, command)
        if not output.exists() or output.stat().st_size < 1024:
            raise RetryableJobError("FFMPEG_OUTPUT_MISSING")
        output_asset_id = await upload_file_artifact(
            client, job, output, "final.mp4", "video/mp4", "video",
            {"width": width, "height": height, "duration_seconds": total_duration,
             "license_metadata": {"renderer": "ffmpeg", "source": "owner_cloud_worker"}},
        )
        output_ids = [output_asset_id]
        if subtitle_path and subtitle_path.exists() and not timeline.get("burn_subtitles", True):
            subtitle_id = await upload_file_artifact(
                client, job, subtitle_path, "captions.srt", "application/x-subrip", "subtitle",
                {"license_metadata": {"source": "user_project"}},
            )
            output_ids.append(subtitle_id)
        return {
            "artifacts": [],
            "uploaded_asset_ids": output_ids,
            "result_payload": {"duration_seconds": total_duration, "width": width, "height": height, "format": "mp4"},
            "metadata": {"engine": "self-hosted-ffmpeg", "renderer": "libx264+aac", "timeline_mode": "positioned-multitrack"},
        }



def _find_gradio_video_path(value: Any) -> Path | None:
    """Extract a locally downloaded Gradio Video output; never fetch arbitrary URLs."""
    if isinstance(value, str):
        candidate = Path(value)
        if candidate.is_file() and candidate.suffix.lower() in {".mp4", ".webm", ".mov"}:
            return candidate
        return None
    if isinstance(value, dict):
        for key in ("path", "video", "name"):
            if key in value:
                found = _find_gradio_video_path(value[key])
                if found:
                    return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = _find_gradio_video_path(item)
            if found:
                return found
    return None


def _call_wan_zero_gpu(prompt: str, negative_prompt: str, seed: int, guidance: float, steps: int) -> Path:
    if not HF_T2V_SPACE_ID:
        raise PermanentJobError("WAN_ZERO_GPU_SPACE_NOT_CONFIGURED")
    try:
        from gradio_client import Client
        client = Client(HF_T2V_SPACE_ID, hf_token=HF_TOKEN or None, verbose=False)
        result = client.predict(
            prompt[:6000], negative_prompt[:1500], int(seed),
            float(guidance), int(steps), api_name="/generate",
        )
    except Exception as exc:
        message = str(exc).lower()
        if any(term in message for term in ("quota", "exceeded", "rate limit", "gpu")):
            raise RetryableJobError("WAN_ZERO_GPU_QUOTA_OR_CAPACITY: " + str(exc)[:300]) from exc
        raise RetryableJobError("WAN_ZERO_GPU_REQUEST_FAILED: " + str(exc)[:300]) from exc
    path = _find_gradio_video_path(result)
    if not path or not path.exists() or path.stat().st_size < 1024:
        raise PermanentJobError("WAN_ZERO_GPU_RETURNED_NO_VIDEO_FILE")
    return path


async def run_wan_zero_gpu_video(job: dict[str, Any], output_dir: Path) -> tuple[Path, dict[str, Any]]:
    params = job.get("input_parameters") or {}
    settings = params.get("settings") if isinstance(params.get("settings"), dict) else {}
    prompt = str(params.get("prompt") or "").strip()
    if not prompt:
        raise PermanentJobError("VIDEO_PROMPT_REQUIRED")
    style = str(settings.get("style") or "").strip()
    setting = str(settings.get("setting") or "").strip()
    characters = settings.get("characters") if isinstance(settings.get("characters"), list) else []
    character_notes = [str(x.get("description") or x.get("name") or "") for x in characters if isinstance(x, dict)]
    scene_notes = []
    for scene in settings.get("scenes", []) if isinstance(settings.get("scenes"), list) else []:
        if isinstance(scene, dict):
            note = str(scene.get("visual_prompt") or scene.get("title") or "").strip()
            if note:
                scene_notes.append(note)
    enriched = "\n".join(x for x in [
        prompt,
        ("Visual style: " + style) if style else "",
        ("Setting: " + setting) if setting else "",
        ("Character continuity: " + "; ".join(character_notes[:8])) if character_notes else "",
        ("Scene direction: " + "; ".join(scene_notes[:8])) if scene_notes else "",
    ] if x)
    negative = str(settings.get("negative_prompt") or "low quality, blurry, flicker, distorted anatomy, duplicate subjects, text, watermark")
    seed = int.from_bytes(job["id"].encode("utf-8")[:4].ljust(4, b"0"), "big") % 2147483647
    guidance = max(1.0, min(10.0, float(settings.get("guidance_scale") or 5.0)))
    steps = max(8, min(30, int(settings.get("num_inference_steps") or 20)))
    source = await asyncio.to_thread(_call_wan_zero_gpu, enriched, negative, seed, guidance, steps)
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / "wan21-generated.mp4"
    await asyncio.to_thread(target.write_bytes, source.read_bytes())
    return target, {
        "duration_seconds": 81 / 15,
        "width": 832,
        "height": 480,
        "source_provider": "huggingface_zero_gpu",
        "license_metadata": {
            "model": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
            "license": "Apache-2.0",
            "provider": "Hugging Face Spaces ZeroGPU"
        }
    }


async def run_engine(client: httpx.AsyncClient, job: dict[str, Any]) -> dict[str, Any]:
    if not ENGINE_URL:
        raise RetryableJobError("SELF_HOSTED_ENGINE_NOT_CONFIGURED")
    context = await load_project_context(client, job)
    engine_headers = {"Content-Type": "application/json"}
    if ENGINE_TOKEN:
        engine_headers["Authorization"] = f"Bearer {ENGINE_TOKEN}"
    payload = {
        "contract_version": "1",
        "job": {
            "id": job["id"],
            "type": job["job_type"],
            "scene_id": job.get("scene_id"),
            "attempt": job.get("attempt_count", 1),
            "input": job.get("input_parameters") or {},
        },
        "context": context,
    }
    try:
        response = await client.post(
            f"{ENGINE_URL}/v1/generate",
            json=payload, headers=engine_headers, timeout=HTTP_TIMEOUT,
        )
        if response.status_code in (408, 425, 429, 500, 502, 503, 504):
            raise RetryableJobError(f"ENGINE_HTTP_{response.status_code}")
        if response.status_code >= 400:
            raise PermanentJobError(f"ENGINE_HTTP_{response.status_code}")
        result = response.json()
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise RetryableJobError("ENGINE_UNAVAILABLE") from exc
    if not isinstance(result, dict):
        raise PermanentJobError("INVALID_ENGINE_RESPONSE")
    if not result.get("artifacts") and not result.get("result_payload"):
        raise PermanentJobError("ENGINE_RETURNED_NO_OUTPUT")
    return result


async def process_job(client: httpx.AsyncClient, job: dict[str, Any]) -> None:
    job_id = job["id"]
    try:
        await patch_job(client, job_id, {"status": "running", "progress_percent": 5, "heartbeat_at": utc_now()})
        ids: list[str] = []
        if job.get("job_type") == "render":
            result = await render_timeline(client, job)
        elif job.get("job_type") == "video" and HF_T2V_SPACE_ID:
            with tempfile.TemporaryDirectory(prefix="studio-wan-") as temp_dir:
                video_path, video_meta = await run_wan_zero_gpu_video(job, Path(temp_dir))
                ids.append(await upload_file_artifact(
                    client, job, video_path, "wan21-generated.mp4", "video/mp4", "video", video_meta
                ))
            result = {
                "result_payload": {"model": "Wan2.1-T2V-1.3B", "duration_seconds": video_meta["duration_seconds"], "resolution": "832x480"},
                "metadata": {"provider": "huggingface_zero_gpu", "model": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", "license": "Apache-2.0"}
            }
        else:
            result = await run_engine(client, job)
        ids.extend(list(result.get("uploaded_asset_ids") or []))
        artifacts = result.get("artifacts") or []
        for index, artifact in enumerate(artifacts):
            ids.append(await upload_artifact(client, job, artifact))
            progress = 10 + int(80 * (index + 1) / max(1, len(artifacts)))
            await patch_job(client, job_id, {
                "progress_percent": progress,
                "heartbeat_at": utc_now(),
            })
        await patch_job(client, job_id, {
            "status": "succeeded",
            "progress_percent": 100,
            "output_asset_ids": ids,
            "result_payload": result.get("result_payload") or {},
            "provider_metadata": result.get("metadata", {}),
            "finished_at": utc_now(),
            "locked_at": None,
            "locked_by": None,
            "heartbeat_at": None,
            "error_code": None,
            "error_message": None,
        })
        log.info("job completed id=%s type=%s artifacts=%d", job_id, job["job_type"], len(ids))
    except PermanentJobError as exc:
        await patch_job(client, job_id, {
            "status": "failed", "error_code": str(exc)[:80],
            "error_message": str(exc)[:500], "finished_at": utc_now(),
            "locked_at": None, "locked_by": None, "heartbeat_at": None,
        })
        log.error("job permanently failed id=%s code=%s", job_id, exc)
    except Exception as exc:
        attempts = int(job.get("attempt_count") or 1)
        max_attempts = int(job.get("max_attempts") or 3)
        retryable = bool(job.get("retryable", True))
        if retryable and attempts < max_attempts:
            delay = min(3600, 15 * (2 ** max(0, attempts - 1)))
            retry_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
            await patch_job(client, job_id, {
                "status": "queued", "available_at": retry_at,
                "error_code": "RETRYABLE_FAILURE",
                "error_message": str(exc)[:500],
                "locked_at": None, "locked_by": None, "heartbeat_at": None,
                "progress_percent": 0,
            })
            log.warning("job retry scheduled id=%s attempt=%s delay=%s", job_id, attempts, delay)
        else:
            await patch_job(client, job_id, {
                "status": "failed", "error_code": "JOB_FAILED",
                "error_message": str(exc)[:500], "finished_at": utc_now(),
                "locked_at": None, "locked_by": None, "heartbeat_at": None,
            })
            log.exception("job failed id=%s", job_id)


async def main() -> None:
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
    async with httpx.AsyncClient(timeout=60, limits=limits) as client:
        log.info("worker started id=%s poll=%ss batch=%s", WORKER_ID, POLL_SECONDS, BATCH_SIZE)
        while True:
            try:
                jobs = await claim_jobs(client)
                if jobs:
                    await asyncio.gather(*(process_job(client, job) for job in jobs))
                else:
                    await asyncio.sleep(POLL_SECONDS)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("queue polling failed")
                await asyncio.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
