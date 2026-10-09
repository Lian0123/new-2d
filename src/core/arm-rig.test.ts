import assert from 'node:assert/strict';
import test from 'node:test';
import { articulatedPose, rigidHandPoint, skinArmPoint } from './arm-rig';
import { applyMotionPreset, motionNames } from './motions';
import { createDefaultProject, evaluatePose, validateProject } from './model';
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);

test('every frame keeps identical mirrored bone lengths and rigid five-finger geometry', () => {
  const fingers=[{x:824,y:335},{x:861,y:278},{x:914,y:265},{x:958,y:280},{x:990,y:321}];
  for (const name of motionNames) {
    const project=applyMotionPreset(createDefaultProject(),name);
    assert.deepEqual(validateProject(project),project);
    let last: {x:number;y:number} | undefined;
    for (let frame=0;frame<=180;frame++) {
      const pose=evaluatePose(project,frame/30);
      const a=pose.armRaise;
      const right=articulatedPose(a),left=articulatedPose(a,true);
      assert.ok(Math.abs(distance(right.shoulder,right.elbow)-Math.hypot(59,272))<1e-9);
      assert.ok(Math.abs(distance(right.elbow,right.wrist)-Math.hypot(100,243))<1e-9);
      for(const bone of ['shoulder','elbow','wrist'] as const) {assert.equal(right[bone].x+left[bone].x,1254);assert.equal(right[bone].y,left[bone].y);}
      const mapped=fingers.map(p=>rigidHandPoint(p,a,pose.wristWave));
      for(let i=0;i<fingers.length;i++) for(let j=0;j<i;j++) assert.ok(Math.abs(distance(mapped[i],mapped[j])-distance(fingers[i],fingers[j]))<1e-9);
      if(last) assert.ok(distance(mapped[0],last)<40, `${name} frame ${frame}: discontinuity`);
      last=mapped[0];
    }
    assert.deepEqual(evaluatePose(project,0),evaluatePose(project,6), `${name}: loop seam`);
  }
});

test('elbow skin weights stay continuous across the former nearest-bone boundary',()=>{
  for(let raise=0;raise<=1;raise+=0.01) for(let x=780;x<=1020;x+=20) for(let y=650;y<=810;y+=5) {
    const a=skinArmPoint({x,y},raise),b=skinArmPoint({x:x+0.01,y},raise);
    assert.ok(distance(a,b)<0.05, `weight discontinuity at ${x},${y},${raise}`);
  }
});

test('older projects default new wrist controls without replacing manual artwork',()=>{
  const project=JSON.parse(JSON.stringify(createDefaultProject()));
  delete project.parameters.armRaiseLeft;delete project.parameters.wristWave;delete project.parameters.wristWaveLeft;
  const restored=validateProject(project);
  assert.equal(restored.parameters.armRaiseLeft,0);assert.equal(restored.parameters.wristWave,0);assert.equal(restored.parameters.wristWaveLeft,0);
});
