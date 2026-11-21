create table if not exists public.world_scenes (
  project_id uuid primary key references public.projects(id) on delete cascade,
  world_type text not null default 'Realistic 3D location',
  location text,
  weather text not null default 'Sunny · Day',
  scene_data jsonb not null default '{"objects":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.world_scenes enable row level security;
drop policy if exists world_scenes_select_owner on public.world_scenes;
create policy world_scenes_select_owner on public.world_scenes
for select to authenticated
using (exists (select 1 from public.projects p where p.id = world_scenes.project_id and p.owner_id = auth.uid()));
drop policy if exists world_scenes_insert_owner on public.world_scenes;
create policy world_scenes_insert_owner on public.world_scenes
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = world_scenes.project_id and p.owner_id = auth.uid()));
drop policy if exists world_scenes_update_owner on public.world_scenes;
create policy world_scenes_update_owner on public.world_scenes
for update to authenticated
using (exists (select 1 from public.projects p where p.id = world_scenes.project_id and p.owner_id = auth.uid()))
with check (exists (select 1 from public.projects p where p.id = world_scenes.project_id and p.owner_id = auth.uid()));
drop policy if exists world_scenes_delete_owner on public.world_scenes;
create policy world_scenes_delete_owner on public.world_scenes
for delete to authenticated
using (exists (select 1 from public.projects p where p.id = world_scenes.project_id and p.owner_id = auth.uid()));
grant select, insert, update, delete on public.world_scenes to authenticated;
