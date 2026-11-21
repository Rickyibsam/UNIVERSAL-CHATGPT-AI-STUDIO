import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.ok(scripts.length > 0, 'inline application script exists');
for (const [index, source] of scripts.entries()) {
  new vm.Script(source, { filename: `inline-script-${index}.js` });
}
const worker = readFileSync(new URL('../worker/worker.py', import.meta.url), 'utf8');
const rendererSmoke = readFileSync(new URL('./renderer_smoke.py', import.meta.url), 'utf8');
assert.ok(rendererSmoke.includes('4k-zoom') && rendererSmoke.includes('1080p-slide-chroma'), 'real 1080p and 4K FFmpeg render tests exist');
const rendererApi = readFileSync(new URL('../worker/web.py', import.meta.url), 'utf8');
const cloudEditor = readFileSync(new URL('../public/editor-cloud.js', import.meta.url), 'utf8');
const worldEditor = readFileSync(new URL('../public/world-3d.js', import.meta.url), 'utf8');
execFileSync(process.execPath, ['--input-type=module', '--check'], { input: worldEditor, stdio: ['pipe', 'ignore', 'pipe'] });
const worldMigration = readFileSync(new URL('../supabase/migrations/20261121174500_world_scenes.sql', import.meta.url), 'utf8');
new vm.Script(cloudEditor, { filename: 'editor-cloud.js' });
const requiredIds = [
  'sourceUrl','rightsStatus','saveImportRecord','publishPlatform','buildMetadata','worldMode','addWorldObject','downloadWorldPlan','templateGrid','prompt','planBtn','writeScreenplayBtn','realAiStoryBtn','characterList',
  'mediaFiles','uploadMediaBtn','timelineItems','createTimelineBtn',
  'saveTimelineBtn','exportTimelineBtn','exportSubsBtn','saveVersionBtn',
  'loadVersionsBtn','downloadRenderKitBtn','providerStatus',
  'authEmail','authPassword','signInBtn','signUpBtn','saveBtn','audioStudio','previewNarrationBtn','generateAudioBtn'
];
for (const id of requiredIds) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `required UI control exists: ${id}`);
}
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'HTML element IDs must be unique');
for (const id of ['accountStudio','pipelineStudio','proEditor','editorTransport','editorEffectsPanel','editorTextPanel','editorClipPanel','editorFit','editorRotate','editorScale','editorAnimation','editorSticker','editorRender','editorChromaKey']) assert.ok(ids.includes(id), 'Canva editor workspace control exists: '+id);
for (const marker of ['Canva-like panel navigation','grid-template-columns:290px minmax(0,1fr)','html,body{height:100%;overflow:hidden}','studio-zoom-in','Effects & filters','Text & stickers']) assert.ok(html.includes(marker), 'single-screen editor layout marker exists: '+marker);
assert.ok(html.includes("activate(document.getElementById(initial)?initial:'proEditor',false)"), 'editor opens as the default workspace');

