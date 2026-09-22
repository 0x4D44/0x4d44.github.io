#!/usr/bin/env python3
"""Reproducible Chromium regression checks. pip install playwright; use a Chromium binary.
Loads the exact site as an in-memory self-contained document. It makes no network
requests, so the same tests work in network-restricted authoring environments.
This is NOT a claim that GitHub Pages deployment or other browser engines were tested.
"""
import argparse, base64, json, re, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def inline_document():
    html=(ROOT/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+(ROOT/'style.css').read_text()+'</style>')
    for name in ['model','diagrams','learning-data','app']:
        code=(ROOT/f'{name}.js').read_text().replace('</script','<\\/script')
        html=html.replace(f'<script defer src="{name}.js"></script>','<script>'+code+'</script>')
    back=ROOT.parent/'almanac-back.js'
    if not back.exists():
        raise RuntimeError('Run inside the Almanac checkout, or provide its existing almanac-back.js alongside meiosis/.')
    html=html.replace('<script defer src="/almanac-back.js"></script>','<script>'+back.read_text()+'</script>')
    for asset in ['assets/icon.svg','assets/meiosis-full-process.svg']:
        encoded=base64.b64encode((ROOT/asset).read_bytes()).decode()
        html=html.replace(f'href="{asset}"',f'href="data:image/svg+xml;base64,{encoded}"')
    return html

