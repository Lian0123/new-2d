import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createDefaultProject } from './model';

/** Transparent regions that cannot reach the canvas edge are enclosed holes.
 * Curled hair intentionally has such spaces; solid cloth and palms must not. */
function enclosedHoles(data: Buffer, width: number, height: number): number[] {
  const seen=new Uint8Array(width*height),queue=new Int32Array(width*height),holes:number[]=[];
  for(let i=0;i<seen.length;i++) {
    if(seen[i]||data[i*4+3]>=12) continue;
    let start=0,end=1,area=0,touches=false;queue[0]=i;seen[i]=1;
    while(start<end) {
      const at=queue[start++],x=at%width,y=Math.floor(at/width);area++;
      if(x===0||y===0||x===width-1||y===height-1) touches=true;
      for(const next of [x>0?at-1:-1,x<width-1?at+1:-1,y>0?at-width:-1,y<height-1?at+width:-1]) {
        if(next>=0&&!seen[next]&&data[next*4+3]<12) {seen[next]=1;queue[end++]=next;}
      }
    }
    if(!touches&&area>5) holes.push(area);
  }
  return holes;
}

test('all independent artwork is registered RGBA; solid cloth and palms have no enclosed alpha holes', async()=>{
  const sources=[...new Set(createDefaultProject().layers.filter(l=>l.part).map(l=>l.src!))];
  for(const src of sources) {
    const file=`public${src}`;
    const metadata=await sharp(file).metadata();
    assert.equal(metadata.width,1254,src);assert.equal(metadata.height,1254,src);assert.equal(metadata.hasAlpha,true,src);
    if(/\/(bodice|sleeve|hand-open)\.png$/.test(src)) {
      const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      assert.deepEqual(enclosedHoles(data,info.width,info.height),[],`${src}: accidental holes`);
    }
  }
});
