# Application data model (draft v1)

This is a provider-neutral logical model. It is documentation only; no database or paid service has been created.

## Core entities

### Project
- id: UUID
- owner_id: UUID
- title: string
- description: string, nullable
- status: draft | planning | generating | reviewing | completed | failed
- default_format: 9:16 | 16:9 | 1:1 | 4:3
- visual_style: string
- target_duration_seconds: integer
- language: string
- created_at, updated_at: timestamp

### Character
- id: UUID
- project_id: UUID
- name: string
- description: text
- visual_reference_asset_ids: UUID[]
- voice_profile: JSON
- continuity_notes: text
- created_at, updated_at: timestamp

### Scene
- id: UUID
- project_id: UUID
- sequence_number: integer
- title: string
- narrative_beat: text
- visual_prompt: text
- camera_direction: JSON
- dialogue: JSON
- duration_seconds: number
- character_ids: UUID[]
- status: draft | queued | generating | ready | needs_review | failed
- created_at, updated_at: timestamp

### GenerationJob
- id: UUID
- project_id: UUID
- scene_id: UUID, nullable
- job_type: script | image | video | speech | music | lipsync | render | quality_check
- provider_key: string
- status: queued | running | succeeded | failed | cancelled
- progress_percent: integer
- input_parameters: JSON
- output_asset_ids: UUID[]
- error_code: string, nullable
- error_message: string, nullable
- attempt_count: integer
- created_at, started_at, finished_at: timestamp

### Asset
- id: UUID
- project_id: UUID
- scene_id: UUID, nullable
- asset_type: image | video | audio | subtitle | export | reference
- storage_key: string
- mime_type: string
- size_bytes: integer
- duration_seconds: number, nullable
- width, height: integer, nullable
- source_provider: string, nullable
- license_metadata: JSON
- created_at: timestamp

## Security invariants

- Every project has exactly one owner.
- Every child entity is reachable only through a project owned by the authenticated user.
- Never expose provider secret keys to the browser.
- Provider keys are server-side secrets and must be encrypted/managed by the hosting platform.
- Signed, short-lived asset URLs are preferred over public buckets.
- All generation jobs must verify project ownership before enqueueing and before returning results.
- Cost/credit estimates and provider availability must be displayed before any billable job is submitted.

## Job lifecycle

queued -> running -> succeeded
queued -> cancelled
running -> failed
failed -> queued (retry, subject to retry limit)

Retries must be idempotent and must not create duplicate billable provider requests. Store provider request IDs and idempotency keys where supported.

## Provider adapter contract (planned)

Each adapter should expose:
- capabilities(): supported task types, formats, durations, resolutions and limits
- estimate(input): estimated cost or explicit free/unknown status
- validate(input): structured validation errors
- submit(input, idempotencyKey): provider job reference
- poll(providerJobId): normalized status and progress
- fetchOutputs(providerJobId): normalized asset metadata

The application must refuse billable requests unless the user has explicitly enabled that provider and accepted the displayed estimate.
