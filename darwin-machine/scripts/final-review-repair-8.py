from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TEST = ROOT / "darwin-machine/tests/browser.test.mjs"

old = '''        const el = document.getElementById(${JSON.stringify(control)}); el.scrollIntoView({block:"center"});
        const r = el.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
        return { size:[r.width,r.height], hit: target === el || el.contains(target), covered: target?.id || target?.tagName };'''
new = '''        const el = document.getElementById(${JSON.stringify(control)});
        el.scrollIntoView({block:"center", behavior:"instant"});
        const r = el.getBoundingClientRect();
        const x = r.left + r.width/2;
        const y = r.top + r.height/2;
        const target = document.elementFromPoint(x, y);
        return {
          size:[r.width,r.height],
          hit: target === el || el.contains(target),
          covered: target?.id || target?.tagName || "outside viewport",
          point:[x,y],
          viewport:[innerWidth,innerHeight],
        };'''

source = TEST.read_text(encoding="utf-8")
old_count = source.count(old)
new_count = source.count(new)
if old_count == 1:
    TEST.write_text(source.replace(old, new), encoding="utf-8")
    print("Applied synchronous real hit-testing for scrolled controls.")
elif old_count == 0 and new_count == 1:
    print("Synchronous real hit-testing already materialised.")
else:
    raise SystemExit(
        f"Expected one control hit-test or its corrected form; old={old_count} new={new_count}"
    )
