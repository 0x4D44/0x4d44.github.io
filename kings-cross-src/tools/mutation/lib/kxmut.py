"""Shared harness for the mutation drivers in the directory above. It is imported, never run.

A driver copies the package, breaks one thing on purpose and asks the tests whether they noticed. That
only means something if three things hold, and each used to be left to the individual driver:

* the copy can resolve what the tests import (`copy_package` links the real node_modules);
* the UNMODIFIED copy passes the exact command the mutants will use (`require_green`), so a copy that is
  broken before any mutation stops the driver instead of "killing" every mutant;
* a kill is a named test failing, never a load or crash error (`judge`): a module that cannot be
  resolved, a mutant that no longer parses, a test file that dies, a hang or a missing run are ERRORS;
* a mutant that hangs, allocates without bound or prints without end costs one bounded run, never the
  machine (`run_command`): every run is its own process group, killed whole on a timeout, past a memory
  cap or past an output cap, and no process of it outlives the run (see LIMITS below).

It lives in lib/ because the evidence pack requires every `*.py` directly in tools/mutation/ to be a
documented driver. Drivers add this directory to sys.path themselves (`python3 -I` does not):

    import sys; from pathlib import Path
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
    import kxmut

A driver that keeps its own counting still takes the limits by running its test command through
`run_process`, a drop-in for `subprocess.run(..., capture_output=True, text=True, timeout=...)`.
"""
from __future__ import annotations

import atexit
import contextlib
import ctypes
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

# Never copied into a mutation workspace. node_modules is linked instead of copied.
JUNK = ('node_modules', '.git', '.scratch', 'dist', 'coverage', '__pycache__')

# LIMITS on every process tree `run_command` starts. A mutant that loops and allocates once left orphaned `node --test`
# workers holding hundreds of GB between them (the machine ran out of memory), so these are not optional:
#   * every node it starts gets --max-old-space-size=HEAP_MB (NODE_OPTIONS), so a runaway script heap aborts that process;
#   * a watchdog sums the tree's memory every POLL_SECONDS (physical footprint on macOS: resident, compressed and swapped
#     pages together, which is what the kernel kills for; resident size elsewhere) and kills the tree past MEMORY_CAP;
#   * the same watchdog kills it past OUTPUT_CAP bytes of stdout and stderr together (they go to temporary files, not to
#     the driver's memory);
#   * a run that ends, however it ends, takes every process still left in its tree with it.
# MEMORY_CAP is 4 GB. A mutation driver runs a handful of test files (a whole test directory at once peaks at 0.9 to 2.6 GB
# and the whole suite, 143 files and 1,740 tests, at 3.3 GB, on the 18-core Mac this was measured on), so a run past 4 GB is a
# runaway. A fast allocator (a typed array filled in a loop: several GB a second) overshoots the cap by up to a gigabyte
# between two polls, so the cap sits that far below the 6 GB at which the fleet's guard kills any `node --test` process: the
# harness decides first and says why (OVERCAP), and does not rely on the guard.
# KXMUT_MEMORY_CAP_GB, KXMUT_HEAP_MB and KXMUT_OUTPUT_CAP_MB override the defaults for a machine that needs other numbers.
def _setting(name, default):
    try:
        return type(default)(os.environ[name]) if os.environ.get(name) else default
    except ValueError:
        raise SystemExit(f'{name}={os.environ[name]!r} is not a number')


HEAP_MB = _setting('KXMUT_HEAP_MB', 4096)
MEMORY_CAP = int(_setting('KXMUT_MEMORY_CAP_GB', 4.0) * 1024 ** 3)
OUTPUT_CAP = int(_setting('KXMUT_OUTPUT_CAP_MB', 64.0) * 1024 ** 2)
POLL_SECONDS = 0.25
# Past this share of the memory cap the watchdog looks every FAST_POLL_SECONDS: a fast allocator should not get a whole poll to itself.
FAST_POLL_SHARE = 0.25
FAST_POLL_SECONDS = 0.1

# Resolution failures: the copy lacks something a test imports. They say the copy cannot run, not that a test noticed.
MODULE_ERROR = re.compile(
    r'ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_UNSUPPORTED_DIR_IMPORT|'
    r'ERR_REQUIRE_ESM|ERR_INVALID_MODULE_SPECIFIER|ERR_(?:UNSUPPORTED|INVALID)_TYPESCRIPT_SYNTAX|'
    r'Cannot find (?:module|package)')
# Also a file that no longer parses. Only meaningful for a test FILE that died: a named test that fails with a
# SyntaxError (it parsed data the mutant corrupted, or asserts on an error message) is a test noticing.
ENV_ERROR = re.compile(MODULE_ERROR.pattern + r'|SyntaxError')

