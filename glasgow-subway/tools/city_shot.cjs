const {chromium}=require('playwright');
(async()=>{const [,,out,qs,w,h]=process.argv;const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+(w||1280),height:+(h||720)}});const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:8123/tools/city_view.html?'+qs);await p.waitForFunction('window.__done',null,{timeout:170000});
console.log(JSON.stringify(await p.evaluate('window.__info')),errs.slice(0,5),await p.evaluate('window.__log'));await p.screenshot({path:out});await b.close();})();
