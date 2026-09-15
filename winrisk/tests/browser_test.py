"""Browser regression suite. pip install playwright; playwright install chromium.

Run from any directory. By default, serve the repository over HTTP and test the
real ES modules. --injected is an explicit, network-free fallback for restricted
runners: inline the local CSS/code, strip ES-module import/export syntax, and
supply the three JSON responses in memory. That fallback tests DOM behaviour,
not HTTP loading or module resolution. No browser network policy is changed.
"""
import argparse
import functools
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / 'winrisk'
PARSER = argparse.ArgumentParser()
PARSER.add_argument('--injected', action='store_true')
PARSER.add_argument('--screenshots', type=Path)
ARGS = PARSER.parse_args()


def inject(page, javascript=True):
    html = (SITE / 'index.html').read_text()
    css = (SITE / 'style.css').read_text()
    html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*>', lambda _: '<style>' + css + '</style>', html)
    html = re.sub(r'<script[^>]*src=[^>]*></script>', '', html)
    page.set_content(html)
    if not javascript:
        return
    page.add_script_tag(content=(ROOT / 'almanac-back.js').read_text())
    evidence = {p.name: json.loads(p.read_text()) for p in (SITE / 'evidence').glob('*.json')}
    model = (SITE / 'model.mjs').read_text().replace('export ', '')
    app = (SITE / 'app.mjs').read_text().split('\n', 1)[1]
    app = app.replace('import.meta.url', json.dumps('https://0x4d44.github.io/winrisk/app.mjs'))
    page.add_script_tag(content='(()=>{' + model + '\nconst evidence=' + json.dumps(evidence) +
        ';\nconst fetch=async u=>({ok:true,json:async()=>evidence[String(u).split("/").at(-1)]});\n' + app + '\n})();')


server = None
if not ARGS.injected:
    mimetypes.add_type('text/javascript', '.mjs')
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/winrisk/'

