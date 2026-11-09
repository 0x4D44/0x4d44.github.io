"""Private signal report/capture mutations; a named assertion must kill every mutation.
python3 -I -u kings-cross-src/tools/mutation/signal-report.py kings-cross-src .scratch/signals-round19/mutations
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be under worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)
R, C, F = 'tools/signal-report.ts', 'tools/signal-capture.mjs', 'tools/signal-framing.mjs'
M = [
 ('constant bits disappear', R, "const key = `${change.address}:${change.bit}`;", "if (change.from === null) continue; const key = `${change.address}:${change.bit}`;"),
 ('route drives a lamp', R, "Boolean(accepted && (accepted.kind ?? 'proceed') === 'proceed')", 'Boolean(accepted)'),
 ('unknown bit count wrong', R, 'unknownBits: bits.filter(b => !b.decoded).length', 'unknownBits: 0'),
 ('unpositioned decoded heads omitted', R, 'const decodedHeads = proceed.map(h => {', 'const decodedHeads = proceed.filter(h => headRows.some(p => p.berth === h.berth)).map(h => {'),
 ('undecoded positioned heads omitted', R, 'bits, heads: headRows, decodedHeads', 'bits, heads: headRows.filter(h => h.decoded), decodedHeads'),
 ('inferred reason erased', R, "${anchor?.evidence ?? 'anchor evidence unavailable'}", "anchor evidence unavailable"),
 ('inferred positions look reviewed', R, "source === 'private-topology' ? 'topology' : 'unreviewed'", "source === 'private-topology' ? 'topology' : 'topology'"),
 ('geographic review conflated with identity', R, "reviewed: headRows.filter(h => h.positionReview.status === 'reviewed')", "reviewed: headRows.filter(h => h.review !== 'unreviewed')"),
 ('public review evidence discarded', R, '!r.inferredPosition && publicReviewById.has(r.signal.id)', 'false'),
 ('stale public review ledger coordinates accepted', R, 'publicSignalReviewMatches(signal, candidates[0]!, rawPosition, raw !== undefined)', 'true'),
 ('position changes hidden', R, 'r.group.position.z - previousPost[1]', '0'),
 ('geographic review table omitted', R, 'for (const h of report.heads) lines.push', 'for (const h of []) lines.push'),
 ('unknown aspects hidden from report', R, 'if (!head) continue;', 'if (!head || !head.decoded) continue;'),
 ('capture intervals never close', R, 'if (endMs > interval.startMs) intervals.push', 'if (false) intervals.push'),
 ('capture forgets recording identity', R, '{ ...interval, endMs, recording }', '{ ...interval, endMs, recording: 0 }'),
 ('capture manufactures danger at byte reset', R, 'state: record.state, startMs: t', "state: record.state === 'unknown' ? 'danger' : record.state, startMs: t"),
 ('capture prefers inferred over real OSM', R, 'Number(b.headId > 0) - Number(a.headId > 0)', 'Number(a.headId > 0) - Number(b.headId > 0)'),
 ('capture time lands on interval end', R, 'interval.startMs + Math.min(500, (interval.endMs - interval.startMs) / 2)', 'interval.endMs'),
 ('unvalidated table bypasses renderer admission', R, 'const hypotheses = validatedSignalHypotheses(table, anchors.area);', 'const hypotheses = (table as {hypotheses: SignalHypothesis[]}).hypotheses;'),
 ('CLI drops last complete event', R, "bytes.subarray(0, bytes.lastIndexOf(10) + 1)", "bytes.subarray(0, bytes.lastIndexOf(10))"),
 ('CLI permits overwrite of a frozen pack', R, "flag: 'wx', mode: 0o600", "flag: 'w', mode: 0o600"),
 ('capture accepts an undecoded head', C, 'h.berth === plan.berth && h.decoded', 'h.berth === plan.berth'),
 ('capture accepts an unobserved interval', C, '!report.intervals.some(', 'false && !report.intervals.some('),
 ('capture ignores actual aspect', C, 'actual.state !== expected.state', 'false'),
 ('capture ignores actual clock', C, 'actual.timeMs !== expected.timeMs', 'false'),
 ('capture accepts an unrendered frame', C, '!actual.rendered', 'false'),
 ('capture accepts a displaced head', C, 'expected.post && (!actual.post', 'false && (!actual.post'),
 ('cancelled browser frame still fires', C, 'pending.delete(id)', 'false'),
 ('camera ignores head world facing', F, 'new T.Vector3(0, 0, 1).transformDirection(group.matrixWorld)', 'new T.Vector3(0, 0, 1)'),
 ('camera ignores scene height', F, 'camera.position.copy(focus)', 'camera.position.copy(new T.Vector3(focus.x, 0, focus.z))'),
 ('camera ignores ground height', F, 'camera.position.y = Math.max(camera.position.y, groundY + .3)', 'camera.position.y = camera.position.y'),
 ('camera ignores frame margin', F, 'Math.abs(p.x) > .88 || Math.abs(p.y) > .88', 'Math.abs(p.x) > 100 || Math.abs(p.y) > 100'),
 ('camera leaves overview orbit clamp', F, 'controls.minDistance = 0', 'controls.minDistance = 8'),
 ('camera accepts a tiny distant head', F, 'screenMaxY - screenMinY < .6', 'screenMaxY - screenMinY < 0'),
 ('camera checks only the lamp', F, 'for (const sample of samples)', "for (const sample of samples.filter(s => s.name === 'lamp'))"),
 ('camera ignores foreground occluders', F, 'hits.find(h => !belongs(h.object) && h.distance < visibleDistance - .001)', 'undefined'),
 ('camera accepts a self-obscured lamp', F, 'sample.surface && own?.object !== sample.surface', 'false'),
 ('camera loses occluder identity', F, 'const occluder = { chain, distanceM:', 'const occluder = { chain: [], distanceM:'),
 ('camera loses candidate diagnostics', F, 'error.details = {', 'error.details = null; void {'),
 ('one failed shot aborts all states', C, 'catch (error) { failed.push(', 'catch (error) { throw error; failed.push('),
 ('failed shot is silently omitted', C, 'failed.push({ ...plan, reason: error.message, details: error.details ?? null })', 'void 0'),
 ('fallback never tries another head', C, 'seen.add(i.headId);result.push(', 'seen.add(i.headId);continue;result.push('),
 ('fallback admits undecoded heads', C, 'h.id === i.headId && h.berth === i.berth && h.decoded', 'h.id === i.headId && h.berth === i.berth'),
 ('missing state is success', C, 'exitCode: missingStates.length ? 1 : 0', 'exitCode: 0'),
 ('camera accepts a fully blocked head', F, 'throw error;', 'return { visibility: { clear: false } };'),
 ('shot accepts an obstructed head', C, '!actual.visibility?.clear', 'false'),
 ('profile removal races browser exit', C, 'exited = await new Promise(resolve => {', 'exited = true; void new Promise(resolve => {'),
 ('profile cleanup warnings erased', C, 'warnings.push(message)', 'void 0'),
 ('stuck browser never escalated', C, "['SIGTERM', 'SIGKILL']", "['SIGTERM']"),
 ('live browser profile removed', C, 'if (!exited) note(', 'if (false) note('),
 ('frozen table endpoint serves anchors', C, "type:'application/json', body:frozen.table", "type:'application/json', body:frozen.anchors"),
 ('frozen input hash unchecked', C, '!== entry.sha256)', '!== entry.sha256 && false)'),
 ('frozen input accepts traversal', C, "path.basename(entry.file) !== entry.file", 'false'),
 ('CDP response lost', C, 'p.resolve(m.result)', 'p.resolve({})'),
]

def run(root, target=None, cli=False):
    command=['node','--test','--test-reporter=tap','--test-timeout=20000']
    if target:
        if cli: command+=['--test-name-pattern=signal report CLI']
        else: command+=['--test-skip-pattern=signal report CLI']
    if target==R: command+=['kings-cross-src/core/tests/signal-report.test.ts']
    elif target in (C,F): command+=['kings-cross-src/tools/tests/signal-capture.test.mjs']
    else: command+=['kings-cross-src/core/tests/signal-report.test.ts','kings-cross-src/tools/tests/signal-capture.test.mjs']
    return subprocess.run(command,cwd=root,capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=60)

with tempfile.TemporaryDirectory(prefix='signal-report-',dir=scratch) as tmp:
    root=Path(tmp);pkg=root/'kings-cross-src'
    for name in ['core','web','tools']:
        shutil.copytree(src/name,pkg/name)
    shutil.copy2(src/'package.json',pkg/'package.json')
    (pkg/'node_modules').symlink_to(src/'node_modules',target_is_directory=True)
    (root/'.scratch').mkdir()
    baseline=run(root)
    if baseline.returncode: print(baseline.stdout,baseline.stderr);raise SystemExit('baseline must pass')
    names=set(re.findall(r'^ok \d+ - (.+)$',baseline.stdout,re.M));seen=set();survivors=[]
    expected={}
    for target,cli in [(R,False),(R,True),(C,False),(F,False)]:
        selected=run(root,target,cli)
        if selected.returncode or selected.stderr:raise SystemExit('selected baseline must pass')
        expected[target,cli]=set(re.findall(r'^ok \d+ - (.+)$',selected.stdout,re.M))
    for index,(label,target,old,new) in enumerate(M):
        original=(src/target).read_text()
        if old not in original: raise SystemExit(f'missing mutation pattern: {label}')
        (pkg/target).write_text(original.replace(old,new,1))
        result=run(root,target,label.startswith('CLI'))
        failed=set()
        for block in re.split(r'(?=^not ok \d+ - )',result.stdout,flags=re.M)[1:]:
            block=re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)',block,maxsplit=1,flags=re.M)[0]
            name=re.match(r'not ok \d+ - ([^\n]+)',block)
            if name and 'ERR_ASSERTION' in block:failed.add(name[1])
        (pkg/target).write_text(original)
        selected_names=expected[target,label.startswith('CLI')]
        actual_names=set(re.findall(r'^(?:ok|not ok) \d+ - (.+)$',result.stdout,re.M))
        named_failures=set(re.findall(r'^not ok \d+ - (.+)$',result.stdout,re.M))
        total=re.search(r'^# tests (\d+)$',result.stdout,re.M)
        complete=total and int(total[1])==len(selected_names) and actual_names==selected_names
        if result.returncode and failed and failed==named_failures and complete and not result.stderr:
            seen.update(failed);print(f'[CAUGHT] {label}: {sorted(failed)}',flush=True)
        else:
            survivors.append(label);(scratch/f'{index:02d}.log').write_text(result.stdout+result.stderr);print(f'[SURVIVED] {label}',flush=True)
    print(f'{len(M)-len(survivors)}/{len(M)} caught; survivors: {survivors}')
    print(f'{len(names&seen)}/{len(names)} tests observed failing; never failed: {sorted(names-seen)}')
    raise SystemExit(1 if survivors or names-seen else 0)
