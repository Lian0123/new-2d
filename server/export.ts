import { motionNames } from '../src/core/motions.js';
import archiver from 'archiver';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { validateProject, type Project } from '../src/core/model.js';

export const EXPORT_LIMITS = {
  jsonBytes: 48 * 1024 * 1024,
  pngBytes: 12 * 1024 * 1024,
  assetBytes: 32 * 1024 * 1024,
  zipBytes: 48 * 1024 * 1024,
  pngDimension: 8192,
} as const;

export class ExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportValidationError';
  }
}

export interface ExportOptions {
  rootDirectory?: string;
  runtime?: Uint8Array;
}

export interface ExportResult {
  filename: string;
  buffer: Buffer;
  assetCount: number;
}

/** Builds a browser-only bundle with no CDN or Node.js runtime dependency. */
export async function buildBrowserRuntime(rootDirectory = process.cwd()): Promise<Buffer> {
  const result = await build({
    entryPoints: [path.join(rootDirectory, 'src/core/embed.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    legalComments: 'none',
    write: false,
    outfile: 'runtime.js',
    logLevel: 'silent',
  });
  const runtime = result.outputFiles?.find((file) => file.path.endsWith('runtime.js'));
  if (!runtime) throw new Error('Browser runtime build did not produce runtime.js.');
  return Buffer.from(runtime.contents);
}

function assertPng(buffer: Buffer, source: string): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length > EXPORT_LIMITS.pngBytes) {
    throw new ExportValidationError(`${source}: PNG exceeds the 12 MiB limit.`);
  }
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)
    || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ExportValidationError(`${source}: expected a PNG image with a valid header.`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0 || width > EXPORT_LIMITS.pngDimension || height > EXPORT_LIMITS.pngDimension) {
    throw new ExportValidationError(`${source}: PNG dimensions must be between 1 and 8192 pixels.`);
  }
}

async function readAsset(source: string, rootDirectory: string): Promise<Buffer> {
  if (source.startsWith('data:')) {
    const prefix = 'data:image/png;base64,';
    if (!source.startsWith(prefix)) {
      throw new ExportValidationError('Imported assets must use data:image/png;base64 URLs.');
    }
    const encoded = source.slice(prefix.length);
    if (encoded.length > Math.ceil(EXPORT_LIMITS.pngBytes / 3) * 4
      || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new ExportValidationError('Imported PNG has invalid or oversized base64 data.');
    }
    const buffer = Buffer.from(encoded, 'base64');
    assertPng(buffer, 'Imported asset');
    return buffer;
  }

  // Explicitly reject protocols, queries, encoded separators, and parent segments.
  // No user-controlled URL is ever fetched by the export service.
  if (!/^\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.png$/.test(source)) {
    throw new ExportValidationError('Asset paths must be local /assets/*.png files without traversal or URLs.');
  }
  const publicRoot = await realpath(path.join(rootDirectory, 'public', 'assets'));
  let assetPath: string;
  try {
    assetPath = await realpath(path.join(rootDirectory, 'public', source.slice(1)));
    if (!assetPath.startsWith(`${publicRoot}${path.sep}`)) {
      throw new ExportValidationError('Asset symlink points outside public/assets.');
    }
    const info = await stat(assetPath);
    if (!info.isFile() || info.size > EXPORT_LIMITS.pngBytes) {
      throw new ExportValidationError('Asset is not a PNG file within the 12 MiB limit.');
    }
  } catch (error) {
    if (error instanceof ExportValidationError) throw error;
    throw new ExportValidationError(`Asset is unavailable: ${source}`);
  }
  const buffer = await readFile(assetPath);
  assertPng(buffer, source);
  return buffer;
}

function escapeHtml(value: string): string {
  const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (char) => escaped[char]);
}