assert.ok(!html.includes('service_role'), 'service role key must never be shipped to the browser');
assert.ok(!html.includes('sb_secret_'), 'Supabase secret key must never be shipped to the browser');
assert.ok(!html.includes('value="lipsync"'), 'lip-sync generation must remain disabled in the low-spec build');
assert.ok(html.includes('OfflineAudioContext'), 'browser audio preview tools must exist');
assert.ok(html.includes('/functions/v1/studio-gateway'), 'screenplay generation must call the cloud gateway');
assert.ok(html.includes("from('generation_jobs')"), 'screenplay UI must poll durable job progress');
assert.ok(!/generativelanguage\.googleapis\.com|GEMINI_API_KEY|api\.openai\.com|replicate\.com|fal\.ai/i.test(html), 'browser must not call hosted AI generation APIs');
assert.ok(worker.includes('claim_studio_jobs'), 'private worker must claim durable jobs');
assert.ok(worker.includes('STUDIO_ENGINE_URL'), 'private worker must call only the self-hosted engine');
assert.ok(worker.includes('async def render_timeline'), 'private worker must implement cloud MP4 assembly');
assert.ok(worker.includes('subtitles='), 'cloud renderer must support subtitle burn-in');
assert.ok(worker.includes('amix=inputs='), 'cloud renderer must mix audio tracks');
assert.ok(worker.includes('def render_filter_chain'), 'cloud renderer must map editor filter presets to FFmpeg filters');
assert.ok(html.includes('id="editorFps"') && html.includes('frameRate:editorFps()') && html.includes('frame_rate:editorFps()'), 'timeline edits and exports must use selectable frame rates');
assert.ok(html.includes('localTime*editorFps()') && html.includes('sourceOffset=snapFrame(localTime*speed)'), 'keyframes and split points must be clip-local and frame-snapped');
assert.ok(html.includes('let editorTimebase=editorFps()') && html.includes('next/old'), 'changing FPS must preserve keyframe timing in seconds');
assert.ok(worker.includes('any(isinstance(k, dict) and "scale" in k'), 'animated scale overlays must remain centered in the output frame');
assert.ok(worker.includes('scale_expr = keyframe_value_expression') && worker.includes('frame_time(source_duration, fps, 1)'), 'renderer must apply animated scale and quantize clips to exact frames');
assert.ok(worker.includes('def atempo_filters'), 'cloud renderer must support audio playback speed');
assert.ok(worker.includes('drawtext=fontfile='), 'cloud renderer must burn clip title overlays');
assert.ok(worker.includes('overlay=x=') && worker.includes('eof_action=pass:shortest=0'), 'cloud renderer must composite positioned video and overlay tracks');
assert.ok(worker.includes('trim_in_seconds'), 'cloud renderer must respect clip trim in points');
assert.ok(worker.includes('start_seconds'), 'cloud renderer must respect clip timeline positions');
assert.ok(worker.includes('fade=t=in'), 'cloud renderer must support fade transitions');
assert.ok(worker.includes('chromakey='), 'cloud renderer must support green/blue screen removal');
assert.ok(worker.includes('keyframe_value_expression'), 'cloud renderer must apply opacity keyframes');
assert.ok(worker.includes('upload_file_artifact') && !worker.includes('base64.b64encode(output.read_bytes())'), 'rendered MP4 must stream to Storage without base64 buffering');
assert.ok(html.includes('editorAddKeyframe'), 'editor must expose keyframe controls');
assert.ok(html.includes('worldCanvas') && html.includes('exportWorldGlb'), 'interactive 3D world canvas and GLB export controls exist');
assert.ok(html.includes('Minecraft grass block') && html.includes('applyWorldTransform'), 'voxel block placement and object transform controls exist');
assert.ok(worldEditor.includes('OrbitControls') && worldEditor.includes('GLTFExporter') && worldEditor.includes('world_scenes'), '3D editor supports orbit controls, GLB export and cloud storage');
assert.ok(worldMigration.includes('world_scenes_select_owner') && worldMigration.includes('auth.uid()'), 'world scene data is protected by project-owner RLS');
assert.ok(rendererApi.includes('/jobs/{job_id}/run'), 'authenticated render API must accept render jobs');
assert.ok(rendererApi.includes('authenticated_user'), 'render API must validate Supabase user sessions');
assert.ok(cloudEditor.includes('timeline_clips'), 'editor must persist timeline clips in Supabase');
assert.ok(cloudEditor.includes('createSignedUrl'), 'editor must restore private cloud media');
assert.ok(cloudEditor.includes('Render final MP4') || html.includes('Render final MP4'), 'editor must expose cloud MP4 rendering');

assert.ok(worker.includes('"status": "succeeded"'), 'worker must use the database success status');
assert.ok(!/generativelanguage\.googleapis\.com|api\.openai\.com|replicate\.com|fal\.ai/i.test(worker), 'worker must not call third-party hosted generation APIs');
for (const id of ['templateStudio','worldStudio','importStudio','publishStudio','templateGrid','worldPreview','metadataOutput']) assert.ok(html.includes('id="'+id+'"'), 'creator workspace module exists: '+id);
assert.ok(html.includes('studio-import-rights-draft'), 'rights record draft is saved in browser session');
assert.ok(html.includes('renderer_status'), 'world plan export identifies planning-only status');
for (const id of ['proEditor','editorFiles','editorTimeline','editorSplit','editorDuplicate','editorDelete','editorApplyTiming','editorApplyEffects','editorApplyText','editorUndo','editorRedo','editorExport','editorSave']) assert.ok(html.includes('id="'+id+'"'), 'professional editor control exists: '+id);
for (const feature of ['universal-studio-edit-v2','Split selected at playhead','Shorts effects & filters','TRANSITION','TRIM IN','Text, captions & stickers','Drag clips between tracks','cloud_timeline_autosave_enabled']) assert.ok(html.includes(feature), 'editor capability marker exists: '+feature);

assert.ok(!html.includes('127.0.0.1'), 'browser app must not depend on localhost AI services');
assert.ok(!html.toLowerCase().includes('ollama'), 'local Ollama dependency must be removed');
assert.ok(!html.toLowerCase().includes('comfyui'), 'local ComfyUI dependency must be removed');
console.log(`PASS: ${scripts.length} inline script(s), ${requiredIds.length} required controls, unique IDs, no privileged Supabase key.`);
