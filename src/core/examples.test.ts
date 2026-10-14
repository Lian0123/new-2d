import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { characterExamples, createExampleProject, createAnimatedExampleProject } from './examples';
import { createDefaultProject, evaluatePose, validateProject } from './model';
import { applyMotionPreset, motionNames } from './motions';
import { deformPoint } from './player';

test('pose projects survive JSON round trips and never inherit Hana deformation', () => {
  for (const example of characterExamples.filter(item => !item.layered)) {
    const project = validateProject(JSON.parse(JSON.stringify(createExampleProject(example.id))));
    assert.equal(project.renderMode, 'illustration');
    assert.equal(project.layers.length, 1);
    assert.equal(project.assets.wave, project.assets.neutral);
    const pose = { ...createDefaultProject().parameters, angleX: 30, angleY: -30, angleZ: 20, armRaise: 1, breath: 1, hairSway: 1, windStrength: 1 };
    for (const point of [{x:200,y:200},{x:700,y:300},{x:1100,y:950}]) {
      assert.deepEqual(deformPoint(point,1254,1254,project,pose,2),point);
    }
  }
  assert.equal(createExampleProject('hana').renderMode, undefined);
  assert.throws(() => validateProject({...createDefaultProject(),renderMode:'unknown'}));
});

test('four pose assets preserve alpha and safe transparent framing', async () => {
  for (const example of characterExamples.filter(item => !item.layered)) {
    const { data, info } = await sharp(`public${example.src}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,1254); assert.equal(info.height,1254);
    let count=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      const alpha=data[(y*info.width+x)*4+3];
      if(alpha>12) { count++; assert.ok(x>=100&&x<1154&&y>=100&&y<1154,`${example.id}: silhouette outside safe frame`); }
    }
    assert.ok(count>100_000,`${example.id}: missing painted character`);
  }
});

test('animated pose profiles preserve their own rig through portable JSON and anchor feet', () => {
  for (const example of characterExamples.filter(item => !item.layered)) {
    const source = createAnimatedExampleProject(example.id);
    const project = validateProject(JSON.parse(JSON.stringify(source)));
    assert.deepEqual(project, source);
    assert.notDeepEqual(project.rig, createDefaultProject().rig);
    assert.notEqual(project.poseRig, source.poseRig);
    const pose = { ...project.parameters, angleX: 20, angleY: 10, angleZ: 12, armRaise: 1, armRaiseLeft: 1, wristWave: 1, windStrength: 1 };
    const head = { x: project.rig.headCenter.x * 1254, y: project.rig.headCenter.y * 1254 };
    assert.notDeepEqual(deformPoint(head, 1254, 1254, project, pose, 2), head);
    const foot = { x: 700, y: 1120 };
    assert.deepEqual(deformPoint(foot, 1254, 1254, project, pose, 2), foot);
    assert.throws(() => validateProject({ ...source, poseRig: undefined }));
    assert.throws(() => validateProject({ ...source, poseRig: { ...source.poseRig, armRight: { ...source.poseRig!.armRight, lift: 90 } } }));
  }
});

test('pose animations keep every mesh triangle facing forward across all presets', () => {
  const area = (a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for (const id of ['sakura', 'aoi', 'yuzuki', 'rin']) for (const motion of motionNames) {
    const project = applyMotionPreset(createAnimatedExampleProject(id), motion);
    const { columns, rows } = project.mesh!;
    for (const time of [0,1,2,3,4,5]) {
      const pose = evaluatePose(project, time);
      const vertices = Array.from({length:rows+1}, (_,r) => Array.from({length:columns+1}, (_,c) => deformPoint({x:c/columns*1254,y:r/rows*1254},1254,1254,project,pose,time)));
      for(let r=0;r<rows;r++) for(let c=0;c<columns;c++) {
        const a=vertices[r][c],b=vertices[r][c+1],d=vertices[r+1][c],e=vertices[r+1][c+1];
        assert.ok(area(a,b,d)>0&&area(d,b,e)>0,`${id}: ${motion} at ${time}s folded a triangle`);
      }
    }
  }
});