export function standaloneHtml(projectName: string): string {
  const title = escapeHtml(projectName);
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Mio 2D</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='18' fill='%239770c8'/%3E%3Ctext x='32' y='45' text-anchor='middle' font-family='sans-serif' font-weight='bold' font-size='38' fill='white'%3EM%3C/text%3E%3C/svg%3E"><style>
:root{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2d2941;background:#f6f4fb;font-synthesis:none}*{box-sizing:border-box}body{margin:0}button,input{font:inherit}header{padding:26px 5vw;border-bottom:1px solid #e4dfef;display:flex;align-items:center;justify-content:space-between;background:#fff}header strong{font-size:19px;letter-spacing:-.04em}header span{font-size:12px;color:#887aab;background:#f2ecff;border:1px solid #e4dafa;padding:7px 12px;border-radius:30px}main{max-width:1120px;margin:32px auto;padding:0 24px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}.stage{min-height:680px;border:1px solid #e3deed;border-radius:22px;background:radial-gradient(ellipse at 50% 50%,#fff 5%,#f2edfa 80%);overflow:hidden;position:relative;box-shadow:0 10px 45px #7763970a;display:flex;align-items:center;justify-content:center}.stage:after{content:"MIO 2D / WEB PLAYER";position:absolute;left:22px;bottom:18px;letter-spacing:.13em;font-size:9px;color:#aa9cba;pointer-events:none}canvas{display:block;width:100%;height:100%;max-height:780px;object-fit:contain}aside{background:#fff;padding:24px;border:1px solid #e3deed;border-radius:22px;align-self:start}h1{margin:0 0 6px;font-size:22px;letter-spacing:-.04em}p{margin:0 0 24px;font-size:12px;color:#90899e;line-height:1.7}h2{font-size:11px;font-weight:600;color:#9585ad;letter-spacing:.13em;margin:24px 0 14px}label.range{display:block;font-size:12px;margin:16px 0;color:#6a607a}.range>span{display:flex;justify-content:space-between;margin-bottom:9px}.range output{font-variant-numeric:tabular-nums;color:#9d8cac}input[type=range]{width:100%;accent-color:#9770c8;height:4px}.actions{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}button{border:1px solid #e5dfee;border-radius:9px;background:#faf8fd;color:#776388;padding:10px 8px;font-size:11px;cursor:pointer}button:hover{background:#f0e9fa;border-color:#c5b1e0}button.primary{background:#9770c8;border-color:#9770c8;color:#fff;width:100%;margin-top:14px}label.check{display:flex;align-items:center;gap:8px;font-size:12px;color:#776b89;margin:14px 0}input[type=checkbox]{accent-color:#9770c8}#status{font-size:11px;min-height:34px;line-height:1.6;color:#96859e;margin-top:16px}footer{font-size:10px;color:#b0a6bd;text-align:center;padding:0 20px 30px}@media(max-width:760px){main{grid-template-columns:1fr;margin:18px auto;padding:0 14px}.stage{min-height:480px;height:70vh}aside{padding:20px}header{padding:20px}header span{display:none}}
</style></head><body><header><strong>Mio <span style="padding:0;border:0;background:none;font-size:19px;color:#9770c8">2D</span></strong><span>獨立網頁角色播放器</span></header>
<main><section class="stage"><canvas id="character" width="900" height="1200" aria-label="互動角色"></canvas></section><aside><h1>${title}</h1><p>調整表情、動作與光影，讓角色回應你的操作。</p>
<label class="range"><span>動畫動作</span><select id="motion" aria-label="動畫動作"><option value="">自訂動畫</option>${motionNames.map(name => `<option>${escapeHtml(name)}</option>`).join('')}</select></label><h2>CHARACTER / 角色控制</h2><div class="actions"><button data-action="blink">眨眼</button><button data-action="wave">揮手</button><button data-action="talk">說話</button></div>
<label class="range"><span>左右轉頭<output id="angleX-value">0</output></span><input data-parameter="angleX" type="range" min="-30" max="30" step="1" value="0"></label>
<label class="range"><span>嘴巴張開<output id="mouthOpen-value">0</output></span><input data-parameter="mouthOpen" type="range" min="0" max="1" step=".01" value="0"></label>
<label class="range"><span>揮手幅度<output id="armRaise-value">0</output></span><input data-parameter="armRaise" type="range" min="0" max="1" step=".01" value="0"></label>
<h2>LIGHT / 光影控制</h2>
<label class="range"><span>光源強度<output id="intensity-value">1</output></span><input data-light="intensity" type="range" min="0" max="2" step=".01" value="1"></label>
<label class="range"><span>輪廓高光<output id="rimLight-value">0</output></span><input data-light="rimLight" type="range" min="0" max="1" step=".01" value="0"></label>
<label class="range"><span>光源暖度<output id="warmth-value">0</output></span><input data-light="warmth" type="range" min="-1" max="1" step=".01" value="0"></label>
<h2>WIND / 服裝動態</h2>
<label class="range"><span>風力強度<output id="windStrength-value">0.2</output></span><input data-parameter="windStrength" type="range" min="0" max="1" step=".01" value="0.2"></label>
<label class="range"><span>風向左右<output id="windDirection-value">0.5</output></span><input data-parameter="windDirection" type="range" min="-1" max="1" step=".01" value="0.5"></label>
<label class="range"><span>裙襬擺動<output id="clothSway-value">0</output></span><input data-parameter="clothSway" type="range" min="-1" max="1" step=".01" value="0"></label>
<label class="range"><span>袖口擺動<output id="sleeveSwing-value">0</output></span><input data-parameter="sleeveSwing" type="range" min="-1" max="1" step=".01" value="0"></label>
<label class="check"><input id="autoBlink" type="checkbox" checked>自動眨眼</label><label class="check"><input id="pointerTracking" type="checkbox" checked>視線跟隨游標</label><button class="primary" id="mic">啟用麥克風對嘴</button><button style="width:100%;margin-top:8px" id="play">暫停動畫</button><div id="status" role="status">正在載入角色…</div>
</aside></main><footer>由 Mio 2D 製作 · 所有圖像與執行檔均包含於此資料夾</footer><script src="./runtime.js"></script><script>
(async function(){
const status=document.getElementById('status');
try{
const response=await fetch('./character.mio.json');if(!response.ok)throw new Error('無法讀取角色專案');
const project=await response.json();const canvas=document.getElementById('character');
canvas.width=project.canvas.width;canvas.height=project.canvas.height;
const player=new window.Mio2D.CharacterPlayer(canvas,project);await player.load();player.play();window.character=player;
if(project.renderMode==='illustration'){
  document.querySelectorAll('[data-parameter],#motion').forEach(input=>{input.disabled=true;input.closest('label').style.display='none'});
  document.querySelectorAll('.actions,.check,#mic,#play').forEach(node=>node.style.display='none');
  document.querySelectorAll('h2').forEach(node=>{if(!node.textContent.startsWith('LIGHT'))node.style.display='none'});
  document.querySelector('aside>p').textContent='完整姿勢插畫。調整光影，欣賞角色與服裝細節。';
  player.pause();
}

let playing=true,micStream=null,audioContext=null,micFrame=0,actionFrame=0,actionCleanup=()=>{},micBaseline=undefined,micToken=0,micPending=false;
const parameterOverrides={};
document.getElementById('motion').addEventListener('change',event=>{if(!event.target.value)return;cancelAnimationFrame(actionFrame);actionCleanup();for(const key of Object.keys(parameterOverrides))delete parameterOverrides[key];const motion=Mio2D.applyMotionPreset(project,event.target.value);project.parameters=motion.parameters;project.timeline=motion.timeline;player.setProject(project);player.setOptions({parameters:undefined});player.seek(0);player.play();playing=true;document.getElementById('play').textContent='暫停動畫'});
const apply=()=>player.setOptions({parameters:parameterOverrides,lighting:project.lighting,autoBlink:project.settings.autoBlink,idleMotion:project.settings.idleMotion,pointerTracking:project.settings.pointerTracking});
const resetOverrides=()=>{player.setOptions({parameters:undefined});apply()};
document.querySelectorAll('[data-parameter],[data-light]').forEach(input=>{
const section=input.dataset.parameter?'parameters':'lighting';const key=input.dataset.parameter||input.dataset.light;
input.value=String(project[section][key]);const output=document.getElementById(key+'-value');output.value=Number(input.value).toFixed(key==='angleX'?0:2);
input.addEventListener('input',()=>{project[section][key]=Number(input.value);if(section==='parameters')parameterOverrides[key]=Number(input.value);output.value=Number(input.value).toFixed(key==='angleX'?0:2);apply()});
});
['autoBlink','pointerTracking'].forEach(key=>{const input=document.getElementById(key);input.checked=project.settings[key];input.addEventListener('change',()=>{project.settings[key]=input.checked;apply()})});
document.getElementById('play').addEventListener('click',()=>{playing=!playing;playing?player.play():player.pause();document.getElementById('play').textContent=playing?'暫停動畫':'播放動畫'});
function action(kind){cancelAnimationFrame(actionFrame);actionCleanup();const start=performance.now(),keys=kind==='blink'?['eyeOpenLeft','eyeOpenRight']:kind==='wave'?['armRaise','wristWave']:['mouthOpen'],saved={},baseline=player.getFrame().parameters;for(const key of keys)saved[key]=parameterOverrides[key];const duration=kind==='blink'?650:kind==='wave'?3800:2400;
actionCleanup=()=>{for(const key of keys){if(saved[key]===undefined)delete parameterOverrides[key];else parameterOverrides[key]=saved[key]}resetOverrides();actionCleanup=()=>{}};
function animate(now){const t=Math.min(1,(now-start)/duration),envelope=(1-Math.cos(Math.PI*2*t))/2;
if(kind==='blink'){parameterOverrides.eyeOpenLeft=baseline.eyeOpenLeft*(1-envelope);parameterOverrides.eyeOpenRight=baseline.eyeOpenRight*(1-envelope)}
if(kind==='wave'){const phase=t<.35?t/.35:t>.65?(1-t)/.35:1,ease=phase*phase*(3-2*phase);parameterOverrides.armRaise=baseline.armRaise+(1-baseline.armRaise)*ease;parameterOverrides.wristWave=t>.35&&t<.65?Math.sin((t-.35)/.3*Math.PI*6)*.75:0}
if(kind==='talk')parameterOverrides.mouthOpen=baseline.mouthOpen*(1-envelope)+envelope*(.15+.85*(.5+.5*Math.sin(t*26-Math.PI/2)));
apply();if(t<1)actionFrame=requestAnimationFrame(animate);else actionCleanup()}actionFrame=requestAnimationFrame(animate)}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>action(button.dataset.action)));
async function stopMic(){cancelAnimationFrame(micFrame);micStream?.getTracks().forEach(track=>track.stop());micStream=null;if(audioContext)await audioContext.close();audioContext=null;if(micBaseline===undefined)delete parameterOverrides.mouthOpen;else parameterOverrides.mouthOpen=micBaseline;resetOverrides();document.querySelector('[data-action="talk"]').disabled=false;document.getElementById('mic').textContent='啟用麥克風對嘴';status.textContent='麥克風已停止。'}
document.getElementById('mic').addEventListener('click',async()=>{if(micPending)return;if(micStream){await stopMic();return}const token=++micToken,button=document.getElementById('mic');micPending=true;button.disabled=true;button.textContent='正在啟用麥克風…';try{
if(!navigator.mediaDevices?.getUserMedia)throw new Error('麥克風需要 localhost 或 HTTPS 網頁');
audioContext=new(window.AudioContext||window.webkitAudioContext)();const ready=audioContext.resume();ready.catch(()=>{});const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(token!==micToken){stream.getTracks().forEach(track=>track.stop());return}micStream=stream;await ready;if(token!==micToken)return;cancelAnimationFrame(actionFrame);actionCleanup();micBaseline=parameterOverrides.mouthOpen;const source=audioContext.createMediaStreamSource(micStream),analyser=audioContext.createAnalyser();analyser.fftSize=512;source.connect(analyser);const data=new Uint8Array(analyser.fftSize);
function sample(){analyser.getByteTimeDomainData(data);let sum=0;for(const value of data){const n=(value-128)/128;sum+=n*n}parameterOverrides.mouthOpen=Math.min(1,Math.max(0,(Math.sqrt(sum/data.length)-.015)*10));apply();micFrame=requestAnimationFrame(sample)}sample();document.querySelector('[data-action="talk"]').disabled=true;document.getElementById('mic').textContent='停止麥克風';status.textContent='正在使用麥克風音量控制嘴型，聲音只在此瀏覽器處理。';
}catch(error){micStream?.getTracks().forEach(track=>track.stop());micStream=null;if(audioContext&&audioContext.state!=='closed')await audioContext.close();audioContext=null;button.textContent='啟用麥克風對嘴';status.textContent=error.message||'麥克風未獲授權。'}finally{micPending=false;button.disabled=false}});
window.addEventListener('pagehide',()=>{micToken++;cancelAnimationFrame(micFrame);cancelAnimationFrame(actionFrame);micStream?.getTracks().forEach(track=>track.stop());audioContext?.close();player.pause()});
status.textContent='角色已就緒。可以使用上方控制項。';
}catch(error){status.textContent='載入失敗：'+error.message+'。請以本機 HTTP 伺服器或網站開啟此資料夾。';console.error(error)}
})();
</script></body></html>`;
}

function integrationReadme(name: string): string {
  const tick = String.fromCharCode(96);
  return `# ${name.replace(/[\r\n]/g, ' ')} — Mio 2D web package

