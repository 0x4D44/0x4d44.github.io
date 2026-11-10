"""Mutation checks for the multi-station code (relay/areas.mjs, core/station-config.ts, core/waverley-anchors.ts,
tools/waverley-anchors.ts, web/src/stations.ts); usage: stations.py <kings-cross-src> <.scratch/output>.

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass each
command first, a mutant is killed only by a named test that fails by assertion (a load error or a crash is an ERROR,
not a kill), and every test of these files must be turned red by at least one mutation (tools/mutation/lib/kxmut.py).
A mutation given as a list of (old, new) pairs applies them together: two guards that cover for each other need both
removed before either shows."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

if len(sys.argv) != 3:
    raise SystemExit(__doc__)

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

AREAS, CONFIG, ANCHORS, CLI, STATIONS = 'relay/areas.mjs', 'core/station-config.ts', 'core/waverley-anchors.ts', 'tools/waverley-anchors.ts', 'web/src/stations.ts'
TESTS = {
    AREAS: ['relay/tests/areas.test.mjs'],
    CONFIG: ['core/tests/station-config.test.ts'],
    ANCHORS: ['core/tests/waverley-anchors.test.ts'],
    CLI: ['tools/tests/waverley-anchors.test.ts'],
    STATIONS: ['web/tests/stations.test.ts'],
}
# relay/tests/areas.test.mjs also holds the feed tests, which belong to relay/feed.mjs and its own driver
NOT_OURS = ('feed: ',)
IDENTITY = 'JSON.stringify([area, local])'
KX = "id: 'kings-cross', name: \"King's Cross\""

MUTATIONS = [
    # The TD area allowlist and the per-area data directory.
    ('area ids may be lowercase', AREAS, 'const AREA_ID = /^[A-Z0-9]{2}$/;', 'const AREA_ID = /^[A-Za-z0-9]{2}$/;'),
    ('area ids may be any length', AREAS, 'const AREA_ID = /^[A-Z0-9]{2}$/;', 'const AREA_ID = /^[A-Z0-9]+$/;'),
    ('configured entries are not trimmed', AREAS, 'const area = entry.trim();', 'const area = entry;'),
    ('the configured default is ignored', AREAS, 'areaList(value === undefined ? fallback : value)', "areaList(value === undefined ? 'Y9' : value)"),
    ('configured areas are sorted', AREAS, "throw new Error('areas: at least one area is required');\n  return result;", "throw new Error('areas: at least one area is required');\n  return result.sort();"),
    ('a default of several areas is accepted', AREAS, "if (fallbacks.length !== 1) throw new Error('areas: default area must be a single area');", ''),
    ('an unknown area is served', AREAS, "if (!allowed.has(selected)) throw new Error(`areas: unknown area ${JSON.stringify(selected)}`);", ''),
    ('a repeated area selector takes the first', AREAS, "if (selectors.length > 1) throw new Error('areas: area selector must appear only once');", ''),
    ('an empty area selector means the default', AREAS, 'const selected = selectors.length === 0 ? fallback : selectors[0];', 'const selected = selectors[0] || fallback;'),
    ('a request without a selector has no default', AREAS, 'const selected = selectors.length === 0 ? fallback : selectors[0];', 'const selected = selectors[0];'),
    ('the data directory accepts any area text', AREAS, "if (typeof area !== 'string' || !AREA_ID.test(area)) {", 'if (false) {'),
    ('other areas are stored beside Y9', AREAS, "path.join(dataDir, 'areas', area)", 'path.join(dataDir, area)'),
    ('Y9 storage moves under areas/', AREAS, "return area === 'Y9' ? dataDir : path.join(dataDir, 'areas', area);", "return path.join(dataDir, 'areas', area);"),
    # The station table.
    ("King's Cross watches a second area", CONFIG, f"{KX}, tdAreas: ['Y9'],", f"{KX}, tdAreas: ['Y9', 'WH'],"),
    ('St Pancras loses an area', CONFIG, "tdAreas: ['WH', 'X0', 'CT'],", "tdAreas: ['WH', 'X0'],"),
    ('Waverley watches the wrong area', CONFIG, "tdAreas: ['EB'],", "tdAreas: ['ED'],"),
    ("King's Cross loses its TIPLOC", CONFIG, "tiplocs: ['KNGX']", 'tiplocs: []'),
    ("King's Cross loses its STANOX", CONFIG, "stanox: ['54311']", 'stanox: []'),
    ("King's Cross gains a platform", CONFIG, 'Array.from({ length: 11 }', 'Array.from({ length: 12 }'),
    ('St Pancras loses a platform', CONFIG, 'Array.from({ length: 13 }', 'Array.from({ length: 12 }'),
    ('Waverley loses a platform', CONFIG, 'Array.from({ length: 20 }', 'Array.from({ length: 19 }'),
    ("King's Cross loses its schedule", CONFIG, "schedule: 'available', legacyLnerFallback: true", "schedule: 'unavailable', legacyLnerFallback: true"),
    ("King's Cross loses the legacy LNER fallback", CONFIG, "schedule: 'available', legacyLnerFallback: true", "schedule: 'available', legacyLnerFallback: false"),
    ('St Pancras gains a schedule', CONFIG, "schedule: 'unavailable', legacyLnerFallback: false,\n  },\n  'edinburgh-waverley'", "schedule: 'available', legacyLnerFallback: false,\n  },\n  'edinburgh-waverley'"),
    ('St Pancras gains the legacy LNER fallback', CONFIG, "schedule: 'unavailable', legacyLnerFallback: false,\n  },\n  'edinburgh-waverley'", "schedule: 'unavailable', legacyLnerFallback: true,\n  },\n  'edinburgh-waverley'"),
    ('Waverley gains the legacy LNER fallback', CONFIG, "schedule: 'unavailable', legacyLnerFallback: false,\n  },\n};", "schedule: 'unavailable', legacyLnerFallback: true,\n  },\n};"),
    ('area identities are joined with a separator', CONFIG, IDENTITY, '`${area}:${local}`'),
    ('area identities ignore the type of the local id', CONFIG, IDENTITY, 'JSON.stringify([area, String(local)])'),
    ('area identities ignore the area', CONFIG, IDENTITY, 'JSON.stringify([local])'),
    # Waverley geometry and anchors.
    ('packed format scale is not checked', ANCHORS, "scene.format !== 'waverley-varint-v1' || scene.q !== 0.1", "scene.format !== 'waverley-varint-v1'"),
    ('packed format name is not checked', ANCHORS, "scene.format !== 'waverley-varint-v1' || scene.q !== 0.1", 'scene.q !== 0.1'),
    ('packed negative deltas decode as positive', ANCHORS, 'number % 2 ? -(number + 1) / 2 : number / 2', 'number / 2'),
    ('packed coordinates are not accumulated', ANCHORS, 'x += coordinates[i]!; z += coordinates[i + 1]!;', 'x = coordinates[i]!; z = coordinates[i + 1]!;'),
    ('a truncated packed path is accepted', ANCHORS, "if (place !== 1 || coordinates.length % 2) throw new Error('Truncated Waverley path');", ''),
    ('graph nodes ignore the layer', ANCHORS, 'JSON.stringify([p[0], p[1], level])', 'JSON.stringify([p[0], p[1]])'),
    ('rails are not ordered by identity', ANCHORS, 'const rails = [...scene.rails].sort((a, b) => a.id.localeCompare(b.id));\n  if (new Set', 'const rails = [...scene.rails];\n  if (new Set'),
    ('duplicate rail identities are accepted', ANCHORS, "if (new Set(rails.map(r => r.id)).size !== rails.length) throw new Error('Duplicate Waverley rail identity');", ''),
    ('a track far from the platform is adjacent', ANCHORS, '<= 3) { adjacent = true; break; }', '<= 30) { adjacent = true; break; }'),
    ('a short stretch of track identifies the platform', ANCHORS, 'if (coverageM < Math.min(40, result.lengthM * 0.3)) continue;', ''),
    ('a track end is never a terminal candidate', ANCHORS, "[...degrees.keys()].some(n => graph.adj.get(n)?.length === 1) ? 'terminal-candidate' : 'through-or-unresolved'", "'through-or-unresolved'"),
    ('other TD areas supply platform associations', ANCHORS, "if (text(row, 'TD') !== 'EB' || text(row, 'STANME') !== 'EDINBURGH') continue;", ''),
    ('other locations supply platform associations', ANCHORS, "text(row, 'TD') !== 'EB' || text(row, 'STANME') !== 'EDINBURGH'", "text(row, 'TD') !== 'EB'"),
    ('unknown events supply platform associations', ANCHORS, "if (!platform || !['A', 'B', 'C', 'D'].includes(event)) continue;", 'if (!platform) continue;'),
    ('arrivals take the from berth', ANCHORS, "event === 'A' || event === 'C' ? 'TOBERTH' : 'FROMBERTH'", "event === 'A' || event === 'C' ? 'FROMBERTH' : 'TOBERTH'"),
    ('competing platforms are not reported', ANCHORS, 'if (refs.length > 1) {', 'if (false) {'),
    ('split faces are not reported', ANCHORS, 'if (!g && split.length) {', 'if (false) {'),
    ('several candidate tracks still place a berth', ANCHORS, 'else if (!g || g.platformIds.length !== 1 || g.candidates.length !== 1)', 'else if (!g)'),
    ('the provisional heading is not required', ANCHORS, 'else if (!options.allowProvisionalHeading) detail =', 'else if (false) detail ='),
    ('anchor uncertainty ignores the platform length', ANCHORS, 'errorM: Math.max(50, g.lengthM)', 'errorM: 50'),
    ('anchors claim a buffer platform', ANCHORS, "kind: 'smart', from: c.from, to: c.to,", "kind: 'smart', platform: ref, from: c.from, to: c.to,"),
    ('observed berths are not inventoried', ANCHORS, "for (const b of new Set([e.from, e.to, ...Object.keys(e.berths ?? {})])) if (b) inventory.set(b, (inventory.get(b) ?? 0) + (e.kind === 'step' ? 1 : 0));", ''),
    ('other areas are inventoried', ANCHORS, "if (e.area !== 'EB') continue;", ''),
    # The offline EB anchor tool.
    ('output outside .scratch is accepted', CLI, [
        ("if (!out.startsWith(scratch + path.sep)) throw new Error('Output must be inside the worktree .scratch');", ''),
        ("if (actual !== scratchReal && !actual.startsWith(scratchReal + path.sep)) throw new Error('Output resolves outside .scratch');", '')]),
    ('an output reached through a symlink out of .scratch is accepted', CLI, "if (actual !== scratchReal && !actual.startsWith(scratchReal + path.sep)) throw new Error('Output resolves outside .scratch');", ''),
    ('anchors are written through a symlink', CLI, "'anchors.json'), JSON.stringify(map, null, 2) + '\\n', { flag: 'wx', mode: 0o600 }", "'anchors.json'), JSON.stringify(map, null, 2) + '\\n', { mode: 0o600 }"),
    ('geometry is written through a symlink', CLI, "'geometry.json'), JSON.stringify(waverleyPlatformGeometry(scene), null, 2) + '\\n', { flag: 'wx', mode: 0o600 }", "'geometry.json'), JSON.stringify(waverleyPlatformGeometry(scene), null, 2) + '\\n', { mode: 0o600 }"),
    ('track is written through a symlink', CLI, "'track.json'), JSON.stringify(waverleyTrackData(scene), null, 2) + '\\n', { flag: 'wx', mode: 0o600 }", "'track.json'), JSON.stringify(waverleyTrackData(scene), null, 2) + '\\n', { mode: 0o600 }"),
    ('anchors are written readable by others', CLI, "'anchors.json'), JSON.stringify(map, null, 2) + '\\n', { flag: 'wx', mode: 0o600 }", "'anchors.json'), JSON.stringify(map, null, 2) + '\\n', { flag: 'wx', mode: 0o644 }"),
    ('geometry is written readable by others', CLI, "'geometry.json'), JSON.stringify(waverleyPlatformGeometry(scene), null, 2) + '\\n', { flag: 'wx', mode: 0o600 }", "'geometry.json'), JSON.stringify(waverleyPlatformGeometry(scene), null, 2) + '\\n', { flag: 'wx', mode: 0o644 }"),
    ('track is written readable by others', CLI, "'track.json'), JSON.stringify(waverleyTrackData(scene), null, 2) + '\\n', { flag: 'wx', mode: 0o600 }", "'track.json'), JSON.stringify(waverleyTrackData(scene), null, 2) + '\\n', { flag: 'wx', mode: 0o644 }"),
    ('a recording from another area is accepted', CLI, "if (records.some(record => !record.e || record.e.area !== 'EB')) throw new Error(`Invalid normalized recording: ${name}`);", ''),
    ('recordings of every area are read', CLI, '/^td-EB-[A-Za-z0-9_-]+\\.(?:ndjson|jsonl)(?:\\.gz)?$/', '/^td-[A-Z0-9]{2}-[A-Za-z0-9_-]+\\.(?:ndjson|jsonl)(?:\\.gz)?$/'),
    ('zipped recordings are read as text', CLI, "const decoded = name.endsWith('.gz') ? gunzipSync(bytes) : bytes;", 'const decoded = bytes;'),
    ('the unfinished last line is read', CLI, 'const completeEnd = decoded.lastIndexOf(10) + 1;', 'const completeEnd = decoded.length;'),
    ('the recordings folder inside a data root is ignored', CLI, 'if ((await stat(nested)).isDirectory()) dir = nested;', 'if ((await stat(nested)).isDirectory()) dir = selected;'),
    ('the provisional heading is on unless refused', CLI, "allowProvisionalHeading: options.get('--provisional-heading') === 'true'", "allowProvisionalHeading: options.get('--provisional-heading') !== 'false'"),
    ('any value is taken for the provisional heading', CLI, "if (options.has('--provisional-heading') && !['true', 'false'].includes(options.get('--provisional-heading')!)) throw new Error('--provisional-heading must be true or false');", ''),
    ('the OSM input hash is omitted', CLI, '`OSM input sha256 ${sha256(osmBytes)}`, ', ''),
    ('the SMART input hash is omitted', CLI, '`SMART compressed input sha256 ${sha256(smartBytes)}`, ', ''),
    # The station switcher.
    ('London GPU resources are kept', STATIONS, 'if (activeScene === london) { releaseSceneGpu(london); ++releases; }', 'if (activeScene === london) { ++releases; }'),
    ('render lists survive a scene swap', STATIONS, 'renderer.renderLists.dispose(); active = id;', 'active = id;'),
    ('London objects stay visible under another station', STATIONS, 'masked.set(object, object.visible); object.visible = false; }', 'masked.set(object, object.visible); }'),
    ('hidden London objects are not restored on return', STATIONS, "for (const [object, visible] of masked) object.visible = visible; masked.clear(); }", 'masked.clear(); }'),
    ('dispose leaves London objects hidden', STATIONS, 'placeholderScene?.dispose(); remoteId = null; for (const [object, visible] of masked) object.visible = visible;', 'placeholderScene?.dispose(); remoteId = null;'),
    ('dispose leaves the popstate listener', STATIONS, "win.removeEventListener('popstate', onPop); win.removeEventListener('resize', sizeNav);", "win.removeEventListener('resize', sizeNav);"),
    ('dispose leaves the resize listener', STATIONS, "win.removeEventListener('popstate', onPop); win.removeEventListener('resize', sizeNav);", "win.removeEventListener('popstate', onPop);"),
    ('dispose leaves the resize observer connected', STATIONS, 'cancelInput(); observer.disconnect();', 'cancelInput();'),
    ('dispose leaves the switcher in the page', STATIONS, 'nav.remove(); placeholder.remove();', 'placeholder.remove();'),
    ('dispose leaves the placeholder in the page', STATIONS, 'nav.remove(); placeholder.remove();', 'nav.remove();'),
    ('dispose leaves the station marker on the body', STATIONS, 'delete doc.body.dataset.station;', ''),
    ('dispose leaves the Waverley credit', STATIONS, 'if (groundCredit) groundCredit.textContent = londonGroundCredit;\n      nav.remove()', 'nav.remove()'),
    ('dispose keeps a pending Waverley model', STATIONS, 'pendingEdinburgh?.dispose(); pendingEdinburgh = null;\n      placeholderScene?.dispose();', 'placeholderScene?.dispose();'),
    ('a disposed switcher still changes the URL', STATIONS, 'if (disposed) return;\n    await selection.select(id);', 'await selection.select(id);'),
    ('a disposed switcher still runs frames', STATIONS, 'frame(time: number): void {\n      if (disposed) return;', 'frame(time: number): void {'),
    ('a station change pushes no history entry', STATIONS, "if (history && selection.state().selected === id) win.history.pushState(null, '', stationHref(win.location.href, id));", ''),
    ('a history entry is pushed for a station that was not reached', STATIONS, "if (history && selection.state().selected === id) win.history.pushState", 'if (history) win.history.pushState'),
    ('going back does not change the station', STATIONS, 'const onPop = (): void => { void select(stationFromSearch(win.location.search), false); };', 'const onPop = (): void => {};'),
    ('a bookmarked station is ignored', STATIONS, "if (initialId !== 'kings-cross') void select(initialId, false);", 'if (false) void select(initialId, false);'),
    ('the opening view is not framed', STATIONS, '  else pose(viewOf(initialId));', '  else {}'),
    ('station buttons do nothing', STATIONS, "button.addEventListener('click', () => { void select(station.id); });", ''),
    ('the heading keeps the previous station', STATIONS, "doc.querySelector('h1')!.textContent = STATIONS[state.selected].name;", ''),
    ('the selected button is not marked pressed', STATIONS, "button.setAttribute('aria-pressed', String(id === state.selected));", ''),
    ('the loading button is not labelled', STATIONS, " + (id === state.selected && state.phase === 'loading' ? ' · Loading…' : '')", ''),
    ('the real Waverley model is hidden behind the placeholder', STATIONS, "placeholder.hidden = !isRemote(id) || !placeholderScene?.placeholder;", "placeholder.hidden = !isRemote(id);"),
    ('the live runtime is attached to the placeholder', STATIONS, "if (!placeholderScene.placeholder) (id === 'perth' ? options.attachPerth : options.attachEdinburgh)?.(placeholderScene);", "(id === 'perth' ? options.attachPerth : options.attachEdinburgh)?.(placeholderScene);"),
    ('the live runtime is never attached', STATIONS, "if (!placeholderScene.placeholder) (id === 'perth' ? options.attachPerth : options.attachEdinburgh)?.(placeholderScene);", ''),
    ('Waverley status ignores its live runtime', STATIONS, 'placeholderScene.live?.status() ?? placeholderScene.message : options.stationStatus', 'placeholderScene.message : options.stationStatus'),
    # The sky text each station appends to its notice and to the footer status (stationSuffix).
    ('the notice drops the station sky text', STATIONS, "const text = message ? message + (options.stationSuffix?.(state.selected) ?? '') : undefined;", 'const text = message;'),
    ("the notice shows the sky text of King's Cross", STATIONS, "options.stationSuffix?.(state.selected) ?? '') : undefined;", "options.stationSuffix?.('kings-cross') ?? '') : undefined;"),
    ('the notice gains text when nothing is ready', STATIONS, "const text = message ? message + (options.stationSuffix?.(state.selected) ?? '') : undefined;", "const text = message + (options.stationSuffix?.(state.selected) ?? '');"),
    ('a notice without a sky text gains a space', STATIONS, "options.stationSuffix?.(state.selected) ?? '')", "options.stationSuffix?.(state.selected) ?? ' ')"),
    ('the status line drops the station sky text', STATIONS, "stationMessage(selection.state().selected)) + (options.stationSuffix?.(selection.state().selected) ?? ''),", 'stationMessage(selection.state().selected)),'),
    ("the status line shows the sky text of King's Cross", STATIONS, "+ (options.stationSuffix?.(selection.state().selected) ?? ''),", "+ (options.stationSuffix?.('kings-cross') ?? ''),"),
    ('a status line without a sky text gains a space', STATIONS, "+ (options.stationSuffix?.(selection.state().selected) ?? ''),", "+ (options.stationSuffix?.(selection.state().selected) ?? ' '),"),
    ("the King's Cross and Waverley status lines lose the sky text", STATIONS, [
        ("=> (selection.state().selected === 'kings-cross' ? kx", "=> selection.state().selected === 'kings-cross' ? kx"),
        ('stationMessage(selection.state().selected)) + (options', 'stationMessage(selection.state().selected) + (options')]),
    ('the ground credit does not follow the station', STATIONS, "const credit = activeScene === london ? londonGroundCredit : placeholderScene?.groundAttribution ?? 'Terrain model not loaded.';", 'const credit = londonGroundCredit;'),
    ('a portrait change does not reframe', STATIONS, 'if (camera.aspect !== viewportAspect) {', 'if (false) {'),
    ('the hop swaps scenes too early', STATIONS, 'if (t >= .5 && !hop.swapped) {', 'if (t >= .1 && !hop.swapped) {'),
    ('the hop never finishes', STATIONS, "if (t >= 1) { hop = null; renderer.domElement.style.opacity = '1'; selection.finish(); }", "if (t >= 1) { hop = null; renderer.domElement.style.opacity = '1'; }"),
    ('London roofs include the sky dome', STATIONS, 'if (box.max.y < 1000) top = Math.max(top, box.max.y);', 'top = Math.max(top, box.max.y);'),
    ('St Pancras framing ignores a narrow screen', STATIONS, 'const scale = Math.max(1, 1.3 / Math.max(.2, aspect));', 'const scale = 1;'),
]

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'stations') as work:
    suite = kxmut.Suite(work, test_timeout_ms=30000, timeout=120)
    names = set()
    for tests in TESTS.values():
        names |= {name for name in suite.baseline(tests).passed if not name.startswith(NOT_OURS)}
    for label, file, *change in MUTATIONS:
        pairs = change[0] if len(change) == 1 else [tuple(change)]
        try:
            with kxmut.mutated(work / file, pairs, unique=True):
                verdict, _run = suite.judge(TESTS[file], strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unseen = names - tally.red
print(f'{len(names) - len(unseen)}/{len(names)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or unseen else 0)
