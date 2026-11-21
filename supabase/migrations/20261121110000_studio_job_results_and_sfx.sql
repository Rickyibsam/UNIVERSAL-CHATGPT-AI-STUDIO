alter table public.generation_jobs
  add column if not exists result_payload jsonb not null default '{}'::jsonb;
alter table public.generation_jobs
  drop constraint if exists generation_jobs_job_type_check;
alter table public.generation_jobs
  add constraint generation_jobs_job_type_check
  check (job_type = any (array['script','image','video','speech','music','sfx','lipsync','render','quality_check']::text[]));
