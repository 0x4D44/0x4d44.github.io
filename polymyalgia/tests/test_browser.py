"""PMR browser regression checks. Run from any directory with Python + Playwright.

python -m unittest discover -s polymyalgia/tests -v
CHROMIUM_EXECUTABLE may select an existing Chromium installation.
AXE_SCRIPT may point to a local axe-core/axe.min.js for WCAG checks.
No external resources are allowed during page tests.
"""
from __future__ import annotations
import functools
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(os.environ.get('PMR_TEST_OUTPUT', tempfile.mkdtemp(prefix='pmr-tests-')))
OUTPUT.mkdir(parents=True, exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.hrefs, self.svg, self.lang = [], [], [], None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs: self.ids.append(attrs['id'])
        if tag == 'a': self.hrefs.append(attrs.get('href', ''))
        if tag == 'svg': self.svg.append(attrs)
        if tag == 'html': self.lang = attrs.get('lang')

class PMRTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        self.context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname == '127.0.0.1' else route.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.failed_local = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('response', lambda response: self.failed_local.append(response.url) if response.status >= 400 and urlparse(response.url).hostname == '127.0.0.1' else None)
        self.page.goto(self.base + '/polymyalgia/', wait_until='networkidle')
    def tearDown(self):
        errors, failed = self.errors[:], self.failed_local[:]
        self.context.close()
        self.assertEqual(errors, [], 'Browser JavaScript errors')
        self.assertEqual(failed, [], 'Missing local resources')
    def test_markup_and_sources(self):
        parser = Markup()
        html = (ROOT / 'polymyalgia/index.html').read_text()
        parser.feed(html)
        self.assertEqual(parser.lang, 'en-GB')
        self.assertEqual(len(parser.ids), len(set(parser.ids)), 'Duplicate HTML IDs')
        for href in parser.hrefs:
            if href.startswith('#'): self.assertIn(href[1:], parser.ids)
        self.assertGreaterEqual(len(parser.svg), 6)
        for svg in parser.svg:
            self.assertEqual(svg.get('role'), 'img')
            self.assertTrue(svg.get('aria-labelledby'))
            for target in svg['aria-labelledby'].split(): self.assertIn(target, parser.ids)
        self.assertEqual(len(self.page.locator('.references > li').all()), 29)
        self.assertEqual(len(self.page.locator('.lab').all()), 9)
        for text in ['not been independently clinically reviewed', 'Never abruptly stop', 'once weekly, not daily', '15 September 2026', 'not a single survival curve', 'SMC2810']:
            self.assertIn(text, self.page.locator('body').inner_text())
        self.assertEqual(self.page.locator('script[src="/almanac-back.js"]').count(), 1)
        self.assertEqual(self.page.locator('h1').count(), 1)
    def test_all_interactive_figures(self):
        for part in ['bursa', 'tendon', 'joint', 'muscle']:
            button = self.page.locator(f'[data-anatomy="{part}"]')
            button.click()
            self.assertEqual(button.get_attribute('aria-pressed'), 'true')
            self.assertEqual(self.page.locator('#anatomy-' + part).evaluate('(e)=>e.style.opacity'), '1')
        self.page.locator('[data-signal="blockade"]').click()
        self.assertIn('cannot exclude', self.page.locator('#signal-note').inner_text())
        self.page.locator('[data-signal="steroid"]').click()
        self.assertIn('broad', self.page.locator('#signal-note').inner_text())
        for hour in [0, 6, 12, 16, 24]:
            self.page.locator('#day-time').fill(str(hour))
            self.assertEqual(self.page.locator('#day-output').inner_text(), f'{hour:02}:00')
        for lens in ['blood', 'imaging', 'review', 'pattern']:
            self.page.locator(f'[data-lens="{lens}"]').click()
            self.assertEqual(self.page.locator('#lens-' + lens).get_attribute('stroke-width'), '4')
        for amount, expected in [('0', 74), ('100', 26)]:
            self.page.locator('#artery-wall').fill(amount)
            self.assertEqual(float(self.page.locator('#artery-lumen').get_attribute('r')), expected)
        for base, percentage in [(5, 20), (10, 10), (20, 5)]:
            self.page.locator(f'[data-fraction="{base}"]').click()
            self.assertEqual(self.page.locator('#fraction-result').inner_text(), f'{percentage}%')
        for trial in ['saphyr', 'mtx', 'spare', 'replenish']:
            self.page.locator(f'[data-trial="{trial}"]').click()
            self.assertTrue(self.page.locator('#trial-' + trial).is_visible())
            self.assertEqual(self.page.locator('.trial-panel:visible').count(), 1)
        for year, percentage in [(1, 77), (2, 51), (5, 25)]:
            self.page.locator(f'[data-cohort="{year}"]').click()
            self.assertEqual(self.page.locator('#cohort-number').inner_text(), f'{percentage}%')
            self.assertEqual(self.page.locator('#cohort-dots .on').count(), percentage)
        self.assertEqual(self.page.locator('#cohort-dots .dot').count(), 100)
    def test_trial_values_and_scales(self):
        expected = {'saphyr': ['28.3%', '10.3%'], 'mtx': ['80%', '46%'], 'spare': ['63.2%', '11.8%'], 'replenish': ['41.2%', '40.6%', '20.4%']}
        for trial, values in expected.items():
            panel = self.page.locator('#trial-' + trial)
            self.assertEqual(panel.locator('.bar').evaluate_all('(es)=>es.map(e=>e.style.width)'), values)
            for value in values: self.assertIn(value, panel.text_content())
            self.assertTrue(panel.locator('.endpoint').text_content().strip())
    def test_responsive_and_back_pill_clearance(self):
        for width, height in [(320, 720), (390, 844), (768, 1024), (1440, 1000), (1920, 1080)]:
            self.page.set_viewport_size({'width': width, 'height': height})
            for target in ['#title', '#anatomy-lab', '#trial-lab', '#sources']:
                self.page.locator(target).scroll_into_view_if_needed()
                self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth'), 1, (width, target))
                covered = self.page.evaluate('''() => [...document.querySelectorAll('a,button,input,select,summary')].filter(e => {
                  const s=getComputedStyle(e), r=e.getBoundingClientRect();
                  return s.visibility!=='hidden' && s.display!=='none' && r.width>0 && r.height>0 && r.left<112 && r.right>0 && r.top<41 && r.bottom>0;
                }).map(e=>e.outerHTML.slice(0,180))''')
                self.assertEqual(covered, [], (width, target, covered))
    def test_keyboard_and_reduced_motion(self):
        button = self.page.locator('[data-anatomy="muscle"]')
        button.focus()
        self.page.keyboard.press('Enter')
        self.assertEqual(button.get_attribute('aria-pressed'), 'true')
        self.assertEqual(self.page.evaluate('getComputedStyle(document.documentElement).scrollBehavior'), 'auto')
        self.assertEqual(self.page.locator('input:not([type=checkbox]):not([type=range])').count(), 0)
        self.assertEqual(self.page.evaluate('localStorage.length'), 0)
    def test_print_modes_and_state_restoration(self):
        self.page.evaluate('window.print=()=>{window.pmrPrintInvoked=true}')
        self.page.locator('#print-guide').click()
        self.assertTrue(self.page.evaluate('window.pmrPrintInvoked'))
        self.assertEqual(self.page.locator('details:not([open])').count(), 0)
        self.page.emulate_media(media='print')
        self.assertEqual(self.page.locator('.trial-panel:visible').count(), 4)
        self.assertFalse(self.page.locator('.masthead').is_visible())
        self.page.evaluate('window.dispatchEvent(new Event("afterprint"))')
        self.page.emulate_media(media='screen')
        self.assertEqual(self.page.locator('details[open]').count(), 0)
        self.page.locator('#print-questions').click()
        self.assertEqual(self.page.locator('body').get_attribute('data-print'), 'questions')
        self.page.emulate_media(media='print')
        self.assertTrue(self.page.locator('#consultation').is_visible())
        self.assertFalse(self.page.locator('#pattern').is_visible())
        self.page.evaluate('window.dispatchEvent(new Event("afterprint"))')
        self.assertIsNone(self.page.locator('body').get_attribute('data-print'))
    def test_no_javascript(self):
        context = self.browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
        page = context.new_page()
        try:
            page.goto(self.base + '/polymyalgia/', wait_until='networkidle')
            self.assertEqual(page.locator('.trial-panel:visible').count(), 4)
            self.assertEqual(page.locator('.controls:visible').count(), 0)
            self.assertIn('emergency assessment now', page.locator('.safety').first.inner_text())
            self.assertIn('77% at 1 year', page.locator('#prognosis').inner_text())
            self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth'), 1)
            page.locator('details summary').first.click()
            self.assertTrue(page.locator('details').first.get_attribute('open') is not None)
        finally:
            context.close()
    def test_almanac_integration(self):
        self.page.goto(self.base + '/', wait_until='networkidle')
        result = self.page.evaluate('''() => ({entries:window.ESSAYS.filter(e=>e.slug==='polymyalgia'), shelves:window.COLLECTIONS.filter(c=>c.slugs.includes('polymyalgia')).map(c=>c.id), icon:!!document.getElementById('ill-dna')})''')
        self.assertEqual(len(result['entries']), 1)
        self.assertEqual(set(result['shelves']), {'health', 'science'})
        self.assertTrue(result['icon'])
        self.assertEqual(result['entries'][0]['url'], 'https://0x4d44.github.io/polymyalgia/')
    def test_screenshots(self):
        self.page.screenshot(path=str(OUTPUT / 'pmr-desktop.png'))
        self.page.locator('#signal-lab').screenshot(path=str(OUTPUT / 'pmr-signals.png'))
        self.page.locator('[data-trial="replenish"]').click()
        self.page.locator('#trial-lab').screenshot(path=str(OUTPUT / 'pmr-trials.png'))
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.evaluate('window.scrollTo(0,0)')
        self.page.screenshot(path=str(OUTPUT / 'pmr-mobile.png'))
    @unittest.skipUnless(os.environ.get('AXE_SCRIPT'), 'Set AXE_SCRIPT to enable optional axe-core audit')
    def test_wcag_automated_audit(self):
        self.page.add_script_tag(path=os.environ['AXE_SCRIPT'])
        report = self.page.evaluate('''async () => await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})''')
        (OUTPUT / 'axe-report.json').write_text(json.dumps(report, indent=2))
        self.assertEqual(report['violations'], [], [(item['id'], len(item['nodes'])) for item in report['violations']])

if __name__ == '__main__':
    unittest.main(verbosity=2)
