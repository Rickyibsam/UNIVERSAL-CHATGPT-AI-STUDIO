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
import os
import socket
import time
import uuid
from typing import Any

import httpx

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("studio-worker")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ENGINE_URL = os.getenv("STUDIO_ENGINE_URL", "").rstrip("/")
ENGINE_TOKEN = os.getenv("STUDIO_ENGINE_TOKEN", "")
BUCKET = os.getenv("STUDIO_STORAGE_BUCKET", "studio-media")
WORKER_ID = os.getenv("WORKER_ID", f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}")
POLL_SECONDS = max(2, int(os.getenv("POLL_SECONDS", "5")))
BATCH_SIZE = max(1, min(10, int(os.getenv("BATCH_SIZE", "2"))))
HTTP_TIMEOUT = max(30, int(os.getenv("ENGINE_TIMEOUT_SECONDS", "1800")))

if not ENGINE_URL:
    log.warning("STUDIO_ENGINE_URL is not configured; generation jobs will be retried safely.")

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


class RetryableJobError(Exception):
    pass


class PermanentJobError(Exception):
    pass


async def request(client: httpx.AsyncClient, method: str, path: str, **kwargs: Any) -> httpx.Response:
    response = await client.request(method, f"{SUPABASE_URL}{path}", headers=headers, **kwargs)
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
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
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
    if not isinstance(result, dict) or not isinstance(result.get("artifacts"), list) or not result["artifacts"]:
        raise PermanentJobError("ENGINE_RETURNED_NO_ARTIFACTS")
    return result


async def process_job(client: httpx.AsyncClient, job: dict[str, Any]) -> None:
    job_id = job["id"]
    try:
        await patch_job(client, job_id, {"progress_percent": 5, "heartbeat_at": "now()"})
        result = await run_engine(client, job)
        ids: list[str] = []
        artifacts = result["artifacts"]
        for index, artifact in enumerate(artifacts):
            ids.append(await upload_artifact(client, job, artifact))
            progress = 10 + int(80 * (index + 1) / len(artifacts))
            await patch_job(client, job_id, {
                "progress_percent": progress,
                "heartbeat_at": "now()",
            })
        await patch_job(client, job_id, {
            "status": "success",
            "progress_percent": 100,
            "output_asset_ids": ids,
            "provider_metadata": result.get("metadata", {}),
            "finished_at": "now()",
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
            "error_message": str(exc)[:500], "finished_at": "now()",
            "locked_at": None, "locked_by": None, "heartbeat_at": None,
        })
        log.error("job permanently failed id=%s code=%s", job_id, exc)
    except Exception as exc:
        attempts = int(job.get("attempt_count") or 1)
        max_attempts = int(job.get("max_attempts") or 3)
        retryable = bool(job.get("retryable", True))
        if retryable and attempts < max_attempts:
            delay = min(3600, 15 * (2 ** max(0, attempts - 1)))
            from datetime import datetime, timedelta, timezone
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
                "error_message": str(exc)[:500], "finished_at": "now()",
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
