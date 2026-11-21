# UNIVERSAL-CHATGPT-AI-STUDIO

An independent, modular AI filmmaking workspace. The goal is to turn a prompt into a planned production: story, scenes, characters, visual assets, video shots, voice, music, editing and quality review.

## Current build status

- [x] GitHub repository and Render static site
- [x] Responsive production-planner interface
- [x] Prompt and production settings
- [x] Basic scene-plan draft builder
- [x] Save a draft locally in the current browser
- [ ] User accounts and cloud project library
- [ ] AI story/script planning service
- [ ] Character and world reference manager
- [ ] Image/video/voice/music provider adapters
- [ ] Background generation queue and asset storage
- [ ] Timeline assembly and export
- [ ] Automated quality and continuity checks

**Important:** the current scene planner is a browser-side prototype. It does not call an AI model and does not generate video, voice or music yet. Provider credentials are not configured.

## Principles

1. Free-first infrastructure. Do not activate a paid API, subscription, or paid Render resource without explicit owner approval.
2. Provider-agnostic design. Generation vendors must be replaceable adapters, not hard-coded throughout the application.
3. Honest capability reporting. Show model limits, output resolution, duration, availability and cost before a job is submitted.
4. User ownership. Projects, prompts and generated assets must be private to their owner.
5. Resilient generation. Use queued jobs, retries, per-shot regeneration and clear job states.
6. Safety and rights. Add content checks, consent safeguards for real-person likeness/voice, and asset licensing records.
7. No impossible guarantees. AI output can contain artifacts; the system should detect, report and offer repairs rather than promise zero mistakes.

## Planned architecture

- Web client: production workspace, storyboard, character bible, media library, timeline and export controls.
- Application API: authentication, projects, prompts, scene plans, job submission and provider capability/cost checks.
- Database: users, projects, characters, scenes, jobs, assets, provider configuration and audit events.
- Object storage: source uploads, generated images/video/audio, previews and exports.
- Background workers: generation orchestration, polling, retries, FFmpeg assembly and quality checks.
- Provider adapters: text planning, image generation, video generation, speech, music and optional lip-sync.

## Development sequence

1. Production workspace and typed project/scene data model.
2. Authentication, cloud persistence and private storage.
3. Story planner and editable storyboard.
4. Character/world reference continuity.
5. Provider adapter interface and free/local provider options.
6. Queue workers, asset lifecycle and shot-level retries.
7. Voice, dialogue, subtitles, music and sound effects.
8. Timeline assembly, rendering and export presets.
9. Safety, rights, cost controls, observability and end-to-end tests.

## Deployment

The initial frontend is hosted as a Render static site and deploys from the `main` branch. The static site does not yet provide a backend API or database.
