import { clamp, type Parameters, type Point, type PoseRig, type Project, type Rect } from './model';

const point = (x: number, y: number): Point => ({ x: x / 1254, y: y / 1254 });
const rect = (x: number, y: number, width: number, height: number): Rect => ({ ...point(x, y), width: width / 1254, height: height / 1254 });

// Landmarks are registered to each original 1254px painting, not Hana's anatomy.
export const poseProfiles: Record<string, { rig: Project['rig']; motion: PoseRig }> = {
  sakura: {
    rig: { eyeLeft: rect(582, 196, 34, 28), eyeRight: rect(633, 214, 36, 29), mouth: rect(597, 240, 33, 30), headCenter: point(627, 237), shoulder: point(678, 337) },
    motion: { head: rect(508, 111, 254, 220), chest: rect(516, 312, 211, 200), hair: rect(508, 143, 280, 218), cloth: rect(430, 486, 493, 287), anchor: point(650, 655), armLeft: { shoulder: point(546, 332), wrist: point(544, 278), radius: .047, lift: -5 }, armRight: { shoulder: point(693, 362), wrist: point(812, 522), radius: .047, lift: -7 } },
  },
  aoi: {
    rig: { eyeLeft: rect(614, 198, 34, 27), eyeRight: rect(651, 214, 31, 26), mouth: rect(628, 237, 28, 21), headCenter: point(648, 235), shoulder: point(727, 371) },
    motion: { head: rect(549, 116, 165, 187), chest: rect(581, 287, 159, 170), hair: rect(397, 242, 208, 293), cloth: rect(467, 491, 363, 255), anchor: point(660, 650), armLeft: { shoulder: point(566, 354), wrist: point(592, 461), radius: .045, lift: 4 }, armRight: { shoulder: point(729, 380), wrist: point(776, 572), radius: .041, lift: -8 } },
  },
  yuzuki: {
    rig: { eyeLeft: rect(562, 232, 35, 28), eyeRight: rect(614, 208, 35, 28), mouth: rect(604, 258, 37, 28), headCenter: point(612, 241), shoulder: point(745, 372) },
    motion: { head: rect(507, 119, 202, 203), chest: rect(511, 329, 254, 173), hair: rect(411, 272, 404, 275), cloth: rect(520, 597, 383, 339), anchor: point(650, 639), armLeft: { shoulder: point(514, 372), wrist: point(587, 550), radius: .052, lift: 3 }, armRight: { shoulder: point(756, 377), wrist: point(759, 551), radius: .044, lift: -3 }, coupledHands: rect(550, 489, 248, 105) },
  },
  rin: {
    rig: { eyeLeft: rect(584, 211, 34, 28), eyeRight: rect(628, 189, 35, 27), mouth: rect(619, 232, 36, 30), headCenter: point(625, 230), shoulder: point(755, 367) },
    motion: { head: rect(530, 112, 205, 181), chest: rect(559, 309, 193, 161), hair: rect(535, 146, 203, 136), cloth: rect(533, 482, 240, 311), anchor: point(664, 802), armLeft: { shoulder: point(565, 299), wrist: point(479, 214), radius: .05, lift: -5 }, armRight: { shoulder: point(762, 382), wrist: point(907, 540), radius: .05, lift: -7 } },
  },
};

const smooth = (a: number, b: number, value: number) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const region = (p: Point, box: Rect) => {
  const distance = Math.hypot((p.x - box.x - box.width / 2) / (box.width / 2), (p.y - box.y - box.height / 2) / (box.height / 2));
  return 1 - smooth(.65, 1.3, distance);
};

/** Continuous, small pose-specific motion; feet and seated furniture stay anchored. */
export function deformPosePoint(p: Point, project: Project, pose: Parameters, time: number): Point {
  const rig = project.poseRig!;
  const head = region(p, rig.head), chest = region(p, rig.chest);
  let x = p.x, y = p.y;
  const tilt = pose.angleZ * Math.PI / 180 * .65;
  const dx = p.x - project.rig.headCenter.x, dy = p.y - project.rig.headCenter.y;
  x += head * (dx * (Math.cos(tilt) - 1) - dy * Math.sin(tilt) + pose.angleX / 30 * .014);
  y += head * (dx * Math.sin(tilt) + dy * (Math.cos(tilt) - 1) + pose.angleY / 30 * .009);
  const breath = pose.breath * (project.settings.idleMotion ? Math.sin(time * 1.75) : 1);
  x += chest * (p.x - rig.anchor.x) * breath * .012; y -= chest * breath * .003;
  const wind = pose.windStrength * pose.windDirection;
  const hair = region(p, rig.hair) * (1 - head);
  const cloth = region(p, rig.cloth);
  x += hair * .012 * (pose.hairSway + wind * (.7 + .2 * Math.sin(time * 2 - p.y * 5)));
  x += cloth * .009 * (pose.clothSway + wind * (.7 + .2 * Math.sin(time * 2.6 - p.x * 6)));
  y += cloth * .005 * (p.x - rig.anchor.x) * (pose.clothSway + wind);
  if (rig.coupledHands) {
    // Move the book and both gripping hands as one region, without pulling them apart.
    const amount = region(p, rig.coupledHands);
    y -= amount * (pose.armRaise + pose.armRaiseLeft) * .004;
    x += amount * (pose.wristWave + pose.wristWaveLeft) * .002;
  } else {
    for (const [arm, raise, wave] of [[rig.armLeft, pose.armRaiseLeft, pose.wristWaveLeft], [rig.armRight, pose.armRaise, pose.wristWave]] as const) {
      const vx = arm.wrist.x - arm.shoulder.x, vy = arm.wrist.y - arm.shoulder.y;
      const along = clamp(((p.x - arm.shoulder.x) * vx + (p.y - arm.shoulder.y) * vy) / Math.max(1e-8, vx * vx + vy * vy), 0, 1);
      const distance = Math.hypot(p.x - arm.shoulder.x - vx * along, p.y - arm.shoulder.y - vy * along);
      const amount = (1 - smooth(arm.radius * .7, arm.radius * 1.8, distance)) * smooth(.15, .85, along);
      const rotation = (arm.lift * raise + wave * 3) * Math.PI / 180;
      const ax = p.x - arm.shoulder.x, ay = p.y - arm.shoulder.y;
      x += amount * (ax * (Math.cos(rotation) - 1) - ay * Math.sin(rotation));
      y += amount * (ax * Math.sin(rotation) + ay * (Math.cos(rotation) - 1));
      x += amount * pose.sleeveSwing * .003;
    }
  }
  return { x, y };
}

