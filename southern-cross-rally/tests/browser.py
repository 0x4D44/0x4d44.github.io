"""Real Chromium/WebGL smoke and UI tests, not a renderer mock.

pip install playwright && playwright install chromium
python tests/browser.py --url http://127.0.0.1:8000/southern-cross-rally/

--embedded loads local sources as Blob modules on about:blank in network-blocked
runners. Its only source substitution enables the explicit ?test hooks.
Use --chromium /usr/bin/chromium to choose a system browser.
"""
from pathlib import Path
import argparse
import json
import re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:8000/southern-cross-rally/')
parser.add_argument('--embedded',action='store_true')
parser.add_argument('--chromium')
parser.add_argument('--screenshots',type=Path)
args=parser.parse_args()
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
    print('PASS',name,flush=True)
DRIVE="""() => {
 const T=rallyTest, v=T.vehicle, s=v.stage;
 T.step({},0);
 for(let i=0;i<120*400 && !v.finished;i++) {
   const speed=Math.abs(v.speed), look=10+speed*.6, p=s.at(v.progress+look);
   const a=Math.atan2(p.x-v.x,p.z-v.z)-v.yaw;
   const error=Math.atan2(Math.sin(a),Math.cos(a));
   const wheel=Math.atan2(2*v.car.wheelbase*Math.sin(error),look);
   const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
   const input={steer:clamp(wheel*(1+speed*.023)/.52*1.8,-1,1),
    throttle:clamp(.35+(14-speed)*.35,0,1),brake:clamp((speed-15)*.4,0,1)};
   if(i%120===0)T.step(input,1/120);else v.step(input,1/120);
 }
 T.step({},1/120);
 return {finished:v.finished,controls:v.checkpoint,damage:v.damage,penalty:v.penalty,phase:T.phase};
}"""
with sync_playwright() as pw:
    launch={'headless':True,'args':['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
    if args.chromium:launch['executable_path']=args.chromium
    browser=pw.chromium.launch(**launch)
    page=browser.new_page(viewport={'width':1280,'height':800})
    page.set_default_timeout(60000)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    if args.embedded:
        html=ROOT.joinpath('index.html').read_text()
        html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
        html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+ROOT.joinpath('style.css').read_text()+'</style>')
        source={n:ROOT.joinpath(n+'.mjs').read_text() for n in ('core','render','game')}
        source['game']=source['game'].replace("new URLSearchParams(location.search).has('test')",'true')
        page.set_content(html)
        page.evaluate("""async src => {
          const blob=s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}));
          const core=blob(src.core),render=blob(src.render.replaceAll("'./core.mjs'",JSON.stringify(core)));
          await import(blob(src.game.replaceAll("'./core.mjs'",JSON.stringify(core)).replaceAll("'./render.mjs'",JSON.stringify(render))));
        }""",source)
    else:
        page.goto(args.url+'?test=1')
    page.wait_for_function('window.rallyTelemetry?.phase === "menu"')
    check('six selectable stages',page.locator('[data-stage]').count()==6)
    check('two selectable cars',page.locator('[data-car]').count()==2)
    check('real WebGL context initialized',page.evaluate('rallyTest.renderer.gl instanceof WebGL2RenderingContext'))
    if args.screenshots:
        args.screenshots.mkdir(parents=True,exist_ok=True)
        page.set_viewport_size({'width':1440,'height':900})
        page.screenshot(path=str(args.screenshots/'menu.png'))
    page.click('#settings-button')
    page.select_option('#quality','low')
    page.click('#settings-close')
    for width,height in [(390,844),(768,1024),(1440,900)]:
        page.set_viewport_size({'width':width,'height':height})
        check(f'no document overflow at {width}x{height}',page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'))
        obscured=page.evaluate("""()=>[...document.querySelectorAll('button,select,input,a')].filter(e=>{
            const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left<109&&r.right>0&&r.top<41&&r.bottom>0;
        }).filter(e=>!e.closest('[hidden]')).map(e=>e.id||e.textContent)""")
        check(f'no controls beneath Almanac pill at {width}',not obscured)
        page.click('#settings-button')
        page.locator('#settings-close').scroll_into_view_if_needed()
        check(f'settings reachable at {width}',page.locator('#settings-close').is_visible())
        page.click('#settings-close')
    page.set_viewport_size({'width':1024,'height':768})
    page.click('[data-car="1"]')
    check('second car selected',page.evaluate('rallyTelemetry.car===1'))
    page.click('#start')
    page.evaluate('rallyTest.step({},0)')
    page.keyboard.down('ArrowUp')
    page.wait_for_function('rallyTelemetry.speed>1')
    page.keyboard.up('ArrowUp')
    check('keyboard accelerates car',page.evaluate('rallyTelemetry.speed>1'))
    page.keyboard.press('Escape')
    paused_time=page.evaluate('rallyTelemetry.time')
    page.wait_for_timeout(250)
    check('pause stops simulation clock',page.evaluate('rallyTelemetry.time')==paused_time)
    page.click('#resume')
    check('resume returns to race',page.evaluate('rallyTelemetry.phase==="race"'))
    page.keyboard.press('KeyR')
    check('recovery charges five seconds',page.evaluate('rallyTest.vehicle.penalty===5'))
    page.evaluate('window.dispatchEvent(new Event("blur"))')
    check('focus loss automatically pauses',page.evaluate('rallyTelemetry.phase==="paused"'))
    page.click('#quit')
    page.click('[data-car="0"]')
    page.select_option('#mode','cup')
    page.click('#start')
    for i in range(6):
        page.wait_for_function('(i)=>rallyTelemetry.stage===i && rallyTelemetry.phase==="countdown"',arg=i)
        outcome=page.evaluate(DRIVE)
        check(f'cup stage {i+1} finishes through all controls',outcome['finished'] and outcome['controls']==4 and outcome['phase']=='results')
        check(f'cup stage {i+1} no crash or recovery',outcome['damage']==0 and outcome['penalty']==0)
        check(f'cup stage {i+1} no GL errors',page.evaluate('rallyTest.renderer.gl.getError()===0'))
        if i==0:
            check('replay samples strictly increasing',page.evaluate('rallyTest.recording.every((s,i,a)=>i===0||s[0]>a[i-1][0])'))
            page.click('#replay')
            check('recorded replay opens',page.evaluate('rallyTelemetry.phase==="replay"'))
            page.click('#end-replay')
            check('replay returns to result',page.evaluate('rallyTelemetry.phase==="results"'))
        if i<5:
            page.click('#next')
            if i in (1,3):
                check(f'service stop after stage {i+1}',page.locator('#service').is_visible())
                page.click('#repair' if i==1 else '#no-repair')
    summary=page.locator('#cup-summary').inner_text()
    check('rally result includes all six stages', '6/6 stages' in summary)
    check('service penalty included once','Includes 20s service' in summary)
    page.click('#next')
    check('completed rally returns to menu',page.evaluate('rallyTelemetry.phase==="menu"'))
    check('no uncaught JavaScript exceptions',not errors)
    browser.close()
print(json.dumps({'checks':len(checks),'errors':errors,'mode':'embedded' if args.embedded else 'http'},indent=2))
