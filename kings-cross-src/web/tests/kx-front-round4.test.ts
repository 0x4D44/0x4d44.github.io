import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {shedLayout,worldToShed,SHED_SPAN_WIDTH} from '../../core/station.ts';
import {lunetteBars} from '../src/shed.ts';
import {createKxFrontReflections,kxFrontSources} from '../src/kx-front-reflections.ts';
import {Glsl} from './glsl.ts';
import {surfaceUniforms} from '../src/atmosphere.ts';
const data=JSON.parse(readFileSync(new URL('../src/data/kx-track.json',import.meta.url),'utf8')),layout=shedLayout(data);
function make(){
 const bytes=new Uint8Array([64,0,255,255,64,0,255,255,64,0,255,255,64,0,255,255]);
 const surface={map:new THREE.DataTexture(bytes,2,2,THREE.RGBAFormat),rect:new THREE.Vector4(-500,-500,.001,.001),dispose(){this.map.dispose();}};
 const made=createKxFrontReflections(layout,surface),mesh=made.group.getObjectByName('kx-front-glazing-reflections') as THREE.InstancedMesh;
 return {surface,made,mesh,dispose(){made.dispose();surface.dispose();}};
}
function shader(mesh:THREE.InstancedMesh){const lib=THREE.ShaderLib.basic,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};(mesh.material as THREE.Material).onBeforeCompile(s as never,undefined as never);return s;}

test('front wet source samples sit inside actual clear panes rather than the lunette bars',()=>{
 const r=make();try{const sources=kxFrontSources(layout,r.surface);assert.equal(sources.length,10);
 for(const source of sources){const {u}=worldToShed(layout,[source.head[0],source.head[2]]),centre=layout.aisle+(u<layout.width/2?.5:1.5)*SHED_SPAN_WIDTH;
  for(const bar of lunetteBars(centre,layout.springing)){const dx=u-bar.c[0],dy=source.head[1]-bar.c[1],x=Math.cos(bar.rotZ)*dx+Math.sin(bar.rotZ)*dy,y=-Math.sin(bar.rotZ)*dx+Math.cos(bar.rotZ)*dy;assert.ok(Math.abs(x)>bar.s[0]/2+.0001||Math.abs(y)>bar.s[1]/2+.0001,'sample is clear of the built mullion, transom and ring');}
 }
 }finally{r.dispose();}
});

test('five front sources per arch have aperture-driven uneven spacing and widths in the rendered shader',()=>{
 const r=make();try{assert.equal(r.mesh.count,10);const p=r.mesh.geometry.getAttribute('reflectionHead'),width=r.mesh.geometry.getAttribute('reflectionWidth');assert.ok(width,'actual source aperture scales each rendered strip');assert.equal(width.count,r.mesh.count);kxFrontSources(layout,r.surface).forEach((source,i)=>assert.ok(Math.abs(width.getX(i)-source.widthScale)<1e-6));
 const gaps=[];for(let i=1;i<5;i++)gaps.push(Math.hypot(p.getX(i)-p.getX(i-1),p.getZ(i)-p.getZ(i-1)));
 assert.ok(Math.max(...gaps)-Math.min(...gaps)>2,'not the previous five-metre grid');assert.ok(Math.max(...Array.from(width.array))-Math.min(...Array.from(width.array))>.35,'narrow interrupted panes and broad panes retain different widths');
 const s=shader(r.mesh),body=s.vertexShader.split('// reflection-source-width-begin')[1]?.split('// reflection-source-width-end')[0];assert.ok(body,'aperture widths reach rendered geometry');
 for(const factor of [.4,1]){const e={vars:{roughWidth:2,reflectionWidth:factor}};new Glsl('').run(body,e);assert.equal(e.vars.roughWidth,2*factor);}
 }finally{r.dispose();}
});

test('front reflected glazing uses the cool shed-light tint instead of the old orange comb',()=>{
 const r=make();try{const colour=new THREE.Color();r.mesh.getColorAt(0,colour);assert.ok(colour.b/colour.r>=1.1);assert.ok(colour.g>colour.r);assert.ok(colour.r+colour.g+colour.b<1.35,'cooler colour does not add total brightness');}finally{r.dispose();}
});


test('front glazing reflections remain absent from snow even when the paving wetness is full',()=>{
 const r=make(),wet=surfaceUniforms.wet.value,snow=surfaceUniforms.snowCover.value;
 try{const s=shader(r.mesh);assert.equal(s.uniforms.uLampSnow,surfaceUniforms.snowCover,'front opts into the live shared snow uniform');
  const body=s.fragmentShader.split('// reflection-snow-begin')[1]?.split('// reflection-snow-end')[0];assert.ok(body);
  surfaceUniforms.wet.value=1;
  let previous=1;
  for(const cover of [0,.02,.08,.15,.20,1]){
   surfaceUniforms.snowCover.value=cover;r.made.setLevel(1);
   assert.equal(r.mesh.visible,cover<.20,'opaque snow submits no front reflection draw');
   const env={vars:{gl_FragColor:[1,1,1,1],uLampSnow:cover}};new Glsl('').run(body,env);const alpha=(env.vars.gl_FragColor as number[])[3]!;
   assert.ok(alpha<=previous);previous=alpha;if(cover>=.20)assert.equal(alpha,0);if(cover<=.02)assert.equal(alpha,1);
  }
 }finally{surfaceUniforms.wet.value=wet;surfaceUniforms.snowCover.value=snow;r.dispose();}
});
