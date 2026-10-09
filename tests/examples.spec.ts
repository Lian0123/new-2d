import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

test('pose gallery loads all four characters, preserves illustration controls, saves and restores', async ({page}) => {
  test.setTimeout(120000);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await mkdir('outputs/character-examples',{recursive:true});
  await page.goto('/'); await expect(page.locator('.canvas-loading')).toBeHidden();
  await page.getByRole('button',{name:'角色範例',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'角色範例',exact:true})).toBeVisible();
  await expect(page.locator('.example-card')).toHaveCount(5);
  await page.screenshot({path:'outputs/character-examples/gallery-desktop.png'});
  for(const [id,name,pose] of [['sakura','櫻咲','側身比耶'],['aoi','蒼月','叉腰站姿'],['yuzuki','柚月','坐姿閱讀'],['rin','凜音','抬腿敬禮']]) {
    if(id!=='sakura') await page.getByRole('button',{name:'角色範例',exact:true}).click();
    await page.getByRole('button',{name:`載入${name} · ${pose}`,exact:true}).click();
    await expect(page.locator('.canvas-loading')).toBeHidden();
    await expect(page.locator('.character-card')).toContainText(name);
    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'網格綁定',exact:true})).toBeDisabled();
    await expect(page.locator('.quick-actions')).toHaveCount(0);
    await page.screenshot({path:`outputs/character-examples/${id}-studio.png`});
    const downloadEvent=page.waitForEvent('download');
    await page.getByRole('button',{name:'儲存專案',exact:true}).click();
    const download=await downloadEvent;
    const project=JSON.parse(await readFile((await download.path())!,'utf8'));
    expect(project.renderMode).toBe('illustration');
    expect(project.assets.neutral).toMatch(/^data:image\/png/);
    await download.saveAs(`outputs/character-examples/${id}.mio.json`);
  }
  await page.getByRole('button',{name:'參數',exact:true}).click();
  await page.getByRole('slider',{name:'角色旋轉',exact:true}).fill('10');
  await expect(page.locator('.saved-label')).toContainText('已自動儲存');
  await page.reload(); await expect(page.locator('.canvas-loading')).toBeHidden();
  await expect(page.locator('.character-card')).toContainText('凜音');
  await page.getByRole('button',{name:'參數',exact:true}).click();
  await expect(page.getByRole('slider',{name:'角色旋轉',exact:true})).toHaveValue('10');
  const pngEvent=page.waitForEvent('download'); await page.getByTitle('下載透明 PNG').click();
  const png=await pngEvent; const meta=await sharp(await readFile((await png.path())!)).metadata();
  expect(meta.hasAlpha).toBe(true);
  await page.getByRole('button',{name:'角色範例',exact:true}).click();
  await page.getByRole('button',{name:'載入花音 · 正面 · 分層動畫',exact:true}).click();
  await expect(page.locator('.canvas-loading')).toBeHidden();
  await expect(page.locator('.layer-row')).toHaveCount(14);
  await expect(page.getByRole('button',{name:'揮手',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile gallery stays within viewport and opens the seated character', async ({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await page.getByRole('button',{name:'角色範例',exact:true}).click();
  await page.screenshot({path:'outputs/character-examples/gallery-mobile.png'});
  const bounds=await page.getByRole('dialog',{name:'角色範例',exact:true}).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'載入柚月 · 坐姿閱讀',exact:true}).click();
  await expect(page.locator('.canvas-loading')).toBeHidden();
  await page.getByRole('button',{name:'參數',exact:true}).click();
  await expect(page.getByRole('slider',{name:'角色縮放',exact:true})).toBeVisible();
});
