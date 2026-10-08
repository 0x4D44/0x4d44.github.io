// Deterministic frame renderer: drives video.html in headless Chromium (software WebGL),
// one JPEG per frame.  Frames are rendered at 12 fps ("on twos") and doubled at encode time.
//   node render.mjs START END OUTDIR PORT [times] [STRIDE]
//   e.g. four workers: for i in 0 1 2 3; do node render.mjs $i 4548 frames $((8600+i)) "" 4 & done
//   MISS=file.txt (comma-separated frame indices) re-renders just those frames.
import {chromium} from 'playwright-core';
import http from 'http';import fs from 'fs';
const [,,startF,endF,outDir,port]=process.argv;
const FPS=12;
const srv=http.createServer((q,r)=>{let p='.'+decodeURIComponent(q.url.split('?')[0]);try{r.end(fs.readFileSync(p))}catch(e){r.statusCode=404;r.end()}}).listen(+port);
const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await b.newPage({viewport:{width:1280,height:720}});
pg.on('pageerror',e=>console.log('E',e.message));
pg.on('console',m=>{const x=m.text();if(!/WebGL|404/.test(x))console.log('C',x)});
await pg.goto(`http://localhost:${port}/video.html`);await pg.waitForFunction('window.ready',null,{timeout:60000});
fs.mkdirSync(outDir,{recursive:true});
const times=process.argv[6]?process.argv[6].split(',').map(Number):null;
const MISS=process.env.MISS?fs.readFileSync(process.env.MISS,'utf8').split(',').filter(Boolean).map(Number):null;
const STR=+(process.argv[7]||1);
const frames=MISS||times||Array.from({length:Math.ceil((endF-startF)/STR)},(_,i)=>(+startF+i*STR));
const t0=Date.now();
for(const f of frames){
  const t=times?f:f/FPS;
  await pg.evaluate(t=>window.renderFrame(t),t);
  const name=times?`${outDir}/t${String(f).replace('.','_')}.jpg`:`${outDir}/${String(f).padStart(6,'0')}.jpg`;
  await pg.screenshot({path:name,type:'jpeg',quality:93});
}
console.log('done',frames.length,'frames',(Date.now()-t0)/1000,'s');
await b.close();srv.close();
