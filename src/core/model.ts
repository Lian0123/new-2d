export type ParameterId = keyof Parameters;

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }

export interface Parameters {
  angleX: number; angleY: number; angleZ: number;
  eyeOpenLeft: number; eyeOpenRight: number; eyeX: number; eyeY: number;
  mouthOpen: number; mouthSmile: number; browY: number;
  breath: number; armRaise: number; hairSway: number;
  windStrength: number; windDirection: number; clothSway: number; sleeveSwing: number;
  armRaiseLeft: number; wristWave: number; wristWaveLeft: number;
}

export interface Lighting {
  intensity: number; exposure: number; shadow: number; softness: number;
  rimLight: number; warmth: number; direction: number;
}

export interface Layer {
  id: string; name: string;
  kind: 'character' | 'eyes' | 'mouth' | 'arm' | 'hair' | 'clothing' | 'custom';
  visible: boolean; locked: boolean; opacity: number;
  x: number; y: number; rotation: number; scale: number; src?: string;
  part?: 'body' | 'hairBack' | 'hairMiddle' | 'hairFront' | 'bodice' | 'skirt' | 'sleeveLeft' | 'sleeveRight' | 'armRight' | 'armLeft' | 'handRight' | 'handLeft';
  waveSrc?: string;
  pivot?: Point;
}

export interface Keyframe { time: number; value: number }
export interface Track { id: string; parameter: ParameterId; keyframes: Keyframe[]; easing?: 'linear' | 'smooth' }

export interface Project {
  version: 1; id: string; name: string;
  renderMode?: 'illustration';
  canvas: { width: number; height: number };
  assets: { neutral: string; blink: string; talk: string; wave: string; armless?: string; armRest?: string; armWave?: string };
  parameters: Parameters;
  lighting: Lighting;
  rig: { eyeLeft: Rect; eyeRight: Rect; mouth: Rect; headCenter: Point; shoulder: Point };
  layers: Layer[];
  timeline: { duration: number; fps: number; tracks: Track[] };
  settings: { autoBlink: boolean; idleMotion: boolean; pointerTracking: boolean };
  mesh?: { columns: number; rows: number; offsets: Point[] };
}

export interface ParameterDefinition {
  id: ParameterId; label: string; min: number; max: number;
  defaultValue: number; group: 'head' | 'eyes' | 'mouth' | 'body';
}