KILLED, SURVIVED, ERROR, TIMEOUT, OVERCAP = 'KILLED', 'SURVIVED', 'ERROR', 'TIMEOUT', 'OVERCAP'


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
    """One finished process tree.

    `expired` is true when the harness ended the run itself; `reason` then says why: 'time' (out of time), 'memory' (the
    tree held more than the cap) or 'output' (it wrote more than the cap). `peak` is the most memory the watchdog saw the
    tree hold, in bytes (a run shorter than one poll is never measured). `survivors` lists any process of the tree that
    could not be killed (it should always be empty).
    """

    def __init__(self, argv, returncode, stdout, stderr, expired, *, reason=None, peak=0, seconds=0.0, timeout=None, cap=None, survivors=()):
        self.argv, self.returncode, self.stdout, self.stderr, self.expired = argv, returncode, stdout, stderr, expired
        self.reason = reason or ('time' if expired else None)
        self.peak, self.seconds, self.timeout, self.cap, self.survivors = peak, seconds, timeout, cap, list(survivors)

    @property
    def text(self):
        return self.stdout + self.stderr

    @property
    def overcap(self):
        """Killed for what it held or wrote, not for how long it took."""
        return self.reason in ('memory', 'output')

    def limit_note(self):
        """One line on why the harness ended the run (empty when it did not)."""
        if self.reason == 'memory':
            return f'the process tree held {_gb(self.peak)} against a cap of {_gb(self.cap)} after {self.seconds:.1f} s and was killed'
        if self.reason == 'output':
            return f'the process tree wrote more than {_gb(self.cap, mega=True)} of output in {self.seconds:.1f} s and was killed'
        if self.reason == 'time':
            return f'timed out after {self.timeout} s'
        return ''

    def tail(self, limit=3000):
        return self.text[-limit:]


def _gb(n, mega=False):
    return f'{n / 1024 ** 2:.0f} MB' if mega or (n or 0) < 1024 ** 3 else f'{(n or 0) / 1024 ** 3:.1f} GB'


def _process_table():
    """{pid: (ppid, pgid, resident bytes, start time)} for every process on the machine ({} when `ps` cannot say)."""
    try:
        text = subprocess.run(['ps', '-A', '-o', 'pid=,ppid=,pgid=,rss=,lstart='], capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    table = {}
    for line in text.splitlines():
        parts = line.split(None, 4)
        if len(parts) == 5 and all(part.isdigit() for part in parts[:4]):
            pid, ppid, pgid, rss = map(int, parts[:4])
            table[pid] = (ppid, pgid, rss * 1024, parts[4].strip())  # the start time tells a process from a later one with the same pid
    return table


def _tree(leader, table, alive=True):
    """The pids of the tree `leader` started: its whole process group, and everything below any of those (a child that
    left the group, as a daemon does, still belongs to the run that started it). The leader's own pid counts only while
    it is `alive`, that is not yet reaped: after that the number could belong to anyone, though a group id never does."""
    members = {pid for pid, (_ppid, pgid, _rss, _started) in table.items() if pgid == leader}
    if alive and leader in table:
        members.add(leader)
    children = {}
    for pid, (ppid, _pgid, _rss, _started) in table.items():
        children.setdefault(ppid, []).append(pid)
    queue = list(members)
    while queue:
        for child in children.get(queue.pop(), ()):
            if child not in members:
                members.add(child)
                queue.append(child)
    return members


def _load_footprint():
    """pid -> physical footprint in bytes where the system can say: on macOS resident, compressed and swapped pages
    together (a runaway process is mostly compressed, so its resident size understates it by orders of magnitude);
    on Linux resident and swapped. None elsewhere."""
    if sys.platform == 'darwin':
        try:
            call = ctypes.CDLL('/usr/lib/libproc.dylib').proc_pid_rusage
            call.argtypes, call.restype = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p], ctypes.c_int
        except (OSError, AttributeError):
            return None

        def footprint(pid):
            info = (ctypes.c_uint64 * 64)()  # flavour 0, rusage_info_v0: ri_uuid[16], then nine 64-bit counters, the ninth ri_phys_footprint
            return int(info[9]) if call(pid, 0, info) == 0 else None
        return footprint
    if sys.platform.startswith('linux'):
        def footprint(pid):
            try:
                status = Path(f'/proc/{pid}/status').read_text()
            except OSError:
                return None
            return sum(int(m.group(1)) * 1024 for m in re.finditer(r'^(?:VmRSS|VmSwap):\s+(\d+) kB', status, re.M))
        return footprint
    return None


