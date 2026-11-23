# YouTube Automation Setup

This module adds a channel connection and daily publishing settings to Universal ChatGPT AI Studio.

## What is deployed

- Dedicated Supabase tables for channel metadata, private OAuth credentials, OAuth state, automation settings, publish jobs and analytics snapshots.
- RLS policies and least-privilege grants. OAuth credentials and OAuth state are server-only; authenticated browser users cannot read them.
- Supabase Edge Function `youtube-automation` for Google OAuth initiation/callback, channel listing, settings save and disconnect.
- Dashboard section at `#youtubeAutomation` for channel connection and daily settings.
- Defaults: one video/day, Asia/Karachi, Kids Learning + 3D Animation, private visibility, quality check required, auto-publish off until explicitly enabled.

## Required Google Cloud configuration

Create a Google Cloud project and configure OAuth consent. Create an OAuth 2.0 Web application client.

Authorized redirect URI must be exactly:

```
https://xoitqhckliiuomreutmk.supabase.co/functions/v1/youtube-automation?action=callback
```

Enable YouTube Data API v3 and, for analytics, YouTube Analytics API. Request these scopes through the OAuth flow:

- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

Set these Supabase Edge Function secrets in the Supabase Dashboard (Project Settings → Edge Functions → Secrets):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REDIRECT_URI` (the exact redirect URI above)

Never commit these secrets, put them in browser JavaScript, or send them in chat.

## Runtime blockers before automatic daily publishing

The current project README and self-hosted engine contract intentionally prohibit third-party hosted generation APIs and paid GPU compute without owner approval. The private inference engine and polling worker are not deployed, and the model registry currently has no active generation adapters. The current free Render renderer is an FFmpeg renderer, not a GPU inference host.

Before enabling true unattended daily video production, the owner-operated licensed GPU inference engine, durable scheduler/publisher worker, and YouTube upload worker must be deployed and tested. Do not enable auto-publish until an actual generated MP4, audio mix, metadata and channel upload have passed end-to-end verification.

For content designated Made for Kids, set the audience flag accurately for each video. Do not infer it only from the channel or from the automation category. Set synthetic/altered-content disclosures accurately when applicable.

## Current module limitations

- OAuth cannot complete until the Google OAuth secrets are configured and the redirect URI is allowlisted in Google Cloud.
- Daily schedule settings are persisted, but a production scheduler is not yet running.
- Publish-job and analytics tables are prepared, but automatic uploads and analytics synchronization are not yet wired into the background worker.
- No video-generation success is reported until a real owner-operated model returns a verified artifact.