const facePatchCache = new WeakMap<HTMLImageElement, Map<string, { canvas: HTMLCanvasElement; skin: string }>>();

/** Replace a face patch locally, feathered into the original painted skin. */
export function drawPoseFace(ctx: CanvasRenderingContext2D, image: HTMLImageElement, project: Project, pose: Parameters): void {
  const width = image.naturalWidth, height = image.naturalHeight;
  const paint = (box: Rect, scaleX: number, scaleY: number, shiftX: number, shiftY: number, eye: boolean) => {
    const x = box.x * width, y = box.y * height, w = box.width * width, h = box.height * height;
    if (Math.abs(scaleX - 1) + Math.abs(scaleY - 1) + Math.abs(shiftX) + Math.abs(shiftY) < .0001) return;
    let entries = facePatchCache.get(image);
    if (!entries) { entries = new Map(); facePatchCache.set(image, entries); }
    const key = JSON.stringify(box);
    let entry = entries.get(key);
    if (!entry) {
      const sample = document.createElement('canvas'); sample.width = sample.height = 1;
      const source = sample.getContext('2d', { willReadFrequently: true })!;
      source.drawImage(image, x + w * .45, y + h + 2, 1, 1, 0, 0, 1, 1);
      const skin = source.getImageData(0, 0, 1, 1).data;
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(w + 12); canvas.height = Math.ceil(h + 12);
      entry = { canvas, skin: `rgb(${skin[0]},${skin[1]},${skin[2]})` }; entries.set(key, entry);
    }
    const patch = entry.canvas, paint = patch.getContext('2d')!;
    paint.clearRect(0, 0, patch.width, patch.height);
    paint.fillStyle = entry.skin; paint.fillRect(0, 0, patch.width, patch.height);
    paint.save(); paint.translate(patch.width / 2 + shiftX, patch.height / 2 + shiftY);
    paint.scale(scaleX, Math.max(.05, scaleY));
    paint.drawImage(image, x, y, w, h, -w / 2, -h / 2, w, h); paint.restore();
    if (eye && scaleY < .15) {
      paint.save(); paint.translate((patch.width - w) / 2, (patch.height - h) / 2);
      paint.lineWidth = Math.max(1.2, w * .045); paint.lineCap = 'round'; paint.strokeStyle = '#5b393e';
      paint.beginPath(); paint.moveTo(w * .13, h * .51); paint.quadraticCurveTo(w * .5, h * .76, w * .88, h * .49); paint.stroke(); paint.restore();
    }
    paint.save(); paint.translate(patch.width / 2, patch.height / 2); paint.scale(patch.width / 2, patch.height / 2);
    const edge = paint.createRadialGradient(0, 0, 0, 0, 0, 1);
    edge.addColorStop(0, '#fff'); edge.addColorStop(.8, '#fff'); edge.addColorStop(1, 'transparent');
    paint.globalCompositeOperation = 'destination-in'; paint.fillStyle = edge; paint.fillRect(-1, -1, 2, 2); paint.restore();
    ctx.drawImage(patch, x + w / 2 - patch.width / 2, y + h / 2 - patch.height / 2);
  };
  for (const [box, open] of [[project.rig.eyeLeft, pose.eyeOpenLeft], [project.rig.eyeRight, pose.eyeOpenRight]] as const) {
    paint(box, 1, clamp(open, 0, 1), pose.eyeX * box.width * width * .075, -pose.eyeY * box.height * height * .07, true);
  }
  paint(project.rig.mouth, 1 + pose.mouthSmile * .12, .55 + pose.mouthOpen * .9, 0, 0, false);
}
