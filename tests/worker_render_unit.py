from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")

from worker import worker


def main() -> None:
    assert worker.frame_time(1.001, 30) == 1.0
    assert worker.frame_time(1.02, 30) == 31 / 30
    assert worker.frame_time(-1, 24) == 0
    assert worker.frame_time(0, 60, 1) == 1 / 60

    expression = worker.keyframe_value_expression(
        {"keyframes": [{"frame": 0, "opacity": 0.2}, {"frame": 30, "opacity": 1.0}]},
        "opacity", 1.0, 30, "T",
    )
    assert expression and "1.000000" in expression and "0.200000" in expression

    scale = worker.keyframe_value_expression(
        {"keyframes": [{"frame": 0, "scale": 80}, {"frame": 30, "scale": 120}]},
        "scale", 100.0, 30, "t",
    )
    assert scale and "0.800000" in scale and "1.200000" in scale

    chain = worker.render_filter_chain({
        "chroma_key": "green", "chroma_similarity": 0.3, "chroma_blend": 0.1,
        "keyframes": [{"frame": 0, "scale": 80}, {"frame": 30, "scale": 120}],
        "transition": "Fade", "fade": 0.2, "filter": "grayscale(1)",
    }, 1280, 720, 30, 0, 2)
    assert "chromakey=0x00FF00" in chain
    assert "scale=w=" in chain
    assert "hue=s=0" in chain
    assert "fade=t=in" in chain and "fade=t=out" in chain
    print("PASS: frame quantization, opacity/scale keyframes, chroma key, filter and fade chain")


if __name__ == "__main__":
    main()
