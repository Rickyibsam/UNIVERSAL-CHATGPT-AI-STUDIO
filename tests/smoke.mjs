import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].map(match => match[1]);
assert.ok(scripts.length > 0, 'inline application script exists');
for (const [index, source] of scripts.entries()) {
  new vm.Script(source, { filename: `inline-script-${index}.js` });
}
const requiredIds = [
  'prompt','planBtn','writeScreenplayBtn','realAiStoryBtn','characterList',
  'mediaFiles','uploadMediaBtn','timelineItems','createTimelineBtn',
  'saveTimelineBtn','exportTimelineBtn','exportSubsBtn','saveVersionBtn',
  'loadVersionsBtn','comfyWorkflow','runComfyJobBtn','checkComfyQueueBtn',
  'authEmail','authPassword','signInBtn','signUpBtn','saveBtn'
];
for (const id of requiredIds) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `required UI control exists: ${id}`);
}
const ids = [...html.matchAll(/\\bid=["']([^"']+)["']/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'HTML element IDs must be unique');
assert.ok(!html.includes('service_role'), 'service role key must never be shipped to the browser');
assert.ok(!html.includes('sb_secret_'), 'Supabase secret key must never be shipped to the browser');
console.log(`PASS: ${scripts.length} inline script(s), ${requiredIds.length} required controls, unique IDs, no privileged Supabase key.`);