This ZIP contains a complete static web player. Upload all files to one directory on any static host and open index.html. For a local preview, serve the extracted directory over HTTP, for example with ${tick}npx http-server .${tick}. Opening index.html directly with file:// is not supported because browsers block project fetches. Microphone lip sync requires localhost or HTTPS and starts only after clicking its button.

Files:
- index.html: standalone player and controls, no external CDN dependency.
- character.mio.json: editable, validated version 1 project.
- runtime.js: TypeScript player bundled for the browser.
- assets/: original PNG character artwork and imported layer artwork.

Keep character.mio.json beside its assets directory: it contains relative image paths and is not a single-file portable project. To reopen a project on another computer in the editor, use the editor's Save Project command, which embeds the images into its .mio.json file. The web ZIP should be transferred or uploaded as a complete directory.

## Embed in your website

${tick.repeat(3)}html
<canvas id="character" width="900" height="1200"></canvas>
<script src="./runtime.js"></script>
<script>
  async function start() {
    const project = await fetch('./character.mio.json').then(r => r.json());
    const player = new Mio2D.CharacterPlayer(document.querySelector('#character'), project);
    await player.load();
    player.play();
    project.parameters.mouthOpen = 0.7;
    project.parameters.armRaise = 0.8;
    project.lighting.rimLight = 0.5;
    player.setProject(project);
    // player.pause(); player.seek(1.2);
    window.character = player;
  }
  start();
