// Inspect the actual Chrome PNG, independently of scene metadata/render callbacks.
import {inflateSync} from 'node:zlib';

/** Chrome screenshots use non-interlaced, eight-bit RGB or RGBA PNGs. Fail closed otherwise. */
export function readPng(bytes) {
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('invalid PNG signature');
  let width,height,channels,ended=false;const chunks=[];
  for(let i=8;i<bytes.length;) {
    if(i+12>bytes.length)throw new Error('truncated PNG chunk');
    const length=bytes.readUInt32BE(i),type=bytes.toString('ascii',i+4,i+8),data=bytes.subarray(i+8,i+8+length);i+=12+length;
    if(i>bytes.length)throw new Error('truncated PNG data');
    if(type==='IHDR') {
      if(length!==13)throw new Error('invalid PNG header');
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===2?3:data[9]===6?4:0;
      if(!width||!height||width*height>20000000||data[8]!==8||!channels||data[10]||data[11]||data[12])throw new Error('unsupported PNG format');
    }else if(type==='IDAT')chunks.push(data);
    else if(type==='IEND'){ended=true;break;}
  }
  if(!ended||!channels||!chunks.length)throw new Error('incomplete PNG');
  const stride=width*channels,raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height});
  if(raw.length!==(stride+1)*height)throw new Error('invalid PNG scanline size');
  const pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];if(filter>4)throw new Error('unknown PNG filter');
    for(let x=0;x<stride;x++) {
      const index=y*stride+x,a=x>=channels?pixels[index-channels]:0,b=y?pixels[index-stride]:0,c=y&&x>=channels?pixels[index-stride-channels]:0;
      const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
      const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c;
      pixels[index]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  return {width,height,channels,pixels};
}

const inside=(x,y,r)=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
const colours={grid:([r,g,b])=>b>r+12&&b>g+6||g>r+12&&b>r+12,
  ground:([r,g,b])=>r>g+35&&g>b+20,
  rail:([r,g,b])=>b>130&&b>r+50&&b>g+45};
function colourAt(image,x,y) {
  const i=(y*image.width+x)*image.channels;return image.pixels.subarray(i,i+3);
}
function pathPixels(image,path,test,excluded,{contrast=false}={}) {
  let samples=0,hits=0;const bins=new Set();
  for(let i=1;i<path.points.length;i++) {
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const n=Math.max(1,Math.ceil(length/4));
    for(let j=0;j<n;j++) {
      const t=(j+.5)/n,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t);
      if(x<2||y<80||x>=image.width-2||y>=image.height-40||excluded.some(r=>inside(x,y,r)))continue;
      samples++;let found=false;
      for(let dy=-1;dy<=1&&!found;dy++)for(let dx=-1;dx<=1;dx++){
        const px=x+dx,py=y+dy,colour=colourAt(image,px,py),nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length;
        // A blue-grey fog/background is not a grid: require a narrow coloured stroke.
        const stroke=!contrast||[-3,3].every(offset=>{
          const sx=Math.max(0,Math.min(image.width-1,Math.round(px+nx*offset))),sy=Math.max(0,Math.min(image.height-1,Math.round(py+ny*offset))),off=colourAt(image,sx,sy);
          return Math.max(...colour.map((v,i)=>Math.abs(v-off[i])))>=12;
        });
        if(test(colour)&&stroke){found=true;break;}
      }
      if(found){hits++;bins.add(Math.min(9,Math.floor(x/image.width*10)));}
    }
  }
  return {samples,hits,fraction:samples?hits/samples:0,bins:[...bins]};
}

/** Baseline is the same camera/DOM/grid with all measured geometry hidden. */
export function inspectCapturePixels(png,baselinePng,plan) {
  const image=readPng(png),baseline=readPng(baselinePng);
  if(image.width!==plan.width||image.height!==plan.height||baseline.width!==image.width||baseline.height!==image.height)throw new Error('PNG viewport differs from pixel specification');
  const excluded=plan.excluded??[],grid=plan.grid.map(p=>({...pathPixels(image,p,colours.grid,excluded,{contrast:true}),axis:p.axis}));
  const axes=[...new Set(plan.grid.map(p=>p.axis))];
  const gridClear=axes.length===2&&axes.every(axis=>{
    const available=grid.filter(p=>p.axis===axis&&p.samples>=5);
    return available.length>0&&available.filter(p=>p.fraction>=.35).length>=Math.min(2,available.length);
  });
  const profiles=(plan.profiles??[]).map(p=>({name:p.name,...pathPixels(image,p,colours[p.colour],excluded)}));
  const profileClear=plan.view!=='terrain-section'||profiles.length===2&&profiles.every(p=>p.samples>=100&&p.fraction>=.65&&p.bins.length>=8);
  let changed=0,left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  const r=plan.geometry;
  for(let y=Math.max(80,Math.ceil(r.top));y<Math.min(image.height-40,r.bottom);y++)for(let x=Math.max(0,Math.ceil(r.left));x<Math.min(image.width,r.right);x++) {
    if(excluded.some(r=>inside(x,y,r)))continue;
    const a=colourAt(image,x,y),b=colourAt(baseline,x,y);
    if(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<18)continue;
    changed++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  const geometry={changed,extentPx:changed?[right-left,bottom-top]:[0,0]};
  const geometryClear=changed>=100&&geometry.extentPx[0]>=24&&geometry.extentPx[1]>=16;
  return {clear:gridClear&&profileClear&&geometryClear,reason:!gridClear?'PNG lacks visible grid lines in both axes':!profileClear?'PNG lacks orange ground / blue rail profiles along the section':!geometryClear?'PNG has no measurable geometry beyond grid and labels':null,
    viewport:[image.width,image.height],grid:{clear:gridClear,lines:grid},profiles,geometry:{...geometry,clear:geometryClear}};
}
