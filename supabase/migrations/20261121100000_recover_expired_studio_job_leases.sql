-- Recover worker crashes by expiring leases before claiming queued work.
create or replace function public.claim_studio_jobs(p_worker_id text, p_limit integer default 3)
returns setof public.generation_jobs
language sql
security definer
set search_path = ''
as $$
  with recovered as (
    update public.generation_jobs j
    set status = case when j.retryable and j.attempt_count < j.max_attempts then 'queued' else 'failed' end,
        available_at = now(),
        error_code = 'WORKER_LEASE_EXPIRED',
        error_message = 'The previous worker stopped reporting progress; the job was safely recovered.',
        finished_at = case when j.retryable and j.attempt_count < j.max_attempts then null else now() end,
        locked_at = null,
        locked_by = null,
        heartbeat_at = null,
        progress_percent = case when j.retryable and j.attempt_count < j.max_attempts then 0 else j.progress_percent end
    where j.status = 'running'
      and coalesce(j.heartbeat_at, j.locked_at, j.started_at, j.created_at) < now() - interval '45 minutes'
    returning j.id
  ),
  candidates as (
    select j.id from public.generation_jobs j
    where j.status = 'queued' and j.available_at <= now() and j.attempt_count < j.max_attempts
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 10))
  )
  update public.generation_jobs j
  set status = 'running', attempt_count = j.attempt_count + 1,
      locked_at = now(), locked_by = p_worker_id, heartbeat_at = now(),
      started_at = coalesce(j.started_at, now())
  from candidates c where j.id = c.id
  returning j.*;
$$;
revoke all on function public.claim_studio_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_studio_jobs(text, integer) to service_role;
