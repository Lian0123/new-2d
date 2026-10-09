import { clamp, createDefaultProject, evaluatePose, smoothPose, type Layer, type Lighting, type Parameters, type Point, type Project, type Rect } from './model';
import { GpuMeshRenderer } from './gpu-mesh';
import { articulatedPose, handAnchor, handRotation, skinArmPoint } from './arm-rig';

export interface PlayerOptions {
  mesh?: boolean; background?: 'studio' | 'transparent' | 'dark';
  zoom?: number; pan?: Point; playing?: boolean; selectedLayer?: string; editing?: boolean;
  parameters?: Partial<Parameters>; lighting?: Partial<Lighting>;
  autoBlink?: boolean; idleMotion?: boolean; pointerTracking?: boolean;
}

export interface CharacterImages {
  neutral: HTMLImageElement; blink: HTMLImageElement; talk: HTMLImageElement; wave: HTMLImageElement;
  custom: Map<string, HTMLImageElement>;
  hairMask?: HTMLCanvasElement; armMask?: HTMLCanvasElement; clothingMask?: HTMLCanvasElement;
  armless?: HTMLImageElement; armRest?: HTMLCanvasElement; armWave?: HTMLCanvasElement;
  parts: Map<string, HTMLCanvasElement>;
}

export interface RenderOptions extends PlayerOptions {
  time?: number; motionTime?: number; pointer?: Point;
  surface?: HTMLCanvasElement; overlay?: boolean;
  gpu?: GpuMeshRenderer; armGpu?: GpuMeshRenderer;
}

