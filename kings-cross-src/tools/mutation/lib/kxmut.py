"""Shared harness for the mutation drivers in the directory above. It is imported, never run.

A driver copies the package, breaks one thing on purpose and asks the tests whether they noticed. That
only means something if three things hold, and each used to be left to the individual driver:

* the copy can resolve what the tests import (`copy_package` links the real node_modules);
* the UNMODIFIED copy passes the exact command the mutants will use (`require_green`), so a copy that is
  broken before any mutation stops the driver instead of "killing" every mutant;
* a kill is a named test failing, never a load or crash error (`judge`): a module that cannot be
  resolved, a mutant that no longer parses, a test file that dies, a hang or a missing run are ERRORS.

It lives in lib/ because the evidence pack requires every `*.py` directly in tools/mutation/ to be a
documented driver. Drivers add this directory to sys.path themselves (`python3 -I` does not):

    import sys; from pathlib import Path
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
    import kxmut
"""
from __future__ import annotations

import contextlib
import os
import re
import shutil
import signal
import subprocess
import tempfile
from pathlib import Path

# Never copied into a mutation workspace. node_modules is linked instead of copied.
JUNK = ('node_modules', '.git', '.scratch', 'dist', 'coverage', '__pycache__')

# Resolution failures: the copy lacks something a test imports. They say the copy cannot run, not that a test noticed.
MODULE_ERROR = re.compile(
    r'ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_UNSUPPORTED_DIR_IMPORT|'
    r'ERR_REQUIRE_ESM|ERR_INVALID_MODULE_SPECIFIER|ERR_(?:UNSUPPORTED|INVALID)_TYPESCRIPT_SYNTAX|'
    r'Cannot find (?:module|package)')
# Also a file that no longer parses. Only meaningful for a test FILE that died: a named test that fails with a
# SyntaxError (it parsed data the mutant corrupted, or asserts on an error message) is a test noticing.
ENV_ERROR = re.compile(MODULE_ERROR.pattern + r'|SyntaxError')

KILLED, SURVIVED, ERROR, TIMEOUT = 'KILLED', 'SURVIVED', 'ERROR', 'TIMEOUT'


class StalePattern(Exception):
    """A mutation's search text is no longer in the file: the driver is out of date, not the tests."""


# --------------------------------------------------------------------------------------- workspaces

def copy_package(src, dest):
    """Copy the whole package at `src` to the fresh directory `dest` and link the real node_modules into it.

    Everything is copied, not a hand-picked list: a list that falls behind the tests' imports is how a copy comes to
    fail to load. The baseline run is what proves the copy is complete.
    """
    src, dest = Path(src).resolve(), Path(dest)
    if dest.exists():
        raise SystemExit(f'{dest} already exists; a mutation workspace is always fresh')
    modules = src / 'node_modules'
    if not modules.is_dir():
        raise SystemExit(f'{modules} is missing; run `npm ci` in {src} first (the copies link it)')
    shutil.copytree(src, dest, ignore=shutil.ignore_patterns(*JUNK))
    (dest / 'node_modules').symlink_to(modules.resolve(), target_is_directory=True)
    return dest


@contextlib.contextmanager
def workspace(src, scratch, prefix):
    """A fresh copy of the package at `<scratch>/<prefix>-xxxx/kings-cross-src`, removed on exit.

    The folder is still called kings-cross-src because some tests expect the package to sit under a repository.
    """
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix=prefix + '-', dir=scratch))
    try:
        (root / '.scratch').mkdir()  # tools that write evidence insist on a worktree .scratch beside the package
        yield copy_package(src, root / 'kings-cross-src')
    finally:
        shutil.rmtree(root, ignore_errors=True)


@contextlib.contextmanager
def mutated(path, replacements, *, every=False, unique=False):
    """Apply [(old, new), ...] to the file at `path` for the duration of the block, then restore it.

    Raises StalePattern before touching the file when any `old` is absent (or, with `unique`, not found exactly
    once). `every` replaces all matches.
    """
    path = Path(path)
    original = path.read_text()
    text = original
    for old, new in replacements:
        if old not in text:
            raise StalePattern(f'{path.name}: {old[:90]!r} not found')
        if unique and text.count(old) != 1:
            raise StalePattern(f'{path.name}: {old[:90]!r} found {text.count(old)} times, expected exactly once')
        text = text.replace(old, new) if every else text.replace(old, new, 1)
    path.write_text(text)
    try:
        yield
    finally:
        path.write_text(original)


# ------------------------------------------------------------------------------------------ running

class Run:
    """One finished child process."""

    def __init__(self, argv, returncode, stdout, stderr, expired):
        self.argv, self.returncode, self.stdout, self.stderr, self.expired = argv, returncode, stdout, stderr, expired

    @property
    def text(self):
        return self.stdout + self.stderr

    def tail(self, limit=3000):
        return self.text[-limit:]


