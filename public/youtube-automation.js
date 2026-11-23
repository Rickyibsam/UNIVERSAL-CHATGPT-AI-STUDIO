(() => {
  const panel = document.getElementById("youtubeAutomation");
  if (!panel || !window.supabase) return;
  const $y = (id) => document.getElementById(id);
  const status = (message, bad = false) => {
    const el = $y("ytStatus");
    if (el) { el.textContent = message; el.style.color = bad ? "#ff9b9b" : "#9aa9c3"; }
  };
  const call = async (body) => {
    const { data, error } = await sb.functions.invoke("youtube-automation", { body });
    if (error) throw new Error(error.message || "YouTube automation request failed");
    if (data?.error) throw new Error(data.error + (data.detail ? ": " + data.detail : ""));
    return data;
  };
  let channels = [];
  let settingsByChannel = {};
  let selectedChannel = "";
  function currentSettings() {
    return settingsByChannel[selectedChannel] || {
      enabled: false, videos_per_day: 1, publish_time: "18:00", timezone: "Asia/Karachi",
      content_mix: ["kids_learning", "3d_animation"], default_language: "en",
      default_privacy: "private", auto_publish: false, require_quality_pass: true, daily_budget_usd: 0
    };
  }
  function renderChannels() {
    const select = $y("ytChannel");
    const list = $y("ytChannels");
    select.innerHTML = channels.map(c => '<option value="' + c.id + '">' + esc(c.channel_title) + ' · ' + esc(c.status) + '</option>').join("");
    if (!channels.length) {
      selectedChannel = "";
      select.innerHTML = '<option value="">Connect a YouTube channel first</option>';
      list.innerHTML = '<div class="empty">No YouTube channel connected yet.</div>';
      $y("ytSettings").hidden = true;
      return;
    }
    if (!channels.some(c => c.id === selectedChannel)) selectedChannel = channels[0].id;
    select.value = selectedChannel;
    list.innerHTML = channels.map(c => '<div class="scene"><div class="sceneNo">▶</div><div><h3>' + esc(c.channel_title) + '</h3><p>Channel ID: ' + esc(c.channel_id) + ' · ' + esc(c.status) + '</p></div></div>').join("");
    $y("ytSettings").hidden = false;
    fillSettings();
  }
  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function fillSettings() {
    const s = currentSettings();
    $y("ytEnabled").checked = !!s.enabled;
    $y("ytAutoPublish").checked = !!s.auto_publish;
    $y("ytQuality").checked = s.require_quality_pass !== false;
    $y("ytVideosPerDay").value = String(s.videos_per_day || 1);
    $y("ytPublishTime").value = String(s.publish_time || "18:00").slice(0,5);
    $y("ytTimezone").value = s.timezone || "Asia/Karachi";
    $y("ytLanguage").value = s.default_language || "en";
    $y("ytPrivacy").value = s.default_privacy || "private";
    $y("ytBudget").value = s.daily_budget_usd ?? 0;
    const mix = s.content_mix || ["kids_learning","3d_animation"];
    $y("ytKids").checked = mix.includes("kids_learning");
    $y("yt3d").checked = mix.includes("3d_animation");
  }
  async function refresh() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { status("Sign in to your Studio account before connecting YouTube.", true); return; }
      const data = await call({ action: "list" });
      channels = data.channels || [];
      settingsByChannel = Object.fromEntries((data.settings || []).map(s => [s.channel_id, s]));
      renderChannels();
      status(channels.length ? "Connected channel data loaded. Uploading and daily generation still require configured Google OAuth secrets and a live AI worker." : "Studio account connected. Connect a YouTube channel to begin.");
    } catch (e) { status(e.message, true); }
  }
  $y("ytConnect").addEventListener("click", async () => {
    try {
      status("Preparing secure Google authorization…");
      const data = await call({ action: "connect" });
      if (!data.authorization_url) throw new Error("Google authorization URL was not returned.");
      location.href = data.authorization_url;
    } catch (e) { status(e.message, true); }
  });
  $y("ytRefresh").addEventListener("click", refresh);
  $y("ytChannel").addEventListener("change", e => { selectedChannel = e.target.value; fillSettings(); });
  $y("ytSave").addEventListener("click", async () => {
    if (!selectedChannel) return status("Connect a YouTube channel first.", true);
    const mix = [];
    if ($y("ytKids").checked) mix.push("kids_learning");
    if ($y("yt3d").checked) mix.push("3d_animation");
    if (!mix.length) return status("Select at least one content category.", true);
    const settings = {
      channel_id: selectedChannel, enabled: $y("ytEnabled").checked,
      auto_publish: $y("ytAutoPublish").checked, require_quality_pass: $y("ytQuality").checked,
      videos_per_day: Number($y("ytVideosPerDay").value), publish_time: $y("ytPublishTime").value,
      timezone: $y("ytTimezone").value.trim(), default_language: $y("ytLanguage").value.trim(),
      default_privacy: $y("ytPrivacy").value, daily_budget_usd: Number($y("ytBudget").value),
      content_mix: mix
    };
    try {
      status("Saving automation settings…");
      const result = await call({ action: "save-settings", settings });
      settingsByChannel[selectedChannel] = result.settings;
      status("Settings saved. Automation remains gated until Google OAuth, generation engine and publishing worker are configured.");
    } catch (e) { status(e.message, true); }
  });
  $y("ytDisconnect").addEventListener("click", async () => {
    if (!selectedChannel || !confirm("Disconnect this YouTube channel and revoke the stored Studio connection?")) return;
    try { await call({ action: "disconnect", channel_id: selectedChannel }); await refresh(); status("Channel disconnected. Google account permissions can also be revoked in your Google Account settings."); }
    catch (e) { status(e.message, true); }
  });
  sb.auth.onAuthStateChange((_event, session) => { if (session) refresh(); });
  if (location.hash.startsWith("#youtubeAutomation")) refresh();
  window.addEventListener("hashchange", () => { if (location.hash === "#youtubeAutomation") refresh(); });
})();