import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Deterministic registration/cropping of GPT-generated art; no painting or image edits.
const directory = path.resolve('public/assets/characters/hana');
const size = 1254;
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
await mkdir(path.join(directory, 'parts'), { recursive: true });
const load = async (name: string) => sharp(path.join(directory, name)).resize(size, size).ensureAlpha().raw().toBuffer();
const write = async (name: string, data: Buffer) => sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toFile(path.join(directory, 'parts', name));
const inside = (x: number, y: number, polygon: number[][]) => { let result = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const [xi, yi] = polygon[i], [xj, yj] = polygon[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result; } return result; };
const rawBody = await load('body-base-generated.png');
const body = Buffer.from(rawBody), bodice = Buffer.alloc(rawBody.length), skirt = Buffer.alloc(rawBody.length);
const topPolygon = [[589,376],[703,376],[725,419],[772,427],[815,567],[821,638],[768,736],[518,736],[471,646],[473,566],[533,425],[577,417]];
const skirtPolygon = [[519,704],[770,704],[813,858],[945,1069],[911,1164],[295,1164],[299,1060],[430,867]];
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = (y * size + x) * 4;
  const skin = rawBody[i] - rawBody[i + 2] > 12 && rawBody[i] - rawBody[i + 1] > 10;
  const isSkirt = inside(x, y, skirtPolygon) && (y < 1060 || !skin);
  const isTop = !isSkirt && inside(x, y, topPolygon) && !(skin && (y < 421 || x < 520 || x > 774));
  if (isTop || isSkirt) { rawBody.copy(isSkirt ? skirt : bodice, i, i, i + 4); body[i + 3] = 0; }
}
await Promise.all([write('body.png', body), write('bodice.png', bodice), write('skirt.png', skirt)]);

// Register generated component bounding boxes to the original source canvas.
async function register(source: string, output: string, width: number, height: number, left: number, top: number) {
  const resized = await sharp(path.join(directory, source)).resize(width, height, { fit: 'fill' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: transparent } }).composite([{ input: resized, left, top }]).png().toFile(path.join(directory, 'parts', output));
}
await register('hair-back-generated.png', 'hair-back.png', 1030, 1045, 112, 0);
await register('hair-front-generated.png', 'hair-front.png', 442, 442, 407, -1 + 1);
await register('hair-middle-generated.png', 'hair-middle.png', 1070, 650, 92, 179);

// Original sleeve textures retain source shading and registered pixel geometry.
const source = await load('neutral.png');
const rig = JSON.parse(await readFile(path.join(directory, 'arm-rig.json'), 'utf8'));
const rest = await load('arm-rest.png'), wave = await load('arm-wave.png');
const left = Buffer.alloc(source.length);
const leftPolygon = rig.polygonsPixels.rest.map(([x, y]: number[]) => [size - x, y]);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; if (inside(x, y, leftPolygon)) source.copy(left, i, i, i + 4); }
await write('sleeve-left.png', left);
for (const [label, texture, raised] of [['rest', rest, false], ['wave', wave, true]] as const) {
  const arm = Buffer.from(texture), sleeve = Buffer.alloc(texture.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const skin = texture[i] - texture[i + 2] > 9 && texture[i] - texture[i + 1] > 7;
    const sleeveRegion = raised ? y > 441 && y < 780 : y > 534 && y < 1022;
    if (sleeveRegion && !skin) { texture.copy(sleeve, i, i, i + 4); arm[i + 3] = 0; }
  }
  await write(`arm-right-${label}.png`, arm); await write(`sleeve-right-${label}.png`, sleeve);
}
const metadata = { canvas: { width: size, height: size }, generation: 'GPT image_gen transparent assets', registration: 'body exact source registration; hair components registered to crown/temples', parts: ['hair-back.png', 'body.png', 'bodice.png', 'skirt.png', 'sleeve-left.png', 'arm-right-rest.png', 'arm-right-wave.png', 'sleeve-right-rest.png', 'sleeve-right-wave.png', 'hair-middle.png', 'hair-front.png'], limitations: ['Sleeve extraction retains painted strand overlaps from source art.', 'Hair parts are registered new artwork; outer locks differ slightly from the original complete illustration.', 'Hidden garment areas were GPT-repainted; fine occlusion seams may need artist refinement.'] };
await writeFile(path.join(directory, 'parts', 'manifest.json'), JSON.stringify(metadata, null, 2));
console.log(`Packaged ${metadata.parts.length} independent RGBA rig parts.`);