export const parameterDefinitions: ParameterDefinition[] = [
  { id: 'angleX', label: '左右轉頭', min: -30, max: 30, defaultValue: 0, group: 'head' },
  { id: 'angleY', label: '抬頭低頭', min: -30, max: 30, defaultValue: 0, group: 'head' },
  { id: 'angleZ', label: '歪頭角度', min: -20, max: 20, defaultValue: 0, group: 'head' },
  { id: 'eyeOpenLeft', label: '左眼睜開', min: 0, max: 1, defaultValue: 1, group: 'eyes' },
  { id: 'eyeOpenRight', label: '右眼睜開', min: 0, max: 1, defaultValue: 1, group: 'eyes' },
  { id: 'eyeX', label: '視線左右', min: -1, max: 1, defaultValue: 0, group: 'eyes' },
  { id: 'eyeY', label: '視線上下', min: -1, max: 1, defaultValue: 0, group: 'eyes' },
  { id: 'mouthOpen', label: '嘴巴開合', min: 0, max: 1, defaultValue: 0, group: 'mouth' },
  { id: 'mouthSmile', label: '微笑幅度', min: -1, max: 1, defaultValue: 0.25, group: 'mouth' },
  { id: 'browY', label: '眉毛高度', min: -1, max: 1, defaultValue: 0, group: 'eyes' },
  { id: 'breath', label: '呼吸起伏', min: 0, max: 1, defaultValue: 0.35, group: 'body' },
  { id: 'armRaise', label: '抬手揮手', min: 0, max: 1, defaultValue: 0, group: 'body' },
  { id: 'armRaiseLeft', label: '左臂抬起', min: 0, max: 1, defaultValue: 0, group: 'body' },
  { id: 'wristWave', label: '右手腕擺動', min: -1, max: 1, defaultValue: 0, group: 'body' },
  { id: 'wristWaveLeft', label: '左手腕擺動', min: -1, max: 1, defaultValue: 0, group: 'body' },
  { id: 'hairSway', label: '髮絲擺動', min: -1, max: 1, defaultValue: 0, group: 'body' },
  { id: 'windStrength', label: '風力強度', min: 0, max: 1, defaultValue: 0.2, group: 'body' },
  { id: 'windDirection', label: '風向左右', min: -1, max: 1, defaultValue: 0.5, group: 'body' },
  { id: 'clothSway', label: '裙擺飄動', min: -1, max: 1, defaultValue: 0, group: 'body' },
  { id: 'sleeveSwing', label: '袖口擺動', min: -1, max: 1, defaultValue: 0, group: 'body' },
];

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function createDefaultProject(): Project {
  return {
    version: 1, id: 'hana-layered-v3', name: '花音 · 月光練習',
    canvas: { width: 1254, height: 1254 },
    assets: {
      neutral: '/assets/characters/hana/neutral.png',
      blink: '/assets/characters/hana/blink.png',
      talk: '/assets/characters/hana/talk.png',
      wave: '/assets/characters/hana/wave.png',
      armless: '/assets/characters/hana/armless.png',
      armRest: '/assets/characters/hana/arm-rest.png',
      armWave: '/assets/characters/hana/arm-wave.png',
    },
    parameters: Object.fromEntries(parameterDefinitions.map(d => [d.id, d.defaultValue])) as unknown as Parameters,
    lighting: { intensity: 1, exposure: 0, shadow: 0.18, softness: 0.7, rimLight: 0.22, warmth: 0.08, direction: -35 },
    rig: {
      eyeLeft: { x: 520 / 1254, y: 222 / 1254, width: 95 / 1254, height: 67 / 1254 },
      eyeRight: { x: 642 / 1254, y: 217 / 1254, width: 90 / 1254, height: 67 / 1254 },
      mouth: { x: 594 / 1254, y: 303 / 1254, width: 75 / 1254, height: 44 / 1254 },
      headCenter: { x: 0.5, y: 0.22 }, shoulder: { x: 797 / 1254, y: 474 / 1254 },
    },
    layers: [
      partLayer('hair-back', '後髮 · 背後長髮', 'hair', 'hairBack', 'hair-back.png', { x: 0.5, y: 0.08 }),
      partLayer('body', '頭部與身體底圖', 'character', 'body', 'body.png', { x: 0.5, y: 0.22 }),
      partLayer('arm-left', '左手臂 · 肩肘', 'arm', 'armLeft', 'arm-upper.png', { x: 457 / 1254, y: 474 / 1254 }),
      partLayer('sleeve-left', '左袖 · 完整衣料', 'clothing', 'sleeveLeft', 'sleeve.png', { x: 457 / 1254, y: 474 / 1254 }),
      partLayer('bodice', '上衣 · 領口與蝴蝶結', 'clothing', 'bodice', 'bodice.png', { x: 0.5, y: 0.35 }),
      partLayer('skirt', '裙襬 · 花紋與蕾絲', 'clothing', 'skirt', 'skirt.png', { x: 0.5, y: 0.57 }),
      { id: 'eyes', name: '眼睛 · 獨立開合', kind: 'eyes', visible: true, locked: false, opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 },
      { id: 'mouth', name: '嘴型 · 說話表情', kind: 'mouth', visible: true, locked: false, opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 },
      partLayer('arm', '右手臂 · 肩肘', 'arm', 'armRight', 'arm-upper.png', { x: 797 / 1254, y: 474 / 1254 }),
      partLayer('sleeve-right', '右袖 · 完整衣料', 'clothing', 'sleeveRight', 'sleeve.png', { x: 797 / 1254, y: 474 / 1254 }),
      partLayer('hair-middle', '中髮 · 臉旁與肩前', 'hair', 'hairMiddle', 'hair-middle.png', { x: 0.5, y: 0.18 }),
      partLayer('hair-front', '前髮 · 瀏海與髮飾', 'hair', 'hairFront', 'hair-front.png', { x: 0.5, y: 0.07 }),
      partLayer('hand-left', '左手掌 · 獨立手腕', 'arm', 'handLeft', 'hand-open.png', { x: 298 / 1254, y: 989 / 1254 }),
      partLayer('hand-right', '右手掌 · 獨立手腕', 'arm', 'handRight', 'hand-open.png', { x: 956 / 1254, y: 989 / 1254 }),
    ],
    timeline: { duration: 6, fps: 30, tracks: [] },
    settings: { autoBlink: true, idleMotion: true, pointerTracking: false },
    mesh: { columns: 12, rows: 16, offsets: Array.from({ length: 13 * 17 }, () => ({ x: 0, y: 0 })) },
  };
}