def run_command(work, argv, *, timeout=60, env=None):
    """Run argv in `work` with stdin closed, in its own process group so a hang cannot outlive the timeout."""
    env = dict(os.environ if env is None else env)
    # A driver started from inside a node test would otherwise hand its children the parent runner's context,
    # and `node --test` refuses to run files when it believes it is nested ("ran no tests").
    env.pop('NODE_TEST_CONTEXT', None)
    process = subprocess.Popen(argv, cwd=work, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               encoding='utf-8', errors='replace', start_new_session=True, env=env)
    expired = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        expired = True
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate(timeout=10)
    return Run(list(argv), process.returncode, stdout, stderr, expired)


class Result:
    """One TAP result line with the fields of its YAML block."""

    def __init__(self, name, ok, depth, fields, block, skipped=False):
        self.name, self.ok, self.depth, self.fields, self.block, self.skipped = name, ok, depth, fields, block, skipped

    @property
    def code(self):
        return self.fields.get('code')

    @property
    def failure_type(self):
        return self.fields.get('failureType')

    @property
    def aggregate(self):
        """A parent that failed only because a child did; the child is the evidence."""
        return self.failure_type == 'subtestsFailed'

    @property
    def crash(self):
        """The test FILE died (it could not load, or its process exited): no named test is to blame.

        An exception that escaped while a named test was running is that test failing, not a crash.
        """
        if 'exitCode' in self.fields:
            return True
        return self.failure_type in ('uncaughtException', 'unhandledRejection') and bool(re.search(r'\.[cm]?[jt]s$', self.name))

    @property
    def timeout(self):
        return self.failure_type in ('testTimeoutFailure', 'cancelledByParent')

    @property
    def assertion(self):
        return self.code == 'ERR_ASSERTION'


