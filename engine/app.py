from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from registry import load_registry

app = FastAPI(title="Universal Studio Self-Hosted Inference Engine", version="1.0.0")
registry = load_registry()
ENGINE_TOKEN = os.getenv("STUDIO_ENGINE_TOKEN", "")

ALLOWED_JOB_TYPES = {"script", "image", "video", "speech", "music", "sfx", "render", "quality_check"}


class GenerationRequest(BaseModel):
    contract_version: str = Field("1", max_length=8)
    job: dict[str, Any]
    context: dict[str, Any] = Field(default_factory=dict)


def authorize(authorization: str | None) -> None:
    if not ENGINE_TOKEN:
        raise HTTPException(status_code=503, detail="ENGINE_AUTH_NOT_CONFIGURED")
    supplied = (authorization or "").removeprefix("Bearer ")
    if not hmac.compare_digest(supplied, ENGINE_TOKEN):
        raise HTTPException(status_code=401, detail="ENGINE_AUTH_REQUIRED")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/capabilities")
async def capabilities(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    return {
        "engine": "self-hosted",
        "contract_version": "1",
        "models": registry.capabilities(),
        "supported_job_types": sorted(ALLOWED_JOB_TYPES),
    }


@app.post("/v1/generate")
async def generate(
    body: GenerationRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authorize(authorization)
    job = body.job
    job_type = str(job.get("type") or "")
    params = job.get("input") if isinstance(job.get("input"), dict) else {}
    model_key = str(params.get("model_key") or "")
    if body.contract_version != "1" or job_type not in ALLOWED_JOB_TYPES or not model_key:
        raise HTTPException(status_code=400, detail="GENERATION_REQUEST_INVALID")
    try:
        adapter = registry.get(model_key, job_type)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail="MODEL_NOT_READY") from exc
    result = await adapter.generate({
        "job": job,
        "context": body.context,
        "input": params,
    })
    if not isinstance(result, dict) or (not result.get("artifacts") and not result.get("result_payload")):
        raise HTTPException(status_code=502, detail="MODEL_ADAPTER_RETURNED_INVALID_OUTPUT")
    result.setdefault("metadata", {})
    result["metadata"].update({
        "engine": "self-hosted",
        "model_key": model_key,
        "license": adapter.license_id,
    })
    return result