function partLayer(id: string, name: string, kind: Layer['kind'], part: NonNullable<Layer['part']>, file: string, pivot: Point): Layer {
  return { id, name, kind, part, src: `/assets/characters/hana/parts-v3/${file}`, pivot, visible: true, locked: false, opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 };
}

function invalid(path: string, message: string): never { throw new Error(`專案格式錯誤：${path} ${message}`); }
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, '必須是物件');
  return value as Record<string, unknown>;
}
function numeric(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(path, `必須介於 ${min} 和 ${max}${integer ? ' 的整數' : ''}`);
  return value;
}
function string(value: unknown, path: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(path, `必須是 1–${max} 字元的文字`);
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalid(path, '必須是布林值');
  return value;
}
function asset(value: unknown, path: string): string {
  const result = string(value, path, 30_000_000);
  // Only raster assets: executable URL schemes and SVG data URLs are rejected.
  if (/^(?:javascript|vbscript|file):/i.test(result) || (/^data:/i.test(result) && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(result))) invalid(path, '必須是 PNG、JPEG 或 WebP 圖片路徑');
  return result;
}
function point(value: unknown, path: string): Point {
  const obj = record(value, path);
  return { x: numeric(obj.x, `${path}.x`, 0, 1), y: numeric(obj.y, `${path}.y`, 0, 1) };
}
function rect(value: unknown, path: string): Rect {
  const obj = record(value, path), origin = point(value, path);
  const width = numeric(obj.width, `${path}.width`, 0.001, 1), height = numeric(obj.height, `${path}.height`, 0.001, 1);
  if (origin.x + width > 1.000001 || origin.y + height > 1.000001) invalid(path, '範圍必須在角色圖像內');
  return { ...origin, width, height };
}

