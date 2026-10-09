import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

test('complete editor: independent layers, live controls, mesh, animation, portable project, PNG, web ZIP and persistence', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.canvas-loading')).toBeHidden();
  await expect(page.locator('.layer-row')).toHaveCount(14);
  const canvas = page.locator('canvas[aria-label="互動角色畫布"]');
  const viewport = await page.locator('.workspace').boundingBox();
  const stage = await canvas.boundingBox();
  expect(stage!.y + stage!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
  await expect(page.getByRole('button', { name: '眨眼', exact: true })).toBeVisible();
  await page.locator('.toggle-row').filter({ hasText: '自動眨眼' }).locator('input').uncheck({ force: true });
  const mouth = page.getByRole('slider', { name: '嘴巴開合', exact: true });
  await mouth.focus(); await mouth.press('End');
  await expect(mouth).toHaveValue('1');
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(mouth).toHaveValue('0');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(mouth).toHaveValue('1');

  // Three actual hair PNGs have independent opacity and position controls.
  await page.getByRole('button', { name: '前髮 · 瀏海與髮飾', exact: true }).click();
  await expect(page.locator('.part-preview')).toContainText('獨立 PNG 部件');
  await page.getByLabel('圖層 X 位置', { exact: true }).fill('20');
  await page.getByRole('button', { name: '隱藏 前髮 · 瀏海與髮飾', exact: true }).click();
  await expect(page.getByRole('button', { name: '顯示 前髮 · 瀏海與髮飾', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '顯示 前髮 · 瀏海與髮飾', exact: true }).click();
  await page.getByLabel('圖層 X 位置', { exact: true }).fill('0');

  // Imported 100px parts stay in source-pixel scale, rather than filling the stage.
  const accessory = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 210, g: 110, b: 180, alpha: 0.8 } } }).png().toBuffer();
  await page.locator('input[type=file][accept="image/png"]').setInputFiles({ name: '蝴蝶配件.png', mimeType: 'image/png', buffer: accessory });
  await expect(page.locator('.layer-row')).toHaveCount(15);
  await page.getByLabel('圖層 X 位置', { exact: true }).fill('120');
  await page.getByRole('button', { name: '往後一層', exact: true }).click();

  // Edit the real deformation cage and make sure the offset is persisted.
  await page.getByRole('button', { name: '網格綁定', exact: true }).click();
  const bounds = await canvas.boundingBox();
  const x = bounds!.x + bounds!.width / 2, y = bounds!.y + bounds!.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 20, y + 16, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(900);
  const savedMesh = await page.evaluate(() => JSON.parse(localStorage.getItem('mio-studio-project-v1')!).mesh);
  expect(savedMesh.offsets.some((p: { x: number; y: number }) => Math.abs(p.x) + Math.abs(p.y) > 0.01)).toBeTruthy();
  await page.getByRole('button', { name: '恢復綁定與網格', exact: true }).click();
  await page.getByRole('button', { name: '動畫編輯', exact: true }).click();
  await page.getByLabel('動畫預設', { exact: true }).selectOption('風吹衣襬');
  await expect(page.locator('.track-name')).toHaveCount(4);
  await page.getByRole('button', { name: '暫停動畫', exact: true }).click();
  const ruler = await page.locator('.time-ruler').boundingBox();
  await page.mouse.click(ruler!.x + ruler!.width * 0.5, ruler!.y + ruler!.height / 2);
  await expect(page.locator('.transport')).toContainText('3.00');
  await page.getByRole('button', { name: '下一影格', exact: true }).click();
  await expect(page.locator('.transport')).toContainText('3.03');
  await page.getByRole('button', { name: '上一影格', exact: true }).click();
  await expect(page.locator('.transport')).toContainText('3.00');

  // The saved file has every source and raised-arm texture inlined.
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存專案', exact: true }).click();
  const json = await jsonDownload;
  const portable = JSON.parse(await readFile((await json.path())!, 'utf8'));
  expect(portable.layers.filter((layer: { part?: string }) => !!layer.part)).toHaveLength(12);
  for (const source of Object.values(portable.assets)) expect(source).toMatch(/^data:image\/png;base64,/);
  for (const layer of portable.layers) { if (layer.src) expect(layer.src).toMatch(/^data:image\/png;base64,/); if (layer.waveSrc) expect(layer.waveSrc).toMatch(/^data:image\/png;base64,/); }
  expect(portable.timeline.tracks).toHaveLength(4);
  expect(portable.layers.find((l: { name: string }) => l.name === '蝴蝶配件').x).toBe(120);

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  const png = await pngDownload;
  const image = sharp(await readFile((await png.path())!));
  expect((await image.metadata()).hasAlpha).toBeTruthy();
  expect((await image.stats()).channels.at(-1)?.min).toBe(0);

  // Import the portable JSON and reload to exercise large-project IndexedDB saves.
  await page.locator('input[type=file][accept=".json,.mio"]').setInputFiles({ name: 'roundtrip.mio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(portable)) });
  await expect(page.locator('.toast')).toContainText('已開啟');
  await expect(page.locator('.saved-label')).toHaveText('已自動儲存', { timeout: 20000 });
  await page.reload();
  await expect(page.locator('.layer-row')).toHaveCount(15);
  await expect(page.locator('.canvas-loading')).toBeHidden();
  await page.getByRole('button', { name: '匯出網頁', exact: true }).click();
  const zipDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載網頁播放包', exact: true }).click();
  const zip = await zipDownload;
  expect((await readFile((await zip.path())!)).subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('editor-verified.png') });
});

test('mobile layout retains accessible canvas, parameters, and action controls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.canvas-loading')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBeFalsy();
  await expect(page.getByRole('button', { name: '眨眼', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '光影', exact: true }).click();
  await expect(page.getByRole('slider', { name: '光源強度', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('microphone lipsync starts on request and stops every captured track', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.goto('/');
  await expect(page.locator('.canvas-loading')).toBeHidden();
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); (window as any).qaTracks = stream.getTracks(); return stream; };
  });
  await page.getByRole('button', { name: /麥克風嘴型同步/ }).click();
  await expect(page.locator('.mic-button')).toHaveClass(/recording/);
  expect(await page.evaluate(() => (window as any).qaTracks.every((track: MediaStreamTrack) => track.readyState === 'live'))).toBeTruthy();
  await page.getByRole('button', { name: /停用麥克風/ }).click();
  await expect(page.locator('.mic-button')).not.toHaveClass(/recording/);
  expect(await page.evaluate(() => (window as any).qaTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBeTruthy();
  await expect(page.getByRole('slider', { name: '嘴巴開合', exact: true })).toHaveValue('0');
});
