import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { createDefaultProject } from '../src/core/model.js';
import { standaloneHtml } from './export.js';

async function harness() {
  const callbacks = new Map<string, () => Promise<void>>();
  const nodes = new Map<string, { textContent: string; disabled: boolean; checked: boolean; addEventListener: (type: string, fn: () => Promise<void>) => void }>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', disabled: false, checked: false, addEventListener: (_type, fn) => { callbacks.set(id, fn); } });
    return nodes.get(id)!;
  };
  let activation = false, resumes = 0, closes = 0, stops = 0;
  let resolveMedia!: (stream: unknown) => void, rejectMedia!: (error: Error) => void;
  const stream = { getTracks: () => [{ stop: () => { stops++; } }] };
  const media = new Promise((resolve, reject) => { resolveMedia = resolve; rejectMedia = reject; });
  const window = {
    Mio2D: { CharacterPlayer: class { async load() {} play() {} pause() {} setOptions() {} } },
    AudioContext: class {
      state = 'suspended';
      resume() { assert.ok(activation, 'audio must resume before losing the click gesture'); resumes++; this.state = 'running'; return Promise.resolve(); }
      close() { closes++; this.state = 'closed'; return Promise.resolve(); }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (data: Uint8Array) => data.fill(128) }; }
      createMediaStreamSource() { return { connect() {} }; }
    },
    addEventListener: (type: string, fn: () => Promise<void>) => callbacks.set(type, fn),
  };
  const html = standaloneHtml('測試角色');
  const source = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1];
  await new Script(source).runInNewContext({
    window, document: { getElementById: node, querySelector: node, querySelectorAll: () => [] },
    navigator: { mediaDevices: { getUserMedia: () => media } },
    fetch: async () => ({ ok: true, json: async () => createDefaultProject() }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console,
  });
  return {
    click: () => { activation = true; const result = callbacks.get('mic')!(); activation = false; return result; },
    grant: () => resolveMedia(stream), deny: () => rejectMedia(new Error('Permission denied')),
    hide: () => callbacks.get('pagehide')!(),
    counts: () => ({ resumes, closes, stops }), node,
  };
}

test('standalone microphone resumes during the gesture, rejects duplicate starts, and releases recording resources', async () => {
  const app = await harness();
  const pending = app.click();
  assert.equal(app.counts().resumes, 1);
  assert.equal(app.node('mic').disabled, true);
  await app.click();
  assert.equal(app.counts().resumes, 1);
  app.grant(); await pending;
  assert.equal(app.node('mic').textContent, '停止麥克風');
  assert.equal(app.node('mic').disabled, false);
  await app.click();
  assert.deepEqual(app.counts(), { resumes: 1, closes: 1, stops: 1 });
  assert.equal(app.node('mic').textContent, '啟用麥克風對嘴');
});

test('microphone denial closes audio without leaving the button locked', async () => {
  const app = await harness(); const pending = app.click(); app.deny(); await pending;
  assert.deepEqual(app.counts(), { resumes: 1, closes: 1, stops: 0 });
  assert.equal(app.node('mic').disabled, false);
  assert.equal(app.node('status').textContent, 'Permission denied');
});

test('leaving the page during permission request releases any subsequently granted stream', async () => {
  const app = await harness(); const pending = app.click(); app.hide(); app.grant(); await pending;
  assert.deepEqual(app.counts(), { resumes: 1, closes: 1, stops: 1 });
});
