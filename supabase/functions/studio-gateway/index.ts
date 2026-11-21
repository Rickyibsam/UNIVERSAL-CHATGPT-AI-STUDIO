import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://universal-chatgpt-ai-studio.onrender.com";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "AUTH_REQUIRED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !anonKey) return json({ error: "BACKEND_CONFIGURATION_MISSING" }, 500);

  const headers = {
    apikey: anonKey,
    authorization,
    "content-type": "application/json",
  };
  const userRes = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: { apikey: anonKey, authorization },
  });
  if (!userRes.ok) return json({ error: "INVALID_SESSION" }, 401);
  const user = await userRes.json();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  if (!["generate-script", "generate-video", "render-video"].includes(String(body.action))) return json({ error: "UNSUPPORTED_ACTION" }, 400);

  const projectId = String(body.project_id || "");
  const prompt = String(body.prompt || "").trim();
  const settings = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
    ? body.settings as Record<string, unknown>
    : {};
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || prompt.length < 8 || prompt.length > 12000) {
    return json({ error: "INVALID_PROJECT_OR_PROMPT" }, 400);
  }

  const ownerRes = await fetch(
    supabaseUrl + "/rest/v1/projects?id=eq." + encodeURIComponent(projectId) +
      "&owner_id=eq." + encodeURIComponent(user.id) + "&select=id",
    { headers },
  );
  if (!ownerRes.ok) return json({ error: "PROJECT_LOOKUP_FAILED" }, 502);
  const owned = await ownerRes.json();
  if (!Array.isArray(owned) || owned.length !== 1) {
    return json({ error: "PROJECT_NOT_FOUND_OR_FORBIDDEN" }, 404);
  }

  if (body.action === "generate-video") {
    const activeRes = await fetch(
      supabaseUrl + "/rest/v1/generation_jobs?project_id=eq." + encodeURIComponent(projectId) +
        "&job_type=eq.video&status=in.(queued,running)&select=id&limit=1",
      { headers },
    );
    if (!activeRes.ok) return json({ error: "VIDEO_ACTIVE_JOB_CHECK_FAILED" }, 502);
    const activeJobs = await activeRes.json();
    if (Array.isArray(activeJobs) && activeJobs.length) {
      return json({ error: "VIDEO_ALREADY_RUNNING", message: "This project already has a queued or running video generation." }, 409);
    }
    const jobId = crypto.randomUUID();
    const insertRes = await fetch(supabaseUrl + "/rest/v1/generation_jobs", {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        id: jobId, project_id: projectId, job_type: "video",
        provider_key: "self-hosted-engine", status: "queued", progress_percent: 0,
        idempotency_key: crypto.randomUUID(), max_attempts: 2, retryable: true,
        input_parameters: { prompt, settings, source: "cloud-studio-video", contract_version: "1" },
      }),
    });
    if (!insertRes.ok) return json({ error: "VIDEO_JOB_CREATE_FAILED", message: (await insertRes.text()).slice(0, 500) }, 502);
    return json({ job_id: jobId, status: "queued", provider: "self-hosted-engine", message: "Video generation queued. A registered video model and online worker are required to produce footage." }, 202);
  }

  if (body.action === "render-video") {
    const timeline = body.timeline && typeof body.timeline === "object" && !Array.isArray(body.timeline)
      ? body.timeline as Record<string, unknown> : {};
    const clips = Array.isArray(timeline.clips) ? timeline.clips as Record<string, unknown>[] : [];
    const width = Number(timeline.width || 1920);
    const height = Number(timeline.height || 1080);
    const fps = Number(timeline.fps || 30);
    if (!clips.length || clips.length > 100 || !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 320 || width > 3840 || height < 240 || height > 2160 || !Number.isInteger(fps) || fps < 12 || fps > 60) {
      return json({ error: "RENDER_SETTINGS_INVALID" }, 400);
    }
    const assetIds = [...new Set(clips.map(c => String(c.asset_id || "")).filter(Boolean))];
    if (clips.some(c => !String(c.asset_id || "")) || !assetIds.length || assetIds.length > 100) return json({ error: "RENDER_ASSET_LIST_INVALID" }, 400);
    const assetFilter = assetIds.map(id => encodeURIComponent(id)).join(",");
    const assetRes = await fetch(
      supabaseUrl + "/rest/v1/assets?project_id=eq." + encodeURIComponent(projectId) +
        "&id=in.(" + assetFilter + ")&select=id",
      { headers },
    );
    if (!assetRes.ok) return json({ error: "RENDER_ASSET_LOOKUP_FAILED" }, 502);
    const ownedAssets = await assetRes.json();
    if (!Array.isArray(ownedAssets) || ownedAssets.length !== assetIds.length) {
      return json({ error: "RENDER_ASSET_NOT_OWNED" }, 403);
    }
    for (const clip of clips) {
      const start = Number(clip.start_seconds || 0);
      const duration = Number(clip.duration_seconds || 0);
      const trim = Number(clip.trim_in_seconds || 0);
      const speed = Number(clip.speed || 1);
      if (![start, duration, trim, speed].every(Number.isFinite) || start < 0 || duration <= 0 ||
          duration > 900 || trim < 0 || speed < 0.25 || speed > 4) {
        return json({ error: "RENDER_CLIP_TIMING_INVALID" }, 400);
      }
    }
    const activeRes = await fetch(
      supabaseUrl + "/rest/v1/generation_jobs?project_id=eq." + encodeURIComponent(projectId) +
        "&job_type=eq.render&status=in.(queued,running)&select=id&limit=1",
      { headers },
    );
    if (!activeRes.ok) return json({ error: "RENDER_ACTIVE_JOB_CHECK_FAILED" }, 502);
    const activeJobs = await activeRes.json();
    if (Array.isArray(activeJobs) && activeJobs.length) {
      return json({ error: "RENDER_ALREADY_RUNNING", message: "This project already has a queued or running render." }, 409);
    }
    const jobId = crypto.randomUUID();
    const insertRes = await fetch(supabaseUrl + "/rest/v1/generation_jobs", {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        id: jobId, project_id: projectId, job_type: "render",
        provider_key: "self-hosted-ffmpeg", status: "queued", progress_percent: 0,
        idempotency_key: crypto.randomUUID(), max_attempts: 2, retryable: true,
        input_parameters: { timeline: { width, height, fps, clips }, source: "cloud-studio-editor", contract_version: "1" },
      }),
    });
    if (!insertRes.ok) return json({ error: "RENDER_JOB_CREATE_FAILED", message: (await insertRes.text()).slice(0, 500) }, 502);
    return json({ job_id: jobId, status: "queued", message: "MP4 render queued on the private cloud renderer." }, 202);
  }

  const jobId = crypto.randomUUID();
  const insertRes = await fetch(supabaseUrl + "/rest/v1/generation_jobs", {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      id: jobId,
      project_id: projectId,
      job_type: "script",
      provider_key: "self-hosted-engine",
      status: "queued",
      progress_percent: 0,
      idempotency_key: crypto.randomUUID(),
      max_attempts: 3,
      retryable: true,
      input_parameters: {
        prompt,
        settings,
        source: "cloud-studio",
        contract_version: "1",
      },
    }),
  });
  if (!insertRes.ok) {
    return json({ error: "JOB_CREATE_FAILED", message: (await insertRes.text()).slice(0, 500) }, 502);
  }

  return json({
    job_id: jobId,
    status: "queued",
    provider: "self-hosted-engine",
    message: "Screenplay job queued. It will start when the private self-hosted engine worker is online.",
  }, 202);
});