try:
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        if ARGS.injected: inject(page)
        else: page.goto(url)
        page.wait_for_selector('html[data-ready="true"]')
        assert page.locator('.finding').count() == 9
        assert page.locator('#segments button').count() == 10
        for i in range(1, 11):
            page.locator(f'#segments button[data-segment="{i}"]').click()
            assert page.locator('#segments button[aria-pressed="true"]').count() == 1
            assert page.locator('#segment-detail h4').inner_text().startswith(f'{i}.')
        page.locator('#example-dice').click()
        assert 'Attacker −1' in page.locator('#combat-output .result').first.inner_text()
        assert 'Defender −2' in page.locator('#combat-output .result').last.inner_text()
        page.locator('#reverse-dice').click()
        assert 'Attacker −0' in page.locator('#combat-output .result').first.inner_text()
        for a in range(1, 4):
            page.select_option('#attack-count', str(a))
            for d in range(1, 3):
                page.select_option('#defend-count', str(d))
                assert page.locator('#attacker-dice button').count() == a
                assert page.locator('#defender-dice button').count() == d
        page.locator('#attacker-dice button').first.focus()
        old = int(page.locator('#attacker-dice button').first.inner_text())
        page.keyboard.press('Enter')
        assert int(page.locator('#attacker-dice button').first.inner_text()) == old % 6 + 1
        page.locator('#run-sweep').click()
        page.wait_for_function("document.querySelector('#sweep-status').textContent.includes('check complete')")
        assert page.locator('#sweep-rows tr').count() == 6
        assert '10,836 cases. Original: 2,317 disagreements. Repaired: 0.' in page.locator('#sweep-status').inner_text()
        for context, original, repaired in [('result', 2, 1), ('normal', 1, 1), ('ai', 0, 0)]:
            page.select_option('#click-context', context)
            page.locator('#queue-click').click()
            outputs = page.locator('#queue-output .outcome').all_inner_texts()
            assert outputs == [f'{n} message' + ('' if n == 1 else 's') for n in [original, repaired]]
        page.locator('#territory-index').fill('-1')
        assert 'DS:081E' in page.locator('#index-output').inner_text()
        page.locator('#territory-index').fill('41')
        assert 'Valid territory' in page.locator('#index-output').inner_text()
        page.locator('#territory-index').fill('42')
        assert 'Outside' in page.locator('#index-output').inner_text()
        for stack in range(2, 10):
            page.locator('#stack').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input"))}', str(stack))
            assert '2 cards transferred' in page.locator('#elimination-output .result').last.inner_text()
        for draw in [43, 44, 45]:
            page.locator('#draw').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input"))}', str(draw))
            expected = (draw - 1) % 44
            assert f'Slot {expected}:' in page.locator('#deck-output .result').last.inner_text()
        page.locator('#setup-name').fill('<img src=x onerror=alert(1)>')
        for code in [0, 1, -1]:
            page.locator(f'[data-dialog-result="{code}"]').click()
            assert page.locator('#setup-output img').count() == 0
            assert page.locator('[data-dialog-result][aria-pressed="true"]').count() == 1
        assert page.locator('#map-land path').count() == 42
        for territory in [27, 30, 33, 36, 37, 39, 42]:
            page.select_option('#map-territory', str(territory))
            page.locator('#map-witness').click()
            assert 'classification changed' in page.locator('#map-hit').inner_text(), territory
            page.locator('#map-zoom').check()
            assert page.locator('#territory-map').get_attribute('viewBox') != '-110 -110 760 610'
        page.select_option('#map-territory', '33')
        page.locator('#map-witness').click()
        page.locator('#show-sentinel').uncheck()
        assert 'same classification' in page.locator('#map-hit').inner_text()
        manifest = json.loads((SITE / 'evidence/patch_manifest.json').read_text())
        for i, change in enumerate(manifest['changes']):
            page.select_option('#patch-select', str(i))
            if 'helper_hex' in change:
                actual = re.sub(r'\s+', '', page.locator('#patch-detail pre').inner_text()).lower()
                assert actual == change['helper_hex'].lower()
            else:
                assert change['offset_hex'] in page.locator('#patch-detail').inner_text()
        page.locator('#exe-file').set_input_files({'name':'other.exe', 'mimeType':'application/octet-stream', 'buffer':b'not an exe'})
        assert 'Different file size' in page.locator('#file-result').inner_text()
        page.locator('#exe-file').set_input_files({'name':'unknown.exe', 'mimeType':'application/octet-stream', 'buffer':bytes(220672)})
        page.wait_for_function("!document.querySelector('#file-result').textContent.includes('Computing')")
        assert ('requires a secure context' if ARGS.injected else 'Not recognised') in page.locator('#file-result').inner_text()
        for width, height in [(320,800), (390,844), (768,1024), (1440,1000)]:
            page.set_viewport_size({'width':width,'height':height})
            for selector in ['body','#dice-lab','#map-lab','#surgery','#evidence']:
                page.locator(selector).scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth') <= 1, (width,selector)
            page.evaluate('scrollTo(0,0)')
            covered = page.evaluate("""()=>Array.from(document.querySelectorAll('a,button,input,select,summary')).filter(e=>{
                const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<112&&r.bottom>0&&r.top<42;
            }).map(e=>e.id||e.outerHTML.slice(0,100))""")
            assert not covered, (width, covered)
            if ARGS.screenshots:
                ARGS.screenshots.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(ARGS.screenshots/f'winrisk-{width}.png'))
        page.evaluate("location.hash='fix-combat'")
        page.wait_for_function("document.getElementById('fix-combat').open")
        page.evaluate("location.hash='%E0%A4%A'")
        assert not errors, errors
        nojs = browser.new_page(java_script_enabled=False)
        if ARGS.injected: inject(nojs, False)
        else: nojs.goto(url)
        assert 'complete written case study' in nojs.locator('noscript').inner_text()
        assert nojs.locator('.finding').count() == 9
        print('PASS: controls, six dice sweeps, 42 paths/seven witnesses, all patch bytes, transactions, file-check fallback, 320/390/768/1440 layouts, keyboard, malformed fragment, no-JS prose.')
        print('Mode:', 'offline injected DOM (HTTP/module loading not tested)' if ARGS.injected else 'real HTTP and native ES modules')
        browser.close()
finally:
    if server: server.shutdown()
