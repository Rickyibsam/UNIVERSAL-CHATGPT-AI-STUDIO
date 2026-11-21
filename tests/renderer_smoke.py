from __future__ import annotations

import json
import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('SUPABASE_URL', 'https://example.supabase.co')
os.environ.setdefault('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
from worker import worker


def run(args: list[str]) -> None:
    completed = subprocess.run(args, capture_output=True, text=True, timeout=180)
    if completed.returncode:
        raise RuntimeError((completed.stderr or completed.stdout)[-4000:])


def verify(path: Path, width: int, height: int, fps: int) -> None:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=codec_name,width,height,r_frame_rate,duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=30,
    )
    streams = json.loads(result.stdout).get("streams", [])
    assert streams, "No video stream in rendered file"
    stream = streams[0]
    assert stream["codec_name"] == "h264", stream
    assert int(stream["width"]) == width and int(stream["height"]) == height, stream
    numerator, denominator = map(int, stream["r_frame_rate"].split("/"))
    assert numerator / denominator == fps, stream
    assert float(stream["duration"]) >= 0.9, stream
    assert path.stat().st_size > 1024, "Rendered MP4 is unexpectedly small"


def render_case(folder: Path, name: str, width: int, height: int, fps: int, effect: str) -> None:
    output = folder / f"{name}.mp4"
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r={fps}:d=1",
        "-f", "lavfi", "-i", f"testsrc2=s=320x180:r={fps}:d=1",
        "-filter_complex", effect,
        "-map", "[vout]", "-t", "1",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ])
    verify(output, width, height, fps)


def main() -> None:
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise RuntimeError(f"{binary} is required for renderer smoke tests")
    with tempfile.TemporaryDirectory(prefix="studio-render-smoke-") as temp:
        folder = Path(temp)
        render_case(
            folder, "1080p-slide-chroma", 1920, 1080, 30,
            "[1:v]setpts=PTS-STARTPTS,fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,chromakey=0x00FF00:0.25:0.10,"
            "setsar=1,format=rgba,fade=t=in:st=0:d=0.2:alpha=1,setpts=PTS/1+0/TB[v0];"
            "[0:v][v0]overlay=x='if(lt(t,0.5),main_w*(1-(t-0)/0.5),0)':y=0:"
            "eof_action=pass:shortest=0:enable='between(t,0,1)'[vout]",
        )
        render_case(
            folder, "720p-opacity-keyframes", 1280, 720, 30,
            "[1:v]setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=rgba,"
            "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
            "a='alpha(X,Y)*if(lt(T,0.5),0.2+(1-0.2)*(T-0)/0.5,1)',"
            "fps=30,setsar=1,setpts=PTS/1+0/TB[v0];"
            "[0:v][v0]overlay=x=0:y=0:eof_action=pass:shortest=0:"
            "enable='between(t,0,1)'[vout]",
        )
        render_case(
            folder, "720p-wipe", 1280, 720, 30,
            "[1:v]setpts=PTS-STARTPTS,fps=30,scale=1280:720:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,format=rgba,"
            "scale=w='max(1,iw*min(1,max(0,t/0.5)))':h=ih:eval=frame,"
            "pad=1280:720:0:0:color=black@0,setpts=PTS/1+0/TB[v0];"
            "[0:v][v0]overlay=x=0:y=0:eof_action=pass:shortest=0:"
            "enable='between(t,0,1)'[vout]",
        )
        scale_expr = worker.keyframe_value_expression(
            {"keyframes": [{"frame": 0, "scale": 80}, {"frame": 30, "scale": 120}]},
            "scale", 100.0, 30, "t",
        )
        assert scale_expr, "Renderer did not build the animated scale expression"
        render_case(
            folder, "720p-animated-scale-keyframes", 1280, 720, 30,
            f"[1:v]setpts=PTS-STARTPTS,format=rgba,"
            f"scale=w='iw*({scale_expr})':h='ih*({scale_expr})':eval=frame[v0];"
            "[0:v][v0]overlay=x='(main_w-overlay_w)/2':y='(main_h-overlay_h)/2':"
            "eof_action=pass:shortest=0[vout]",
        )
        render_case(
            folder, "4k-zoom", 3840, 2160, 30,
            "[1:v]setpts=PTS-STARTPTS,fps=30,scale=3840:2160:force_original_aspect_ratio=decrease,"
            "pad=3840:2160:(ow-iw)/2:(oh-ih)/2,setsar=1,format=rgba,"
            "scale=w='iw*(0.8+0.2*max(0,min(1,t/0.5)))':"
            "h='ih*(0.8+0.2*max(0,min(1,t/0.5)))':eval=frame,setpts=PTS/1+0/TB[v0];"
            "[0:v][v0]overlay=x='(main_w-overlay_w)/2':y='(main_h-overlay_h)/2':"
            "eof_action=pass:shortest=0:enable='between(t,0,1)'[vout]",
        )
    print("PASS: 720p opacity/scale keyframes/wipe, 1080p chroma/slide and 4K zoom MP4 render smoke tests")


if __name__ == "__main__":
    main()
