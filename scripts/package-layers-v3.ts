import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Registration and geometric part packaging only. Reconstructed artwork comes
// from imagegen, never a color classifier or procedural paint replacement.
const base = path.resolve('public/assets/characters/hana'), size = 1254;
const output = path.join(base, 'parts-v3');
await mkdir(output, { recursive: true });
const load = (file: string) => sharp(path.join(base, file)).resize(size, size).ensureAlpha().raw().toBuffer();
const write = (file: string, pixels: Buffer) => sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toFile(path.join(output, file));
const inside = (x: number, y: number, polygon: number[][]) => {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = polygon[i], [c, d] = polygon[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) yes = !yes;
  }
  return yes;
};
const raw = await load('body-base-generated.png');
const body = Buffer.alloc(raw.length), bodice = Buffer.alloc(raw.length), skirt = Buffer.alloc(raw.length);
const topShape = [[589,376],[703,376],[725,419],[780,427],[835,567],[837,638],[780,740],[512,740],[458,646],[458,566],[525,425],[577,417]];
const skirtShape = [[519,704],[770,704],[813,858],[955,1069],[932,1175],[286,1175],[288,1060],[430,867]];
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = (y * size + x) * 4;
  const legs = y > 1070 && raw[i] - raw[i + 2] > 12 && raw[i] - raw[i + 1] > 10;
  const top = inside(x, y, topShape), hem = inside(x, y, skirtShape) && !legs;
  if (top) raw.copy(bodice, i, i, i + 4);
  if (hem) raw.copy(skirt, i, i, i + 4);
  // Neck/collar and waist overlap are deliberate, not missing pixels.
  if ((!top && !hem) || legs) raw.copy(body, i, i, i + 4);
}
await Promise.all([write('body.png', body), write('bodice.png', bodice), write('skirt.png', skirt)]);
async function register(input: string, file: string, width: number, height: number, left: number, top: number) {
  const sprite = await sharp(path.join(base, input)).resize(width, height, { fit: 'fill' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: sprite, left, top }]).png().toFile(path.join(output, file));
}
await register('hair-back-clean-v3.png', 'hair-back.png', 1120, 1120, 67, 0);
await register('hair-middle-clean-v3.png', 'hair-middle.png', 1254, 903, 0, 44);
await sharp(path.join(base, 'parts/hair-front.png')).toFile(path.join(output, 'hair-front.png'));
// Two reviewed anchors: generated shoulder (875,375) -> (797,474),
// generated cuff (1065,1025) -> approximately (956,989).
await register('arm-clean-v3.png', 'arm-registered.png', 1003, 1003, 97, 174);
const arm = await sharp(path.join(output, 'arm-registered.png')).ensureAlpha().raw().toBuffer();
const upper = Buffer.alloc(arm.length), sleeve = Buffer.alloc(arm.length);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = (y * size + x) * 4;
  if (y < 580) arm.copy(upper, i, i, i + 4);
  // Keep the entire fabric, including shaded peach/pink cloth. No skin threshold.
  const cuff = ((x - 856) * 100 + (y - 746) * 243) / (100 * 100 + 243 * 243);
  if (y >= 548 && cuff < 1.06) arm.copy(sleeve, i, i, i + 4);
}
await Promise.all([write('arm-upper.png', upper), write('sleeve.png', sleeve)]);
// Open hand is registered by the painted wrist, not by its image bounding box.
await register('hand-clean-v3.png', 'hand-open.png', 602, 602, 449, 141);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ canvas: { width: size, height: size }, revision: 3, source: 'Built-in imagegen repairs; originals retained', symmetry: 'Both arms use the same canonical sprite and mirrored joints at runtime. Symmetric hair construction retains strand detail and the original one-sided moon ornament.', seams: '32px upper/sleeve overlap, 36px bodice/skirt overlap, wrist tucked behind cuff', hand: 'One rigid five-finger sprite; no rest/wave texture crossfade', parts: ['body.png', 'bodice.png', 'skirt.png', 'hair-back.png', 'hair-middle.png', 'hair-front.png', 'arm-upper.png', 'sleeve.png', 'hand-open.png'] }, null, 2));
console.log('Packaged v3 artwork with geometric boundaries and mirrored arm reuse.');
