import { clamp, type Point } from './model';

export interface BonePose { shoulder: Point; elbow: Point; wrist: Point }
export const restArm: BonePose = { shoulder: { x: 797, y: 474 }, elbow: { x: 856, y: 746 }, wrist: { x: 956, y: 989 } };
export const handAnchor = { x: 908, y: 497 };
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const rotate = (point: Point, origin: Point, target: Point, rotation: number): Point => {
  const x = point.x - origin.x, y = point.y - origin.y;
  return { x: target.x + x * Math.cos(rotation) - y * Math.sin(rotation), y: target.y + x * Math.sin(rotation) + y * Math.cos(rotation) };
};

/** Fixed lengths and a shared mirrored skeleton. No interpolated bone scaling. */
export function articulatedPose(raise: number, left = false): BonePose {
  const t = clamp(raise, 0, 1);
  const upper = angle(restArm.shoulder, restArm.elbow) + (Math.atan2(236, 132) - angle(restArm.shoulder, restArm.elbow)) * t;
  const lower = angle(restArm.elbow, restArm.wrist) + (Math.atan2(-213, -21) - angle(restArm.elbow, restArm.wrist)) * t;
  const shoulder = restArm.shoulder;
  const elbow = { x: shoulder.x + Math.cos(upper) * Math.hypot(59, 272), y: shoulder.y + Math.sin(upper) * Math.hypot(59, 272) };
  const wrist = { x: elbow.x + Math.cos(lower) * Math.hypot(100, 243), y: elbow.y + Math.sin(lower) * Math.hypot(100, 243) };
  const mirror = (p: Point) => ({ x: 1254 - p.x, y: p.y });
  return left ? { shoulder: mirror(shoulder), elbow: mirror(elbow), wrist: mirror(wrist) } : { shoulder: { ...shoulder }, elbow, wrist };
}

/** Longitudinal elbow weights remain continuous across the entire sleeve.
 * Nearest-bone classification caused folded triangles and torn hands. */
export function skinArmPoint(point: Point, raise: number): Point {
  const target = articulatedPose(raise);
  const upper = rotate(point, restArm.shoulder, target.shoulder, angle(target.shoulder, target.elbow) - angle(restArm.shoulder, restArm.elbow));
  const lower = rotate(point, restArm.elbow, target.elbow, angle(target.elbow, target.wrist) - angle(restArm.elbow, restArm.wrist));
  const vx = restArm.elbow.x - restArm.shoulder.x, vy = restArm.elbow.y - restArm.shoulder.y;
  const along = ((point.x - restArm.shoulder.x) * vx + (point.y - restArm.shoulder.y) * vy) / Math.hypot(vx, vy);
  const t = clamp((along - Math.hypot(vx, vy) + 65) / 130, 0, 1), weight = t * t * (3 - 2 * t);
  return { x: upper.x * (1 - weight) + lower.x * weight, y: upper.y * (1 - weight) + lower.y * weight };
}

export function handRotation(raise: number, wave: number): number {
  const target = articulatedPose(raise);
  return angle(target.elbow, target.wrist) - Math.atan2(-213, -21) + clamp(wave, -1, 1) * 0.20;
}

/** Fingers are a rigid sprite; every pairwise distance is preserved. */
export function rigidHandPoint(point: Point, raise: number, wave: number, left = false): Point {
  const p = rotate(point, handAnchor, articulatedPose(raise).wrist, handRotation(raise, wave));
  return left ? { x: 1254 - p.x, y: p.y } : p;
}
