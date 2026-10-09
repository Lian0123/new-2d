import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1100,height:900}});
  await page.route('**/src/main.tsx',route=>route.fulfill({body:'',contentType:'application/javascript'}));
  await page.goto(process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173');
  await page.evaluate(async fallback=>{
    const {CharacterPlayer,renderCharacter} = await import('/src/core/player.ts' as string);
    const {createDefaultProject} = await import('/src/core/model.ts' as string);
    const {GpuMeshRenderer} = await import('/src/core/gpu-mesh.ts' as string);
    const project=createDefaultProject(); project.parameters.breath=0; project.parameters.windStrength=0; project.settings.idleMotion=false;
    document.body.innerHTML='<canvas style="width:850px;height:850px"></canvas>';
    const canvas=document.querySelector('canvas')!;canvas.width=canvas.height=850;
    const player=new CharacterPlayer(canvas,project); await player.load();player.pause();
    const state=window as any;state.player=player;state.project=project;state.render=renderCharacter;state.canvas=canvas;state.gpu=fallback?undefined:new GpuMeshRenderer();state.armGpu=fallback?undefined:new GpuMeshRenderer();
  },process.env.CPU_FALLBACK === '1');
  const output=process.env.CPU_FALLBACK === '1'?'outputs/v3-canvas-preview':'outputs/v3-preview';
  await mkdir(output,{recursive:true});
  for(const amount of [0,0.2,0.4,0.6,0.8,1]) {
    const uri=await page.evaluate(amount=>{
      const s=window as any;s.render(s.canvas.getContext('2d'),s.player.images,s.project,{...s.project.parameters,armRaise:amount},{background:'studio',gpu:s.gpu,armGpu:s.armGpu});return s.canvas.toDataURL();
    },amount);
    await writeFile(`${output}/arm-${amount}.png`,Buffer.from(uri.split(',')[1],'base64'));
  }
} finally {await browser.close();}
