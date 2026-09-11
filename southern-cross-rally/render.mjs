/* Small WebGL2 renderer. Original geometry; no downloads, third-party assets or build step.
 * Instanced vegetation, shadow mapping, procedural surfaces, atmospheric sky and post FX. */
import {clamp,mix,random,smooth,CARS} from './core.mjs';
const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
const norm=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function transform(x=0,y=0,z=0,ry=0,rx=0,rz=0,sx=1,sy=sx,sz=sx){let t=I();t[12]=x;t[13]=y;t[14]=z;const yy=I(),xx=I(),zz=I();yy[0]=yy[10]=Math.cos(ry);yy[2]=-Math.sin(ry);yy[8]=Math.sin(ry);xx[5]=xx[10]=Math.cos(rx);xx[6]=Math.sin(rx);xx[9]=-Math.sin(rx);zz[0]=zz[5]=Math.cos(rz);zz[1]=Math.sin(rz);zz[4]=-Math.sin(rz);t=multiply(multiply(multiply(t,yy),xx),zz);for(let r=0;r<3;r++){t[r]*=sx;t[4+r]*=sy;t[8+r]*=sz;}return t;}
function lookAt(eye,target){const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x),o=I();for(let i=0;i<3;i++){o[i*4]=x[i];o[i*4+1]=y[i];o[i*4+2]=z[i];}o[12]=-x.reduce((s,v,i)=>s+v*eye[i],0);o[13]=-y.reduce((s,v,i)=>s+v*eye[i],0);o[14]=-z.reduce((s,v,i)=>s+v*eye[i],0);return o;}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o;}
function ortho(l,r,b,t,n,f){const o=I();o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);return o;}
class Geometry {
  constructor(){this.v=[];}
  vertex(p,n,c=[1,1,1],uv=[0,0]){this.v.push(...p,...n,...c,...uv);}
  tri(a,b,c,colour=[1,1,1],uv=[[0,0],[1,0],[1,1]]){const n=norm(cross(sub(b,a),sub(c,a)));this.vertex(a,n,colour,uv[0]);this.vertex(b,n,colour,uv[1]);this.vertex(c,n,colour,uv[2]);}
  quad(a,b,c,d,colour=[1,1,1]){this.tri(a,b,c,colour,[[0,0],[1,0],[1,1]]);this.tri(a,c,d,colour,[[0,0],[1,1],[0,1]]);}
  textQuad(a,b,c,d){this.tri(a,b,c,[1,1,1],[[0,1],[1,1],[1,0]]);this.tri(a,c,d,[1,1,1],[[0,1],[1,0],[0,0]]);}
  add(g,m=I(),tint=[1,1,1]){for(let i=0;i<g.v.length;i+=11){const a=g.v,x=a[i],y=a[i+1],z=a[i+2],nx=a[i+3],ny=a[i+4],nz=a[i+5];this.vertex([m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]],norm([m[0]*nx+m[4]*ny+m[8]*nz,m[1]*nx+m[5]*ny+m[9]*nz,m[2]*nx+m[6]*ny+m[10]*nz]),[a[i+6]*tint[0],a[i+7]*tint[1],a[i+8]*tint[2]],[a[i+9],a[i+10]]);}return this;}
}
function box(){const g=new Geometry(),v=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];for(const f of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])g.quad(...f.map(i=>v[i]));return g;}
function cylinder(top=1,bottom=1,height=1,sides=12){const g=new Geometry();for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;g.quad([Math.cos(a)*bottom,0,Math.sin(a)*bottom],[Math.cos(a)*top,height,Math.sin(a)*top],[Math.cos(b)*top,height,Math.sin(b)*top],[Math.cos(b)*bottom,0,Math.sin(b)*bottom]);if(top)g.tri([0,height,0],[Math.cos(b)*top,height,Math.sin(b)*top],[Math.cos(a)*top,height,Math.sin(a)*top]);if(bottom)g.tri([0,0,0],[Math.cos(a)*bottom,0,Math.sin(a)*bottom],[Math.cos(b)*bottom,0,Math.sin(b)*bottom]);}return g;}
function sphere(rows=8,cols=12){const g=new Geometry();const p=(i,j)=>[Math.sin(i/rows*Math.PI)*Math.cos(j/cols*Math.PI*2),Math.cos(i/rows*Math.PI),Math.sin(i/rows*Math.PI)*Math.sin(j/cols*Math.PI*2)];for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=p(i,j),b=p(i+1,j),c=p(i+1,j+1),d=p(i,j+1);for(const v of [a,b,c,a,c,d])g.vertex(v,v);}return g;}
function torus(r=.29,tube=.09){const g=new Geometry(),rows=24,cols=8;const p=(i,j)=>{const a=i/rows*Math.PI*2,b=j/cols*Math.PI*2;return [Math.sin(b)*tube,Math.cos(a)*(r+Math.cos(b)*tube),Math.sin(a)*(r+Math.cos(b)*tube)];};for(let i=0;i<rows;i++)for(let j=0;j<cols;j++)g.quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1));return g;}
function loft(rings){const g=new Geometry();const ring=([z,w,low,top,bevel=.12])=>[[-w+bevel,low,z],[w-bevel,low,z],[w,low+bevel,z],[w,top-bevel,z],[w-bevel,top,z],[-w+bevel,top,z],[-w,top-bevel,z],[-w,low+bevel,z]];const r=rings.map(ring);for(let k=0;k<r.length-1;k++)for(let j=0;j<8;j++)g.quad(r[k][j],r[k][(j+1)%8],r[k+1][(j+1)%8],r[k+1][j]);for(let j=1;j<7;j++){g.tri(r[0][0],r[0][j+1],r[0][j]);g.tri(r.at(-1)[0],r.at(-1)[j],r.at(-1)[j+1]);}return g;}
const VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;layout(location=2) in vec3 aColor;layout(location=3) in vec4 iPosition;layout(location=4) in vec4 iExtra;layout(location=5) in vec2 aUV;
uniform mat4 uModel,uVP,uLightVP;out vec3 vWorld,vNormal,vColor;out vec4 vShadow;out vec2 vUV;
void main(){float c=cos(iExtra.x),s=sin(iExtra.x);mat3 rot=mat3(c,0.,-s,0.,1.,0.,s,0.,c);vec4 world=uModel*vec4(rot*aPosition*iPosition.w+iPosition.xyz,1.);vWorld=world.xyz;vNormal=transpose(inverse(mat3(uModel)))*rot*aNormal;vColor=aColor*iExtra.yzw;vUV=aUV;vShadow=uLightVP*world;gl_Position=uVP*world;}`;
const FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal,vColor;in vec4 vShadow;in vec2 vUV;out vec4 outColor;
uniform vec3 uEye,uSun,uSunColor,uSky,uFog,uColor,uGrass,uCar,uDirection;uniform float uKind,uTime,uWet,uAlpha,uGhost;uniform sampler2D uShadow,uTexture;uniform int uUseTexture,uShadows;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float shade(vec3 n){if(uShadows==0)return 1.;vec3 p=vShadow.xyz/vShadow.w*.5+.5;if(p.z>1.||p.z<0.||p.x<0.||p.x>1.||p.y<0.||p.y>1.)return 1.;float lit=0.;float bias=max(.0007,.0016*(1.-max(0.,dot(n,uSun))));vec2 texel=1./vec2(textureSize(uShadow,0));for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)lit+=p.z-bias<=texture(uShadow,p.xy+vec2(x,y)*texel).r?1.:0.;return mix(.28,1.,lit/9.);}
void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 base=uColor*vColor;vec3 view=normalize(uEye-vWorld);float rough=.75;
if(uKind==1.){float large=noise(vWorld.xz*.028),fine=noise(vWorld.xz*1.8);base=uGrass*(.73+large*.48+fine*.16);float rock=smoothstep(.18,.48,1.-n.y);base=mix(base,vec3(.34,.32,.27)*(.7+large*.6),rock);}
if(uKind==2.){float pebbles=noise(vWorld.xz*8.),grain=noise(vWorld.xz*1.3);float detail=noise(vWorld.xz*32.);base*=.86+pebbles*.13+grain*.05+detail*.09;float rut=1.-smoothstep(.20,.48,abs(abs(vUV.x)-1.15));base*=1.-rut*.17;float puddle=smoothstep(.63,.77,noise(vWorld.xz*.18))*uWet;base=mix(base,vec3(.21,.28,.29),puddle*.5);rough=mix(.94,.15,puddle);}
if(uKind==3.){float wave=sin(vWorld.x*.14+uTime*.7)*cos(vWorld.z*.17+uTime*.5);n=normalize(vec3(wave*.12,1.,cos(vWorld.x*.22-uTime)*.1));base=mix(vec3(.14,.29,.34),vec3(.20,.36,.40),wave*.5+.5);rough=.12;}
if(uKind==4.){base*=.83+noise(vWorld.xz*3.)*.23;rough=1.;}
if(uKind==6.){float fres=pow(1.-max(dot(n,view),0.),2.);base=mix(vec3(.035,.085,.105),uSky*.8,fres*.8+.2);rough=.09;}
if(uUseTexture==1){vec4 t=texture(uTexture,vUV);base*=t.rgb;if(t.a<.1)discard;}
float light=max(0.,dot(n,uSun)),shadow=shade(n);vec3 halfV=normalize(view+uSun);float spec=pow(max(0.,dot(n,halfV)),mix(100.,7.,rough))*(1.-rough)*.65;
vec3 col=base*(vec3(.28,.32,.34)+max(0.,n.y)*vec3(.17,.19,.19)+uSunColor*light*shadow*.96)+uSunColor*spec*shadow;
if(uKind==0.){float fres=pow(1.-max(dot(n,view),0.),3.);col+=uSky*fres*.2;}
if(uWet>.5){vec3 to=vWorld-uCar;float forward=dot(to.xz,uDirection.xz),side=abs(to.x*uDirection.z-to.z*uDirection.x);float cone=(1.-smoothstep(1.+forward*.13,2.+forward*.40,side))*smoothstep(0.,3.,forward)*(1.-smoothstep(12.,65.,forward));col+=base*vec3(1.,.93,.71)*cone*.85;}
if(uKind==5.)col=base*1.25;
if(uGhost>.5)col=mix(col,vec3(.36,.92,.85),.8);
float dist=length(vWorld-uEye);float fog=1.-exp(-dist*(.0016+uWet*.0018));col=mix(col,uFog,fog);
outColor=vec4(col,uAlpha);}`;
const FULL=`#version 300 es
precision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const SKY=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform vec3 uForward,uRight,uUp,uSky,uFog,uSun,uSunColor;uniform float uAspect,uTan,uTime,uWet;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
void main(){vec2 uv=vUV*2.-1.;vec3 ray=normalize(uForward+uRight*uv.x*uAspect*uTan+uUp*uv.y*uTan);float y=max(ray.y,0.);vec3 col=mix(uFog,uSky,pow(clamp(y*1.8,0.,1.),.7));vec2 p=ray.xz/max(.15,ray.y+.22)*2.6+uTime*.003;float f=n(p)*.55+n(p*2.1)*.28+n(p*4.2)*.13;float cloud=smoothstep(.47,.68,f)*smoothstep(-.02,.16,ray.y);col=mix(col,mix(vec3(.92,.92,.83),vec3(.43,.49,.53),uWet),cloud*(.8+uWet*.15));float sun=max(0.,dot(ray,uSun));col+=uSunColor*pow(sun,80.)*.3*(1.-cloud);col+=uSunColor*pow(sun,2800.)*.9*(1.-cloud);outColor=vec4(col,1.);}`;
const POST=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uFrame;uniform vec2 uSize;uniform float uTime,uSpeed,uWet;
void main(){vec2 uv=vUV;vec3 c=texture(uFrame,uv).rgb;vec3 bloom=vec3(0.);vec2 d=1./uSize;
vec3 l=texture(uFrame,uv-vec2(d.x,0.)).rgb,r=texture(uFrame,uv+vec2(d.x,0.)).rgb,t=texture(uFrame,uv+vec2(0.,d.y)).rgb,b=texture(uFrame,uv-vec2(0.,d.y)).rgb;
float contrast=max(max(length(l-c),length(r-c)),max(length(t-c),length(b-c)));c=mix(c,(l+r+t+b+c*2.)/6.,smoothstep(.18,.55,contrast)*.45);for(int i=0;i<4;i++){vec2 o=vec2(i==0?3.:i==1?-3.:0.,i==2?3.:i==3?-3.:0.)*d;bloom+=max(vec3(0.),texture(uFrame,uv+o).rgb-.75);}c+=bloom*.12;c=pow(max(c,0.),vec3(.91));c=mix(vec3(dot(c,vec3(.21,.72,.07))),c,1.10);vec2 q=uv*2.-1.;c*=1.-.19*dot(q,q)*.5;c+=(fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.98,78.23)))*43758.54)-.5)*.003;if(uWet>.5){float rain=pow(max(0.,sin(uv.x*630.+uv.y*90.+floor(uv.y*23.)*4.)),55.)*pow(max(0.,sin(uv.y*70.+uTime*24.)),12.);c+=rain*uWet*.10;}outColor=vec4(c,1.);}`;
const DUST_V=`#version 300 es
precision highp float;layout(location=0) in vec3 aPosition;layout(location=1) in float aSize;layout(location=2) in vec4 aColor;uniform mat4 uVP;uniform float uHeight;out vec4 vColor;
void main(){gl_Position=uVP*vec4(aPosition,1.);gl_PointSize=clamp(aSize*uHeight/max(.2,gl_Position.w),1.,170.);vColor=aColor;}`;
const DUST_F=`#version 300 es
precision highp float;in vec4 vColor;out vec4 outColor;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;outColor=vec4(vColor.rgb,vColor.a*pow(1.-r,2.));}`;
export class Renderer {
  constructor(canvas,quality='high') {
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'});
    if(!this.gl)throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or try a current browser.');
    const gl=this.gl;this.quality=quality;this.scene=[];this.extra=[];this.owned=[];this.textures=[];this.time=0;this.camera=[0,6,-10];this.target=[0,1,0];this.fov=58*Math.PI/180;this.wheelAngle=0;
    this.program=this.link(VERT,FRAG);this.shadowProgram=this.link(VERT,'#version 300 es\nprecision highp float;void main(){}');this.skyProgram=this.link(FULL,SKY);this.postProgram=this.link(FULL,POST);this.fullVAO=gl.createVertexArray();this.dustProgram=this.link(DUST_V,DUST_F);this.dustVAO=gl.createVertexArray();this.dustBuffer=gl.createBuffer();gl.bindVertexArray(this.dustVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.dustBuffer);for(const [loc,size,off]of [[0,3,0],[1,1,12],[2,4,16]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,off);}this.particles=[];this.dustCredit=0;this.effectRandom=random(991);this.skids=[];this.skidTimer=0;this.skidMesh=null;
    this.boxGeo=box();this.sphereGeo=sphere();this.box=this.mesh(this.boxGeo);this.sphere=this.mesh(this.sphereGeo);this.tyre=this.mesh(torus());this.rim=this.mesh(cylinder(.235,.235,.02,24));
    this.cars=CARS.map(c=>this.makeCar(c));
    this.depth=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.depth);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1536,1536,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
    this.shadowFBO=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.depth,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Unable to allocate a shadow framebuffer.');
    this.frame=gl.createTexture();this.frameDepth=gl.createRenderbuffer();this.fbo=gl.createFramebuffer();this.resize();
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onLost?.();});
  }
  link(v,f){const gl=this.gl;const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};const vs=shader(gl.VERTEX_SHADER,v),fs=shader(gl.FRAGMENT_SHADER,f),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));p.locations=new Map();return p;}
  uniform(p,name,value){const gl=this.gl;let loc=p.locations.get(name);if(loc===undefined){loc=gl.getUniformLocation(p,name);p.locations.set(name,loc);}if(loc===null)return;if(typeof value==='number')gl.uniform1f(loc,value);else if(value.length===16)gl.uniformMatrix4fv(loc,false,value);else if(value.length===3)gl.uniform3fv(loc,value);else if(value.length===2)gl.uniform2fv(loc,value);}
  int(p,name,value){this.gl.uniform1i(this.gl.getUniformLocation(p,name),value);}
  mesh(g,instances=null){const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.v),gl.STATIC_DRAW);for(const [loc,count,offset] of [[0,3,0],[1,3,3],[2,3,6],[5,2,9]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,count,gl.FLOAT,false,44,offset*4);}let ib=null;if(instances){ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ib);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(instances.flat()),gl.STATIC_DRAW);for(const loc of [3,4]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,32,(loc-3)*16);gl.vertexAttribDivisor(loc,1);}}return {vao,buffer,ib,count:g.v.length/11,instances:instances?.length||0,allInstances:instances?new Float32Array(instances.flat()):null,visibleData:instances?new Float32Array(instances.length*8):null};}
  object(mesh,matrix=I(),colour=[1,1,1],kind=0,shadow=true,texture=null){return {mesh,matrix,colour,kind,shadow,texture};}
  add(g,instances,colour,kind=0,shadow=true){const mesh=this.mesh(g,instances);this.owned.push(mesh);this.scene.push(this.object(mesh,I(),colour,kind,shadow));return mesh;}
  texture(text,subtext='',bg='#ede6cd',fg='#142b2b'){const c=document.createElement('canvas');c.width=text.length<3?128:512;c.height=128;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,c.width,128);x.fillStyle=fg;x.textAlign='center';x.font=`900 ${text.length<3?83:65}px sans-serif`;x.fillText(text,c.width/2,subtext?84:92);if(subtext){x.font=`bold ${text.length<3?8:18}px sans-serif`;x.fillText(subtext,c.width/2,113);}const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);return t;}
  resize(){const gl=this.gl,ratio=Math.min(devicePixelRatio||1,this.quality==='high'?1.65:1),scale=this.quality==='low'?.75:1;const w=Math.max(1,Math.round(this.canvas.clientWidth*ratio*scale)),h=Math.max(1,Math.round(this.canvas.clientHeight*ratio*scale));if(this.canvas.width===w&&this.canvas.height===h&&this.allocated)return;this.canvas.width=w;this.canvas.height=h;gl.bindTexture(gl.TEXTURE_2D,this.frame);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindRenderbuffer(gl.RENDERBUFFER,this.frameDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.frame,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.frameDepth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Unable to allocate the scene framebuffer.');gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.allocated=true;}
  setStage(stage){
    const gl=this.gl;for(const m of this.owned){gl.deleteBuffer(m.buffer);if(m.ib)gl.deleteBuffer(m.ib);gl.deleteVertexArray(m.vao);}for(const t of this.textures)gl.deleteTexture(t);this.owned=[];this.textures=[];this.scene=[];this.extra=[];this.stage=stage;this.clearEffects();const d=stage.def,rng=random(d.seed+800);
    const xs=stage.points.map(p=>p.x),zs=stage.points.map(p=>p.z),minX=Math.min(...xs)-270,maxX=Math.max(...xs)+270,minZ=-280,maxZ=Math.max(...zs)+300;
    const step=14,nx=Math.ceil((maxX-minX)/step),nz=Math.ceil((maxZ-minZ)/step),grid=[];
    for(let z=0;z<=nz;z++){const row=[];for(let x=0;x<=nx;x++){const xx=minX+x*step,zz=minZ+z*step,n=stage.nearest(xx,zz);row.push([xx,stage.ground(xx,zz,n)-.32*(1-smooth(d.width/2+2,25,n.distance)),zz]);}grid.push(row);}
    const terrain=new Geometry();for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=grid[z][x],b=grid[z+1][x],c=grid[z+1][x+1],e=grid[z][x+1];terrain.quad(a,b,c,e);}this.add(terrain,null,[1,1,1],1);
    const road=new Geometry(),shoulder=new Geometry();for(let i=0;i<stage.points.length-1;i++){const a=stage.points[i],b=stage.points[i+1],half=d.width/2;const p=(c,o)=>[c.x+Math.cos(c.heading)*o,c.y+o*c.bank+.08,c.z-Math.sin(c.heading)*o];for(const [g,w] of [[shoulder,half+1.3],[road,half]]){const aa=p(a,-w),bb=p(b,-w),cc=p(b,w),ee=p(a,w);if(g===shoulder)for(const v of [aa,bb,cc,ee])v[1]-=.035;const normal=norm(cross(sub(bb,aa),sub(cc,aa)));for(const [v,uv]of [[aa,[-w,a.s]],[bb,[-w,b.s]],[cc,[w,b.s]],[aa,[-w,a.s]],[cc,[w,b.s]],[ee,[w,a.s]]])g.vertex(v,normal,[1,1,1],uv);}}
    this.add(shoulder,null,[.46,.42,.33],2);this.add(road,null,d.wet>.5?[.39,.37,.31]:[.60,.55,.43],2);
    if(d.theme==='coast'){const water=box();this.add(water,[[minX+(maxX-minX)/2,d.base-29,maxZ/2,1,0,1,1,1]],[.3,.5,.5],3,false);const obj=this.scene.at(-1);obj.matrix=transform(0,0,0,0,0,0,1,1,1);const sea=new Geometry();sea.quad([minX-1500,d.base-29,-1800],[minX-1500,d.base-29,maxZ+1800],[maxX+100,d.base-29,maxZ+1800],[maxX+100,d.base-29,-1800]);this.add(sea,null,[1,1,1],3,false);}
    const treeGeo=new Geometry();treeGeo.add(cylinder(.07,.17,6.8,9),I(),[.25,.20,.14]);
    if(d.theme==='forest'){
      for(let k=0;k<9;k++){const y=2.0+k*.51,r=1.85*(1-k/11),count=6;
        for(let j=0;j<count;j++){const a=j*Math.PI*2/count+k*1.7,xx=Math.cos(a),zz=Math.sin(a);const shade=.78+rng()*.3;
          treeGeo.add(cylinder(0,r*.43,1.4,6),transform(xx*r*.56,y,zz*r*.56,a,.24,0,1,.6,1),[.14*shade,.27*shade,.16*shade]);
          treeGeo.tri([0,y+.5,0],[xx*r-zz*.25,y-.22,zz*r+xx*.25],[xx*r+zz*.25,y-.22,zz*r-xx*.25],[.12,.23,.13]);
        }
      }
      treeGeo.add(cylinder(0,.55,1.5,7),transform(0,6.2,0),[.20,.33,.18]);
    }else{
      for(let j=0;j<11;j++){const a=j*2.399,r=.5+rng()*1.3,y=3.7+rng()*2;
        treeGeo.add(sphere(4,6),transform(Math.cos(a)*r,y,Math.sin(a)*r,a,0,0,1.1+rng()*.5,.8+rng()*.8,1.1),[.27+rng()*.06,.37+rng()*.08,.16+rng()*.05]);
      }
    }
    const treeInstances=[],rockInstances=[];for(const o of stage.obstacles)(o.type==='tree'?treeInstances:rockInstances).push([o.x,o.y,o.z,o.scale,o.rotation,o.tint,o.tint,o.tint]);
    this.add(treeGeo,treeInstances,[1,1,1],4);const rockGeo=sphere(5,7);this.add(rockGeo,rockInstances,[.46,.43,.36],0);
    const grass=new Geometry();for(let j=0;j<9;j++){const a=j*2.399,x=Math.cos(a)*.19,z=Math.sin(a)*.19,h=.25+rng()*.47;grass.tri([x-.018,0,z],[x+.018,0,z],[x+Math.cos(a)*.13,h,z+Math.sin(a)*.13],[.60,.70,.32]);}
    const gi=[];for(let s=15;s<stage.finish;s+=3.5){const p=stage.at(s);for(const side of [-1,1]){const off=side*(d.width/2+1.6+rng()*15),x=p.x+Math.cos(p.heading)*off,z=p.z-Math.sin(p.heading)*off;if(stage.nearest(x,z).distance<d.width/2+1)continue;gi.push([x,stage.ground(x,z),z,.55+rng(),rng()*6.28,1,1,1]);}}
    this.add(grass,gi,[.72,.83,.61],4,false);
    const pole=new Geometry();pole.add(this.boxGeo,transform(0,.62,0,0,0,0,.11,1.24,.11),[.85,.84,.75]);pole.add(this.boxGeo,transform(0,.99,0,0,0,0,.12,.18,.12),[.8,.16,.08]);const pi=[];
    for(let s=15;s<stage.finish;s+=42){const p=stage.at(s);for(const side of [-1,1]){const off=side*(d.width/2+1),x=p.x+Math.cos(p.heading)*off,z=p.z-Math.sin(p.heading)*off;pi.push([x,stage.ground(x,z),z,1,p.heading,1,1,1]);}}this.add(pole,pi,[1,1,1]);
    if(d.theme==='farm'||d.theme==='ridge'){const fence=new Geometry(),fencePosts=[];for(const side of [-1,1]){let last=null;for(let s=20;s<stage.finish;s+=13){const p=stage.at(s),off=side*(d.width/2+5),x=p.x+Math.cos(p.heading)*off,z=p.z-Math.sin(p.heading)*off,y=stage.ground(x,z);fencePosts.push([x,y,z,1,p.heading,1,1,1]);if(last){const length=Math.hypot(x-last.x,z-last.z),h=Math.atan2(x-last.x,z-last.z);for(const yy of [.6,1.05])fence.add(this.boxGeo,transform((x+last.x)/2,(y+last.y)/2+yy,(z+last.z)/2,h,0,0,.024,.024,length),[.32,.30,.22]);}last={x,y,z};}}const fp=new Geometry().add(this.boxGeo,transform(0,.65,0,0,0,0,.15,1.3,.15),[.35,.29,.19]);this.add(fp,fencePosts,[1,1,1]);this.add(fence,null,[1,1,1]);}
    // Flags and marshals at start, controls and finish; poles are outside the driving envelope.
    for(const [s,label]of [[1,'START'],...stage.checkpoints.slice(0,-1).map((s,i)=>[s,`SPLIT ${i+1}`]),[stage.finish,'FINISH']])this.gate(s,label);
    const people=new Geometry();people.add(cylinder(.16,.2,.75,7),transform(0,.7,0),[.90,.29,.075]);people.add(this.sphereGeo,transform(0,1.58,0,0,0,0,.16),[.62,.43,.29]);for(const x of [-.13,.13])people.add(this.boxGeo,transform(x,.38,0,0,0,0,.15,.75,.16),[.13,.17,.18]);const spectators=[];for(const s0 of [20,stage.finish-15])for(let j=0;j<14;j++){const p=stage.at(s0+j*.8),off=d.width/2+3+rng()*3;const x=p.x+Math.cos(p.heading)*off,z=p.z-Math.sin(p.heading)*off;spectators.push([x,stage.ground(x,z),z,.9+rng()*.2,p.heading-1.57,.7+rng()*.5,.7+rng()*.5,.7+rng()*.5]);}this.add(people,spectators,[1,1,1]);
    this.camera=[stage.points[2].x+8,stage.points[2].y+4,stage.points[2].z+8];
  }
  gate(s,label){const p=this.stage.at(s),half=this.stage.def.width/2+1.5,m=transform(p.x,p.y,p.z,p.heading),geom=new Geometry();for(const side of [-1,1])geom.add(this.boxGeo,transform(side*half,2.3,0,0,0,0,.27,4.6,.27),[.14,.21,.20]);geom.add(this.boxGeo,transform(0,4.5,0,0,0,0,half*2+.3,.9,.18),[.92,.86,.66]);const mesh=this.mesh(geom);this.owned.push(mesh);this.scene.push(this.object(mesh,m));const quad=new Geometry();quad.textQuad([-half+.1,4.9,-.11],[half-.1,4.9,-.11],[half-.1,4.12,-.11],[-half+.1,4.12,-.11]);const text=this.texture(label,'SOUTHERN CROSS RALLY'),q=this.mesh(quad);this.textures.push(text);this.owned.push(q);this.scene.push(this.object(q,m,[1,1,1],0,false,text));}
  makeCar(car){const parts=[],add=(mesh,x,y,z,sx,sy,sz,colour,kind=0,ry=0,rx=0,rz=0)=>parts.push(this.object(mesh,transform(x,y,z,ry,rx,rz,sx,sy,sz),colour,kind));const dark=[.045,.06,.065],chrome=[.56,.59,.57],paint=car.colour,accent=car.accent;
    const shape=car.id==='kestrel'?loft([[-2.02,.78,-.2,.16],[-1.65,.94,-.25,.32],[.95,.94,-.25,.34],[1.85,.81,-.18,.24],[2.1,.70,-.12,.16]]):loft([[-2.1,.74,-.19,.17],[-1.45,.94,-.25,.32],[1.20,.9,-.25,.25],[2.04,.67,-.17,.13]]);
    add(this.mesh(shape),0,0,0,1,1,1,paint);
    const cabin=loft([[-1.2,.75,.25,.40],[-.72,.68,.27,1.02],[.35,.64,.27,1.03],[1.10,.72,.25,.35]]);add(this.mesh(cabin),0,0,0,1,1,1,paint);
    // Sloping windscreen and rear glass, side windows, dark pillar and rain gutter.
    const wind=new Geometry();wind.quad([-.59,1.055,.39],[.59,1.055,.39],[.68,.385,1.13],[-.68,.385,1.13]);add(this.mesh(wind),0,0,0,1,1,1,[.5,.7,.75],6);
    const back=new Geometry();back.quad([-.63,1.05,-.75],[-.69,.44,-1.225],[.69,.44,-1.225],[.63,1.05,-.75]);add(this.mesh(back),0,0,0,1,1,1,[.3,.5,.56],6);
    const windows=new Geometry();for(const side of [-1,1]){windows.quad([side*.746,.38,-1.1],[side*.674,.94,-.69],[side*.638,.95,.33],[side*.72,.38,1.]);}add(this.mesh(windows),0,0,0,1,1,1,[.4,.55,.6],6);
    for(const side of [-1,1]){add(this.box,side*.708,.65,-.18,.047,.65,.085,dark);add(this.box,side*.85,.36,-.5,.028,.028,.3,dark);add(this.box,side*1.02,.52,.64,.28,.14,.20,paint);add(this.box,side*.87,-.22,-.02,.13,.16,3.0,accent);}
    add(this.box,0,1.05,-.19,1.08,.04,.98,accent);add(this.box,0,.315,1.4,.21,.018,.85,accent);add(this.box,0,.3,-1.63,.25,.02,.56,accent);
    add(this.box,0,-.12,2.0,1.51,.21,.19,dark);add(this.box,0,-.15,-2.03,1.51,.2,.18,dark);add(this.box,0,.09,2.03,.57,.14,.06,dark);
    for(const side of [-1,1]){add(this.box,side*.56,.11,1.98,.42,.15,.08,[.97,.94,.75],5);add(this.box,side*.61,.13,-2.06,.37,.15,.04,[.85,.075,.035],5);add(this.box,side*.68,.49,-1.72,.07,.42,.07,dark);}
    add(this.box,0,.71,-1.75,1.92,.08,.36,accent);add(this.box,0,.41,1.12,.53,.18,.40,paint);add(this.box,0,.44,1.34,.4,.07,.025,dark);add(this.box,.17,1.14,-.3,.31,.16,.27,paint);
    add(this.box,.45,1.28,-.60,.016,.43,.016,dark,0,0,0,-.10);
    // Roll cage glimpses, seats and door number plates are original, not licensed liveries.
    const plate=this.texture(car.number,'SOUTHERN CROSS');const sidePlate=new Geometry();sidePlate.textQuad([0,.33,.03],[0,.33,-.52],[0,-.13,-.52],[0,-.13,.03]);const pm=this.mesh(sidePlate);for(const side of [-1,1])parts.push(this.object(pm,transform(side*.954,0,0,side<0?Math.PI:0),[1,1,1],0,true,plate));
    const wheels=[];for(const side of [-1,1])for(const z of [-1.29,1.31]){wheels.push({side,z});add(this.box,side*.91,-.35,z-.37,.20,.34,.035,dark);}
    return {parts,wheels};
  }
  drawObject(o,program,root=null,ghost=false){const gl=this.gl;if(o.mesh.ib&&!o.mesh.instances)return;this.uniform(program,'uModel',root?multiply(root,o.matrix):o.matrix);this.uniform(program,'uColor',o.colour);this.uniform(program,'uKind',o.kind);this.uniform(program,'uAlpha',ghost?.30:1);this.uniform(program,'uGhost',ghost?1:0);this.int(program,'uUseTexture',o.texture?1:0);if(o.texture){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,o.texture);this.int(program,'uTexture',1);}gl.bindVertexArray(o.mesh.vao);if(!o.mesh.instances){gl.vertexAttrib4f(3,0,0,0,1);gl.vertexAttrib4f(4,0,1,1,1);gl.drawArrays(gl.TRIANGLES,0,o.mesh.count);}else gl.drawArraysInstanced(gl.TRIANGLES,0,o.mesh.count,o.mesh.instances);}
  drawCar(v,carIndex,program,ghost=false,mode=0){const model=this.cars[carIndex],root=transform(v.x,v.y,v.z,v.yaw,-(v.pitch||0),v.roll||0);if(mode===2&&!ghost)return;for(const part of model.parts)this.drawObject(part,program,root,ghost);
    for(const wheel of model.wheels){const steer=wheel.z>0?(v.steering||0):0;const base=multiply(root,transform(wheel.side*.91,-.24,wheel.z,steer,this.wheelAngle));this.drawObject(this.object(this.tyre,I(),[.065,.067,.064]),program,base,ghost);const rim=multiply(base,transform(wheel.side*.065,0,0,0,0,-Math.PI/2*wheel.side));this.drawObject(this.object(this.rim,I(),[.14,.16,.16]),program,rim,ghost);for(let j=0;j<5;j++)this.drawObject(this.object(this.box,multiply(transform(wheel.side*.09,0,0,0,j*Math.PI*2/5),transform(0,.115,0,0,0,0,.025,.22,.048)),[.77,.76,.64]),program,base,ghost);}
  }
  cullInstances(v,radius){const gl=this.gl;for(const o of this.scene){const m=o.mesh,a=m.allInstances;if(!a)continue;let n=0;const limit=o.kind===4&&m.count<100?Math.min(100,radius):radius,r2=limit*limit;for(let i=0;i<a.length;i+=8){if((a[i]-v.x)**2+(a[i+2]-v.z)**2>r2)continue;for(let k=0;k<8;k++)m.visibleData[n++]=a[i+k];}m.instances=n/8;gl.bindBuffer(gl.ARRAY_BUFFER,m.ib);if(n)gl.bufferSubData(gl.ARRAY_BUFFER,0,m.visibleData.subarray(0,n));}}
  clearEffects(){this.particles=[];this.dustCredit=0;this.skids=[];this.skidTimer=0;this.lastSkid=null;if(this.skidMesh){this.gl.deleteBuffer(this.skidMesh.buffer);this.gl.deleteVertexArray(this.skidMesh.vao);this.skidMesh=null;}}
  effects(v,dt,active,vp){const gl=this.gl,rng=this.effectRandom,wet=this.stage.def.wet,sy=Math.sin(v.yaw),cy=Math.cos(v.yaw),speed=Math.abs(v.speed||0);
    if(active&&speed>4){this.dustCredit+=dt*(24+speed);while(this.dustCredit>=1&&this.particles.length<240){this.dustCredit--;const side=rng()>.5?1:-1,x=v.x-sy*1.5+cy*side*.85,z=v.z-cy*1.5-sy*side*.85;this.particles.push({x,y:this.stage.ground(x,z)+.22,z,vx:(v.vx||0)*.16+(rng()-.5)*1.8,vz:(v.vz||0)*.16+(rng()-.5)*1.8,vy:.5+rng(),age:0,life:wet>.5?.7+rng()*.35:1.7+rng()*.9,size:.32+rng()*.5});}this.dustCredit=Math.min(this.dustCredit,2);}
    const arr=[];for(const p of this.particles){if(active){p.age+=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.size+=dt*.65;}const f=1-p.age/p.life;if(f>0)arr.push(p.x,p.y,p.z,p.size,...(wet>.5?[.63,.69,.68]:[.65,.57,.43]),f*.26);}
    this.particles=this.particles.filter(p=>p.age<p.life);
    if(arr.length){gl.useProgram(this.dustProgram);this.uniform(this.dustProgram,'uVP',vp);this.uniform(this.dustProgram,'uHeight',this.canvas.height);gl.bindVertexArray(this.dustVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.dustBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.DYNAMIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.drawArrays(gl.POINTS,0,arr.length/8);gl.depthMask(true);gl.disable(gl.BLEND);}
  }
  updateSkids(v,dt,active){if(!active)return;this.skidTimer+=dt;if(this.skidTimer<.07)return;this.skidTimer=0;const sy=Math.sin(v.yaw),cy=Math.cos(v.yaw),wheels=[-1,1].map(side=>{const x=v.x-sy*1.3+cy*side*.91,z=v.z-cy*1.3-sy*side*.91;return [x,this.stage.ground(x,z)+.115,z];});
    if(v.slip>.16&&Math.abs(v.speed)>7&&!v.airborne&&this.lastSkid){for(let i=0;i<2;i++){const a=this.lastSkid[i],b=wheels[i];if(Math.hypot(a[0]-b[0],a[2]-b[2])>5)continue;const x=cy*.095,z=-sy*.095;this.skids.push([[a[0]-x,a[1],a[2]-z],[b[0]-x,b[1],b[2]-z],[b[0]+x,b[1],b[2]+z],[a[0]+x,a[1],a[2]+z]]);}if(this.skids.length>280)this.skids.splice(0,this.skids.length-280);
      const g=new Geometry();for(const q of this.skids)g.quad(...q,[.26,.24,.20]);if(this.skidMesh){this.gl.deleteBuffer(this.skidMesh.buffer);this.gl.deleteVertexArray(this.skidMesh.vao);}this.skidMesh=this.mesh(g);
    }this.lastSkid=wheels;
  }
  render(v,carIndex,{dt=0,menu=false,cameraMode=0,ghost=null,replay=false,active=false}={}){
    if(!this.stage)return;this.resize();this.updateSkids(v,dt,active);this.time+=dt;this.wheelAngle+=(v.speed||0)*dt/.34;const gl=this.gl,d=this.stage.def,sy=Math.sin(v.yaw),cy=Math.cos(v.yaw);let eye,target;
    if(menu){const a=this.time*.11+.9;eye=[v.x+Math.sin(a)*7.5,v.y+2.5,v.z+Math.cos(a)*7.5];target=[v.x-1.1,v.y+.25,v.z];}
    else if(cameraMode===2){eye=[v.x+sy*.65,v.y+.93,v.z+cy*.65];target=[v.x+sy*35,v.y+.7+(v.pitch||0)*22,v.z+cy*35];}
    else {const distance=cameraMode===1?13:6.8,height=cameraMode===1?6.4:2.9;const lead=.1;eye=[v.x-sy*distance-(v.vx||0)*lead,v.y+height,v.z-cy*distance-(v.vz||0)*lead];target=[v.x+sy*11,v.y+1+(v.pitch||0)*5,v.z+cy*11];}
    const follow=menu?1:cameraMode===2?1:1-Math.exp(-dt*7);for(let i=0;i<3;i++){this.camera[i]=mix(this.camera[i],eye[i],follow);this.target[i]=mix(this.target[i],target[i],menu?1:1-Math.exp(-dt*11));}
    const aspect=this.canvas.width/this.canvas.height,fov=this.fov+(menu?0:clamp(Math.abs(v.speed||0)/60,0,1)*.14),vp=multiply(perspective(fov,aspect,.08,2200),lookAt(this.camera,this.target));
    const sun=norm(d.sun),focus=[v.x,v.y,v.z],lightEye=focus.map((n,i)=>n+sun[i]*180),lightVP=multiply(ortho(-75,75,-75,75,1,430),lookAt(lightEye,focus));
    if(this.quality!=='low'){this.cullInstances(v,115);gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFBO);gl.viewport(0,0,1536,1536);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(2,4);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(this.shadowProgram);this.uniform(this.shadowProgram,'uVP',lightVP);this.uniform(this.shadowProgram,'uLightVP',lightVP);for(const o of this.scene)if(o.shadow)this.drawObject(o,this.shadowProgram);this.drawCar(v,carIndex,this.shadowProgram);gl.disable(gl.POLYGON_OFFSET_FILL);}
    this.cullInstances(v,this.quality==='low'?380:650);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(...d.fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.useProgram(this.skyProgram);gl.bindVertexArray(this.fullVAO);const forward=norm(sub(this.target,this.camera)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);for(const [n,val]of Object.entries({uForward:forward,uRight:right,uUp:up,uSky:d.sky,uFog:d.fog,uSun:sun,uSunColor:d.light,uAspect:aspect,uTan:Math.tan(fov/2),uTime:this.time,uWet:d.wet}))this.uniform(this.skyProgram,n,val);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);for(const [n,val]of Object.entries({uVP:vp,uLightVP:lightVP,uEye:this.camera,uSun:sun,uSunColor:d.light,uSky:d.sky,uFog:d.fog,uGrass:d.grass,uCar:[v.x,v.y,v.z],uDirection:[sy,0,cy],uTime:this.time,uWet:d.wet}))this.uniform(this.program,n,val);this.int(this.program,'uShadows',this.quality==='low'?0:1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.depth);this.int(this.program,'uShadow',0);for(const o of this.scene)this.drawObject(o,this.program);this.drawCar(v,carIndex,this.program,false,menu?0:cameraMode);if(this.skidMesh)this.drawObject(this.object(this.skidMesh),this.program);
    if(ghost){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.drawCar(ghost,carIndex,this.program,true);gl.depthMask(true);gl.disable(gl.BLEND);}
    this.effects(v,dt,active,vp);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.disable(gl.DEPTH_TEST);gl.useProgram(this.postProgram);gl.bindVertexArray(this.fullVAO);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.frame);this.int(this.postProgram,'uFrame',0);this.uniform(this.postProgram,'uSize',[this.canvas.width,this.canvas.height]);this.uniform(this.postProgram,'uTime',this.time);this.uniform(this.postProgram,'uSpeed',Math.abs(v.speed||0));this.uniform(this.postProgram,'uWet',d.wet);gl.drawArrays(gl.TRIANGLES,0,3);
  }
}
