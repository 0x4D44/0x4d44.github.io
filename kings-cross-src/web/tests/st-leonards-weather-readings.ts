/** Area-averaged albedo at the scored girder's approximate 42 px panel pitch and 28 px clear face. No browser or GPU. */
export function stLeonardsWeatherReadings(image:{width:number;height:number;data:ArrayLike<number>|null},panels:number,flangeFraction:number){
 const pw=42,ph=28,baseBlue=162,clear=1-2*flangeFraction;
 const colour=(panel:number,x:number,y:number):number[]=>{
  const sum=[0,0,0];let n=0;
  const v0=flangeFraction+y/ph*clear,v1=flangeFraction+(y+1)/ph*clear;
  for(let yy=Math.floor(v0*image.height);yy<Math.ceil(v1*image.height);yy++)for(let xx=Math.floor((panel+x/pw)*image.width/panels);xx<Math.ceil((panel+(x+1)/pw)*image.width/panels);xx++){
   const i=(yy*image.width+xx)*4;for(let c=0;c<3;c++)sum[c]!+=Number(image.data![i+c]);n++;
  }
  return sum.map(v=>v/n);
 };
 const bodies:{panel:number;left:number;right:number;bottom:number;top:number;tailReach:number;aboveReach:number}[]=[];
 let rust=0;
 for(let p=0;p<panels;p++){
  let left=pw,right=-1,bottom=ph,top=-1,cores=0;
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
   const [r,g,b]=colour(p,x,y);
   if(r!-g!>=6&&b!<154)rust++;
   // Strong cores define the blotch body; softer runoff and feathers are measured separately.
   if(r!-g!<20||b!>=135)continue;
   cores++;left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
  }
  if(cores<4)continue;
  const reach=(side:number)=>{
   let last=0;
   for(let d=1;d<ph;d++){
    const y=side<0?bottom-d:top+d;if(y<0||y>=ph)break;
    let loss=0;for(let x=left;x<=right;x++)loss=Math.max(loss,baseBlue-colour(p,x,y)[2]!);
    if(loss>=4)last=d;
   }
   return last;
  };
  bodies.push({panel:p,left,right,bottom,top,tailReach:reach(-1),aboveReach:reach(1)});
 }
 return {pw,ph,bodies,coverage:rust/(panels*pw*ph),colour};
}
