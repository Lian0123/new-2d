import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { characterExamples, createExampleProject } from '../src/core/examples';
import { buildBrowserRuntime, exportProject } from '../server/export';

const output=path.resolve('outputs/character-examples'); await mkdir(output,{recursive:true});
const directory=await mkdtemp(path.join(tmpdir(),'mio-examples-'));
const runtime=await buildBrowserRuntime();
const app=express();app.use(express.static(directory));
const server=app.listen(0,'127.0.0.1');
await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
const address=server.address();assert.ok(address&&typeof address==='object');
const browser=await chromium.launch({headless:true});
const report:any={date:'2026-10-10',examples:[],browserErrors:[]};
try {
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.on('pageerror',e=>report.browserErrors.push(e.message));
  for(const example of characterExamples.filter(item=>!item.layered)) {
    const result=await exportProject(createExampleProject(example.id),{runtime});
    assert.equal(result.assetCount,1,'repeated expression references share one PNG');
    const zip=path.join(output,`${example.id}-web.zip`);await writeFile(zip,result.buffer);
    const extracted=path.join(directory,example.id);await mkdir(extracted);
    execFileSync('unzip',['-q',zip,'-d',extracted]);
    await page.goto(`http://127.0.0.1:${address.port}/${example.id}/`);
    await page.locator('#status').filter({hasText:'角色已就緒'}).waitFor();
    assert.equal(await page.locator('#motion').isVisible(),false);
    assert.equal(await page.locator('[data-light="intensity"]').isVisible(),true);
    await page.evaluate(()=>(window as any).character.setOptions({background:'transparent'}));
    const before=await page.evaluate(()=>document.querySelector('canvas')!.toDataURL());
    await page.evaluate(()=>{
      (window as any).character.setOptions({parameters:{armRaise:1,angleX:30,angleZ:20,mouthOpen:1,eyeOpenLeft:0,breath:1,windStrength:1}});
      (window as any).character.seek(3);
    });
    const after=await page.evaluate(()=>document.querySelector('canvas')!.toDataURL());
    assert.equal(after,before,`${example.id}: illustration must not deform or swap patches`);
    const raw=Buffer.from(before.split(',')[1],'base64');
    const {data,info}=await sharp(raw).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let opaque=0,edge=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>12){opaque++;if(x===0||y===0||x===info.width-1||y===info.height-1)edge++;}
    assert.ok(opaque>info.width*info.height*0.05,'painted silhouette must cover at least 5% of the responsive canvas');assert.equal(edge,0);
    await writeFile(path.join(output,`${example.id}-render.png`),raw);
    await page.screenshot({path:path.join(output,`${example.id}-web.png`),fullPage:true});
    await page.locator('[data-light="warmth"]').evaluate(input=>{(input as HTMLInputElement).value='0.6';input.dispatchEvent(new Event('input',{bubbles:true}))});
    assert.notEqual(await page.evaluate(()=>document.querySelector('canvas')!.toDataURL()),before,`${example.id}: lighting should respond`);
    report.examples.push({id:example.id,name:example.name,pose:example.pose,assetCount:result.assetCount,zipBytes:result.buffer.length,opaquePixels:opaque,edgePixels:edge,anatomyUnchanged:true,lightingWorks:true});
    console.log(`${example.name}: standalone, alpha, unchanged anatomy and lighting passed.`);
  }
  assert.deepEqual(report.browserErrors,[]);report.ok=true;
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  const images=await Promise.all(report.examples.map(async(item:any,i:number)=>({input:await sharp(path.join(output,`${item.id}-render.png`)).resize(550,550).png().toBuffer(),left:i*550,top:0})));
  await sharp({create:{width:2200,height:550,channels:3,background:'#e8e1f3'}}).composite(images).png().toFile(path.join(output,'collection.png'));
}finally{await browser.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await rm(directory,{recursive:true,force:true});}
