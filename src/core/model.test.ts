import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultProject, evaluatePose, interpolateTrack, smoothPose, validateProject, type Project, type Track } from './model.ts';

test('project import round trips and returns independent nested data', () => {
  const original = createDefaultProject();
  const imported = validateProject(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(imported, original);
  imported.rig.mouth.x = 0.2;
  imported.parameters.angleX = 15;
  assert.notEqual(imported.rig.mouth.x, original.rig.mouth.x);
  assert.equal(original.parameters.angleX, 0);
});

test('import rejects non-finite and out-of-range pose values', () => {
  for (const invalid of [NaN, Infinity, -Infinity, 31, '12']) {
    const project = createDefaultProject() as Project;
    project.parameters.angleX = invalid as number;
    assert.throws(() => validateProject(project), /parameters.angleX/);
  }
});

test('import rejects out-of-image rig bounds and oversized canvases', () => {
  const project = createDefaultProject();
  project.rig.eyeLeft = { x: 0.99, y: 0.2, width: 0.1, height: 0.1 };
  assert.throws(() => validateProject(project), /rig.eyeLeft/);
  project.rig = createDefaultProject().rig;
  project.canvas.width = 9000;
  assert.throws(() => validateProject(project), /canvas.width/);
});

test('import rejects unsafe executable image URLs and SVG data', () => {
  for (const invalid of ['javascript:alert(1)', 'file:///tmp/secret', 'data:image/svg+xml;base64,abcd']) {
    const project = createDefaultProject();
    project.assets.neutral = invalid;
    assert.throws(() => validateProject(project), /assets.neutral/);
  }
});

test('import requires a custom image and unique layer identities', () => {
  const project = createDefaultProject();
  project.layers.push({ ...project.layers[0] });
  assert.throws(() => validateProject(project), /不能重複/);
  project.layers = [{ ...project.layers[0], kind: 'custom', src: undefined, part: undefined }];
  assert.throws(() => validateProject(project), /自訂圖層需要圖片/);
});

test('timeline import rejects unsupported parameters, repeated times, and time beyond duration', () => {
  const project = createDefaultProject();
  project.timeline.tracks = [{ id: 'head', parameter: 'angleX', keyframes: [{ time: 0, value: -10 }, { time: 0, value: 10 }] }];
  assert.throws(() => validateProject(project), /必須依時間遞增/);
  project.timeline.tracks[0].keyframes = [{ time: 7, value: 5 }];
  assert.throws(() => validateProject(project), /keyframes\[0\].time/);
  project.timeline.tracks[0] = { id: 'head', parameter: 'unknown' as 'angleX', keyframes: [] };
  assert.throws(() => validateProject(project), /不是支援的參數/);
});

test('track interpolation holds endpoints and resolves linear interior values exactly', () => {
  const track: Track = { id: 'head', parameter: 'angleX', keyframes: [{ time: 1, value: -20 }, { time: 3, value: 20 }, { time: 5, value: 0 }] };
  assert.equal(interpolateTrack(track, -2), -20);
  assert.equal(interpolateTrack(track, 2), 0);
  assert.equal(interpolateTrack(track, 3), 20);
  assert.equal(interpolateTrack(track, 4), 10);
  assert.equal(interpolateTrack(track, 7), 0);
  assert.equal(interpolateTrack({ ...track, keyframes: [] }, 2, 8), 8);
});

test('pose evaluation preserves manual untracked values and clamps seek time', () => {
  const project = createDefaultProject();
  project.parameters.mouthOpen = 0.75;
  project.timeline.tracks = [{ id: 'head', parameter: 'angleX', keyframes: [{ time: 0, value: -20 }, { time: 6, value: 20 }] }];
  assert.equal(evaluatePose(project, 3).angleX, 0);
  assert.equal(evaluatePose(project, 3).mouthOpen, 0.75);
  assert.equal(evaluatePose(project, -2).angleX, -20);
  assert.equal(evaluatePose(project, 10).angleX, 20);
  assert.equal(evaluatePose(project, NaN).angleX, -20);
  assert.equal(project.parameters.angleX, 0);
});

test('pose transitions move continuously and settle at the same rate across frame rates', () => {
  const initial = createDefaultProject().parameters;
  const target = { ...initial, angleX: 30, armRaise: 1, windStrength: 1, mouthOpen: 1 };
  const first = smoothPose(initial, target, 1 / 60);
  assert.ok(first.angleX > 0 && first.angleX < 30);
  assert.ok(first.armRaise > 0 && first.armRaise < 0.2);
  let thirty = initial, sixty = initial;
  for (let i = 0; i < 30; i++) thirty = smoothPose(thirty, target, 1 / 30);
  for (let i = 0; i < 60; i++) sixty = smoothPose(sixty, target, 1 / 60);
  assert.ok(Math.abs(thirty.armRaise - sixty.armRaise) < 0.0001);
  assert.ok(Math.abs(thirty.angleX - sixty.angleX) < 0.0001);
  assert.ok(sixty.armRaise > 0.999);
});

test('earlier version-1 files receive compatible wind and garment defaults', () => {
  const project = createDefaultProject();
  const legacy = JSON.parse(JSON.stringify(project));
  delete legacy.parameters.windStrength; delete legacy.parameters.windDirection;
  delete legacy.parameters.clothSway; delete legacy.parameters.sleeveSwing;
  const imported = validateProject(legacy);
  assert.equal(imported.parameters.windStrength, 0.2);
  assert.equal(imported.parameters.windDirection, 0.5);
  assert.equal(imported.parameters.clothSway, 0);
  assert.equal(imported.parameters.sleeveSwing, 0);
});

test('independent art parts preserve pivots and alternate textures through import', () => {
  const project = createDefaultProject();
  const imported = validateProject(project);
  assert.equal(imported.layers.filter(layer => layer.part).length, 12);
  assert.equal(imported.layers.filter(layer => layer.kind === 'hair').length, 3);
  assert.equal(imported.layers.filter(layer => layer.kind === 'clothing').length, 4);
  const sleeve = imported.layers.find(layer => layer.part === 'sleeveRight')!;
  assert.equal(sleeve.waveSrc, undefined);
  assert.equal(sleeve.src, imported.layers.find(layer => layer.part === 'sleeveLeft')!.src);
  assert.equal(imported.layers.filter(layer => layer.part?.startsWith('hand')).length, 2);
  assert.deepEqual(sleeve.pivot, project.layers.find(layer => layer.id === sleeve.id)!.pivot);
  sleeve.pivot!.x = 0.2;
  assert.notEqual(sleeve.pivot!.x, project.layers.find(layer => layer.id === sleeve.id)!.pivot!.x);
});

test('mesh import enforces vertex count and finite deformation offsets', () => {
  const project = createDefaultProject();
  project.mesh!.offsets[110] = { x: 0.02, y: -0.03 };
  const imported = validateProject(project);
  assert.deepEqual(imported.mesh!.offsets[110], { x: 0.02, y: -0.03 });
  project.mesh!.offsets.pop();
  assert.throws(() => validateProject(project), /頂點數量/);
  project.mesh = createDefaultProject().mesh;
  project.mesh!.offsets[10].x = Infinity;
  assert.throws(() => validateProject(project), /mesh.offsets/);
});
