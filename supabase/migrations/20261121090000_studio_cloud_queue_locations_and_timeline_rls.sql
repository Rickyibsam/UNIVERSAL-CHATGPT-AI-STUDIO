-- Cloud Studio: durable queue metadata, reusable location continuity, and strict timeline references.
alter table public.generation_jobs
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists retryable boolean not null default true,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists estimated_cost_usd numeric(12,6);

alter table public.generation_jobs
  add constraint generation_jobs_max_attempts_check check (max_attempts between 1 and 10),
  add constraint generation_jobs_estimated_cost_check check (estimated_cost_usd is null or estimated_cost_usd >= 0);

create index if not exists generation_jobs_ready_queue_idx
  on public.generation_jobs (available_at, created_at)
  where status = 'queued';
create index if not exists generation_jobs_stale_worker_idx
  on public.generation_jobs (heartbeat_at)
  where status = 'running';

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  visual_prompt text not null default '',
  visual_reference_asset_ids uuid[] not null default '{}',
  continuity_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);
alter table public.locations enable row level security;
drop policy if exists "Owners manage project locations" on public.locations;
create policy "Owners manage project locations" on public.locations
  for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = locations.project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = locations.project_id and p.owner_id = (select auth.uid())
  ));

alter table public.scenes
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists continuity_prompt text not null default '';
create index if not exists scenes_location_id_idx on public.scenes(location_id);

-- Correct the prior policy's tautological project comparisons.
drop policy if exists "Owners manage timeline clips" on public.timeline_clips;
create policy "Owners manage timeline clips" on public.timeline_clips
  for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = timeline_clips.project_id and p.owner_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.projects p
      where p.id = timeline_clips.project_id and p.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.timeline_tracks t
      where t.id = timeline_clips.track_id and t.project_id = timeline_clips.project_id
    )
    and (
      timeline_clips.asset_id is null or exists (
        select 1 from public.assets a
        where a.id = timeline_clips.asset_id and a.project_id = timeline_clips.project_id
      )
    )
    and (
      timeline_clips.scene_id is null or exists (
        select 1 from public.scenes s
        where s.id = timeline_clips.scene_id and s.project_id = timeline_clips.project_id
      )
    )
  );

-- Atomic queue claim. Server-side service_role only; never callable from browser roles.
create or replace function public.claim_studio_jobs(p_worker_id text, p_limit integer default 3)
returns setof public.generation_jobs
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select j.id
    from public.generation_jobs j
    where j.status = 'queued'
      and j.available_at <= now()
      and j.attempt_count < j.max_attempts
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 10))
  )
  update public.generation_jobs j
  set status = 'running',
      attempt_count = j.attempt_count + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      heartbeat_at = now(),
      started_at = coalesce(j.started_at, now())
  from candidates c
  where j.id = c.id
  returning j.*;
$$;
revoke all on function public.claim_studio_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_studio_jobs(text, integer) to service_role;
