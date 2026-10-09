import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { characterExamples, createExampleProject } from './examples';
import { createDefaultProject, validateProject } from './model';
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
