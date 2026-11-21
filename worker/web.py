from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import worker

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
PUBLISHABLE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
ALLOWED_ORIGIN = os.getenv("STUDIO_ALLOWED_ORIGIN", "https://universal-chatgpt-ai-studio.onrender.com")
active_jobs: set[str] = set()
render_lock = asyncio.Lock()

app = FastAPI(title="Universal Studio Render API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "apikey", "content-type"],
)


class RunBody(BaseModel):
    project_id: str


def user_headers(token: str) -> dict[str, str]:
    if not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    return {"apikey": PUBLISHABLE_KEY, "Authorization": token, "Content-Type": "application/json"}


async def authenticated_user(client: httpx.AsyncClient, auth: dict[str, str]) -> dict[str, Any]:
    response = await client.get(SUPABASE_URL + "/auth/v1/user", headers=auth)
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="INVALID_SESSION")
    return response.json()


async def owned_job(client: httpx.AsyncClient, auth: dict[str, str], job_id: str, project_id: str) -> dict[str, Any]:
    response = await client.get(
        SUPABASE_URL + "/rest/v1/generation_jobs",
        params={"id": "eq." + job_id, "project_id": "eq." + project_id, "job_type": "eq.render", "select": "*"},
        headers=auth,
    )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="JOB_LOOKUP_FAILED")
    rows = response.json()
    if not rows:
        raise HTTPException(status_code=404, detail="JOB_NOT_FOUND_OR_FORBIDDEN")
    return rows[0]


async def run_job(job: dict[str, Any], auth: dict[str, str]) -> None:
    async with render_lock:
        previous = worker.headers
        worker.headers = auth
        try:
            limits = httpx.Limits(max_connections=8, max_keepalive_connections=4)
            async with httpx.AsyncClient(timeout=worker.HTTP_TIMEOUT, limits=limits) as client:
                await worker.process_job(client, job)
        except Exception:
            worker.log.exception("render request failed id=%s", job.get("id"))
        finally:
            worker.headers = previous
            active_jobs.discard(str(job.get("id")))


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "universal-studio-render-api"}


@app.post("/jobs/{job_id}/run", status_code=202)
async def start_render(job_id: str, body: RunBody, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    auth = user_headers(authorization or "")
    async with httpx.AsyncClient(timeout=30) as client:
        await authenticated_user(client, auth)
        job = await owned_job(client, auth, job_id, body.project_id)
    if job.get("status") not in ("queued", "running"):
        raise HTTPException(status_code=409, detail="JOB_NOT_QUEUED")
    if job_id not in active_jobs:
        active_jobs.add(job_id)
        asyncio.create_task(run_job(job, auth))
    return {"job_id": job_id, "status": "accepted", "message": "Render task accepted by the cloud renderer."}


@app.get("/jobs/{job_id}")
async def render_status(job_id: str, project_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    auth = user_headers(authorization or "")
    async with httpx.AsyncClient(timeout=30) as client:
        await authenticated_user(client, auth)
        job = await owned_job(client, auth, job_id, project_id)
    return {
        "job_id": job["id"],
        "status": job["status"],
        "progress_percent": job["progress_percent"],
        "output_asset_ids": job.get("output_asset_ids") or [],
        "result_payload": job.get("result_payload") or {},
        "error_message": job.get("error_message"),
    }