_FOOTPRINT = _load_footprint()


def _usage(members, table):
    """What the processes in `members` hold between them, in bytes: the larger of ps's resident size and the footprint."""
    total = 0
    for pid in members:
        resident = table[pid][2] if pid in table else 0
        total += max(resident, (_FOOTPRINT(pid) or 0) if _FOOTPRINT else 0)
    return total


_HEAP_OPTION = re.compile(r'--max[-_]old[-_]space[-_]size[= ](\d+)')


def _node_options(existing, heap_mb):
    """NODE_OPTIONS with a heap cap of at most `heap_mb`: the caller's own --max-old-space-size stays when it is the smaller,
    and is lowered to ours when it is the larger (an environment must not be able to lift the cap)."""
    options = (existing or '').strip()
    if not heap_mb:
        return options
    if _HEAP_OPTION.search(options):
        return _HEAP_OPTION.sub(lambda found: f'--max-old-space-size={min(int(found.group(1)), int(heap_mb))}', options)
    return f'{options} --max-old-space-size={int(heap_mb)}'.strip()


def _read(file, cap):
    """The text a run wrote to `file`; a runaway one is cut to its first and last megabyte so the driver never holds it."""
    size = os.fstat(file.fileno()).st_size
    file.seek(0)
    if size <= cap:
        return file.read().decode('utf-8', 'replace')
    keep = min(1024 ** 2, size // 2)
    head = file.read(keep)
    file.seek(size - keep)
    return head.decode('utf-8', 'replace') + f'\n[... {size - 2 * keep} bytes of output left out ...]\n' + file.read().decode('utf-8', 'replace')


def _kill_tree(process, seen=None):
    """Take every process of the tree `process` leads down, whether the leader is still running or not, and wait until
    none is left. Returns the pids that would not die (none, in practice).

    The tree is read BEFORE anything is signalled: once the leader is dead its children are re-parented, and a child that
    had left the group (as a daemon does) could no longer be traced back to the run that started it. `seen` is what the
    watchdog saw of the tree while it ran, {pid: start time}: a process that was in it and is still alive (the same one,
    by start time) goes too, wherever it has got to since. A daemon that came and went between two polls is out of reach."""
    leader = process.pid
    deadline = time.monotonic() + 10
    while True:
        table = _process_table()
        left = _tree(leader, table, alive=process.returncode is None)
        left |= {pid for pid, started in (seen or {}).items() if pid in table and table[pid][3] == started}
        left -= {leader}
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(leader, signal.SIGKILL)
        for pid in left:
            with contextlib.suppress(ProcessLookupError, PermissionError):
                os.kill(pid, signal.SIGKILL)
        if process.returncode is None:
            with contextlib.suppress(subprocess.TimeoutExpired):
                process.wait(timeout=1)
        if (not left or not table) and process.returncode is not None:
            return []
        if time.monotonic() > deadline:
            return sorted(left)
        time.sleep(0.05)


def _exit_on_signal(signum, _frame):
    raise SystemExit(128 + signum)


def _end_on_termination():
    """While a run is in flight, a SIGTERM or SIGHUP to the driver (whatever launched it timing out, a closed terminal)
    ends the driver through the `finally` of `run_command`, so the run's tree dies with it. Each run is a session of its
    own, so a signal sent to the driver's group would not reach it. Returns {signal: previous handler} to restore."""
    if threading.current_thread() is not threading.main_thread():
        return {}
    return {signum: signal.signal(signum, _exit_on_signal) for signum in (signal.SIGTERM, signal.SIGHUP)}


_STATS = {'runs': 0, 'peak': 0, 'cap': MEMORY_CAP, 'command': ''}


@atexit.register
def _report_headroom():
    """One line on stderr when a driver ends: how much memory its biggest run held against the cap, so a cap that is
    too tight (or far too loose) for the machine shows up in the log before a legitimate run is killed for it."""
    if _STATS['runs']:
        print(f'kxmut: {_STATS["runs"]} test runs; the largest tree held {_gb(_STATS["peak"])} against a cap of {_gb(_STATS["cap"])} '
              f'({_STATS["command"] or "no run lasted long enough to be measured"})', file=sys.stderr, flush=True)


def run_command(work, argv, *, timeout=60, env=None, memory_cap=None, output_cap=None, heap_mb=None):
    """Run argv in `work` with stdin closed, its output in temporary files and the LIMITS above on its whole process tree.

    The run is its own process group (and session). When it ends, however it ends, every process still left in the
    tree is killed. It is cut short, with `expired` set and `reason` saying why, after `timeout` seconds, once the tree
    holds more than `memory_cap` bytes, or once it has written more than `output_cap` bytes. The three default to
    the module's MEMORY_CAP and OUTPUT_CAP; `heap_mb` is the --max-old-space-size every node it starts gets.
    """
    memory_cap = MEMORY_CAP if memory_cap is None else memory_cap
    output_cap = OUTPUT_CAP if output_cap is None else output_cap
    env = dict(os.environ if env is None else env)
    # A driver started from inside a node test would otherwise hand its children the parent runner's context,
    # and `node --test` refuses to run files when it believes it is nested ("ran no tests").
    env.pop('NODE_TEST_CONTEXT', None)
    env['NODE_OPTIONS'] = _node_options(env.get('NODE_OPTIONS'), HEAP_MB if heap_mb is None else heap_mb)
    started = time.monotonic()
    reason, peak, survivors, seen, late = None, 0, [], {}, []
    handlers = _end_on_termination()
    try:
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            process = subprocess.Popen(argv, cwd=work, stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True, env=env)
            try:
                interval = POLL_SECONDS
                while True:
                    remaining = timeout - (time.monotonic() - started)
                    try:
                        process.wait(timeout=max(0.01, min(interval, remaining)))
                        break
                    except subprocess.TimeoutExpired:
                        pass
                    if time.monotonic() - started >= timeout:
                        reason = 'time'
                        break
                    table = _process_table()
                    members = _tree(process.pid, table)
                    seen.update({pid: table[pid][3] for pid in members if pid in table})
                    used = _usage(members, table)
                    peak = max(peak, used)
                    if used > memory_cap:
                        reason = 'memory'
                        break
                    if os.fstat(out.fileno()).st_size + os.fstat(err.fileno()).st_size > output_cap:
                        reason = 'output'
                        break
                    interval = min(POLL_SECONDS, FAST_POLL_SECONDS) if used > FAST_POLL_SHARE * memory_cap else POLL_SECONDS
            finally:
                # also when the driver itself is interrupted: nothing of this run may outlive it. A signal that arrives while
                # the tree is being taken down waits until it is gone.
                for signum in handlers:
                    signal.signal(signum, lambda number, _frame: late.append(number))
                survivors = _kill_tree(process, seen)
            stdout, stderr = _read(out, output_cap), _read(err, output_cap)
    finally:
        for signum, previous in handlers.items():
            signal.signal(signum, signal.SIG_DFL if previous is None else previous)
    if late:
        raise SystemExit(128 + late[0])
    if survivors:
        print(f'kxmut: could not kill process(es) {survivors} of {" ".join(map(str, argv))[:120]}', file=sys.stderr, flush=True)
    _STATS['runs'] += 1
    if peak > _STATS['peak']:
        _STATS['peak'], _STATS['cap'], _STATS['command'] = peak, memory_cap, ' '.join(map(str, argv[2:]))[-90:]
    return Run(list(argv), process.returncode, stdout, stderr, reason is not None, reason=reason, peak=peak,
               seconds=time.monotonic() - started, timeout=timeout, cap={'memory': memory_cap, 'output': output_cap}.get(reason), survivors=survivors)


class OverCap(subprocess.TimeoutExpired):
    """`subprocess.TimeoutExpired` for a run killed for what it held or wrote rather than how long it took, so a driver that
    already handles a timeout handles this too, and can tell the two apart (`isinstance(error, kxmut.OverCap)`)."""

    def __init__(self, cmd, timeout, note, output=None, stderr=None):
        super().__init__(cmd, timeout, output=output, stderr=stderr)
        self.note = note

    def __str__(self):
        return f'Command {self.cmd!r}: {self.note}'


def run_process(argv, *, cwd, timeout, env=None, **limits):
    """A drop-in for `subprocess.run(argv, cwd=cwd, stdin=DEVNULL, capture_output=True, text=True, timeout=timeout)` that
    runs under `run_command`'s limits, for the drivers that keep their own counting. Like subprocess.run it raises
    TimeoutExpired (an OverCap, a subclass, for memory or output) with whatever output there was, and the whole process
    tree is gone by the time it returns or raises: `subprocess.run` kills only the top process of a timed-out `node --test`
    and leaves its test workers running."""
    run = run_command(cwd, argv, timeout=timeout, env=env, **limits)
    if run.expired:
        if run.overcap:
            raise OverCap(list(argv), timeout, run.limit_note(), output=run.stdout, stderr=run.stderr)
        raise subprocess.TimeoutExpired(list(argv), timeout, output=run.stdout, stderr=run.stderr)
    return subprocess.CompletedProcess(list(argv), run.returncode, run.stdout, run.stderr)


def why(error):
    """How a `run_process` that raised TimeoutExpired ended, in a few words, for a driver to print next to the mutation:
    'timed out after 30 s', or 'OVERCAP: the process tree held 4.2 GB against a cap of 4.0 GB ...'."""
    return f'OVERCAP: {error.note}' if isinstance(error, OverCap) else f'timed out after {error.timeout:g} s'


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
        super().__init__(run.argv, run.returncode, run.stdout, run.stderr, run.expired, reason=run.reason, peak=run.peak,
                         seconds=run.seconds, timeout=run.timeout, cap=run.cap, survivors=run.survivors)
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


def run_tests(work, files, *, name_patterns=(), skip_patterns=(), test_timeout_ms=20000, timeout=120, extra=(), **limits):
    """`node --test` over `files` in `work`, TAP on stdout. One call is one "test command" for baselines.

    There is deliberately no --test-force-exit: it ends a test file's process as soon as its tests are done, which
    can cut off the report of a test that is failing. The file then shows up as a crash with no failing test to name,
    and whether that happens depends on load, so a real kill would flicker between KILLED and ERROR.
    `limits` (memory_cap, output_cap, heap_mb) go to run_command.
    """
    argv = ['node', '--test', '--test-reporter=tap', f'--test-timeout={test_timeout_ms}']
    argv += [f'--test-name-pattern={p}' for p in name_patterns]
    argv += [f'--test-skip-pattern={p}' for p in skip_patterns]
    argv += [*extra, *files]
    return TestRun(run_command(work, argv, timeout=timeout, **limits))


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
        reason = ('over its limits: ' if run.overcap else '') + run.limit_note()
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
    with no failing test is an ERROR, never a kill. A hang is a TIMEOUT; a run the harness had to kill for the memory it
    held or the output it wrote is an OVERCAP, which no driver counts as a kill unless it counts a hang as one.
    """
    if run.expired:
        return Verdict(OVERCAP, run.limit_note()) if run.overcap else Verdict(TIMEOUT, 'timed out')
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
        return Verdict(OVERCAP, run.limit_note()) if run.overcap else Verdict(TIMEOUT, 'timed out')
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

    def __init__(self, work, *, cwd=None, test_timeout_ms=20000, timeout=120, extra=(), **limits):
        # `cwd` is where node runs when that is not the package itself (the evidence-pack test runs from its parent).
        # `limits` (memory_cap, output_cap, heap_mb) override the module's for every run of this suite.
        self.work, self.cwd, self.test_timeout_ms, self.timeout, self.extra = work, cwd or work, test_timeout_ms, timeout, tuple(extra)
        self.limits = limits
        self._baselines = {}

    @staticmethod
    def _key(files, name_patterns, skip_patterns):
        return (tuple(files), tuple(name_patterns), tuple(skip_patterns))

    def run(self, files, name_patterns=(), skip_patterns=()):
        return run_tests(self.cwd, files, name_patterns=name_patterns, skip_patterns=skip_patterns,
                         test_timeout_ms=self.test_timeout_ms, timeout=self.timeout, extra=self.extra, **self.limits)

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
    error as `  ERROR: label: why`. Errors, timeouts and over-cap runs (a mutant killed for the memory it held or the
    output it wrote, `[OVERCAP ]`) are not caught.
    """

    def __init__(self, known_equivalent=(), timeout_is_caught=False):
        self.caught, self.survived, self.errors, self.red, self.timeouts = [], [], [], set(), []
        self.known_equivalent = set(known_equivalent)
        # live.py and relay.py have always reported a hang as "caught with timeout" and counted it; they keep doing so,
        # and an over-cap run (a hang that also ate memory) is counted the same way.
        self.timeout_is_caught = timeout_is_caught

    def record(self, label, verdict):
        if verdict.kind == KILLED:
            self.caught.append(label)
            self.red.update(verdict.failed)
            print(f'[KILLED  ] {label} <- {verdict.detail}', flush=True)
        elif verdict.kind == SURVIVED:
            self.survived.append(label)
            print(f'[SURVIVED] {label}', flush=True)
        elif verdict.kind in (TIMEOUT, OVERCAP) and self.timeout_is_caught:
            self.caught.append(label)
            self.timeouts.append(label)
            print(f'[CAUGHT WITH TIMEOUT] {label}: {"OVERCAP: " if verdict.kind == OVERCAP else ""}{verdict.detail}', flush=True)
        else:
            self.errors.append((label, ('OVERCAP: ' if verdict.kind == OVERCAP else '') + verdict.detail))
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
