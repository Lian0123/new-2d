import { createAnimatedExampleProject } from '../core/examples';
import { applyMotionPreset } from '../core/motions';
import type { Project } from '../core/model';

// Only bundled public assets are rebased; data URLs and user URLs stay intact.
export function demoAsset(source: string): string {
  return source.startsWith('/assets/') ? `${import.meta.env.BASE_URL}${source.slice(1)}` : source;
}

export function createDemoProject(character: string, motion: string): Project {
  const project = applyMotionPreset(createAnimatedExampleProject(character), motion);
  return {
    ...project,
    assets: Object.fromEntries(Object.entries(project.assets).map(([key, value]) => [key, demoAsset(value)])) as Project['assets'],
    layers: project.layers.map(layer => ({ ...layer, src: layer.src && demoAsset(layer.src), waveSrc: layer.waveSrc && demoAsset(layer.waveSrc) })),
  };
}
