-- Explicit deny policies document that browser sessions can never read OAuth secrets/state.
drop policy if exists "Deny browser access to YouTube credentials" on public.youtube_credentials;
create policy "Deny browser access to YouTube credentials" on public.youtube_credentials
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "Deny browser access to YouTube OAuth state" on public.youtube_oauth_states;
create policy "Deny browser access to YouTube OAuth state" on public.youtube_oauth_states
  for all to anon, authenticated using (false) with check (false);
