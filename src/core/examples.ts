import { createDefaultProject, type Project } from './model';

export const characterExamples = [
  { id: 'hana', name: '花音', english: 'Hana', pose: '正面 · 分層動畫', style: '月光禮服', src: '/assets/characters/hana/neutral.png', layered: true },
  { id: 'sakura', name: '櫻咲', english: 'Sakura', pose: '側身比耶', style: '甜美舞台服', src: '/assets/characters/examples/sakura.png', layered: false },
  { id: 'aoi', name: '蒼月', english: 'Aoi', pose: '叉腰站姿', style: '幻想冒險裝', src: '/assets/characters/examples/aoi.png', layered: false },
  { id: 'yuzuki', name: '柚月', english: 'Yuzuki', pose: '坐姿閱讀', style: '溫柔日常服', src: '/assets/characters/examples/yuzuki.png', layered: false },
  { id: 'rin', name: '凜音', english: 'Rin', pose: '抬腿敬禮', style: '活力街頭服', src: '/assets/characters/examples/rin.png', layered: false },
] as const;

export function createExampleProject(id: string): Project {
  const example = characterExamples.find(item => item.id === id);
  if (!example) throw new Error(`未知角色範例：${id}`);
  if (example.layered) return createDefaultProject();
  const base = createDefaultProject();
  return {
    ...base, id: `example-${id}-v1`, name: `${example.name} · ${example.pose}`, renderMode: 'illustration',
    canvas: { width: 1254, height: 1254 },
    assets: { neutral: example.src, blink: example.src, talk: example.src, wave: example.src },
    layers: [{ id: 'illustration', name: `${example.name} · 完整姿勢`, kind: 'character', visible: true, locked: false, opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 }],
    parameters: { ...base.parameters, breath: 0, windStrength: 0, mouthSmile: 0 },
    settings: { autoBlink: false, idleMotion: false, pointerTracking: false },
    mesh: undefined,
    timeline: { duration: 6, fps: 30, tracks: [] },
  };
}

export function findCharacterExample(project: Project) {
  return characterExamples.find(item => project.assets.neutral === item.src || project.id === `example-${item.id}-v1`);
}