/** Validate imported project data and return a clean, deeply copied schema. */
export function validateProject(value: unknown): Project {
  const obj = record(value, 'project');
  if (obj.version !== 1) invalid('version', '僅支援版本 1');
  if (obj.renderMode !== undefined && obj.renderMode !== 'illustration') invalid('renderMode', '不是支援的呈現方式');
  const canvas = record(obj.canvas, 'canvas'), assets = record(obj.assets, 'assets');
  const params = record(obj.parameters, 'parameters'), lighting = record(obj.lighting, 'lighting');
  const rig = record(obj.rig, 'rig'), settings = record(obj.settings, 'settings');
  const timeline = record(obj.timeline, 'timeline');
  const duration = numeric(timeline.duration, 'timeline.duration', 0.1, 600);
  if (!Array.isArray(obj.layers) || obj.layers.length > 100) invalid('layers', '必須是最多 100 個圖層的陣列');
  const layerIds = new Set<string>();
  const kinds: Layer['kind'][] = ['character', 'eyes', 'mouth', 'arm', 'hair', 'clothing', 'custom'];
  const layers = obj.layers.map((raw, index) => {
    const path = `layers[${index}]`, layer = record(raw, path);
    const id = string(layer.id, `${path}.id`, 100);
    if (layerIds.has(id)) invalid(`${path}.id`, '不能重複');
    layerIds.add(id);
    if (!kinds.includes(layer.kind as Layer['kind'])) invalid(`${path}.kind`, '不是支援的圖層種類');
    const result: Layer = {
      id, name: string(layer.name, `${path}.name`), kind: layer.kind as Layer['kind'],
      visible: boolean(layer.visible, `${path}.visible`), locked: boolean(layer.locked, `${path}.locked`),
      opacity: numeric(layer.opacity, `${path}.opacity`, 0, 1),
      x: numeric(layer.x, `${path}.x`, -10000, 10000), y: numeric(layer.y, `${path}.y`, -10000, 10000),
      rotation: numeric(layer.rotation, `${path}.rotation`, -360, 360), scale: numeric(layer.scale, `${path}.scale`, 0.01, 10),
    };
    if (layer.src !== undefined) result.src = asset(layer.src, `${path}.src`);
    if (layer.waveSrc !== undefined) result.waveSrc = asset(layer.waveSrc, `${path}.waveSrc`);
    if (layer.pivot !== undefined) result.pivot = point(layer.pivot, `${path}.pivot`);
    if (layer.part !== undefined) {
      const parts = ['body', 'hairBack', 'hairMiddle', 'hairFront', 'bodice', 'skirt', 'sleeveLeft', 'sleeveRight', 'armRight', 'armLeft', 'handRight', 'handLeft'];
      if (!parts.includes(layer.part as string)) invalid(`${path}.part`, '不是支援的部件種類');
      result.part = layer.part as Layer['part'];
      if (!result.src) invalid(`${path}.src`, '獨立部件需要 PNG 圖像');
    }
    if (result.kind === 'custom' && !result.src) invalid(`${path}.src`, '自訂圖層需要圖片');
    return result;
  });
  if (!Array.isArray(timeline.tracks) || timeline.tracks.length > 100) invalid('timeline.tracks', '必須是最多 100 個軌道的陣列');
  const trackIds = new Set<string>();
  const tracks = timeline.tracks.map((raw, index): Track => {
    const path = `timeline.tracks[${index}]`, track = record(raw, path);
    const id = string(track.id, `${path}.id`, 100);
    if (trackIds.has(id)) invalid(`${path}.id`, '不能重複');
    trackIds.add(id);
    const definition = parameterDefinitions.find(d => d.id === track.parameter);
    if (!definition) invalid(`${path}.parameter`, '不是支援的參數');
    if (!Array.isArray(track.keyframes) || track.keyframes.length > 10000) invalid(`${path}.keyframes`, '必須是最多 10000 個關鍵影格的陣列');
    let previous = -1;
    const keyframes = track.keyframes.map((rawFrame, frameIndex): Keyframe => {
      const framePath = `${path}.keyframes[${frameIndex}]`, frame = record(rawFrame, framePath);
      const time = numeric(frame.time, `${framePath}.time`, 0, duration);
      if (time <= previous) invalid(`${framePath}.time`, '必須依時間遞增且不能重複');
      previous = time;
      return { time, value: numeric(frame.value, `${framePath}.value`, definition.min, definition.max) };
    });
    if (track.easing !== undefined && !['linear', 'smooth'].includes(track.easing as string)) invalid(`${path}.easing`, '不是支援的插值方式');
    return { id, parameter: definition.id, keyframes, ...(track.easing ? { easing: track.easing as Track['easing'] } : {}) };
  });
  const addedParameters = new Set<ParameterId>(['windStrength', 'windDirection', 'clothSway', 'sleeveSwing', 'armRaiseLeft', 'wristWave', 'wristWaveLeft']);
  // New motion parameters have defaults so earlier version-1 projects still open.
  const parameters = Object.fromEntries(parameterDefinitions.map(d => [d.id, numeric(params[d.id] ?? (addedParameters.has(d.id) ? d.defaultValue : undefined), `parameters.${d.id}`, d.min, d.max)])) as unknown as Parameters;
  const cleanAssets: Project['assets'] = { neutral: asset(assets.neutral, 'assets.neutral'), blink: asset(assets.blink, 'assets.blink'), talk: asset(assets.talk, 'assets.talk'), wave: asset(assets.wave, 'assets.wave') };
  const armAssets = ['armless', 'armRest', 'armWave'] as const;
  if (armAssets.some(key => assets[key] !== undefined)) for (const key of armAssets) cleanAssets[key] = asset(assets[key], `assets.${key}`);
  let mesh: Project['mesh'];
  if (obj.mesh !== undefined) {
    const raw = record(obj.mesh, 'mesh');
    const columns = numeric(raw.columns, 'mesh.columns', 2, 40, true), rows = numeric(raw.rows, 'mesh.rows', 2, 40, true);
    if (!Array.isArray(raw.offsets) || raw.offsets.length !== (columns + 1) * (rows + 1)) invalid('mesh.offsets', '頂點數量必須與網格一致');
    mesh = { columns, rows, offsets: raw.offsets.map((value, index) => { const p = record(value, `mesh.offsets[${index}]`); return { x: numeric(p.x, `mesh.offsets[${index}].x`, -0.3, 0.3), y: numeric(p.y, `mesh.offsets[${index}].y`, -0.3, 0.3) }; }) };
  }
  return {
    version: 1, id: string(obj.id, 'id', 100), name: string(obj.name, 'name'),
    ...(obj.renderMode === 'illustration' ? { renderMode: 'illustration' as const } : {}),
    canvas: { width: numeric(canvas.width, 'canvas.width', 64, 8192, true), height: numeric(canvas.height, 'canvas.height', 64, 8192, true) },
    assets: cleanAssets,
    parameters,
    lighting: {
      intensity: numeric(lighting.intensity, 'lighting.intensity', 0, 2), exposure: numeric(lighting.exposure, 'lighting.exposure', -1, 1),
      shadow: numeric(lighting.shadow, 'lighting.shadow', 0, 1), softness: numeric(lighting.softness, 'lighting.softness', 0, 1),
      rimLight: numeric(lighting.rimLight, 'lighting.rimLight', 0, 1), warmth: numeric(lighting.warmth, 'lighting.warmth', -1, 1),
      direction: numeric(lighting.direction, 'lighting.direction', -180, 180),
    },
    rig: { eyeLeft: rect(rig.eyeLeft, 'rig.eyeLeft'), eyeRight: rect(rig.eyeRight, 'rig.eyeRight'), mouth: rect(rig.mouth, 'rig.mouth'), headCenter: point(rig.headCenter, 'rig.headCenter'), shoulder: point(rig.shoulder, 'rig.shoulder') },
    layers, ...(mesh ? { mesh } : {}), timeline: { duration, fps: numeric(timeline.fps, 'timeline.fps', 12, 60, true), tracks },
    settings: { autoBlink: boolean(settings.autoBlink, 'settings.autoBlink'), idleMotion: boolean(settings.idleMotion, 'settings.idleMotion'), pointerTracking: boolean(settings.pointerTracking, 'settings.pointerTracking') },
  };
}

