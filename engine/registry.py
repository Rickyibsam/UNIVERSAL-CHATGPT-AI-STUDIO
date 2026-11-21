"""Allowlisted model adapter registry for owner-operated inference.

Adapters are Python modules shipped with this engine. User input can select an
installed model key, but cannot supply a URL, import path, shell command or
arbitrary model download location.
"""
from __future__ import annotations

import importlib
import os
from typing import Any, Protocol


class Adapter(Protocol):
    model_key: str
    job_types: tuple[str, ...]
    license_id: str

    def capabilities(self) -> dict[str, Any]: ...
    async def generate(self, request: dict[str, Any]) -> dict[str, Any]: ...


class ModelRegistry:
    def __init__(self) -> None:
        self._adapters: dict[str, Adapter] = {}

    def register(self, adapter: Adapter) -> None:
        key = str(adapter.model_key).strip()
        if not key or key in self._adapters:
            raise ValueError("MODEL_KEY_INVALID_OR_DUPLICATE")
        if not adapter.license_id:
            raise ValueError("MODEL_LICENSE_REQUIRED")
        self._adapters[key] = adapter

    def get(self, model_key: str, job_type: str) -> Adapter:
        adapter = self._adapters.get(model_key)
        if adapter is None or job_type not in adapter.job_types:
            raise LookupError("MODEL_NOT_INSTALLED_OR_JOB_UNSUPPORTED")
        return adapter

    def capabilities(self) -> list[dict[str, Any]]:
        return [adapter.capabilities() for adapter in self._adapters.values()]


def load_registry() -> ModelRegistry:
    registry = ModelRegistry()
    # Module imports are controlled by the server operator, never by a request.
    modules = [x.strip() for x in os.getenv("STUDIO_ADAPTER_MODULES", "").split(",") if x.strip()]
    for module_name in modules:
        module = importlib.import_module(module_name)
        factory = getattr(module, "build_adapter", None)
        if not callable(factory):
            raise RuntimeError(f"Adapter module has no build_adapter(): {module_name}")
        registry.register(factory())
    return registry
