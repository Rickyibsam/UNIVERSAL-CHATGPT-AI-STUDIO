from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")

from worker import worker as worker_module


class FakeResponse:
    def raise_for_status(self) -> None:
        return None


class FakeClient:
    def __init__(self) -> None:
        self.uploaded = b""
        self.headers = {}

    async def put(self, url, content, headers, timeout):
        chunks = []
        async for chunk in content:
            chunks.append(chunk)
        self.uploaded = b"".join(chunks)
        self.headers = headers
        return FakeResponse()


async def main() -> None:
    fake = FakeClient()
    inserted = {}

    async def fake_request(client, method, path, json=None, headers=None):
        inserted.update(json or {})
        return FakeResponse()

    original_request = worker_module.request
    worker_module.request = fake_request
    try:
        with tempfile.TemporaryDirectory(prefix="studio-stream-upload-") as folder:
            path = Path(folder) / "large-test.mp4"
            expected = (b"studio-stream-chunk-" * 180000)[:3_000_000]
            path.write_bytes(expected)
            asset_id = await worker_module.upload_file_artifact(
                fake,
                {"id": "job-id", "project_id": "project-id", "job_type": "render"},
                path,
                "final.mp4",
                "video/mp4",
                "video",
                {"width": 1920, "height": 1080, "duration_seconds": 2.0},
            )
            assert fake.uploaded == expected
            assert fake.headers["Content-Length"] == str(len(expected))
            assert inserted["id"] == asset_id
            assert inserted["size_bytes"] == len(expected)
            assert inserted["mime_type"] == "video/mp4"
    finally:
        worker_module.request = original_request


if __name__ == "__main__":
    asyncio.run(main())
