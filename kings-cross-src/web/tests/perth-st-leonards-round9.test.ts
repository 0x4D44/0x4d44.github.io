import test from 'node:test';
import assert from 'node:assert/strict';
import {stLeonardsPaintTexture} from '../src/perth-frontage-textures.ts';
import {ST_LEONARDS as K,ST_LEONARDS_COLOURS as C,stLeonardsBridge,stLeonardsFrame} from '../src/perth-st-leonards-bridge.ts';
import {Batch} from '../src/materials.ts';

const panels=Math.floor((K.abutments[1]-K.abutments[0]+2.4)/K.girder.pitch),pitch=(K.abutments[1]-K.abutments[0]+2.4)/panels;
const texture=stLeonardsPaintTexture(panels,C.steel,K.girder.flange/(K.parapet+K.fascia));
test.after(()=>texture.dispose());
// Area-average to the scored telephoto view's approximate 4 cm footprint. Inspect what survives minification, not tiny texel noise.
const pw=42,ph=38,base=[C.steel>>16&255,C.steel>>8&255,C.steel&255];
function colour(panel:number,x:number,y:number):number[]{
 const {width,height,data}=texture.image,sum=[0,0,0];let n=0;
 for(let yy=Math.floor(y*height/ph);yy<Math.ceil((y+1)*height/ph);yy++)for(let xx=Math.floor((panel+x/pw)*width/panels);xx<Math.ceil((panel+(x+1)/pw)*width/panels);xx++){
  const i=(yy*width+xx)*4;for(let c=0;c<3;c++)sum[c]!+=Number(data![i+c]);n++;
 }
 return sum.map(v=>v/n);
}
function patches(){
 const out:{panel:number;left:number;right:number;bottom:number;top:number}[]=[];
 for(let p=0;p<panels;p++){
  let left=pw,right=-1,bottom=ph,top=-1,cores=0;
  for(let y=2;y<ph-2;y++)for(let x=0;x<pw;x++){
   const [r,g,b]=colour(p,x,y);if(r!-g!<20||b!>=135)continue;
   cores++;left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
  }
  if(cores>=4)out.push({panel:p,left,right,bottom,top});
 }
 return out;
}

test('round 9: minified rust includes broad blotches, varied sizes, high and edge patches, and more clean panels',()=>{
 const ps=patches(),widths=ps.map(p=>(p.right-p.left+1)/pw*pitch),heights=ps.map(p=>(p.top-p.bottom+1)/ph*(K.parapet+K.fascia));
 assert.ok(ps.length>=10&&ps.length<=20,`occupied ${ps.length}/${panels}`);
 assert.ok(widths.filter((w,i)=>w>heights[i]!).length>=ps.length*.35,`broad ${widths.filter((w,i)=>w>heights[i]!).length}/${ps.length}`);
 assert.ok(Math.max(...widths)/Math.min(...widths)>=2.5,`width span ${widths}`);
 const centres=ps.map(p=>(p.top+p.bottom)/2/ph);
 assert.ok(Math.max(...centres)-Math.min(...centres)>=.28&&ps.filter(p=>p.top/ph>.8).length>=3,`vertical placement ${centres}`);
 assert.ok(ps.filter(p=>p.left/pw<.15||p.right/pw>.85).length>=3,`edge patches ${JSON.stringify(ps)}`);
});

test('round 9: rust runoff survives the scored footprint for a body-height below the body, with no matching upward trail',()=>{
 const ps=patches();let streaked=0;const evidence:unknown[]=[];
 for(const p of ps){
  const h=p.top-p.bottom+1;let below=0,above=0,reach=0;
  for(let d=1;d<=h;d++){
   let row=0;
   for(let x=p.left;x<=p.right;x++){
    if(p.bottom-d>=2){const c=colour(p.panel,x,p.bottom-d);row=Math.max(row,base[2]!-c[2]!);below+=Math.max(0,base[2]!-c[2]!);}
    if(p.top+d<ph-2)above+=Math.max(0,base[2]!-colour(p.panel,x,p.top+d)[2]!);
   }
   if(row>=8)reach=d;
  }
  if(reach>=h*.9&&below>above*2&&below>=h*12)streaked++;
  evidence.push({panel:p.panel,h,reach,below,above});
 }
 assert.ok(streaked>=ps.length*.65,`long asymmetric runoff ${streaked}/${ps.length}: ${JSON.stringify(evidence)}`);
});

test('round 9: top flange, coping and stiffeners have visible relief and a dark under-flange line on both faces',()=>{
 const b=new Batch({colored:true,uv:false});stLeonardsBridge(b,{heightAt:()=>0});
 for(const sg of [-1,1]){
  const near=(y:number,proud:number)=>Array.from({length:b.count},(_,i)=>i).filter(i=>{
   const f=stLeonardsFrame([b.positions[i*3]!,b.positions[i*3+2]!]);return Math.abs(b.positions[i*3+1]!-y)<.001&&sg*f.o>=K.half+proud-.001&&f.s>12&&f.s<76;
  });
  const top=K.road+K.parapet;
  assert.ok(near(top-K.girder.flange,.15).length>=4,'top flange projects at least 15 cm');
  assert.ok(near(top+K.coping.height,.23).length>=4,'coping projects at least 23 cm');
  const under=[...near(top-K.girder.flange-.07,.005),...near(top-K.girder.flange,.005)];
  assert.ok(under.length>=4&&under.some(i=>b.colors[i*3]!+b.colors[i*3+1]!+b.colors[i*3+2]!<.16),'a crisp dark contact line below the flange');
 }
 assert.ok(K.girder.stiffener>=.15&&K.girder.stiffenerProud>=.085,'stiffeners have a 15 cm face and 8.5 cm relief');
 // Build budget remains independent of scene size or terrain.
 assert.ok(b.triangles<20_000,`bridge triangles ${b.triangles}`);
});
