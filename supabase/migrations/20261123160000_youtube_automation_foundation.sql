-- YouTube automation foundation. Isolated from the existing studio project tables.
create table if not exists public.youtube_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_id text not null,
  channel_title text not null,
  thumbnail_url text,
  custom_url text,
  status text not null default 'connected' check (status in ('connected','reauthorization_required','disconnected')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, channel_id)
);
alter table public.youtube_channels enable row level security;
drop policy if exists "Owners read YouTube channels" on public.youtube_channels;
create policy "Owners read YouTube channels" on public.youtube_channels
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.youtube_channels from anon, authenticated;
grant select on public.youtube_channels to authenticated;
grant all on public.youtube_channels to service_role;

create table if not exists public.youtube_credentials (
  channel_id uuid primary key references public.youtube_channels(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  scope text not null default '',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.youtube_credentials enable row level security;
revoke all on public.youtube_credentials from anon, authenticated;
grant all on public.youtube_credentials to service_role;

create table if not exists public.youtube_oauth_states (
  state_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.youtube_oauth_states enable row level security;
revoke all on public.youtube_oauth_states from anon, authenticated;
grant all on public.youtube_oauth_states to service_role;

create table if not exists public.youtube_automation_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.youtube_channels(id) on delete cascade,
  enabled boolean not null default false,
  videos_per_day integer not null default 1 check (videos_per_day between 1 and 5),
  publish_time time not null default '18:00',
  timezone text not null default 'Asia/Karachi',
  content_mix text[] not null default array['kids_learning','3d_animation'],
  default_language text not null default 'en',
  default_privacy text not null default 'private' check (default_privacy in ('private','unlisted','public')),
  auto_publish boolean not null default false,
  require_quality_pass boolean not null default true,
  daily_budget_usd numeric(10,2) not null default 0 check (daily_budget_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, channel_id)
);
alter table public.youtube_automation_settings enable row level security;
drop policy if exists "Owners manage YouTube automation settings" on public.youtube_automation_settings;
create policy "Owners manage YouTube automation settings" on public.youtube_automation_settings
  for all to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.youtube_channels c where c.id = youtube_automation_settings.channel_id and c.owner_id = (select auth.uid())
  ))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.youtube_channels c where c.id = youtube_automation_settings.channel_id and c.owner_id = (select auth.uid())
  ));

create table if not exists public.youtube_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.youtube_channels(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','queued','uploading','scheduled','published','failed','cancelled')),
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  category_id text,
  privacy_status text not null default 'private' check (privacy_status in ('private','unlisted','public')),
  made_for_kids boolean,
  contains_synthetic_media boolean not null default false,
  scheduled_at timestamptz,
  youtube_video_id text,
  upload_session_uri text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 10),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (owner_id, channel_id, youtube_video_id)
);
alter table public.youtube_publish_jobs enable row level security;
drop policy if exists "Owners read YouTube publish jobs" on public.youtube_publish_jobs;
create policy "Owners read YouTube publish jobs" on public.youtube_publish_jobs
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.youtube_publish_jobs from anon, authenticated;
grant select on public.youtube_publish_jobs to authenticated;
grant all on public.youtube_publish_jobs to service_role;

create table if not exists public.youtube_video_analytics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.youtube_channels(id) on delete cascade,
  publish_job_id uuid references public.youtube_publish_jobs(id) on delete set null,
  youtube_video_id text not null,
  snapshot_date date not null default current_date,
  views bigint not null default 0 check (views >= 0),
  likes bigint not null default 0 check (likes >= 0),
  comments bigint not null default 0 check (comments >= 0),
  watch_time_minutes numeric(14,2) not null default 0 check (watch_time_minutes >= 0),
  average_view_duration_seconds numeric(14,2) not null default 0 check (average_view_duration_seconds >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  ctr numeric(8,4),
  created_at timestamptz not null default now(),
  unique (channel_id, youtube_video_id, snapshot_date)
);
alter table public.youtube_video_analytics enable row level security;
drop policy if exists "Owners read YouTube analytics" on public.youtube_video_analytics;
create policy "Owners read YouTube analytics" on public.youtube_video_analytics
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.youtube_video_analytics from anon, authenticated;
grant select on public.youtube_video_analytics to authenticated;
grant all on public.youtube_video_analytics to service_role;

create index if not exists youtube_channels_owner_idx on public.youtube_channels(owner_id, created_at desc);
create index if not exists youtube_publish_jobs_queue_idx on public.youtube_publish_jobs(scheduled_at, created_at) where status in ('queued','scheduled');
create index if not exists youtube_publish_jobs_owner_idx on public.youtube_publish_jobs(owner_id, created_at desc);
create index if not exists youtube_analytics_channel_date_idx on public.youtube_video_analytics(channel_id, snapshot_date desc);
create index if not exists youtube_oauth_states_expiry_idx on public.youtube_oauth_states(expires_at);

create or replace function public.set_youtube_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists youtube_channels_updated_at on public.youtube_channels;
create trigger youtube_channels_updated_at before update on public.youtube_channels
for each row execute function public.set_youtube_updated_at();
drop trigger if exists youtube_automation_settings_updated_at on public.youtube_automation_settings;
create trigger youtube_automation_settings_updated_at before update on public.youtube_automation_settings
for each row execute function public.set_youtube_updated_at();
drop trigger if exists youtube_publish_jobs_updated_at on public.youtube_publish_jobs;
create trigger youtube_publish_jobs_updated_at before update on public.youtube_publish_jobs
for each row execute function public.set_youtube_updated_at();