/** Linear interpolation with exact keyframe values and stable end points. */
export function interpolateTrack(track: Track, time: number, fallback = 0): number {
  const frames = track.keyframes;
  if (!frames.length) return fallback;
  if (time <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1];
  if (time >= last.time) return last.value;
  let low = 0, high = frames.length - 1;
  while (high - low > 1) { const mid = (low + high) >> 1; if (frames[mid].time <= time) low = mid; else high = mid; }
  const before = frames[low], after = frames[high];
  const progress = (time - before.time) / (after.time - before.time);
  const eased = track.easing === 'smooth' ? progress * progress * (3 - 2 * progress) : progress;
  return before.value + (after.value - before.value) * eased;
}

export function evaluatePose(project: Project, time: number): Parameters {
  const result = { ...project.parameters };
  const at = clamp(Number.isFinite(time) ? time : 0, 0, project.timeline.duration);
  for (const track of project.timeline.tracks) result[track.parameter] = interpolateTrack(track, at, result[track.parameter]);
  return result;
}

/** Stable frame-rate-independent pose transitions. Facial timing is deliberately
 * faster than arm and wind timing, so a short blink still closes completely. */
export function smoothPose(current: Parameters, target: Parameters, elapsedSeconds: number): Parameters {
  const elapsed = clamp(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0, 0, 0.25);
  const result = { ...current };
  for (const definition of parameterDefinitions) {
    const key = definition.id;
    const tau = key === 'eyeOpenLeft' || key === 'eyeOpenRight' ? 0.022 : key === 'mouthOpen' ? 0.045 : key === 'armRaise' || key === 'armRaiseLeft' ? 0.14 : key === 'windStrength' ? 0.13 : 0.085;
    const value = current[key] + (target[key] - current[key]) * (1 - Math.exp(-elapsed / tau));
    result[key] = Math.abs(value - target[key]) < 0.0005 ? target[key] : clamp(value, definition.min, definition.max);
  }
  return result;
}
