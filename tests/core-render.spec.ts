import { expect, test } from '@playwright/test';

test('registered expressions, independent eyes, lighting, transparent PNG, and custom part transforms', async ({ page }, testInfo) => {
  // Prevent the editor's original renderer from surviving detached DOM nodes while
  // this isolated player fixture replaces the page body.
  await page.route('**/src/main.tsx', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.goto(process.env.MIO_TEST_URL ?? 'http://127.0.0.1:5174');
  await page.evaluate(async () => {
    const { CharacterPlayer } = await import('/src/core/player.ts' as string);
    const { createDefaultProject } = await import('/src/core/model.ts' as string);
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0; background:#edeaf5; display:grid; place-items:center; min-height:100vh';
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:600px;height:600px'; document.body.append(canvas);
    const project = createDefaultProject();
    project.parameters.breath = 0;
    project.parameters.windStrength = 0;
    const player = new CharacterPlayer(canvas, project);
    const state = window as any;
    state.qaPlayer = player; state.qaProject = project; state.qaCanvas = canvas;
    await player.load();
    player.setOptions({ autoBlink: false, idleMotion: false, pointerTracking: false, playing: false, background: 'transparent' }); player.seek(0);
    const snapshot = async () => {
      const blob = await player.capture(); const bitmap = await createImageBitmap(blob);
      const exported = document.createElement('canvas'); exported.width = bitmap.width; exported.height = bitmap.height;
      const ctx = exported.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return ctx.getImageData(0, 0, exported.width, exported.height);
    };
    state.qaSnapshot = snapshot; state.qaNeutral = await snapshot();
  });
  await page.screenshot({ path: testInfo.outputPath('neutral.png') });

  const alpha = await page.evaluate(() => {
    const data: ImageData = (window as any).qaNeutral;
    let opaque = 0; let transparent = 0;
    for (let i = 3; i < data.data.length; i += 4) { if (data.data[i] > 250) opaque++; if (!data.data[i]) transparent++; }
    return { width: data.width, height: data.height, corners: [data.data[3], data.data[(data.width - 1) * 4 + 3], data.data[(data.height - 1) * data.width * 4 + 3]], opaque, transparent };
  });
  expect(alpha.width).toBe(1254); expect(alpha.height).toBe(1254);
  expect(alpha.corners).toEqual([0, 0, 0]); expect(alpha.opaque).toBeGreaterThan(300_000); expect(alpha.transparent).toBeGreaterThan(400_000);

  const independent = await page.evaluate(async () => {
    const state = window as any;
    state.qaPlayer.setOptions({ parameters: { eyeOpenLeft: 0, eyeOpenRight: 1 } }); state.qaPlayer.seek(0);
    const frame: ImageData = await state.qaSnapshot(), base: ImageData = state.qaNeutral;
    const difference = (rect: any) => {
      // The v3 render includes 160px safe margins on either side.
      const x0 = Math.floor(frame.width * (0.5 + (rect.x - 0.5) * 1254 * 0.94 / 1574));
      const y0 = Math.floor(frame.height * (0.5 + (rect.y - 0.5) * 1254 * 0.94 / 1574));
      const x1 = Math.ceil(x0 + rect.width * frame.width * 1254 * 0.94 / 1574), y1 = Math.ceil(y0 + rect.height * frame.height * 1254 * 0.94 / 1574);
      let result = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * frame.width + x) * 4;
        if (Math.abs(frame.data[i] - base.data[i]) + Math.abs(frame.data[i + 1] - base.data[i + 1]) + Math.abs(frame.data[i + 2] - base.data[i + 2]) > 20) result++;
      }
      return result;
    };
    return { left: difference(state.qaProject.rig.eyeLeft), right: difference(state.qaProject.rig.eyeRight) };
  });
  expect(independent.left).toBeGreaterThan(1000); expect(independent.right).toBeLessThan(30);
  await page.screenshot({ path: testInfo.outputPath('wink.png') });

  await page.evaluate(() => { (window as any).qaPlayer.setOptions({ parameters: { eyeOpenLeft: 1, mouthOpen: 1 } }); (window as any).qaPlayer.seek(0); });
  await page.screenshot({ path: testInfo.outputPath('talk.png') });
  await page.evaluate(() => { (window as any).qaPlayer.setOptions({ parameters: { mouthOpen: 0, armRaise: 1 } }); (window as any).qaPlayer.seek(0); });
  await page.screenshot({ path: testInfo.outputPath('wave.png') });

  const lighting = await page.evaluate(async () => {
    const state = window as any; state.qaPlayer.setOptions({ parameters: undefined }); state.qaPlayer.seek(0);
    state.qaPlayer.setOptions({ lighting: { exposure: 0.6, warmth: -0.6, direction: 140, rimLight: 0.8 } });
    const frame: ImageData = await state.qaSnapshot(), base: ImageData = state.qaNeutral;
    let difference = 0;
    for (let i = 0; i < frame.data.length; i += 4) if (frame.data[i + 3] > 250) difference += Math.abs(frame.data[i] - base.data[i]) + Math.abs(frame.data[i + 1] - base.data[i + 1]) + Math.abs(frame.data[i + 2] - base.data[i + 2]);
    return difference;
  });
  expect(lighting).toBeGreaterThan(5_000_000);
  await page.screenshot({ path: testInfo.outputPath('lighting.png') });

  const custom = await page.evaluate(async () => {
    const state = window as any;
    state.qaPlayer.setOptions({ lighting: undefined });
    const asset = document.createElement('canvas'); asset.width = asset.height = 100;
    const ctx = asset.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 100, 100);
    state.qaProject.layers.push({ id: 'test-part', name: '測試元件', kind: 'custom', visible: true, locked: false, opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, src: asset.toDataURL() });
    state.qaPlayer.setProject(state.qaProject); await state.qaPlayer.load();
    const bounds = () => {
      const canvas: HTMLCanvasElement = state.qaCanvas, pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let min = Infinity, max = -Infinity, sum = 0, count = 0;
      for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
        const i = (y * pixels.width + x) * 4;
        if (pixels.data[i] > 220 && pixels.data[i + 1] < 40 && pixels.data[i + 2] < 50 && pixels.data[i + 3] > 250) { min = Math.min(min, x); max = Math.max(max, x); sum += x; count++; }
      }
      return { width: (max - min + 1) / devicePixelRatio, center: sum / count / devicePixelRatio };
    };
    const before = bounds(); state.qaPlayer.setOptions({ pan: { x: 50, y: 0 } }); const after = bounds();
    state.qaPlayer.dispose();
    return { before, after };
  });
  expect(custom.before.width).toBeGreaterThan(33); expect(custom.before.width).toBeLessThan(38);
  expect(custom.after.center - custom.before.center).toBeCloseTo(50, 0);
});
