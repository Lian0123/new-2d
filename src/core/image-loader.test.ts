import test from 'node:test';
import assert from 'node:assert/strict';
import { loadImage } from './image-loader';

test('image loading bounds parallel transfers, shares pending URLs, and recovers after errors', async () => {
  const original = globalThis.Image;
  let active = 0, peak = 0;
  const requests: string[] = [];
  class FakeImage {
    crossOrigin = ''; decoding = ''; fetchPriority = ''; naturalWidth = 1254; naturalHeight = 1254;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) {
      assert.equal(this.fetchPriority, 'high');
      requests.push(value); active++; peak = Math.max(peak, active);
      queueMicrotask(() => { active--; if (value === 'broken.png') this.onerror?.(); else this.onload?.(); });
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  try {
    const first = loadImage('a.png');
    assert.equal(loadImage('a.png'), first);
    const results = await Promise.allSettled([first, ...['b.png', 'broken.png', 'c.png', 'd.png'].map(loadImage)]);
    assert.equal(peak, 2); assert.equal(active, 0);
    assert.equal(requests.filter(src => src === 'a.png').length, 1);
    assert.equal(results[2].status, 'rejected');
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 4);
    await assert.rejects(loadImage('broken.png'), /載入失敗/);
    assert.equal(requests.filter(src => src === 'broken.png').length, 2);
    assert.equal((await loadImage('e.png')).naturalWidth, 1254);
  } finally { globalThis.Image = original; }
});
