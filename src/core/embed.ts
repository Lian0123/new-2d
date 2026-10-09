import { applyMotionPreset, motionNames } from './motions';
import { CharacterPlayer, renderCharacter } from './player';
import { createDefaultProject, validateProject, parameterDefinitions, evaluatePose, interpolateTrack, smoothPose } from './model';

export { applyMotionPreset, motionNames, CharacterPlayer, renderCharacter, createDefaultProject, validateProject, parameterDefinitions, evaluatePose, interpolateTrack, smoothPose };

declare global {
  interface Window {
    Mio2D: { applyMotionPreset: typeof applyMotionPreset; motionNames: typeof motionNames; CharacterPlayer: typeof CharacterPlayer; renderCharacter: typeof renderCharacter; createDefaultProject: typeof createDefaultProject; validateProject: typeof validateProject; parameterDefinitions: typeof parameterDefinitions; evaluatePose: typeof evaluatePose; interpolateTrack: typeof interpolateTrack };
  }
}

if (typeof window !== 'undefined') window.Mio2D = { applyMotionPreset, motionNames, CharacterPlayer, renderCharacter, createDefaultProject, validateProject, parameterDefinitions, evaluatePose, interpolateTrack };
