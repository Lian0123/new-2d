import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { motionNames } from '../src/core/motions';

const output=path.resolve('outputs/motion-qa');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const report: any={fps:30,framesPerMotion:181,totalFrames:0,motions:[],browserErrors:[],checks:['every frame rendered in Chromium','all artwork decoded','alpha bounds and torso coverage at every frame','fixed bone lengths and rigid hand geometry covered by unit tests'],visualReview:'pending'};
try {
  const page=await browser.newPage({viewport:{width:900,height:760}});
  page.on('pageerror',error=>report.browserErrors.push(error.message));
  await page.route('**/src/main.tsx',route=>route.fulfill({body:'',contentType:'application/javascript'}));
  await page.goto(process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5174');
  await page.evaluate(async()=>{
    const {CharacterPlayer,renderCharacter}=await import('/src/core/player.ts' as string);
    const {createDefaultProject,evaluatePose}=await import('/src/core/model.ts' as string);
    const {applyMotionPreset}=await import('/src/core/motions.ts' as string);
    const {GpuMeshRenderer}=await import('/src/core/gpu-mesh.ts' as string);
    document.body.innerHTML='<canvas></canvas>';
    const canvas=document.querySelector('canvas')!;canvas.width=800;canvas.height=640;canvas.style.cssText='width:800px;height:640px';
    const project=createDefaultProject();const player=new CharacterPlayer(canvas,project);await player.load();player.pause();
    (window as any).qa={player,canvas,project,renderCharacter,evaluatePose,applyMotionPreset,gpu:new GpuMeshRenderer(),armGpu:new GpuMeshRenderer(),surface:document.createElement('canvas')};
  });
  for(const [motionIndex,name] of motionNames.entries()) {
    const directory=path.join(output,`motion-${motionIndex}`);await mkdir(directory,{recursive:true});
    let edgeMax=0,coverageMin=1;const frameFiles:string[]=[];
    for(let frame=0;frame<=180;frame++) {
      const result=await page.evaluate(({name,frame})=>{
        const q=(window as any).qa;const project=q.applyMotionPreset(q.project,name);
        // Deterministic QA: explicit timeline poses and flowing material motion,
        // without random auto-blinks or real-time smoothing affecting frame timing.
        project.settings.autoBlink=false;project.settings.idleMotion=false;
        const pose=q.evaluatePose(project,frame/30);
        q.renderCharacter(q.canvas.getContext('2d'),q.player.images,project,pose,{background:'transparent',time:frame/30,motionTime:frame/30,surface:q.surface,gpu:q.gpu,armGpu:q.armGpu});
        const ctx=q.canvas.getContext('2d'),data=ctx.getImageData(0,0,800,640).data;
        let edge=0;for(let y=0;y<640;y++) {edge+=data[(y*800)*4+3]>8?1:0;edge+=data[(y*800+799)*4+3]>8?1:0;}
        const fit=Math.min(800*.94/1574,640*.97/1254);let opaque=0;
        for(const [x,y] of [[580,540],[650,570],[720,620],[610,680],[690,690],[630,760]]) {
          const dx=Math.round(400+(x-627)*fit),dy=Math.round(320+(y-627)*fit);
          if(data[(dy*800+dx)*4+3]>245) opaque++;
        }
        // The PNG records the actual transparent render before checkerboard is added.
        const png=q.canvas.toDataURL('image/png');
        const view=document.createElement('canvas');view.width=800;view.height=640;const v=view.getContext('2d')!;
        v.fillStyle='#f1edf7';v.fillRect(0,0,800,640);v.drawImage(q.canvas,0,0);
        v.fillStyle='#574775';v.font='15px sans-serif';v.fillText(`${name} · ${frame}/180 · ${(frame/30).toFixed(3)}s`,16,24);
        return {png,view:view.toDataURL('image/webp',.86),edge,coverage:opaque/6};
      },{name,frame});
      assert.equal(result.edge,0,`${name} frame ${frame}: clipped at side`);
      assert.equal(result.coverage,1,`${name} frame ${frame}: torso hole`);
      edgeMax=Math.max(edgeMax,result.edge);coverageMin=Math.min(coverageMin,result.coverage);
      const file=path.join(directory,`${String(frame).padStart(3,'0')}.webp`);
      await writeFile(file,Buffer.from(result.view.split(',')[1],'base64'));frameFiles.push(file);
      if([0,30,60,90,120,150,180].includes(frame)) await writeFile(path.join(directory,`${String(frame).padStart(3,'0')}.png`),Buffer.from(result.png.split(',')[1],'base64'));
    }
    const sheets=[];
    for(let start=0;start<181;start+=60) {
      const images=await Promise.all(frameFiles.slice(start,start+60).map((file,index)=>sharp(file).resize(200,160).png().toBuffer().then(input=>({input,left:index%6*200,top:Math.floor(index/6)*180+20}))));
      const sheet=`sheet-${motionIndex}-${Math.floor(start/60)}.png`;
      await sharp({create:{width:1200,height:Math.ceil(images.length/6)*180+20,channels:3,background:'#eeeaf4'}}).composite(images).png().toFile(path.join(output,sheet));sheets.push(sheet);
    }
    report.totalFrames+=181;report.motions.push({name,index:motionIndex,frames:181,edgeMax,coverageMin,sheets});
    console.log(`${name}: 181 frames passed, no side clipping or torso alpha gaps.`);
  }
  assert.deepEqual(report.browserErrors,[]);
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>花音逐幀檢視</title><style>body{margin:24px;background:#201e29;color:#eee;font:16px system-ui}main{max-width:1000px;margin:auto}img{width:100%;max-height:75vh;object-fit:contain}button,select,input{font:inherit;margin:6px}section{display:flex;align-items:center;gap:12px}input{flex:1}</style><main><h1>花音 · 逐幀檢視</h1><p>11 個動作，每個 181 幀（30 FPS，含 6 秒終點）。左右鍵切換影格；原尺寸透明 PNG 每秒保存一張。</p><select id="motion">${motionNames.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}</select><section><button id="prev">上一幀</button><input id="frame" type="range" min="0" max="180" value="0"><button id="next">下一幀</button><output id="label"></output></section><img id="image"><p id="sheets"></p></main><script>const m=document.getElementById('motion'),f=document.getElementById('frame');function draw(){document.getElementById('image').src='motion-'+m.value+'/'+String(f.value).padStart(3,'0')+'.webp';document.getElementById('label').textContent=f.value+'/180';document.getElementById('sheets').innerHTML=[0,1,2,3].map(i=>'<a style="color:#d6c2ff;margin:8px" href="sheet-'+m.value+'-'+i+'.png">影格總覽 '+(i+1)+'</a>').join('')}function step(n){f.value=Math.max(0,Math.min(180,Number(f.value)+n));draw()}m.onchange=f.oninput=draw;document.getElementById('prev').onclick=()=>step(-1);document.getElementById('next').onclick=()=>step(1);onkeydown=e=>{if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1)};draw();</script></html>`);
}finally{await browser.close();}
