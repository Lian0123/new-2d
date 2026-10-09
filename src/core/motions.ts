import { createDefaultProject, type ParameterId, type Project, type Track } from './model';

type Frames = Array<[number, number]>;
type MotionSpec = Array<[ParameterId, Frames]>;
const wrist: Frames = [[0,0],[1.6,0],[1.85,-0.75],[2.1,0.75],[2.35,-0.75],[2.6,0.75],[2.85,-0.75],[3.1,0],[6,0]];
const lift: Frames = [[0,0],[1.6,1],[3.3,1],[4.9,0],[6,0]];
export const motionSpecs: Record<string, MotionSpec> = {
  '輕柔待機': [['breath', [[0,0.15],[1.5,0.5],[3,0.15],[4.5,0.5],[6,0.15]]], ['angleZ', [[0,0],[1.5,-1],[4.5,1],[6,0]]], ['hairSway', [[0,0],[1.5,-0.12],[4.5,0.12],[6,0]]]],
  '揮手招呼': [['armRaise',lift],['wristWave',wrist],['angleZ',[[0,0],[0.9,-2],[2.7,-2],[3.6,0],[6,0]]]],
  '開心說話': [['mouthOpen', [[0,0],[0.3,0.65],[0.6,0.1],[0.9,0.8],[1.2,0],[1.5,0.5],[1.8,0.8],[2.1,0.2],[2.4,0.6],[2.7,0],[3.1,0.7],[3.5,0.1],[3.9,0.6],[4.3,0],[4.8,0.6],[5.2,0.2],[6,0]]],['mouthSmile',[[0,0.25],[0.4,0.7],[5.5,0.7],[6,0.25]]]],
  '風吹衣襬': [['windStrength',[[0,0.2],[1.5,0.65],[4,0.55],[6,0.2]]],['windDirection',[[0,0.5],[3,0.8],[6,0.5]]],['clothSway',[[0,0],[1.5,0.45],[3,-0.2],[4.5,0.4],[6,0]]],['hairSway',[[0,0],[2,0.2],[4,-0.12],[6,0]]]],
  '點頭回應': [['angleY',[[0,0],[0.8,-2],[1.5,9],[2.3,0],[3.1,7],[4,0],[6,0]]],['mouthSmile',[[0,0.25],[1,0.5],[4,0.25],[6,0.25]]]],
  '輕輕搖頭': [['angleX',[[0,0],[1,-10],[2,10],[3,-8],[4,8],[5,0],[6,0]]],['eyeX',[[0,0],[1,-0.2],[2,0.2],[3,-0.2],[4,0.2],[5,0],[6,0]]]],
  '眨眼微笑': [['eyeOpenLeft',[[0,1],[0.85,1],[1,0],[1.3,0],[1.5,1],[6,1]]],['mouthSmile',[[0,0.25],[0.7,0.75],[2,0.75],[3,0.25],[6,0.25]]],['angleZ',[[0,0],[1,-3],[2,-3],[3,0],[6,0]]]],
  '歪頭好奇': [['angleZ',[[0,0],[1.4,-6],[2.6,-6],[4,4],[5.5,0],[6,0]]],['browY',[[0,0],[1.4,0.25],[4,0.15],[5.5,0],[6,0]]]],
  '左右環顧': [['angleX',[[0,0],[1.3,-12],[2.3,-12],[3.7,12],[4.7,12],[6,0]]],['eyeX',[[0,0],[0.7,-0.5],[2.3,-0.5],[3.1,0.5],[4.7,0.5],[6,0]]]],
  '左手招呼': [['armRaiseLeft',lift],['wristWaveLeft',wrist],['angleZ',[[0,0],[0.9,2],[2.7,2],[3.6,0],[6,0]]]],
  '雙手歡迎': [['armRaise',lift],['armRaiseLeft',lift],['wristWave',wrist],['wristWaveLeft',wrist],['mouthSmile',[[0,0.25],[0.9,0.65],[2.7,0.65],[3.6,0.25],[6,0.25]]]],
};
export const motionNames = Object.keys(motionSpecs);

export function applyMotionPreset(project: Project, name: string): Project {
  const spec = motionSpecs[name];
  if (!spec) throw new Error(`未知動畫：${name}`);
  const tracks: Track[] = spec.map(([parameter, frames]) => ({ id: `motion-${parameter}`, parameter, easing: 'smooth', keyframes: frames.map(([time,value]) => ({time,value})) }));
  return { ...project, parameters: createDefaultProject().parameters, timeline: { duration: 6, fps: project.timeline.fps, tracks } };
}