const smooth = (a: number, b: number, value: number): number => { const x = clamp((value - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const radians = (degrees: number): number => degrees * Math.PI / 180;
const activeLayer = (project: Project, kind: Layer['kind']): Layer | undefined => project.layers.find(l => l.kind === kind);
const layerAmount = (layer: Layer | undefined): number => layer ? (layer.visible ? layer.opacity : 0) : 1;
const compositionCache = new WeakMap<HTMLCanvasElement, string>();
const compositionVersion = new WeakMap<HTMLCanvasElement, number>();

export interface ArmJoints { shoulder: Point; elbow: Point; wrist: Point }

const sourceArmJoints = (raised: boolean, width: number, height: number): ArmJoints => ({
  shoulder: { x: 797 / 1254 * width, y: 474 / 1254 * height },
  elbow: { x: (raised ? 929 : 856) / 1254 * width, y: (raised ? 710 : 746) / 1254 * height },
  wrist: { x: (raised ? 908 : 956) / 1254 * width, y: (raised ? 497 : 989) / 1254 * height },
});

/** Interpolate actual bone angles, so the forearm takes one continuous outward
 * arc instead of two complete poses becoming simultaneously visible. */
export function armJointsAt(progress: number, width: number, height: number): ArmJoints {
  const amount = clamp(progress, 0, 1), rest = sourceArmJoints(false, width, height), wave = sourceArmJoints(true, width, height);
  const endpoint = (fromStart: Point, fromEnd: Point, toStart: Point, toEnd: Point, origin: Point): Point => {
    const fromAngle = Math.atan2(fromEnd.y - fromStart.y, fromEnd.x - fromStart.x);
    const toAngle = Math.atan2(toEnd.y - toStart.y, toEnd.x - toStart.x);
    let delta = toAngle - fromAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const angle = fromAngle + delta * amount;
    const length = Math.hypot(fromEnd.x - fromStart.x, fromEnd.y - fromStart.y) * (1 - amount) + Math.hypot(toEnd.x - toStart.x, toEnd.y - toStart.y) * amount;
    return { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length };
  };
  const shoulder = rest.shoulder, elbow = endpoint(rest.shoulder, rest.elbow, wave.shoulder, wave.elbow, shoulder);
  return { shoulder, elbow, wrist: endpoint(rest.elbow, rest.wrist, wave.elbow, wave.wrist, elbow) };
}

function mapArmPoint(point: Point, source: ArmJoints, target: ArmJoints): Point {
  const mapSegment = (start: Point, end: Point, nextStart: Point, nextEnd: Point) => {
    const sx = end.x - start.x, sy = end.y - start.y, sourceLength = Math.hypot(sx, sy);
    const along = ((point.x - start.x) * sx + (point.y - start.y) * sy) / (sourceLength * sourceLength);
    const across = ((point.y - start.y) * sx - (point.x - start.x) * sy) / sourceLength;
    const dx = nextEnd.x - nextStart.x, dy = nextEnd.y - nextStart.y, targetLength = Math.hypot(dx, dy);
    const nearest = clamp(along, 0, 1);
    const distance = Math.hypot(point.x - start.x - nearest * sx, point.y - start.y - nearest * sy);
    const widthScale = Math.pow(targetLength / sourceLength, 0.20);
    return { point: { x: nextStart.x + along * dx - across * dy / targetLength * widthScale, y: nextStart.y + along * dy + across * dx / targetLength * widthScale }, distance, along };
  };
  const upper = mapSegment(source.shoulder, source.elbow, target.shoulder, target.elbow);
  const lower = mapSegment(source.elbow, source.wrist, target.elbow, target.wrist);
  const elbowDistance = Math.hypot(point.x - source.elbow.x, point.y - source.elbow.y);
  const mix = elbowDistance < 38 ? smooth(-18, 18, upper.distance - lower.distance) : upper.distance < lower.distance ? 0 : 1;
  return { x: upper.point.x * (1 - mix) + lower.point.x * mix, y: upper.point.y * (1 - mix) + lower.point.y * mix };
}

function drawArticulatedArm(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, raisedSource: boolean, amount: number, gpu?: GpuMeshRenderer): void {
  const width = source.width, height = source.height;
  if ((!raisedSource && amount < 0.0005) || (raisedSource && amount > 0.9995)) { ctx.drawImage(source, 0, 0); return; }
  const from = sourceArmJoints(raisedSource, width, height), target = armJointsAt(amount, width, height);
  const original: Point[][] = [], distorted: Point[][] = [];
  const columns = 12, rows = 28;
  for (let r = 0; r <= rows; r++) {
    original[r] = []; distorted[r] = [];
    for (let c = 0; c <= columns; c++) {
      const p = { x: width * (0.608 + c / columns * 0.23), y: height * ((raisedSource ? 0.195 : 0.337) + r / rows * (raisedSource ? 0.425 : 0.61)) };
      original[r][c] = p; distorted[r][c] = mapArmPoint(p, from, target);
    }
  }
  const accelerated = gpu?.render(source, original, distorted, raisedSource ? 2 : 1);
  if (accelerated && gpu) { ctx.drawImage(accelerated, -gpu.padding, -gpu.padding, accelerated.width / gpu.renderScale, accelerated.height / gpu.renderScale); return; }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    drawTriangle(ctx, source, [original[r][c], original[r][c + 1], original[r + 1][c]], [distorted[r][c], distorted[r][c + 1], distorted[r + 1][c]]);
    drawTriangle(ctx, source, [original[r + 1][c], original[r][c + 1], original[r + 1][c + 1]], [distorted[r + 1][c], distorted[r][c + 1], distorted[r + 1][c + 1]]);
  }
}

/** Draw the new arm cage in source coordinates. The hand bypasses this cage. */
function drawRigPart(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, part: Layer['part'], raise: number, wave: number, gpu?: GpuMeshRenderer, sleeveSwing = 0): void {
  const w = source.width, h = source.height, sx = w / 1254, sy = h / 1254;
  const left = part === 'armLeft' || part === 'sleeveLeft' || part === 'handLeft';
  ctx.save();
  if (left) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  if (part === 'handLeft' || part === 'handRight') {
    const target = articulatedPose(raise).wrist;
    ctx.translate(target.x * sx, target.y * sy);
    ctx.rotate(handRotation(raise, wave));
    ctx.drawImage(source, -handAnchor.x * sx, -handAnchor.y * sy);
  } else if (raise < 0.00001 && Math.abs(sleeveSwing) < 0.00001) ctx.drawImage(source, 0, 0);
  else {
    const original: Point[][] = [], distorted: Point[][] = [];
    const columns = 16, rows = 40;
    for (let r = 0; r <= rows; r++) {
      original[r] = []; distorted[r] = [];
      for (let c = 0; c <= columns; c++) {
        const p = { x: 760 + c / columns * 300, y: 420 + r / rows * 660 };
        const q = skinArmPoint(p, raise);
        if (part === 'sleeveLeft' || part === 'sleeveRight') {
          const belly = Math.sin(Math.PI * clamp((p.y - 548) / (1040 - 548), 0, 1));
          q.x += sleeveSwing * 6 * belly * belly;
        }
        original[r][c] = { x: p.x * sx, y: p.y * sy }; distorted[r][c] = { x: q.x * sx, y: q.y * sy };
      }
    }
    drawCage(ctx, source, original, distorted, gpu);
  }
  ctx.restore();
}

function drawCage(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, original: Point[][], distorted: Point[][], gpu?: GpuMeshRenderer): void {
  const accelerated = gpu?.render(source, original, distorted, 1);
  if (accelerated && gpu) { ctx.drawImage(accelerated, -gpu.padding, -gpu.padding, accelerated.width / gpu.renderScale, accelerated.height / gpu.renderScale); return; }
  for (let r = 0; r < original.length - 1; r++) for (let c = 0; c < original[0].length - 1; c++) {
    drawTriangle(ctx, source, [original[r][c], original[r][c + 1], original[r + 1][c]], [distorted[r][c], distorted[r][c + 1], distorted[r + 1][c]]);
    drawTriangle(ctx, source, [original[r + 1][c], original[r][c + 1], original[r + 1][c + 1]], [distorted[r + 1][c], distorted[r][c + 1], distorted[r + 1][c + 1]]);
  }
}

/** Move only the intended independent part. Hair wind cannot stretch fingers
 * or punch gaps in the blouse underneath it. */
function drawFlowingPart(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, part: Layer['part'], pose: Parameters, time: number, idle: boolean, gpu?: GpuMeshRenderer): void {
  const w = source.width, h = source.height;
  const original: Point[][] = [], distorted: Point[][] = [];
  const columns = 14, rows = 24;
  for (let r = 0; r <= rows; r++) {
    original[r] = []; distorted[r] = [];
    for (let c = 0; c <= columns; c++) {
      const u = c / columns, v = r / rows;
      const p = { x: u * w, y: v * h };
      const wind = pose.windStrength * pose.windDirection;
      let dx = 0, dy = 0;
      if (part === 'skirt') {
        const hem = smooth(704 / 1254, 1110 / 1254, v);
        const sway = pose.clothSway + wind * (0.65 + Math.sin(time * 2.6 - u * 6) * 0.12);
        dx = w * 0.013 * hem * sway; dy = h * hem * (u - 0.5) * sway * 0.014;
      } else {
        const fall = smooth(part === 'hairBack' ? 0.16 : 0.18, 0.77, v);
        const gust = 0.75 + Math.sin(time * 1.3) * 0.16;
        dx = w * 0.018 * fall * (pose.hairSway + wind * gust + (idle ? Math.sin(time * 1.9 + v * 4) * 0.08 : 0));
        dy = -h * fall * pose.windStrength * 0.002 * Math.sin(time * 2.2 + v * 4);
      }
      original[r][c] = p; distorted[r][c] = { x: p.x + dx, y: p.y + dy };
    }
  }
  drawCage(ctx, source, original, distorted, gpu);
}

/** A source-aware matte for the bundled hair and resting arm. Imported independent
 * PNG parts remain preferable when exact production layer boundaries are needed. */
function buildPartMasks(image: HTMLImageElement): { hairMask: HTMLCanvasElement; armMask: HTMLCanvasElement; clothingMask: HTMLCanvasElement } {
  const width = image.naturalWidth, height = image.naturalHeight;
  const source = document.createElement('canvas'); source.width = width; source.height = height;
  const context = source.getContext('2d', { willReadFrequently: true })!; context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  const hairMask = document.createElement('canvas'), armMask = document.createElement('canvas'), clothingMask = document.createElement('canvas');
  hairMask.width = armMask.width = clothingMask.width = width; hairMask.height = armMask.height = clothingMask.height = height;
  const hairCtx = hairMask.getContext('2d')!, armCtx = armMask.getContext('2d')!, clothingCtx = clothingMask.getContext('2d')!;
  const hairPixels = hairCtx.createImageData(width, height), armPixels = armCtx.createImageData(width, height), clothingPixels = clothingCtx.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4, u = x / width, v = y / height;
    const r = pixels.data[at], g = pixels.data[at + 1], b = pixels.data[at + 2], alpha = pixels.data[at + 3];
    const inFace = u > 0.418 && u < 0.600 && v > 0.166 && v < 0.311;
    const hairZone = v < 0.32 || (v < 0.88 && (u < 0.43 || u > 0.61));
    const lavender = smooth(2, 13, b - r) * smooth(4, 17, b - g);
    const hair = !inFace && hairZone ? lavender : 0;
    hairPixels.data[at] = hairPixels.data[at + 1] = hairPixels.data[at + 2] = 255;
    hairPixels.data[at + 3] = Math.round(alpha * hair);
    // Skin and white sleeve pixels in the resting right-arm region; purple hair
    // pixels are excluded so hiding an arm keeps strands that overlap its sleeve.
    const inArm = v > 0.337 && v < 0.942 && u > 0.628 + Math.max(0, v - 0.36) * 0.19 && u < 0.704 + Math.max(0, v - 0.36) * 0.23;
    const skinOrSleeve = clamp(1 - lavender, 0, 1);
    armPixels.data[at] = armPixels.data[at + 1] = armPixels.data[at + 2] = 255;
    armPixels.data[at + 3] = inArm ? Math.round(alpha * skinOrSleeve) : 0;
    const torsoDress = v > 0.31 && v < 0.89 && u > 0.315 && u < 0.715;
    const sleeveCloth = v > 0.43 && v < 0.82 && ((u > 0.205 && u < 0.39) || (u > 0.64 && u < 0.83));
    const skin = smooth(10, 26, r - b) * smooth(5, 25, r - g);
    clothingPixels.data[at] = clothingPixels.data[at + 1] = clothingPixels.data[at + 2] = 255;
    clothingPixels.data[at + 3] = torsoDress || sleeveCloth ? Math.round(alpha * (1 - hair) * (1 - skin)) : 0;
  }
  hairCtx.putImageData(hairPixels, 0, 0); armCtx.putImageData(armPixels, 0, 0); clothingCtx.putImageData(clothingPixels, 0, 0);
  return { hairMask, armMask, clothingMask };
}

/** The deformation cage is in source image coordinates. All image parts share it. */
export function deformPoint(point: Point, width: number, height: number, project: Project, pose: Parameters, motionTime: number): Point {
  if (project.renderMode === 'illustration') return { ...point };
  const u = point.x / width, v = point.y / height;
  const separateRig = project.layers.some(layer => layer.part === 'handRight');
  const head = (1 - smooth(0.29, 0.47, v)) * (separateRig ? 1 - smooth(0.13, 0.18, Math.abs(u - 0.5)) : 1);
  const face = (1 - smooth(0.20, 0.31, Math.abs(u - 0.5))) * head;
  const body = smooth(0.27, 0.46, v) * (1 - smooth(0.75, 1, v)) * (separateRig ? 1 - smooth(0.12, 0.18, Math.abs(u - 0.5)) : 1);
  const layered = project.layers.some(layer => layer.part === 'body');
  const hairLayer = activeLayer(project, 'hair');
  const hairAmount = layered ? Math.max(0, ...project.layers.filter(l => l.kind === 'hair').map(layerAmount)) : layerAmount(hairLayer);
  const hair = smooth(0.08, 0.24, Math.abs(u - 0.5)) * smooth(0.2, 0.45, v) * hairAmount * (separateRig ? 0 : 1);
  const armLayer = activeLayer(project, 'arm');
  const arm = smooth(0.63, 0.79, u) * smooth(0.32, 0.55, v) * layerAmount(armLayer);
  const clothesLayer = activeLayer(project, 'clothing');
  const clothOpacity = layered ? Math.max(0, ...project.layers.filter(l => l.kind === 'clothing').map(layerAmount)) : layerAmount(clothesLayer);
  const wind = pose.windStrength * pose.windDirection;
  const flowing = project.settings.idleMotion ? motionTime : 0;
  const skirt = smooth(0.54, 0.66, v) * (1 - smooth(0.875, 0.94, v)) * (1 - smooth(0.19, 0.27, Math.abs(u - 0.50))) * clothOpacity * (separateRig ? 0 : 1);
  const hem = smooth(0.62, 0.85, v) * skirt;
  const sleeveSide = smooth(0.075, 0.16, Math.abs(u - 0.51)) * (1 - smooth(0.29, 0.38, Math.abs(u - 0.51)));
  const sleeves = smooth(0.34, 0.46, v) * (1 - smooth(0.80, 0.86, v)) * sleeveSide * clothOpacity * (separateRig ? 0 : 1);
  const cuff = smooth(0.43, 0.75, v);
  const hc = { x: project.rig.headCenter.x * width, y: project.rig.headCenter.y * height };
  let x = point.x, y = point.y;
  const yaw = pose.angleX / 30, pitch = pose.angleY / 30;
  x += head * yaw * width * 0.030;
  x += (u - 0.5) * Math.abs(yaw) * width * -0.060 * face;
  y += head * pitch * height * 0.018 + pitch * face * (v - 0.21) * height * 0.05;
  const tilt = radians(pose.angleZ) * head * 0.70;
  const dx = x - hc.x, dy = y - hc.y;
  x = hc.x + dx * Math.cos(tilt) - dy * Math.sin(tilt);
  y = hc.y + dx * Math.sin(tilt) + dy * Math.cos(tilt);
  const breath = (project.settings.idleMotion ? Math.sin(motionTime * 1.75) : 1) * pose.breath;
  x += (u - 0.5) * width * 0.012 * body * breath;
  y -= height * 0.004 * body * breath;
  const gust = 0.72 + Math.sin(flowing * 1.3) * 0.18 + Math.sin(flowing * 3.1 + v * 4.2) * 0.10;
  x += hair * width * 0.026 * (pose.hairSway + wind * gust * 1.35 + Math.sin(flowing * 1.9 + v * 5) * (project.settings.idleMotion ? 0.13 : 0));
  y -= hair * height * pose.windStrength * 0.003 * Math.sin(flowing * 2.2 + v * 4);
  // Hem vertices move more than the waist. Separate low and high frequencies keep
  // fabric motion flowing while preserving the hand-painted folds and lace.
  const hemFlutter = Math.sin(flowing * 2.6 - u * 6.5) * 0.65 + Math.sin(flowing * 5.2 + u * 12) * 0.18;
  const skirtSwing = pose.clothSway + wind * (0.72 + hemFlutter * 0.22);
  x += width * 0.022 * hem * skirtSwing;
  y -= height * hem * (pose.windStrength * 0.012 * (0.75 + hemFlutter * 0.25) + Math.abs(pose.clothSway) * 0.010);
  y += height * skirt * (u - 0.5) * skirtSwing * 0.026;
  // Sleeve motion lags the wind by position along the shoulder-to-cuff falloff.
  const sleeveFlutter = Math.sin(flowing * 2.4 - cuff * 2.4 + (u < 0.5 ? 0.7 : 1.9));
  const sleeveMotion = pose.sleeveSwing + wind * (0.55 + sleeveFlutter * 0.30);
  x += width * sleeves * cuff * sleeveMotion * 0.018;
  y += height * sleeves * cuff * (pose.sleeveSwing * Math.sign(u - 0.5) * 0.010 + pose.windStrength * sleeveFlutter * 0.004);
  if (clothesLayer && !layered) {
    x += skirt * (clothesLayer.x * width / project.canvas.width + (u - 0.5) * width * (clothesLayer.scale - 1));
    y += skirt * (clothesLayer.y * height / project.canvas.height + (v - 0.54) * height * (clothesLayer.scale - 1));
    x -= hem * (v - 0.55) * height * Math.sin(radians(clothesLayer.rotation));
  }
  if (hairLayer && !layered) {
    const hairAngle = radians(hairLayer.rotation) * hair;
    x += hair * (hairLayer.x * width / project.canvas.width + (u - 0.5) * width * (hairLayer.scale - 1));
    y += hair * (hairLayer.y * height / project.canvas.height + (v - 0.28) * height * (hairLayer.scale - 1));
    x += -(y - height * 0.25) * Math.sin(hairAngle);
  }
  if (!separateRig) x += arm * width * pose.armRaise * Math.sin(motionTime * 6) * 0.013;
  if (armLayer && !layered) {
    const shoulder = { x: project.rig.shoulder.x * width, y: project.rig.shoulder.y * height };
    const a = radians(armLayer.rotation) * arm;
    const armX = x - shoulder.x, armY = y - shoulder.y;
    x += arm * armLayer.x * width / project.canvas.width + armX * (Math.cos(a) - 1) - armY * Math.sin(a);
    y += arm * armLayer.y * height / project.canvas.height + armX * Math.sin(a) + armY * (Math.cos(a) - 1);
    x += arm * armX * (armLayer.scale - 1); y += arm * armY * (armLayer.scale - 1);
  }
  if (project.mesh) {
    const { columns, rows, offsets } = project.mesh;
    const gx = clamp(u, 0, 1) * columns, gy = clamp(v, 0, 1) * rows;
    const col = Math.min(columns - 1, Math.floor(gx)), row = Math.min(rows - 1, Math.floor(gy));
    const fx = gx - col, fy = gy - row;
    const a = offsets[row * (columns + 1) + col], b = offsets[row * (columns + 1) + col + 1];
    const c = offsets[(row + 1) * (columns + 1) + col], d = offsets[(row + 1) * (columns + 1) + col + 1];
    if (a && b && c && d) {
      x += width * ((a.x * (1 - fx) + b.x * fx) * (1 - fy) + (c.x * (1 - fx) + d.x * fx) * fy);
      y += height * ((a.y * (1 - fx) + b.y * fx) * (1 - fy) + (c.y * (1 - fx) + d.y * fx) * fy);
    }
  }
  return { x, y };
}

function patch(context: CanvasRenderingContext2D, image: HTMLImageElement, rect: Rect, alpha: number, width: number, height: number, layer?: Layer, shift: Point = { x: 0, y: 0 }, scale: Point = { x: 1, y: 1 }): void {
  if (alpha <= 0) return;
  const x = rect.x * width, y = rect.y * height, w = rect.width * width, h = rect.height * height;
  const cx = x + w / 2, cy = y + h / 2;
  context.save();
  context.globalAlpha *= clamp(alpha, 0, 1);
  context.beginPath(); context.roundRect(x, y, w, h, Math.min(w, h) * 0.18); context.clip();
  context.translate(cx + shift.x + (layer?.x ?? 0) * width / 1254, cy + shift.y + (layer?.y ?? 0) * height / 1254);
  context.rotate(radians(layer?.rotation ?? 0));
  context.scale(scale.x * (layer?.scale ?? 1), scale.y * (layer?.scale ?? 1));
  context.drawImage(image, rect.x * image.naturalWidth, rect.y * image.naturalHeight, rect.width * image.naturalWidth, rect.height * image.naturalHeight, -w / 2, -h / 2, w, h);
  context.restore();
}

function eraseRect(context: CanvasRenderingContext2D, rect: Rect, width: number, height: number): void {
  context.save(); context.globalCompositeOperation = 'destination-out';
  context.fillRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
  context.restore();
}

/** Light overlays are clipped to existing subject alpha, preserving transparency. */
export function applyLighting(context: CanvasRenderingContext2D, width: number, height: number, lighting: Lighting): void {
  context.save(); context.globalCompositeOperation = 'source-atop';
  const exposure = lighting.exposure + (lighting.intensity - 1) * 0.65;
  if (exposure !== 0) {
    context.fillStyle = exposure > 0 ? `rgba(255,250,245,${Math.min(0.5, exposure * 0.30)})` : `rgba(13,16,39,${Math.min(0.65, -exposure * 0.40)})`;
    context.fillRect(0, 0, width, height);
  }
  const a = radians(lighting.direction), reach = width * 0.70;
  const light = context.createLinearGradient(width * 0.5 + Math.cos(a) * reach, height * 0.35 + Math.sin(a) * reach, width * 0.5 - Math.cos(a) * reach, height * 0.35 - Math.sin(a) * reach);
  const softness = clamp(lighting.softness, 0, 1);
  light.addColorStop(0, `rgba(235,229,255,${lighting.rimLight * 0.28})`);
  light.addColorStop(0.25 + softness * 0.20, 'rgba(255,255,255,0)');
  light.addColorStop(0.6 + softness * 0.16, `rgba(45,31,82,${lighting.shadow * 0.08})`);
  light.addColorStop(1, `rgba(25,18,64,${lighting.shadow * 0.46})`);
  context.fillStyle = light; context.fillRect(0, 0, width, height);
  if (lighting.warmth !== 0) {
    context.fillStyle = lighting.warmth > 0 ? `rgba(255,171,112,${lighting.warmth * 0.15})` : `rgba(121,162,255,${-lighting.warmth * 0.15})`;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
}

function compose(surface: HTMLCanvasElement, images: CharacterImages, project: Project, pose: Parameters, armGpu?: GpuMeshRenderer, motionTime = 0): CanvasRenderingContext2D {
  const width = images.neutral.naturalWidth, height = images.neutral.naturalHeight;
  const padding = project.layers.some(layer => layer.part === 'handRight') ? 160 : 0;
  if (surface.width !== width + padding * 2 || surface.height !== height) { surface.width = width + padding * 2; surface.height = height; }
  const ctx = surface.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, surface.width, surface.height);
  ctx.save(); ctx.translate(padding, 0);
  // Pose illustrations retain their painted anatomy; expression patches and
  // Hana's joint weights must not be applied to unrelated poses.
  if (project.renderMode === 'illustration') {
    ctx.drawImage(images.neutral, 0, 0, width, height);
    ctx.restore(); applyLighting(ctx, surface.width, height, project.lighting);
    return ctx;
  }
  const armLayer = activeLayer(project, 'arm');
  const raised = smooth(0, 1, pose.armRaise) * layerAmount(armLayer);
  // Expression images are registered to the source canvas; only face patches are replaced.
  const layered = project.layers.some(layer => layer.part === 'body');
  const separateRig = project.layers.some(layer => layer.part === 'handRight');
  if (layered) {
    for (const layer of project.layers) {
      if (layer.kind === 'custom' && layer.visible && layer.opacity > 0) {
        const image = images.custom.get(layer.id);
        if (image) {
          ctx.save(); ctx.globalAlpha = layer.opacity; ctx.translate(width / 2 + layer.x, height / 2 + layer.y);
          ctx.rotate(radians(layer.rotation)); ctx.scale(layer.scale, layer.scale);
          ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2); ctx.restore();
        }
        continue;
      }
      if (!layer.part || !layer.visible || layer.opacity <= 0) continue;
      const sprite = images.parts.get(layer.id); if (!sprite) continue;
      const pivot = layer.pivot ?? { x: 0.5, y: 0.5 };
      ctx.save(); ctx.globalAlpha = layer.opacity;
      ctx.translate(pivot.x * width + layer.x * width / project.canvas.width, pivot.y * height + layer.y * height / project.canvas.height);
      ctx.rotate(radians(layer.rotation)); ctx.scale(layer.scale, layer.scale); ctx.translate(-pivot.x * width, -pivot.y * height);
      if (separateRig && ['armLeft', 'armRight', 'sleeveLeft', 'sleeveRight', 'handLeft', 'handRight'].includes(layer.part)) {
        const left = layer.part.endsWith('Left');
        drawRigPart(ctx, sprite, layer.part, clamp(left ? pose.armRaiseLeft : pose.armRaise, 0, 1), left ? pose.wristWaveLeft : pose.wristWave, armGpu, pose.sleeveSwing);
      } else if (separateRig && ['hairBack', 'hairMiddle', 'skirt'].includes(layer.part)) {
        drawFlowingPart(ctx, sprite, layer.part, pose, motionTime, project.settings.idleMotion, armGpu);
      } else if (layer.part === 'armRight' || layer.part === 'sleeveRight') {
        const amount = smooth(0, 1, pose.armRaise);
        const wave = images.parts.get(`${layer.id}:wave`);
        // Both textures are warped into the SAME joint pose before a short texture
        // blend. They never crossfade separate resting/raised arm silhouettes.
        const blend = wave ? smooth(0.36, 0.72, amount) : 0;
        ctx.globalAlpha = layer.opacity * (1 - blend);
        if (blend < 1) drawArticulatedArm(ctx, sprite, false, amount, armGpu);
        if (wave && blend > 0) { ctx.globalAlpha = layer.opacity * blend; drawArticulatedArm(ctx, wave, true, amount, armGpu); }
      } else ctx.drawImage(sprite, 0, 0, width, height);
      ctx.restore();
    }
  } else if (images.armless && images.armRest && images.armWave) {
    ctx.drawImage(images.armless, 0, 0, width, height);
    const blend = smooth(0.36, 0.72, raised);
    ctx.save(); ctx.globalAlpha = layerAmount(armLayer) * (1 - blend);
    if (blend < 1) drawArticulatedArm(ctx, images.armRest, false, raised, armGpu);
    ctx.globalAlpha = layerAmount(armLayer) * blend;
    if (blend > 0) drawArticulatedArm(ctx, images.armWave, true, raised, armGpu);
    ctx.restore();
  } else ctx.drawImage(images.neutral, 0, 0, width, height);
  if (!layered && !images.armless && raised > 0) {
    // The wave source contains the complete raised sleeve and hand. Its right region is
    // blended while the face and left side remain anchored to the neutral source.
    ctx.save(); ctx.globalAlpha = raised;
    ctx.beginPath();
    ctx.moveTo(width * 0.64, height * 0.175); ctx.lineTo(width, height * 0.175);
    ctx.lineTo(width, height); ctx.lineTo(width * 0.65, height); ctx.closePath(); ctx.clip();
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1 - raised; ctx.drawImage(images.neutral, 0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = raised; ctx.drawImage(images.wave, 0, 0, width, height);
    ctx.restore();
  }
  const eyes = activeLayer(project, 'eyes'), mouth = activeLayer(project, 'mouth');
  for (const [rect, openness] of [[project.rig.eyeLeft, pose.eyeOpenLeft], [project.rig.eyeRight, pose.eyeOpenRight]] as const) {
    if (!eyes?.visible && eyes) { eraseRect(ctx, rect, width, height); continue; }
    const amount = layerAmount(eyes);
    const close = 1 - smooth(0.08, 0.94, openness);
    if (amount < 1) { eraseRect(ctx, rect, width, height); patch(ctx, images.neutral, rect, amount, width, height, eyes); }
    const shift = { x: pose.eyeX * rect.width * width * 0.09, y: -pose.eyeY * rect.height * height * 0.07 };
    if (pose.eyeX || pose.eyeY || eyes?.x || eyes?.y || eyes?.rotation || eyes?.scale !== 1) patch(ctx, images.neutral, rect, (1 - close) * amount, width, height, eyes, shift);
    patch(ctx, images.blink, rect, close * amount, width, height, eyes);
    if (pose.browY) {
      const brow = { ...rect, y: Math.max(0, rect.y - rect.height * 0.58), height: rect.height * 0.42 };
      patch(ctx, images.neutral, brow, amount, width, height, eyes, { x: 0, y: -pose.browY * height * 0.003 });
    }
  }
  if (mouth && !mouth.visible) eraseRect(ctx, project.rig.mouth, width, height);
  else {
    const amount = layerAmount(mouth);
    if (amount < 1) { eraseRect(ctx, project.rig.mouth, width, height); patch(ctx, images.neutral, project.rig.mouth, amount, width, height, mouth); }
    const scale = { x: 1 + pose.mouthSmile * 0.20, y: 1 - pose.mouthSmile * 0.08 };
    if (pose.mouthSmile || mouth?.x || mouth?.y || mouth?.rotation || mouth?.scale !== 1) patch(ctx, images.neutral, project.rig.mouth, amount, width, height, mouth, undefined, scale);
    patch(ctx, images.talk, project.rig.mouth, smooth(0, 1, pose.mouthOpen) * amount, width, height, mouth, undefined, scale);
  }
  for (const [kind, mask] of (layered ? [] : [['hair', images.hairMask], ['arm', images.armMask], ['clothing', images.clothingMask]]) as Array<['hair' | 'arm' | 'clothing', HTMLCanvasElement | undefined]>) {
    const amount = layerAmount(activeLayer(project, kind));
    if (mask && amount < 1) {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1 - amount;
      ctx.drawImage(mask, 0, 0, width, height); ctx.restore();
    }
  }
  ctx.restore();
  applyLighting(ctx, surface.width, height, project.lighting);
  return ctx;
}

function drawTriangle(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, src: [Point, Point, Point], dest: [Point, Point, Point]): void {
  const [s0, s1, s2] = src, [d0, d1, d2] = dest;
  const determinant = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(determinant) < 0.00001) return;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / determinant;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / determinant;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / determinant;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / determinant;
  const e = d0.x - a * s0.x - c * s0.y, f = d0.y - b * s0.x - d * s0.y;
  ctx.save(); ctx.beginPath();
  // Subpixel overlap prevents transparent hairline cracks between triangle clips.
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  for (let i = 0; i < 3; i++) {
    const p = dest[i], distance = Math.hypot(p.x - cx, p.y - cy) || 1;
    const x = p.x + (p.x - cx) / distance * 0.38, y = p.y + (p.y - cy) / distance * 0.38;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.clip(); ctx.transform(a, b, c, d, e, f); ctx.drawImage(image, 0, 0); ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, background: PlayerOptions['background']): void {
  if (background === 'transparent') return;
  const dark = background === 'dark';
  ctx.fillStyle = dark ? '#151622' : '#f0eff7'; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, height * 0.66);
  glow.addColorStop(0, dark ? '#38304d' : '#ffffff'); glow.addColorStop(1, dark ? '#151622' : '#e4e2ef');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.strokeStyle = dark ? 'rgba(167,148,215,0.06)' : 'rgba(137,124,166,0.06)'; ctx.lineWidth = 1;
  const grid = 40; ctx.beginPath();
  for (let x = width / 2 % grid; x < width; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = height / 2 % grid; y < height; y += grid) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke(); ctx.restore();
}

