-- Explicit least-privilege grants for the YouTube automation schema.
revoke all on public.youtube_channels from anon;
grant select on public.youtube_channels to authenticated;
grant all on public.youtube_channels to service_role;

revoke all on public.youtube_credentials from anon, authenticated;
grant all on public.youtube_credentials to service_role;

revoke all on public.youtube_oauth_states from anon, authenticated;
grant all on public.youtube_oauth_states to service_role;

revoke all on public.youtube_automation_settings from anon;
grant select, insert, update, delete on public.youtube_automation_settings to authenticated;
grant all on public.youtube_automation_settings to service_role;

revoke all on public.youtube_publish_jobs from anon;
grant select on public.youtube_publish_jobs to authenticated;
grant all on public.youtube_publish_jobs to service_role;

revoke all on public.youtube_video_analytics from anon;
grant select on public.youtube_video_analytics to authenticated;
grant all on public.youtube_video_analytics to service_role;
