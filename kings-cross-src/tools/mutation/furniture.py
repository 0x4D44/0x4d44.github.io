"""Mutation check for the shed's departure totems (web/src/furniture.ts, B5 of the shed-interior rubric): they stand on the platforms, before a pier
when an arcaded wall is near, out of the gateline passages, clear of the benches, two or three a platform (one shared on an island of 2/3 or 6/7),
their headers numbered, their screens unlit (glowing at night); and the pole clocks, one a platform or island beside a totem; and the platform 9-10
canopies (B6): measured bay, height, glazed strips in a sheet roof, near-black lattice steel, H columns on base plates clear of the furniture.

usage: python3 -I -u tools/mutation/furniture.py <kings-cross-src> <scratch dir>
The tests run in a copy with the real node_modules linked in; the unmodified copy must pass first and a
load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
F = 'web/src/furniture.ts'
M = [
    ('totems hung 3.5 m up again', F, [('m.compose(new THREE.Vector3(t.x, PLATFORM_HEIGHT, t.z)', 'm.compose(new THREE.Vector3(t.x, PLATFORM_HEIGHT + 3.5, t.z)')]),
    ('totems before the openings, at the bay middles', F, [('const t = tAtV(f, rib);', 'const t = tAtV(f, rib + 3.05);'), ('if (Math.abs(v - rib) > 0.05) continue;', 'if (Math.abs(v - rib - 3.05) > 0.05) continue;')]),
    # 'gateline passages ignored' (dropping the westernPassages check) is an equivalent mutant on today's data: no candidate rib lands in a passage.
    ('totems keep only the general gap from benches', F, [('q.r + p.r + (benches.has(q) ? FIGURES.totemBenchGap : FIGURES.gap)', 'q.r + p.r + FIGURES.gap')]),
    # 'clocks keep only the general gap from benches' is equivalent on today's data too: every clock's first free rib is already 3.5 m clear of a bench.
    ('no pole clocks', F, [('          plan.clocks.push(c);\n', '')]),
    ('clocks before the openings, half a bay off', F, [('const CLOCK_OFFSETS = [6.1, -6.1, 12.2, -12.2] as const;', 'const CLOCK_OFFSETS = [3.05, -3.05, 9.15, -9.15] as const;')]),
    ('totem screens lit like the body (dark at night)', F, [('const face = new THREE.MeshBasicMaterial(tex ?', 'const face = new THREE.MeshLambertMaterial(tex ?')]),
    ('a forest of totems again, 30 m apart', F, [('  totemSpacing: 100,', '  totemSpacing: 30,')]),
    ('islands not shared: a totem on each half again', F, [("export const TOTEM_ISLANDS: readonly (readonly [string, string])[] = [['2', '3'], ['6', '7']];", 'export const TOTEM_ISLANDS: readonly (readonly [string, string])[] = [];')]),
    ('blank headers again', F, [("if (ch !== ' ' && Number.isInteger(d)) {", 'if (false) {')]),
    ('the back face reads its number backwards', F, [('faces.poly([[-xa, dy0, -de], [-xb, dy0, -de], [-xb, dy1, -de], [-xa, dy1, -de]]', 'faces.poly([[xb, dy0, -de], [xa, dy0, -de], [xa, dy1, -de], [xb, dy1, -de]]')]),
    # B6, the platform 9-10 canopies as R-kx-shed-interior-f measures them
    ('canopy columns 12 m apart again', F, [('  canopyColumnSpacing: 15,', '  canopyColumnSpacing: 12,')]),
    ('canopy roof back at 5.2 m', F, [('  canopyHeight: 6.4,', '  canopyHeight: 5.2,')]),
    ('canopy roof all sheet, no glazed strips', F, [('    if (hi - lo > 0.2) glazing.push([lo, hi]);', '')]),
    ('canopy roof all glass again (the sheet drawn as glass)', F, [('sheet.build()], true), [canopySteel(), canopySheet()]);', 'sheet.build()], true), [canopySteel(), canopyGlass()]);')]),
    ('canopy steel painted white again', F, [('export const CANOPY_STEEL: Rgb = [0.149, 0.161, 0.173];', 'export const CANOPY_STEEL: Rgb = [1, 1, 1];')]),
    ('canopy edge girders without their lattice', F, [('      addBeam(lattice, [p[0], ya, p[1]], [q[0], yq, q[1]], 0.08, 0.08, S);\n', '')]),
    ('canopy columns without base plates', F, [('    uprightBox(steel, col.x, col.z, ax, 0.25, 0.25, PLATFORM_HEIGHT, PLATFORM_HEIGHT + 0.04, S);\n', '')]),
    ('canopy columns plain posts, no flanges', F, [('    for (const s of [-1, 1]) uprightBox(steel, col.x + ax[0] * 0.1 * s,', '    for (const s of [] as number[]) uprightBox(steel, col.x + ax[0] * 0.1 * s,')]),
    ('canopy columns as small as their post in the overlap check', F, [('r: Math.SQRT2 * 0.25, across: FIGURES.columnSize / 2 });', 'r: FIGURES.columnSize, across: FIGURES.columnSize / 2 });')]),
    # B6 round 2: the sheet shades, its underside is mid-grey, the strips near-white, pendants under the roof
    ('canopy sheet out of the casting steel mesh', F, [('new THREE.Mesh(mergeGeometries([steel.build(), sheet.build()], true), [canopySteel(), canopySheet()]);', 'new THREE.Mesh(steel.build(), canopySteel());')]),
    ('canopy sheet underside unlit (black) again', F, [('emissive: CANOPY_SHEET_GLOW, ', '')]),
    ('canopy strips clear sky-blue again', F, [('    m.emissive.set(0xa4abb0);', '    m.emissive.set(0x3a5670);')]),
    ('canopy pendants 24 m apart', F, [('  pendantSpacing: 7.5,', '  pendantSpacing: 24,')]),
    ('canopy pendants drawn as standards on the floor', F, [("instanced('lamps-pendant', pendantGeometry(),", "instanced('lamps-pendant', lampGeometry(),")]),
]
TESTS = ['web/tests/furniture.test.ts']
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'furniture') as work:
    def run():
        return kxmut.run_tests(work, TESTS, test_timeout_ms=20000, timeout=180)

    baseline = kxmut.require_green(run(), ' '.join(TESTS))
    for label, rel, pairs in M:
        try:
            with kxmut.mutated(work / rel, pairs, unique=True):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
sys.exit(tally.finish())
