/** CPU area averages at the scored view's approximate 42 px panel pitch and 28 px clear face. */
export function stLeonardsWeatherReadings(image:{width:number;height:number;data:ArrayLike<number>|null},panels:number,flangeFraction:number){
 const pw=42,ph=28,clear=1-2*flangeFraction,base=[154,171,162];
 const colours:number[][][]=[];let peak=0,fullBlueLoss=0;
 for(let i=2;i<image.data!.length;i+=4)fullBlueLoss=Math.max(fullBlueLoss,base[2]!-Number(image.data![i]));
 for(let panel=0;panel<panels;panel++){
  const cs:number[][]=[];colours.push(cs);
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
   const sum=[0,0,0];let n=0;
   for(let yy=Math.floor((flangeFraction+y/ph*clear)*image.height);yy<Math.ceil((flangeFraction+(y+1)/ph*clear)*image.height);yy++)
    for(let xx=Math.floor((panel+x/pw)*image.width/panels);xx<Math.ceil((panel+(x+1)/pw)*image.width/panels);xx++){
     const i=(yy*image.width+xx)*4;for(let c=0;c<3;c++)sum[c]!+=Number(image.data![i+c]);n++;
    }
   const c=sum.map(v=>v/n);cs.push(c);peak=Math.max(peak,c[0]!-c[1]!-(base[0]!-base[1]!));
  }
 }
 const colour=(panel:number,x:number,y:number)=>colours[panel]![y*pw+x]!;
 const strength=(panel:number,x:number,y:number)=>{const c=colour(panel,x,y);return (c[0]!-c[1]!-(base[0]!-base[1]!))/peak;};
 const cross=(o:number[],a:number[],b:number[])=>(a[0]!-o[0]!)*(b[1]!-o[1]!)-(a[1]!-o[1]!)*(b[0]!-o[0]!);
 function hullArea(points:number[][]){
  const ps=points.sort((a,b)=>a[0]!-b[0]!||a[1]!-b[1]!),lo:number[][]=[],hi:number[][]=[];
  for(const p of ps){while(lo.length>1&&cross(lo.at(-2)!,lo.at(-1)!,p)<=0)lo.pop();lo.push(p);}
  for(const p of [...ps].reverse()){while(hi.length>1&&cross(hi.at(-2)!,hi.at(-1)!,p)<=0)hi.pop();hi.push(p);}
  const h=[...lo.slice(0,-1),...hi.slice(0,-1)];return Math.abs(h.reduce((s,p,i)=>{const q=h[(i+1)%h.length]!;return s+p[0]!*q[1]!-p[1]!*q[0]!;},0))/2;
 }
 const bodies:{panel:number;left:number;right:number;bottom:number;top:number;area:number;solidity:number;tailReach:number;aboveReach:number}[]=[],counts:number[]=[];
 let rust=0,stripRust=0,stripPixels=0;const cores:number[][]=[];
 for(let panel=0;panel<panels;panel++){
  const mask=new Uint8Array(pw*ph),seen=mask.slice();let count=0;
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
   const c=colour(panel,x,y),p=predictedStLeonardsColour(c,'day'),isRust=p[0]!>p[1]!+6&&p[1]!>p[2]!+3;
   // The existing platform camera sees approximately .046-.333 of the clear web, measured from its bottom.
   if(isRust)rust++;if(y>=ph*.04&&y<ph/3){stripPixels++;if(isRust)stripRust++;}
   if(strength(panel,x,y)>=.72)mask[y*pw+x]=1;
   // Use the same >85% source blue-loss core selection as the PNG sampler, independent of the body silhouette threshold.
   if((base[2]!-c[2]!)/fullBlueLoss>.85)cores.push(c);
  }
  for(let p=0;p<mask.length;p++){
   if(!mask[p]||seen[p])continue;const queue=[p];seen[p]=1;
   let left=pw,right=-1,bottom=ph,top=-1;const corners:number[][]=[];
   for(let q=0;q<queue.length;q++){
    const a=queue[q]!,x=a%pw,y=Math.floor(a/pw);left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    corners.push([x,y],[x+1,y],[x,y+1],[x+1,y+1]);
    for(const n of [x?a-1:-1,x+1<pw?a+1:-1,a-pw,a+pw])if(n>=0&&n<mask.length&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}
   }
   // Small separated pores are edge fragments, not a second blotch.
   if(queue.length<12)continue;count++;
   const reach=(side:number)=>{
    let last=0;
    for(let d=1;d<ph;d++){
     const y=side<0?bottom-d:top+d;if(y<0||y>=ph)break;
     let pixels=0;for(let x=left;x<=right;x++)if(strength(panel,x,y)>=.13)pixels++;
     if(pixels<2)break;last=d;
    }
    return last;
   };
   bodies.push({panel,left,right,bottom,top,area:queue.length,solidity:queue.length/hullArea(corners),tailReach:reach(-1),aboveReach:reach(1)});
  }
  counts.push(count);
 }
 const median=(vs:number[])=>vs.sort((a,b)=>a-b)[Math.floor(vs.length/2)]!;
 const saturation=(c:number[])=>(Math.max(...c)-Math.min(...c))/Math.max(...c);
 return {pw,ph,bodies,counts,coverage:rust/(panels*pw*ph),stripCoverage:stripRust/stripPixels,colour,
  daySaturation:median(cores.map(c=>saturation(predictedStLeonardsColour(c,'day')))),
  duskSaturation:median(cores.map(c=>saturation(predictedStLeonardsColour(c,'dusk'))))};
}

/** Local linear-light calibration from the 21:30Z scored-view PNGs: paint and round-9b strong core.
 * Estimates new material colours; this is not a substitute for a GPU measurement. Retain the ruling's .338 dusk ceiling;
 * its earlier MAIN comparison used mismatched source masks, corrected by the round-9c sampler. */
export function predictedStLeonardsColour(c:number[],light:'day'|'dusk'){
 const linear=(v:number)=>v<=10.31475?v/3294.6:((v/255+.055)/1.055)**2.4;
 const paint=[154,171,162],core=[169,144,123],outPaint=light==='day'?[78,90,87]:[71,72,68],outCore=light==='day'?[88,69,57]:[80,54,44];
 return c.map((v,i)=>outPaint[i]!+(linear(v)-linear(paint[i]!))/(linear(core[i]!)-linear(paint[i]!))*(outCore[i]!-outPaint[i]!));
}