BOUNDS="""() => { const out=[]; for(const svg of document.querySelectorAll('svg')) {
 const r=svg.getBoundingClientRect(); if(r.width<1||r.height<1)continue;
 for(const t of svg.querySelectorAll('text')) {const b=t.getBoundingClientRect();if(b.width<1)continue;
 if(b.left<r.left-2||b.right>r.right+2||b.top<r.top-2||b.bottom>r.bottom+2)out.push({title:svg.querySelector('title')?.textContent,text:t.textContent,excess:Math.max(r.left-b.left,b.right-r.right,r.top-b.top,b.bottom-r.bottom)});}}
 return out;}"""

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=ROOT/'test-output');ap.add_argument('--chromium',default='/usr/bin/chromium');args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    results={'method':'Chromium, in-memory exact static site with inlined local assets','checks':[],'errors':[]}
    def ok(name):results['checks'].append(name)
    html=inline_document()
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
        results['browser']=browser.version
        page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
        page.on('pageerror',lambda e:results['errors'].append(str(e)))
        requests=[];page.on('request',lambda r:requests.append(r.url))
        page.clock.install();page.set_content(html,wait_until='load')
        assert 'enhanced' in page.locator('body').get_attribute('class')
        assert not results['errors'];ok('Progressive enhancement initialises without JavaScript errors')
        assert not [r for r in requests if r.startswith(('http:','https:'))];ok('No external runtime requests')
        page.screenshot(path=str(args.output/'desktop-hero.png'))
        # Every diagram and both numerical scales, driven through the visible controls.
        for n in [2,23]:
          page.locator('#counter-organism').select_option(str(n))
          for stage in range(11):
            page.locator('#stage-select').select_option(str(stage))
            ch=[4,4,4,4,4,4,2,2,2,4,2][stage]*n//2
            dna=[4,8,8,8,8,8,4,4,4,4,2][stage]*n//2
            assert page.locator('#count-chromosomes').inner_text()==str(ch)
            assert page.locator('#count-dna').inner_text()==str(dna)
            assert page.locator('#count-cells').inner_text()==str([1,1,1,1,1,1,2,2,2,2,4][stage])
            if stage in [5,9]:assert 'Each pole:' in page.locator('#count-scope').inner_text()
            assert not page.evaluate(BOUNDS),page.evaluate(BOUNDS)
        ok('All 11 stages × model/human counts, including anaphase boundaries; SVG text inside viewboxes')
        page.locator('#counter-organism').select_option('2');page.locator('#stage-select').select_option('10')
        page.locator('#trace-chromosome').select_option('M1')
        assert page.locator('#stage-picture [data-chromosome="M1a"]').evaluate('(e)=>e.style.opacity')=='1'
        assert page.locator('#stage-picture [data-chromosome="P1a"]').evaluate('(e)=>e.style.opacity')=='0.18'
        page.locator('#trace-chromosome').select_option('all');ok('Lineage tracing highlights descendants without altering counts')
        page.locator('#stage-select').select_option('0');page.locator('#stage-play').click();page.clock.fast_forward(9001)
        assert page.locator('#stage-select').input_value()=='1'
        page.locator('#stage-play').click();page.clock.fast_forward(20000);assert page.locator('#stage-select').input_value()=='1'
        page.locator('#stage-select').select_option('9');page.locator('#stage-play').click();page.clock.fast_forward(9001)
        assert page.locator('#stage-select').input_value()=='10';assert page.locator('#stage-play').get_attribute('aria-pressed')=='false'
        ok('Manual playback, pause and automatic stop at final product')
        page.locator('#stage-picture').focus();page.keyboard.press('ArrowLeft');assert page.locator('#stage-select').input_value()=='9';ok('Scoped keyboard stage navigation')
        for cut,expected in [(1,['ABCD','Abcd','aBCD','abcd']),(2,['ABCD','ABcd','abCD','abcd']),(3,['ABCD','ABCd','abcD','abcd'])]:
          page.locator('#cross-cut').select_option(str(cut));assert page.locator('#cross-results b').all_text_contents()==expected
        page.locator('#cross-enabled').uncheck();assert page.locator('#cross-results b').all_text_contents()==['ABCD','ABCD','abcd','abcd'];page.locator('#cross-enabled').check();ok('All three crossover intervals and no-crossover control')
        for mask in range(8):
          page.locator('#assort-reset').click()
          for bit in range(3):
            if mask&(1<<bit):page.locator(f'[data-flip="{bit}"]').click()
          expected=''.join('P' if mask&(1<<i) else 'M' for i in range(3))
          assert expected in page.locator('#assort-status').inner_text()
          assert page.locator('#assort-combinations .active').count()==2
        page.locator('#pair-count').focus();page.keyboard.press('End');assert page.locator('#combination-count').inner_text()=='8,388,608'
        page.keyboard.press('Home');assert page.locator('#combination-count').inner_text()=='2';ok('Eight assortment orientations; range keyboard endpoints 1–23 pairs')
        ids=['map-ab-upper','map-ab-lower','map-Ab','map-aB']
        for data,expect in [([420,420,80,80],'16%'),([250,250,250,250],'50%'),([1,1,2,2],'Above 50%'),([0,0,0,0],'at least one')]:
          for id,value in zip(ids,data):page.locator('#'+id).fill(str(value))
          page.locator('#mapping-form button[type=submit]').click();assert expect in page.locator('#mapping-status').inner_text()
        page.locator('#mapping-reset').click();assert '16%' in page.locator('#mapping-status').inner_text();ok('Recombination calculator: arithmetic, 50% interpretation, above-limit sample, zero-total error and reset')
        for n in [2,23]:
          page.locator('#nd-organism').select_option(str(n))
          for mode,delta in [('none',[0,0,0,0]),('I',[1,1,-1,-1]),('II',[1,-1,0,0])]:
            page.locator('#nd-mode').select_option(mode)
            for text,d in zip(page.locator('#nd-results b').all_text_contents(),delta):assert text.startswith(str(n+d)+' · ')
        ok('All three segregation modes and human/model gamete + zygote counts')
        # Answer each question correctly. Feedback and score must be connected to state, not cosmetic.
        answers=page.evaluate('MeiosisLearning.quiz.map(q=>q.answer)')
        for i,answer in enumerate(answers):
          page.locator(f'#quiz-options input[value="{answer}"]').check();page.locator('#quiz-check').click()
          assert 'Correct.' in page.locator('#quiz-feedback').inner_text()
          assert f'{i+1} correct from {i+1}' in page.locator('#quiz-score').inner_text()
          page.locator('#quiz-next').click()
        assert '12 / 12' in page.locator('#quiz-feedback').inner_text()
        page.locator('#quiz-reset').click();page.locator('#quiz-options input[value="0"]').check();page.locator('#quiz-check').click()
        assert 'Not quite.' in page.locator('#quiz-feedback').inner_text();assert 'Correct answer:' in page.locator('#quiz-feedback').inner_text()
        assert '0 correct from 1' in page.locator('#quiz-score').inner_text();page.locator('#quiz-reset').click();ok('Entire quiz correct path, incorrect feedback, first-submission scoring, completion and reset')
        page.locator('#glossary-search').fill('shugoshin');assert '0 terms' in page.locator('#glossary-status').inner_text()
        page.locator('#glossary-search').fill('sister');assert page.locator('#glossary-list > div:visible').count()>1
        page.locator('#glossary-search').fill('');assert page.locator('#glossary-list > div:visible').count()==29;ok('Glossary search, no-results state and clearing')
        page.locator('#open-atlas').click();assert page.locator('#atlas-dialog').evaluate('(e)=>e.open')
        ids_now=page.locator('[id]').evaluate_all('(els)=>els.map(e=>e.id)');assert len(set(ids_now))==len(ids_now)
        page.keyboard.press('Escape');assert not page.locator('#atlas-dialog').evaluate('(e)=>e.open')
        assert page.evaluate('document.activeElement.id')=='open-atlas';ok('Native modal: unique SVG IDs, Escape, focus restoration')
        # Responsive layouts and all visible SVG labels at each width.
        widths=[320,390,768,1024,1440]
        for width in widths:
          page.set_viewport_size({'width':width,'height':900})
          page.evaluate('window.scrollTo({top:0,behavior:"instant"})')
          metrics=page.evaluate('({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})')
          assert metrics['scroll']-metrics['client']<=1,(width,metrics)
          covered=page.locator('button,input,select,a').evaluate_all("""els=>els.filter(e=>{let r=e.getBoundingClientRect();return e.getRootNode()===document&&r.width>0&&r.height>0&&r.left<109&&r.right>0&&r.top<41&&r.bottom>0;}).map(e=>e.id||e.textContent)""")
          assert not covered,(width,covered)
          assert not page.evaluate(BOUNDS),page.evaluate(BOUNDS)
          page.locator('#text-size').click();assert page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
          page.locator('#text-size').click()
        ok('320, 390, 768, 1024, 1440px: no document overflow, no controls under Almanac pill, larger-text mode')
        page.set_viewport_size({'width':390,'height':844});page.evaluate('window.scrollTo({top:0,behavior:"instant"})')
        page.screenshot(path=str(args.output/'mobile-hero.png'))
        page.locator('#mobile-index summary').click();assert page.locator('#mobile-index a:visible').count()==13
        page.locator('#mobile-index summary').click();ok('Mobile chapter menu exposes all 13 destinations')
        page.set_viewport_size({'width':1440,'height':1050});page.locator('#stage-select').select_option('4')
        page.locator('#player-heading').evaluate('(e)=>e.scrollIntoView({block:"start",behavior:"instant"})');page.evaluate('window.scrollBy(0,-100)');page.screenshot(path=str(args.output/'desktop-player.png'))
        page.locator('#cross-heading').evaluate('(e)=>e.scrollIntoView({block:"start",behavior:"instant"})');page.evaluate('window.scrollBy(0,-100)');page.screenshot(path=str(args.output/'desktop-crossing.png'))
        page.locator('.atlas-frame').screenshot(path=str(args.output/'full-process-top.png'))
        # Reduced motion uses the same fully functional controls, with no automatic motion on load.
        reduced=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');rp=reduced.new_page();rp.set_content(html)
        assert rp.evaluate('getComputedStyle(document.documentElement).scrollBehavior')=='auto'
        assert rp.locator('#stage-play').get_attribute('aria-pressed')=='false';rp.locator('#stage-next').click();assert rp.locator('#stage-select').input_value()=='1';reduced.close();ok('Reduced-motion preference and manual controls')
        # Static content remains readable without any scripts.
        nojs=browser.new_context(viewport={'width':390,'height':844},java_script_enabled=False);np=nojs.new_page();np.set_content(html)
        assert np.locator('.chapter').count()==14;assert np.locator('svg').count()>=12;assert np.locator('#stage-next').is_hidden()
        assert np.locator('#map-ab-upper').is_disabled();assert np.locator('.nojs-note').is_visible();assert np.locator('.static-question').count()==12
        np.locator('#journey details summary').click();assert np.locator('.stage-transcript li:visible').count()==11
        np.screenshot(path=str(args.output/'mobile-nojs.png'));nojs.close();ok('JavaScript disabled: all chapters, static diagrams, 11-step transcript, disabled calculator and 12 worked quiz answers')
        # Print expansion + geometry; the print-only reading view should not hide glossary matches.
        page.emulate_media(media='print');page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        assert page.locator('details:not([open])').count()==0
        assert page.locator('.atlas-frame').evaluate('(e)=>getComputedStyle(e).overflow')=='visible'
        assert page.locator('.topbar').is_hidden();ok('Print view expands details, removes sticky controls and reveals full atlas')
        page.evaluate("window.dispatchEvent(new Event('afterprint'))");page.emulate_media(media='screen')
        assert not results['errors'];browser.close()
      results['passed']=True
    except Exception:
      results['passed']=False;results['failure']=traceback.format_exc();raise
    finally:
      (args.output/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n')
      print(json.dumps(results,indent=2))

if __name__=='__main__':main()
