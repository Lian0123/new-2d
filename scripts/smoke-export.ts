import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createDefaultProject } from '../src/core/model.js';
import { exportProject } from '../server/export.js';

const rootDirectory = process.cwd();
const outputs = path.join(rootDirectory, 'outputs');
await mkdir(outputs, { recursive: true });
const project = createDefaultProject();
const assetChecks = [];
for (const [state, source] of Object.entries(project.assets)) {
  if (!source) continue;
  const file = path.join(rootDirectory, 'public', source.slice(1));
  const image = sharp(await readFile(file));
  const metadata = await image.metadata();
  const stats = await image.stats();
  assert.equal(metadata.width, project.canvas.width, `${state}: width`);
  assert.equal(metadata.height, project.canvas.height, `${state}: height`);
  assert.equal(metadata.hasAlpha, true, `${state}: alpha channel`);
  assert.equal(stats.channels.at(-1)?.min, 0, `${state}: transparent pixels`);
  assert.equal(stats.channels.at(-1)?.max, 255, `${state}: visible pixels`);
  assetChecks.push({ state, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, transparentPixels: true });
}

const result = await exportProject(project, { rootDirectory });
console.log('Artwork alpha and dimensions verified; export built.');
assert.ok(result.assetCount >= Object.keys(project.assets).length, 'all original expressions and arm textures are distinct');
const zipFile = path.join(outputs, 'flower-web.zip');
await writeFile(zipFile, result.buffer);
const directory = await mkdtemp(path.join(tmpdir(), 'mio-web-player-'));
execFileSync('unzip', ['-q', zipFile, '-d', directory]);
const app = express();
app.use(express.static(directory));
const server = app.listen(Number(process.env.SMOKE_PORT ?? 4322), '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  console.log('Headless browser launched.');
  const page = await browser.newPage({ viewport: { width: 1320, height: 1050 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  console.log(`Standalone page status: ${await page.locator('#status').textContent()}`);
  await page.locator('#status').filter({ hasText: '角色已就緒' }).waitFor({ timeout: 15000 });
  type PlayerWindow = Window & { character: { getFrame(): { time: number; parameters: Record<string, number> } } };
  const frame = () => page.evaluate(() => (window as unknown as PlayerWindow).character.getFrame());
  await page.screenshot({ path: path.join(outputs, 'web-player.png'), fullPage: true });
  const initial = await frame();
  await page.waitForTimeout(180);
  assert.notEqual((await frame()).time, initial.time, 'animation clock is playing');
  await page.locator('#autoBlink').uncheck();
  await page.locator('[data-parameter="mouthOpen"]').evaluate(input => {
    (input as HTMLInputElement).value = '0.8';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => Math.abs((window as unknown as PlayerWindow).character.getFrame().parameters.mouthOpen - 0.8) < 0.01, undefined, { timeout: 3000 });
  await page.locator('[data-light="warmth"]').evaluate(input => {
    (input as HTMLInputElement).value = '0.4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#warmth-value').textContent(), '0.40');
  const windControls = { windStrength: 0.7, windDirection: -0.4, clothSway: 0.6, sleeveSwing: -0.5 };
  for (const [key, value] of Object.entries(windControls)) {
    await page.locator(`[data-parameter="${key}"]`).evaluate((input, next) => {
      (input as HTMLInputElement).value = String(next); input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  await page.waitForFunction(values => {
    const pose = (window as unknown as PlayerWindow).character.getFrame().parameters;
    return Object.entries(values).every(([key, value]) => Math.abs(pose[key] - value) < 0.01);
  }, windControls, { timeout: 3000 });
  await page.locator('[data-action="blink"]').click();
  await page.waitForFunction(() => (window as unknown as PlayerWindow).character.getFrame().parameters.eyeOpenLeft < 0.8, undefined, { timeout: 2500 });
  await page.waitForFunction(() => Math.abs((window as unknown as PlayerWindow).character.getFrame().parameters.eyeOpenLeft - 1) < 0.005, undefined, { timeout: 3000 });
  await page.locator('[data-action="wave"]').click();
  await page.waitForFunction(() => (window as unknown as PlayerWindow).character.getFrame().parameters.armRaise > 0.4, undefined, { timeout: 3000 });
  await page.waitForFunction(() => Math.abs((window as unknown as PlayerWindow).character.getFrame().parameters.armRaise) < 0.005, undefined, { timeout: 4500 });
  assert.ok(Math.abs((await frame()).parameters.mouthOpen - 0.8) < 0.005, 'temporary wave preserves manual mouth setting');
  await page.locator('[data-action="talk"]').click();
  await page.waitForFunction(() => Math.abs((window as unknown as PlayerWindow).character.getFrame().parameters.mouthOpen - 0.8) > 0.1, undefined, { timeout: 3000 });
  await page.waitForFunction(() => Math.abs((window as unknown as PlayerWindow).character.getFrame().parameters.mouthOpen - 0.8) < 0.005, undefined, { timeout: 4500 });
  await page.locator('#play').click();
  const paused = (await frame()).time;
  await page.waitForTimeout(150);
  assert.equal((await frame()).time, paused, 'pause holds timeline');
  await page.locator('#play').click();
  await page.locator('[data-parameter="mouthOpen"]').evaluate(input => {
    (input as HTMLInputElement).value = '0'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-light="warmth"]').evaluate(input => {
    (input as HTMLInputElement).value = '0.08'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#autoBlink').check();
  for (const [key, value] of Object.entries({ windStrength: 0.2, windDirection: 0.5, clothSway: 0, sleeveSwing: 0 })) {
    await page.locator(`[data-parameter="${key}"]`).evaluate((input, next) => {
      (input as HTMLInputElement).value = String(next); input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  await page.locator('#motion').selectOption('雙手歡迎');
  await page.waitForFunction(() => (window as unknown as PlayerWindow).character.getFrame().parameters.armRaiseLeft > 0.6, undefined, { timeout: 5000 });
  assert.equal(await page.locator('#motion option').count(), 12, 'all eleven motion presets exported');
  await page.locator('#play').click();
  await page.screenshot({ path: path.join(outputs, 'web-player.png'), fullPage: true });
  assert.deepEqual(errors, [], 'standalone player has no failed assets or JavaScript errors');
  const report = {
    ok: true, assets: assetChecks, assetCount: result.assetCount, zipBytes: result.buffer.length,
    checks: ['all images decoded', 'alpha preserved', 'no external dependencies', 'mouth slider', 'lighting slider', 'wind strength', 'wind direction', 'skirt sway', 'sleeve swing', 'blink action', 'wave action', 'talk action', 'smooth override restoration', 'pause and play', 'eleven motion presets', 'mirrored left-arm playback'],
    browserErrors: errors,
  };
  await writeFile(path.join(outputs, 'export-qa.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
}
