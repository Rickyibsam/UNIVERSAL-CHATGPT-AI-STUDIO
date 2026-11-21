import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.ok(scripts.length > 0, 'inline application script exists');
for (const [index, source] of scripts.entries()) {
  new vm.Script(source, { filename: `inline-script-${index}.js` });
}
const worker = readFileSync(new URL('../worker/worker.py', import.meta.url), 'utf8');
const requiredIds = [
  'prompt','planBtn','writeScreenplayBtn','realAiStoryBtn','characterList',
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
assert.ok(worker.includes('"status": "succeeded"'), 'worker must use the database success status');
assert.ok(!/generativelanguage\.googleapis\.com|api\.openai\.com|replicate\.com|fal\.ai/i.test(worker), 'worker must not call third-party hosted generation APIs');
assert.ok(!html.includes('127.0.0.1'), 'browser app must not depend on localhost AI services');
assert.ok(!html.toLowerCase().includes('ollama'), 'local Ollama dependency must be removed');
assert.ok(!html.toLowerCase().includes('comfyui'), 'local ComfyUI dependency must be removed');
console.log(`PASS: ${scripts.length} inline script(s), ${requiredIds.length} required controls, unique IDs, no privileged Supabase key.`);