/** Render one frame without owning timers or events, also used for transparent captures. */
export function renderCharacter(ctx: CanvasRenderingContext2D, images: CharacterImages, project: Project, parameters: Parameters, options: RenderOptions = {}): void {
  const width = ctx.canvas.width, height = ctx.canvas.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
  drawBackground(ctx, width, height, options.background ?? 'studio');
  const layered = project.layers.some(layer => layer.part === 'body');
  const base = layered ? undefined : activeLayer(project, 'character');
  const visible = layered ? 1 : layerAmount(base);
  if (visible > 0) {
    if (options.armGpu) options.armGpu.renderScale = Math.max(0.35, Math.min(1, Math.min(width * 0.94 / images.neutral.naturalWidth, height * 0.97 / images.neutral.naturalHeight) * (options.zoom ?? 1)));
    const source = options.surface ?? document.createElement('canvas');
    const compositionKey = JSON.stringify([
      project.renderMode,
      project.rig.eyeLeft, project.rig.eyeRight, project.rig.mouth, project.lighting,
      parameters.eyeOpenLeft, parameters.eyeOpenRight, parameters.eyeX, parameters.eyeY,
      parameters.browY, parameters.mouthOpen, parameters.mouthSmile, parameters.armRaise,
      parameters.armRaiseLeft, parameters.wristWave, parameters.wristWaveLeft,
      parameters.hairSway, parameters.clothSway, parameters.windStrength, parameters.windDirection, parameters.sleeveSwing,
      project.layers.some(l => l.part === 'handRight') ? (options.motionTime ?? options.time ?? 0) : 0,
      project.layers.map(({ src: _src, waveSrc: _wave, ...geometry }) => geometry),
    ]);
    if (compositionCache.get(source) !== compositionKey || !source.width || !source.height) {
      compose(source, images, project, parameters, options.armGpu, options.motionTime ?? options.time ?? 0); compositionCache.set(source, compositionKey);
      compositionVersion.set(source, (compositionVersion.get(source) ?? 0) + 1);
    }
    const sw = source.width, sh = source.height;
    const padding = project.layers.some(layer => layer.part === 'handRight') ? 160 : 0;
    const sourceWidth = images.neutral.naturalWidth;
    const deform = (p: Point) => { const q = deformPoint({ x: p.x - padding, y: p.y }, sourceWidth, sh, project, parameters, options.motionTime ?? options.time ?? 0); return { x: q.x + padding, y: q.y }; };
    const stage = Math.min(width / project.canvas.width, height / project.canvas.height);
    const fit = Math.min(width * 0.94 / sw, height * 0.97 / sh) * clamp(options.zoom ?? 1, 0.25, 4);
    const pan = options.pan ?? { x: 0, y: 0 };
    ctx.save(); ctx.globalAlpha = visible;
    ctx.translate(width / 2 + pan.x + (base?.x ?? 0) * stage, height / 2 + pan.y + (base?.y ?? 0) * stage);
    ctx.rotate(radians(base?.rotation ?? 0)); ctx.scale(fit * (base?.scale ?? 1), fit * (base?.scale ?? 1)); ctx.translate(-sw / 2, -sh / 2);
    const columns = project.mesh?.columns ?? (options.gpu ? 20 : 12), rows = project.mesh?.rows ?? (options.gpu ? 26 : 16);
    const gridColumns = columns + (padding ? 2 : 0);
    const original: Point[][] = [], distorted: Point[][] = [];
    const motionTime = options.motionTime ?? options.time ?? 0;
    for (let row = 0; row <= rows; row++) {
      original[row] = []; distorted[row] = [];
      for (let col = 0; col <= gridColumns; col++) {
        const x = !padding ? col / columns * sw : col === 0 ? 0 : col === gridColumns ? sw : padding + (col - 1) / columns * sourceWidth;
        const p = { x, y: row / rows * sh };
        original[row][col] = p; distorted[row][col] = deform(p);
      }
    }
    const needsDeformation = project.renderMode !== 'illustration' && (Math.abs(parameters.angleX) + Math.abs(parameters.angleY) + Math.abs(parameters.angleZ) + Math.abs(parameters.hairSway) + parameters.breath + parameters.armRaise + parameters.windStrength + Math.abs(parameters.clothSway) + Math.abs(parameters.sleeveSwing) > 0.0001 || project.settings.idleMotion || Boolean(base && (base.x || base.y || base.rotation)) || Boolean(project.mesh?.offsets.some(p => p.x || p.y)));
    if (!needsDeformation) ctx.drawImage(source, 0, 0);
    else {
      if (options.gpu) options.gpu.renderScale = Math.max(0.25, Math.min(1, fit * (base?.scale ?? 1)));
      const accelerated = options.gpu?.render(source, original, distorted, compositionVersion.get(source));
      if (accelerated && options.gpu) ctx.drawImage(accelerated, -options.gpu.padding, -options.gpu.padding, accelerated.width / options.gpu.renderScale, accelerated.height / options.gpu.renderScale);
      else for (let r = 0; r < rows; r++) for (let c = 0; c < gridColumns; c++) {
        drawTriangle(ctx, source, [original[r][c], original[r][c + 1], original[r + 1][c]], [distorted[r][c], distorted[r][c + 1], distorted[r + 1][c]]);
        drawTriangle(ctx, source, [original[r + 1][c], original[r][c + 1], original[r + 1][c + 1]], [distorted[r + 1][c], distorted[r][c + 1], distorted[r + 1][c + 1]]);
      }
    }
    if (options.mesh && options.overlay !== false) {
      ctx.save(); ctx.lineWidth = 0.8 / fit; ctx.strokeStyle = 'rgba(157,130,245,0.45)'; ctx.beginPath();
      for (let r = 0; r <= rows; r++) for (let c = padding ? 1 : 0; c <= gridColumns - (padding ? 1 : 0); c++) {
        const p = distorted[r][c];
        if (c < gridColumns - (padding ? 1 : 0)) { const q = distorted[r][c + 1]; ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
        if (r < rows) { const q = distorted[r + 1][c]; ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke(); ctx.fillStyle = '#c6adff';
      for (const row of distorted) for (const p of (padding ? row.slice(1, -1) : row)) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.65 / fit, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (options.editing && options.overlay !== false) {
      ctx.save(); ctx.lineWidth = 1.2 / fit; ctx.setLineDash([5 / fit, 3 / fit]);
      for (const [id, rect] of [['eyes', project.rig.eyeLeft], ['eyes', project.rig.eyeRight], ['mouth', project.rig.mouth]] as const) {
        ctx.strokeStyle = options.selectedLayer === id ? '#ff72ab' : '#a992ec';
        const corners = [
          { x: rect.x * sourceWidth + padding, y: rect.y * sh }, { x: (rect.x + rect.width) * sourceWidth + padding, y: rect.y * sh },
          { x: (rect.x + rect.width) * sourceWidth + padding, y: (rect.y + rect.height) * sh }, { x: rect.x * sourceWidth + padding, y: (rect.y + rect.height) * sh },
        ].map(deform);
        ctx.beginPath(); corners.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  // User-supplied independent transparent parts support true layer transforms.
  const stage = Math.min(width / project.canvas.width, height / project.canvas.height);
  for (const layer of project.layers) {
    if (layered || layer.kind !== 'custom' || !layer.visible || layer.opacity <= 0) continue;
    const image = images.custom.get(layer.id); if (!image) continue;
    ctx.save(); ctx.globalAlpha = layer.opacity;
    ctx.translate(width / 2 + (options.pan?.x ?? 0) + layer.x * stage, height / 2 + (options.pan?.y ?? 0) + layer.y * stage);
    ctx.rotate(radians(layer.rotation));
    // Part PNG pixel sizes share the source canvas scale: a 100 px ornament stays
    // 100 source pixels wide instead of being independently enlarged to the stage.
    const fit = Math.min(width * 0.94 / images.neutral.naturalWidth, height * 0.97 / images.neutral.naturalHeight) * layer.scale * (options.zoom ?? 1);
    ctx.scale(fit, fit); ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2); ctx.restore();
  }
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
    image.onload = () => { if (!image.naturalWidth || !image.naturalHeight) reject(new Error(`圖片沒有有效尺寸：${src.slice(0, 120)}`)); else resolve(image); };
    image.onerror = () => reject(new Error(`角色圖片載入失敗：${src.startsWith('data:') ? '匯入圖片' : src}`));
    image.src = src;
  });
}

export class CharacterPlayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private project: Project;
  private readonly callbacks: { onFrame?: (time: number, fps: number) => void; onError?: (error: Error) => void };
  private options: PlayerOptions = { mesh: false, background: 'studio', zoom: 1, pan: { x: 0, y: 0 }, playing: true };
  private images?: CharacterImages;
  private surface = document.createElement('canvas');
  private gpu = new GpuMeshRenderer();
  private armGpu = new GpuMeshRenderer();
  private imageCache = new Map<string, Promise<HTMLImageElement>>();
  private frameHandle = 0; private loadToken = 0; private disposed = false;
  private currentTime = 0; private motionTime = 0; private lastTimestamp = 0;
  private fps = 0; private fpsCount = 0; private fpsElapsed = 0; private callbackElapsed = 0;
  private pointerTarget: Point = { x: 0, y: 0 }; private pointer: Point = { x: 0, y: 0 };
  private currentPose: Parameters;
  private signature: string[];
  private resizeObserver?: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, project: Project = createDefaultProject(), options: { onFrame?: (time: number, fps: number) => void; onError?: (error: Error) => void } = {}) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('此瀏覽器不支援 Canvas 2D');
    this.canvas = canvas; this.context = context; this.project = project; this.callbacks = options;
    this.currentPose = { ...project.parameters }; this.signature = this.assetSignature(project);
    canvas.addEventListener('pointermove', this.handlePointerMove); canvas.addEventListener('pointerleave', this.handlePointerLeave);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.draw()); this.resizeObserver.observe(canvas);
    }
  }

  private assetSignature(project: Project): string[] { return [...Object.values(project.assets).filter((src): src is string => !!src), ...project.layers.filter(l => l.src).flatMap(l => [l.id, l.src!, l.waveSrc ?? ''])]; }

  async load(): Promise<void> {
    if (this.disposed) return;
    const token = ++this.loadToken, project = this.project;
    const image = (src: string): Promise<HTMLImageElement> => {
      let request = this.imageCache.get(src);
      if (!request) { request = loadImage(src); this.imageCache.set(src, request); request.catch(() => this.imageCache.delete(src)); }
      return request;
    };
    try {
      const asCanvas = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d')!.drawImage(image, 0, 0); return canvas; };
      const [neutral, blink, talk, wave, custom, armAssets, partEntries] = await Promise.all([
        image(project.assets.neutral), image(project.assets.blink), image(project.assets.talk), image(project.assets.wave),
        Promise.all(project.layers.filter(l => l.kind === 'custom' && l.src).map(async l => [l.id, await image(l.src!)] as const)),
        project.assets.armless && project.assets.armRest && project.assets.armWave ? Promise.all([image(project.assets.armless), image(project.assets.armRest), image(project.assets.armWave)]) : Promise.resolve(undefined),
        Promise.all(project.layers.filter(l => l.part && l.src).flatMap(l => [image(l.src!).then(sprite => [l.id, asCanvas(sprite)] as const), ...(l.waveSrc ? [image(l.waveSrc).then(sprite => [`${l.id}:wave`, asCanvas(sprite)] as const)] : [])])),
      ]);
      if (this.disposed || token !== this.loadToken) return;
      for (const [name, variant] of [['blink', blink], ['talk', talk], ['wave', wave]] as const) {
        if (variant.naturalWidth !== neutral.naturalWidth || variant.naturalHeight !== neutral.naturalHeight) throw new Error(`角色圖像 ${name} 的尺寸必須和 neutral 一致，以維持元件對齊`);
      }
      const masks = buildPartMasks(neutral);
      this.images = { neutral, blink, talk, wave, custom: new Map(custom), parts: new Map(partEntries), ...masks,
        ...(armAssets ? { armless: armAssets[0], armRest: asCanvas(armAssets[1]), armWave: asCanvas(armAssets[2]) } : {}),
      };
      compositionCache.delete(this.surface);
      const referenced = new Set(this.assetSignature(this.project));
      for (const source of this.imageCache.keys()) if (!referenced.has(source)) this.imageCache.delete(source);
      this.draw(true);
      if (!this.frameHandle) this.frameHandle = requestAnimationFrame(this.tick);
    } catch (reason) {
      if (this.disposed || token !== this.loadToken) return;
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.callbacks.onError?.(error); throw error;
    }
  }

  setProject(project: Project): void {
    if (this.disposed) return;
    const signature = this.assetSignature(project), previousDuration = this.project.timeline.duration;
    this.project = project;
    if (this.currentTime > project.timeline.duration || previousDuration !== project.timeline.duration) this.currentTime = clamp(this.currentTime, 0, project.timeline.duration);
    if (signature.length !== this.signature.length || signature.some((source, index) => source !== this.signature[index])) { this.signature = signature; void this.load().catch(() => {}); }
    else this.draw();
  }

  setOptions(options: PlayerOptions): void {
    if (this.disposed) return;
    const hasParameters = Object.prototype.hasOwnProperty.call(options, 'parameters');
    const hasLighting = Object.prototype.hasOwnProperty.call(options, 'lighting');
    this.options = {
      ...this.options, ...options,
      // An explicit undefined removes transient overrides and resumes timeline values.
      parameters: hasParameters ? (options.parameters ? { ...this.options.parameters, ...options.parameters } : undefined) : this.options.parameters,
      lighting: hasLighting ? (options.lighting ? { ...this.options.lighting, ...options.lighting } : undefined) : this.options.lighting,
    };
    this.draw();
  }

  seek(time: number): void { this.currentTime = clamp(Number.isFinite(time) ? time : 0, 0, this.project.timeline.duration); this.draw(true); this.callbacks.onFrame?.(this.currentTime, this.fps); }
  play(): void { this.options.playing = true; }
  pause(): void { this.options.playing = false; }
  getFrame(): { time: number; parameters: Parameters } { return { time: this.currentTime, parameters: { ...this.currentPose } }; }
  getRigViewport(): { fit: number; centerX: number; centerY: number; width: number; height: number } {
    const bounds = this.canvas.getBoundingClientRect(), width = this.images?.neutral.naturalWidth ?? this.project.canvas.width, height = this.images?.neutral.naturalHeight ?? this.project.canvas.height;
    return { fit: Math.min(bounds.width * 0.94 / (width + (this.project.layers.some(l => l.part === 'handRight') ? 320 : 0)), bounds.height * 0.97 / height) * (this.options.zoom ?? 1), centerX: bounds.left + bounds.width / 2 + (this.options.pan?.x ?? 0), centerY: bounds.top + bounds.height / 2 + (this.options.pan?.y ?? 0), width, height };
  }
  pickMeshPoint(clientX: number, clientY: number, radius = 14): number | null {
    if (!this.project.mesh) return null;
    const { fit, centerX, centerY, width, height } = this.getRigViewport(), { rows, columns } = this.project.mesh;
    let closest = radius, index: number | null = null;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const point = deformPoint({ x: col / columns * width, y: row / rows * height }, width, height, this.effectiveProject(), this.currentPose, this.motionTime);
      const distance = Math.hypot(centerX + (point.x - width / 2) * fit - clientX, centerY + (point.y - height / 2) * fit - clientY);
      if (distance < closest) { closest = distance; index = row * (columns + 1) + col; }
    }
    return index;
  }

  private getPose(): Parameters {
    const project = this.project, idle = this.options.idleMotion ?? project.settings.idleMotion;
    const pose = { ...evaluatePose(project, this.currentTime), ...this.options.parameters };
    const tracked = new Set(project.timeline.tracks.filter(t => t.keyframes.length).map(t => t.parameter));
    if (idle) {
      if (!tracked.has('angleZ')) pose.angleZ += Math.sin(this.motionTime * 0.75) * 0.70;
      if (!tracked.has('angleY')) pose.angleY += Math.sin(this.motionTime * 1.05) * 0.45;
    }
    if (this.options.autoBlink ?? project.settings.autoBlink) {
      const phase = (this.motionTime + 1.2) % 4.8;
      let blink = 1;
      if (phase < 0.11) blink = 1 - phase / 0.11;
      else if (phase < 0.20) blink = (phase - 0.11) / 0.09;
      pose.eyeOpenLeft *= blink; pose.eyeOpenRight *= blink;
    }
    if (this.options.pointerTracking ?? project.settings.pointerTracking) {
      pose.eyeX = clamp(pose.eyeX + this.pointer.x * 0.65, -1, 1);
      pose.eyeY = clamp(pose.eyeY + this.pointer.y * 0.65, -1, 1);
      pose.angleX = clamp(pose.angleX + this.pointer.x * 9, -30, 30);
      pose.angleY = clamp(pose.angleY + this.pointer.y * 5, -30, 30);
    }
    return pose;
  }

  private draw(instant = false): void {
    if (this.disposed || !this.images) return;
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round((bounds.width || this.project.canvas.width) * ratio));
    const height = Math.max(1, Math.round((bounds.height || this.project.canvas.height) * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    if (instant) this.currentPose = this.getPose();
    const project = this.effectiveProject();
    const pan = this.options.pan ? { x: this.options.pan.x * ratio, y: this.options.pan.y * ratio } : undefined;
    renderCharacter(this.context, this.images, project, this.currentPose, { ...this.options, pan, time: this.currentTime, motionTime: this.motionTime, surface: this.surface, gpu: this.gpu, armGpu: this.armGpu });
  }

  private tick = (timestamp: number): void => {
    if (this.disposed) return;
    const elapsed = this.lastTimestamp ? Math.min((timestamp - this.lastTimestamp) / 1000, 0.1) : 0;
    this.lastTimestamp = timestamp;
    const advance = this.options.playing !== false;
    if (advance) {
      this.motionTime += elapsed;
      this.currentTime = (this.currentTime + elapsed) % this.project.timeline.duration;
    }
    const smoothing = 1 - Math.exp(-elapsed * 10);
    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * smoothing; this.pointer.y += (this.pointerTarget.y - this.pointer.y) * smoothing;
    this.fpsCount++; this.fpsElapsed += elapsed; this.callbackElapsed += elapsed;
    if (this.fpsElapsed >= 0.5) { this.fps = Math.round(this.fpsCount / this.fpsElapsed); this.fpsCount = 0; this.fpsElapsed = 0; }
    const target = this.getPose();
    const unsettled = Object.keys(target).some(key => Math.abs(target[key as keyof Parameters] - this.currentPose[key as keyof Parameters]) > 0.0001);
    this.currentPose = smoothPose(this.currentPose, target, elapsed);
    if (advance || unsettled || Math.abs(this.pointerTarget.x - this.pointer.x) + Math.abs(this.pointerTarget.y - this.pointer.y) > 0.0001) this.draw(false);
    if (this.callbackElapsed >= 0.08) { this.callbackElapsed = 0; this.callbacks.onFrame?.(this.currentTime, this.fps); }
    this.frameHandle = requestAnimationFrame(this.tick);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerTarget = { x: clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), y: clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1) };
  };
  private handlePointerLeave = (): void => { this.pointerTarget = { x: 0, y: 0 }; };

  private effectiveProject(): Project {
    return {
      ...this.project,
      lighting: this.options.lighting ? { ...this.project.lighting, ...this.options.lighting } : this.project.lighting,
      settings: {
        autoBlink: this.options.autoBlink ?? this.project.settings.autoBlink,
        idleMotion: this.options.idleMotion ?? this.project.settings.idleMotion,
        pointerTracking: this.options.pointerTracking ?? this.project.settings.pointerTracking,
      },
    };
  }

  async capture(): Promise<Blob> {
    if (!this.images || this.disposed) throw new Error('請等待角色素材完成載入');
    const canvas = document.createElement('canvas'); canvas.width = this.project.canvas.width; canvas.height = this.project.canvas.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('無法建立圖像畫布');
    const project = this.effectiveProject();
    renderCharacter(context, this.images, project, { ...this.currentPose }, { ...this.options, zoom: 1, pan: { x: 0, y: 0 }, background: 'transparent', mesh: false, editing: false, overlay: false, time: this.currentTime, motionTime: this.motionTime, gpu: this.gpu, armGpu: this.armGpu });
    return new Promise((resolve, reject) => { try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 匯出失敗')), 'image/png'); } catch (error) { reject(error); } });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.loadToken++;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove); this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.resizeObserver?.disconnect();
    this.gpu.dispose(); this.armGpu.dispose();
    this.images = undefined; this.imageCache.clear(); this.surface.width = 0; this.surface.height = 0;
  }
}
