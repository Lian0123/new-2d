import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const demoPath = process.env.PAGES_BASE_PATH || '/new-2d/';

test('static demo loads, animates, seeks, lights, and exports without an API', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [], failures: string[] = [], apiRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('request', request => { if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url()); });
  await page.goto(demoPath);
  await expect(page.getByTestId('runtime-status')).toHaveAttribute('data-state', 'ready');
  await expect.poll(async () => Number((await page.getByTestId('playback-time').innerText()).split(' / ')[0])).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: '暫停動畫', exact: true }).click();
  await page.getByRole('slider', { name: '播放時間', exact: true }).fill('0');
  const canvas = page.getByTestId('character-canvas');
  const rest = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  await page.getByRole('slider', { name: '播放時間', exact: true }).fill('2');
  await expect(page.getByTestId('playback-time')).toContainText('2.00');
  const wave = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  expect(wave).not.toBe(rest);
  await page.screenshot({ path: testInfo.outputPath('demo-desktop.png'), fullPage: true });

  for (const motion of ['風吹衣襬', '眨眼微笑', '雙手歡迎']) {
    await page.getByRole('combobox', { name: '動畫預設' }).selectOption(motion);
    await expect(page.getByTestId('runtime-status')).toHaveAttribute('data-state', 'ready');
  }
  await page.getByRole('checkbox', { name: '顯示網格' }).check();
  await page.getByRole('checkbox', { name: '視線跟隨游標' }).check();
  await page.getByRole('slider', { name: '播放時間', exact: true }).fill('2');
  await page.getByRole('checkbox', { name: '顯示網格' }).uncheck();
  const beforeLighting = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  await page.getByRole('slider', { name: '曝光', exact: true }).fill('0.8');
  expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(beforeLighting);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載透明 PNG' }).click();
  const png = await download;
  const image = sharp(await readFile((await png.path())!));
  expect(png.suggestedFilename()).toBe('mio-hana.png');
  expect(await image.metadata()).toMatchObject({ width: 1254, height: 1254, hasAlpha: true });
  expect((await image.stats()).channels.at(-1)?.min).toBe(0);
  expect((await image.stats()).channels.at(-1)?.max).toBeGreaterThan(0);
  await page.getByRole('button', { name: '重設展示' }).click();
  await expect(page.getByRole('combobox', { name: '動畫預設' })).toHaveValue('揮手招呼');
  await expect(page.getByRole('slider', { name: '曝光', exact: true })).toHaveValue('0');
  expect(errors).toEqual([]); expect(failures).toEqual([]); expect(apiRequests).toEqual([]);
});

for (const [id, name] of [['sakura', '櫻咲'], ['aoi', '蒼月'], ['yuzuki', '柚月'], ['rin', '凜音'], ['hana', '花音']]) {
  test(`${name}: every motion, expressions, mesh, tracking, and PNG work`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(demoPath);
    await page.getByRole('button', { name: `選擇${name}`, exact: true }).click();
    await expect(page.getByTestId('runtime-status')).toHaveAttribute('data-state', 'ready');
    await page.getByRole('button', { name: '暫停動畫', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '動畫預設' })).toBeEnabled();
    await expect(page.getByTestId('runtime-status')).toContainText('動畫可操作');
    await expect(page.getByRole('slider', { name: '曝光', exact: true })).toBeEnabled();
    const canvas = page.getByTestId('character-canvas');
    for (const motion of await page.getByRole('combobox', { name: '動畫預設' }).locator('option').allTextContents()) {
      await page.getByRole('combobox', { name: '動畫預設' }).selectOption(motion);
      await page.getByRole('slider', { name: '播放時間', exact: true }).fill('0');
      const first = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
      await page.getByRole('slider', { name: '播放時間', exact: true }).fill('2');
      expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL()), motion).not.toBe(first);
    }
    await page.getByRole('checkbox', { name: '顯示網格' }).check();
    const grid = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    await page.getByRole('checkbox', { name: '顯示網格' }).uncheck();
    expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(grid);
    await page.getByRole('checkbox', { name: '視線跟隨游標' }).check();
    const beforeTracking = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    await canvas.hover({ position: { x: 50, y: 100 } });
    await expect.poll(() => canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(beforeTracking);
    await page.getByRole('checkbox', { name: '視線跟隨游標' }).uncheck();
    await page.getByText('手動調整表情與動作', { exact: true }).click();
    for (const [label, value] of [['左眼睜開', '1'], ['右眼睜開', '1'], ['嘴巴開合', '0'], ['抬手揮手', '0'], ['左臂抬起', '0']]) await page.getByRole('slider', { name: label, exact: true }).fill(value);
    await page.getByRole('slider', { name: '播放時間', exact: true }).fill('0');
    const open = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    await canvas.screenshot({ path: testInfo.outputPath(`${id}-neutral.png`) });
    await page.getByRole('slider', { name: '左眼睜開', exact: true }).fill('0');
    await page.getByRole('slider', { name: '右眼睜開', exact: true }).fill('0');
    await page.getByRole('slider', { name: '嘴巴開合', exact: true }).fill('1');
    await page.getByRole('slider', { name: '播放時間', exact: true }).fill('1');
    expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(open);
    await canvas.screenshot({ path: testInfo.outputPath(`${id}-expression.png`) });
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載透明 PNG' }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`mio-${id}.png`);
    const image = sharp(await readFile((await download.path())!));
    expect(await image.metadata()).toMatchObject({ width: 1254, height: 1254, hasAlpha: true });
    expect((await image.stats()).channels.at(-1)?.min).toBe(0);
    await page.getByRole('button', { name: '恢復動畫控制' }).click();
    await page.getByRole('button', { name: '播放動畫', exact: true }).click();
    await expect.poll(async () => Number((await page.getByTestId('playback-time').innerText()).split(' / ')[0])).not.toBe(1);
    await page.getByRole('button', { name: '暫停動畫', exact: true }).click();
    await page.getByRole('button', { name: '重設展示' }).click();
    await expect(page.getByRole('combobox', { name: '動畫預設' })).toHaveValue('揮手招呼');
    expect(errors).toEqual([]);
  });
}

test('mobile demo has no overflow and remains interactive', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demoPath);
  await expect(page.getByTestId('runtime-status')).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '暫停動畫', exact: true }).click();
  await page.getByRole('slider', { name: '播放時間', exact: true }).fill('2');
  await page.screenshot({ path: testInfo.outputPath('demo-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '選擇櫻咲', exact: true }).click();
  await expect(page.getByTestId('runtime-status')).toContainText('動畫可操作');
  await expect(page.getByRole('combobox', { name: '動畫預設' })).toBeEnabled();
});

test('failed assets show a recoverable error', async ({ page }) => {
  await page.route('**/characters/hana/**', route => route.abort());
  await page.goto(demoPath);
  await expect(page.getByRole('alert')).toContainText('角色載入失敗');
  await expect(page.getByRole('button', { name: '下載透明 PNG' })).toBeDisabled();
  await page.unroute('**/characters/hana/**');
  await page.getByRole('button', { name: '重新載入' }).click();
  await expect(page.getByTestId('runtime-status')).toHaveAttribute('data-state', 'ready');
});