</script>
${tick.repeat(3)}

Parameter names: angleX, angleY, angleZ, eyeOpenLeft, eyeOpenRight, eyeX, eyeY, mouthOpen, mouthSmile, browY, breath, armRaise, armRaiseLeft, wristWave, wristWaveLeft, hairSway, windStrength, windDirection, clothSway, sleeveSwing. Settings: autoBlink, idleMotion, pointerTracking. Lighting: intensity, exposure, shadow, softness, rimLight, warmth, direction. See the main application's docs/FORMAT.md for exact ranges and schema. Temporary parameter overrides can be applied with player.setOptions({ parameters: { mouthOpen: 0.7 } }) and cleared with player.setOptions({ parameters: undefined }) to resume timeline control. Preset motions blend from the current pose and use smooth eased envelopes to return to their starting pose. Wind, skirt movement, and sleeves can be controlled independently.

This is an independent foundational 2D character editor and Canvas runtime. It does not read or export proprietary Live2D Cubism .moc3 files. The default character uses generated expression variants, local region transforms, and optional armless/armRest/armWave textures for a single smooth animated limb. The lighting controls modify the 2D render and cannot reconstruct hidden geometry or physically relight painted artwork. Imported transparent PNG layers support separate transforms and compositing.
`;
}

async function createZip(entries: Map<string, Buffer>): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  const completed = new Promise<Buffer>((resolve, reject) => {
    output.on('data', (chunk: Buffer) => {
      byteLength += chunk.length;
      if (byteLength > EXPORT_LIMITS.zipBytes) {
        archive.abort();
        output.destroy(new ExportValidationError('Export exceeds the 48 MiB ZIP limit.'));
        return;
      }
      chunks.push(chunk);
    });
    output.once('end', () => resolve(Buffer.concat(chunks)));
    output.once('error', reject);
    archive.once('error', (error) => output.destroy(error));
    archive.on('warning', (error) => output.destroy(error));
  });
  archive.pipe(output);
  for (const [name, buffer] of entries) archive.append(buffer, { name });
  await Promise.all([archive.finalize(), completed]);
  return completed;
}

/** Validates, copies local PNGs, then fully builds the ZIP before HTTP delivery. */
export async function exportProject(input: unknown, options: ExportOptions = {}): Promise<ExportResult> {
  let project: Project;
  try {
    project = validateProject(input);
  } catch (error) {
    throw new ExportValidationError(error instanceof Error ? error.message : 'Invalid project.');
  }
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const files = new Map<string, Buffer>();
  const copiedSources = new Map<string, string>();
  const copiedHashes = new Map<string, string>();
  let assetBytes = 0;
  let characterDimensions: { width: number; height: number } | undefined;

  function assertCharacterDimensions(buffer: Buffer, label: string): void {
    const dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (characterDimensions && (dimensions.width !== characterDimensions.width || dimensions.height !== characterDimensions.height)) {
      throw new ExportValidationError(`Character ${label} PNG must have the same dimensions as neutral.`);
    }
    characterDimensions ??= dimensions;
  }

  async function copyAsset(source: string, label: string, character = false): Promise<string> {
    const existing = copiedSources.get(source);
    if (existing) {
      if (character) assertCharacterDimensions(files.get(existing)!, label);
      return existing;
    }
    const buffer = await readAsset(source, rootDirectory);
    if (character) assertCharacterDimensions(buffer, label);
    const digest = createHash('sha256').update(buffer).digest('hex');
    const sameImage = copiedHashes.get(digest);
    if (sameImage) {
      copiedSources.set(source, sameImage);
      return sameImage;
    }
    assetBytes += buffer.length;
    if (assetBytes > EXPORT_LIMITS.assetBytes) {
      throw new ExportValidationError('Total referenced PNG assets exceed the 32 MiB limit.');
    }
    const filename = `assets/${String(copiedHashes.size + 1).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || 'image'}.png`;
    files.set(filename, buffer);
    copiedSources.set(source, filename);
    copiedHashes.set(digest, filename);
    return filename;
  }

  for (const key of Object.keys(project.assets) as (keyof Project['assets'])[]) {
    const source = project.assets[key];
    if (source) project.assets[key] = await copyAsset(source, key, true);
  }
  for (const layer of project.layers) {
    if (layer.src) layer.src = await copyAsset(layer.src, `layer-${layer.id}`);
    if (layer.waveSrc) layer.waveSrc = await copyAsset(layer.waveSrc, `wave-${layer.id}`);
  }
  files.set('character.mio.json', Buffer.from(JSON.stringify(project, null, 2)));
  files.set('index.html', Buffer.from(standaloneHtml(project.name)));
  files.set('README.md', Buffer.from(integrationReadme(project.name)));
  files.set('runtime.js', Buffer.from(options.runtime ?? await buildBrowserRuntime(rootDirectory)));
  const filename = `${project.name.normalize('NFKD').replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'mio-character'}.zip`;
  return { filename, buffer: await createZip(files), assetCount: copiedHashes.size };
}
