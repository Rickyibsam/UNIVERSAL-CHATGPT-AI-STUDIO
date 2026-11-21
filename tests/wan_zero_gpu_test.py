import asyncio
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import worker


class WanZeroGpuTests(unittest.TestCase):
    def test_gradio_video_path_requires_local_file(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "sample.mp4"
            video.write_bytes(b"x" * 2048)
            self.assertEqual(worker._find_gradio_video_path({"video": {"path": str(video)}}), video)
            self.assertIsNone(worker._find_gradio_video_path({"video": {"url": "https://invalid.example/video.mp4"}}))

    def test_client_uses_configured_space_and_generate_endpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "result.mp4"
            video.write_bytes(b"x" * 2048)
            calls = {}
            class FakeClient:
                def __init__(self, space, **kwargs):
                    calls["space"] = space
                    calls["kwargs"] = kwargs
                def predict(self, *args, **kwargs):
                    calls["args"] = args
                    calls["api_name"] = kwargs["api_name"]
                    return {"path": str(video)}
            worker.HF_T2V_SPACE_ID = "test-owner/test-wan-space"
            with patch.dict(sys.modules, {"gradio_client": types.SimpleNamespace(Client=FakeClient)}):
                result = worker._call_wan_zero_gpu("a moving train", "blur", 42, 5.0, 20)
            self.assertEqual(result, video)
            self.assertEqual(calls["space"], "test-owner/test-wan-space")
            self.assertEqual(calls["api_name"], "/generate")
            self.assertEqual(calls["args"][0], "a moving train")

    def test_video_job_composes_prompt_and_returns_real_mp4_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.mp4"
            source.write_bytes(b"x" * 2048)
            async def scenario():
                job = {
                    "id": "12345678-aaaa-bbbb-cccc-dddddddddddd",
                    "input_parameters": {
                        "prompt": "A cinematic mountain train",
                        "settings": {
                            "style": "cinematic",
                            "setting": "Alpine valley",
                            "characters": [{"name": "Driver", "description": "A red-jacketed driver"}],
                            "scenes": [{"visual_prompt": "Train enters a snowy tunnel"}],
                        },
                    },
                }
                output_dir = Path(directory) / "output"
                with patch.object(worker, "_call_wan_zero_gpu", return_value=source) as call:
                    target, metadata = await worker.run_wan_zero_gpu_video(job, output_dir)
                self.assertTrue(target.is_file())
                self.assertIn("A cinematic mountain train", call.call_args.args[0])
                self.assertIn("Train enters a snowy tunnel", call.call_args.args[0])
                self.assertEqual(metadata["source_provider"], "huggingface_zero_gpu")
                self.assertEqual(metadata["license_metadata"]["license"], "Apache-2.0")
            asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