_RESULT = re.compile(r'^((?:    )*)(not )?ok (\d+) - (.*)$')
_DIRECTIVE = re.compile(r' # (?:SKIP|TODO)\b.*$')
_COUNT = re.compile(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$')


def parse_tap(text):
    """Return ([Result...], {tests, pass, fail, ...}) from a `node --test --test-reporter=tap` stream."""
    lines, results, summary, i = text.splitlines(), [], {}, 0
    while i < len(lines):
        line = lines[i]
        found = _RESULT.match(line)
        if not found:
            count = _COUNT.match(line)
            if count:
                summary[count.group(1)] = int(count.group(2))
            i += 1
            continue
        indent, name, skipped = found.group(1), _DIRECTIVE.sub('', found.group(4)), bool(_DIRECTIVE.search(found.group(4)))
        fields, block, j = {}, [], i + 1
        if j < len(lines) and lines[j] == indent + '  ---':
            key = re.compile('^' + re.escape(indent) + r"  ([A-Za-z_]+): ?(.*)$")
            j += 1
            while j < len(lines) and lines[j] != indent + '  ...':
                block.append(lines[j])
                entry = key.match(lines[j])
                if entry:
                    fields[entry.group(1)] = entry.group(2).strip().strip('\'"')
                j += 1
            j += 1
        results.append(Result(name, found.group(2) is None, len(indent) // 4, fields, '\n'.join(block), skipped))
        i = j
    return results, summary


class TestRun(Run):
    """A `node --test` run with its TAP parsed."""

    def __init__(self, run):
        super().__init__(run.argv, run.returncode, run.stdout, run.stderr, run.expired)
        self.results, self.summary = parse_tap(run.stdout)

    @property
    def names(self):
        return {r.name for r in self.results}

    @property
    def passed(self):
        """Names of the tests that ran and passed (a skipped test proves nothing)."""
        return {r.name for r in self.results if r.ok and not r.skipped}

    @property
    def failures(self):
        return [r for r in self.results if not r.ok and not r.aggregate]

    @property
    def failed_names(self):
        return [r.name for r in self.failures]

    @property
    def green(self):
        return (not self.expired and self.returncode == 0 and bool(self.results) and not self.failures
                and self.summary.get('fail', 0) == 0 and self.summary.get('cancelled', 0) == 0
                and self.summary.get('tests', 0) > 0)


def run_tests(work, files, *, name_patterns=(), skip_patterns=(), test_timeout_ms=20000, timeout=120, extra=()):
    """`node --test` over `files` in `work`, TAP on stdout. One call is one "test command" for baselines.

    There is deliberately no --test-force-exit: it ends a test file's process as soon as its tests are done, which
    can cut off the report of a test that is failing. The file then shows up as a crash with no failing test to name,
    and whether that happens depends on load, so a real kill would flicker between KILLED and ERROR.
    """
    argv = ['node', '--test', '--test-reporter=tap', f'--test-timeout={test_timeout_ms}']
    argv += [f'--test-name-pattern={p}' for p in name_patterns]
    argv += [f'--test-skip-pattern={p}' for p in skip_patterns]
    argv += [*extra, *files]
    return TestRun(run_command(work, argv, timeout=timeout))


def env_error(text, pattern=ENV_ERROR):
    """The first load/resolution/parse failure line in `text`, or None."""
    for line in text.splitlines():
        if pattern.search(line):
            return line.strip().lstrip('#').strip()[:200]
    return None


# ------------------------------------------------------------------------------------------ baseline

class Baseline:
    """What the unmodified copy ran and passed, for the exact command that will be used on mutants."""

    def __init__(self, run, what):
        self.what, self.names, self.passed = what, run.names, run.passed


def require_green(run, what):
    """Stop the driver, loudly, unless the unmodified copy passed. Returns the Baseline to judge mutants against."""
    if run.green:
        return Baseline(run, what)
    if run.expired:
        reason = 'timed out'
    elif not run.results:
        reason = 'ran no tests' if run.returncode == 0 else f'exit {run.returncode} with no test results'
    else:
        reason = ('failing: ' + '; '.join(run.failed_names[:6])) if run.failures else f'exit {run.returncode}, summary {run.summary}'
    raise SystemExit(f'BASELINE NOT GREEN ({what}): {reason}\n'
                     f'  command: {" ".join(run.argv)}\n  first problem: {env_error(run.text) or "(none recognised)"}\n'
                     f'--- output tail ---\n{run.tail()}\n'
                     'Unmodified code must pass before any mutation counts; nothing was mutated.')


# ---------------------------------------------------------------------------------------- verdicts

class Verdict:
    def __init__(self, kind, detail='', failed=()):
        self.kind, self.detail, self.failed = kind, detail, list(failed)

    def __repr__(self):
        return f'Verdict({self.kind}, {self.detail!r}, {self.failed!r})'


def judge(run, baseline=None, *, strict=False, block_markers=None):
    """Decide what a MUTANT run means.

    KILLED needs at least one named test to fail and nothing else wrong. `strict='any'` also needs one of the
    failures to be an assertion; `strict=True` (or 'all') needs every failure to be one. A test file that dies, a
    load or syntax error, a run with no results, a run that did not run the baseline's tests, or a non-zero exit
    with no failing test is an ERROR, never a kill. A hang is a TIMEOUT.
    """
    if run.expired:
        return Verdict(TIMEOUT, 'timed out')
    failures = run.failures
    if not run.results:
        return Verdict(ERROR, f'exit {run.returncode} with no test results: {env_error(run.text) or run.tail(200).strip()}')
    if run.returncode == 0 and not failures:
        if baseline is not None and run.names != baseline.names:
            return Verdict(ERROR, 'passed but ran different tests from the baseline: '
                           + ', '.join(sorted(run.names ^ baseline.names)[:3]))
        return Verdict(SURVIVED)
    crashed = [r for r in failures if r.crash]
    if crashed:
        first = crashed[0]
        how = ', '.join(f'{k} {first.fields[k]}' for k in ('failureType', 'exitCode', 'signal', 'code') if k in first.fields)
        return Verdict(ERROR, f'{first.name}: test file crashed ({how}){(": " + env_error(run.text)) if env_error(run.text) else ""}')
    if any(r.timeout for r in failures):
        return Verdict(TIMEOUT, 'a test timed out')
    for r in failures:
        problem = env_error(r.block, MODULE_ERROR)
        if problem:
            return Verdict(ERROR, f'{r.name}: {problem}')
        if block_markers and re.search(block_markers, r.block):
            return Verdict(ERROR, f'{r.name}: failed on {re.search(block_markers, r.block).group(0)}, which is the environment, not a test')
    if not failures:
        return Verdict(ERROR, f'exit {run.returncode} but no test failed')
    asserted = [r for r in failures if r.assertion]
    if strict == 'any' and not asserted:
        return Verdict(ERROR, f'{failures[0].name}: failed by {failures[0].fields.get("name", "an exception")}, not by an assertion')
    if strict in (True, 'all') and len(asserted) != len(failures):
        other = next(r for r in failures if not r.assertion)
        return Verdict(ERROR, f'{other.name}: failed by {other.fields.get("name", "an exception")}, not by an assertion')
    chosen = asserted or failures
    note = '' if asserted else f' (threw {chosen[0].fields.get("name", "an exception")}, not an assertion)'
    return Verdict(KILLED, chosen[0].name + note, [r.name for r in failures])


def judge_cli(run, *, fail_marker):
    """Decide what a mutant run of a command-line CHECK means (a tool that exits non-zero and prints a failure
    report when its own comparison fails). Only that report is a kill: a crash exits non-zero too."""
    if run.expired:
        return Verdict(TIMEOUT, 'timed out')
    if run.returncode == 0:
        return Verdict(SURVIVED)
    problem = env_error(run.text)
    if problem:
        return Verdict(ERROR, problem)
    if fail_marker not in run.stdout:
        return Verdict(ERROR, f'exit {run.returncode} without the tool\'s own failure report: {run.tail(200).strip()}')
    first = run.stdout.split(fail_marker, 1)[1].strip().splitlines()[0].strip()
    return Verdict(KILLED, first[:160], [first])


class Suite:
    """The test commands a driver runs in one workspace, each with the baseline of its unmodified copy.

    Call `baseline(...)` for every distinct command BEFORE the first mutation; `judge(...)` refuses to judge
    a command whose baseline was never taken, because a baseline taken after the file was mutated proves nothing.
    """

    def __init__(self, work, *, cwd=None, test_timeout_ms=20000, timeout=120, extra=()):
        # `cwd` is where node runs when that is not the package itself (the evidence-pack test runs from its parent).
        self.work, self.cwd, self.test_timeout_ms, self.timeout, self.extra = work, cwd or work, test_timeout_ms, timeout, tuple(extra)
        self._baselines = {}

    @staticmethod
    def _key(files, name_patterns, skip_patterns):
        return (tuple(files), tuple(name_patterns), tuple(skip_patterns))

    def run(self, files, name_patterns=(), skip_patterns=()):
        return run_tests(self.cwd, files, name_patterns=name_patterns, skip_patterns=skip_patterns,
                         test_timeout_ms=self.test_timeout_ms, timeout=self.timeout, extra=self.extra)

    def baseline(self, files, name_patterns=(), skip_patterns=()):
        key = self._key(files, name_patterns, skip_patterns)
        if key not in self._baselines:
            what = ' '.join([*files, *(f'--test-name-pattern={p}' for p in name_patterns)])
            self._baselines[key] = require_green(self.run(files, name_patterns, skip_patterns), what)
        return self._baselines[key]

    def judge(self, files, name_patterns=(), skip_patterns=(), *, strict=False, block_markers=None):
        """Run the command on the (mutated) workspace and decide. Returns (verdict, run)."""
        key = self._key(files, name_patterns, skip_patterns)
        if key not in self._baselines:
            raise SystemExit(f'no baseline was taken for {files} {list(name_patterns)}; call baseline() before mutating')
        run = self.run(files, name_patterns, skip_patterns)
        return judge(run, self._baselines[key], strict=strict, block_markers=block_markers), run


# ----------------------------------------------------------------------------------------- reporting

class Tally:
    """One line per mutation and a summary the evidence pack and axis 07 evidence can parse.

    The summary is `N/M mutations caught`; every survivor is listed as `  NOT CAUGHT: label` and every
    error as `  ERROR: label: why`. Errors and timeouts are not caught.
    """

    def __init__(self, known_equivalent=(), timeout_is_caught=False):
        self.caught, self.survived, self.errors, self.red, self.timeouts = [], [], [], set(), []
        self.known_equivalent = set(known_equivalent)
        # live.py and relay.py have always reported a hang as "caught with timeout" and counted it; they keep doing so.
        self.timeout_is_caught = timeout_is_caught

    def record(self, label, verdict):
        if verdict.kind == KILLED:
            self.caught.append(label)
            self.red.update(verdict.failed)
            print(f'[KILLED  ] {label} <- {verdict.detail}', flush=True)
        elif verdict.kind == SURVIVED:
            self.survived.append(label)
            print(f'[SURVIVED] {label}', flush=True)
        elif verdict.kind == TIMEOUT and self.timeout_is_caught:
            self.caught.append(label)
            self.timeouts.append(label)
            print(f'[CAUGHT WITH TIMEOUT] {label}: {verdict.detail}', flush=True)
        else:
            self.errors.append((label, verdict.detail))
            print(f'[{verdict.kind:<8}] {label}: {verdict.detail}', flush=True)
        return verdict

    def stale(self, label, error):
        self.errors.append((label, str(error)))
        print(f'[ERROR   ] {label}: mutation pattern is stale: {error}', flush=True)

    def finish(self):
        """Print the summary and return the exit status: 0 only when every mutation was caught, apart from
        survivors the driver has documented as equivalent."""
        total = len(self.caught) + len(self.survived) + len(self.errors)
        print(f'\n{len(self.caught)}/{total} mutations caught', flush=True)
        if self.timeout_is_caught:
            print(f'{len(self.timeouts)} caught with timeout', flush=True)
        for label in self.survived:  # exactly `NOT CAUGHT: label`: the evidence pack matches documented equivalents by label
            print(f'  NOT CAUGHT: {label}')
        for label, why in self.errors:
            print(f'  ERROR: {label}: {why}')
        unexpected = [label for label in self.survived if label not in self.known_equivalent]
        return 1 if unexpected or self.errors or not total else 0
