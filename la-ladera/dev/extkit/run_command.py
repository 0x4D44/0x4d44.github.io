"""Record a real acceptance command, complete output, UTC time and exit status.

Use from the repository root: python la-ladera/dev/extkit/run_command.py LABEL COMMAND...
The command is an argv vector, never a shell string. Nonzero exits are retained.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import shlex
import subprocess
import sys


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: run_command.py LABEL COMMAND [ARG...]")
    directory = Path(__file__).resolve().parent / "logs"
    directory.mkdir(parents=True, exist_ok=True)
    label = sys.argv[1]
    if not label.replace("-", "").replace("_", "").isalnum():
        raise SystemExit("label must contain letters, digits, hyphens or underscores")
    command = sys.argv[2:]
    started = datetime.now(timezone.utc).isoformat()
    path = directory / f"{label}.log"
    if path.exists():
        raise SystemExit(f"Refusing to overwrite existing log: {path}")
    with path.open("w", encoding="utf-8") as log:
        header = f"UTC start: {started}\nWorking directory: {Path.cwd()}\nCommand: {shlex.join(command)}\n\n"
        log.write(header)
        print(header, end="", flush=True)
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, bufsize=1,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        for line in process.stdout:
            log.write(line)
            log.flush()
            print(line, end="", flush=True)
        code = process.wait()
        ended = datetime.now(timezone.utc).isoformat()
        footer = f"\nUTC end: {ended}\nExit status: {code}\n"
        log.write(footer)
        print(footer, end="", flush=True)
    record = {"started": started, "ended": ended, "argv": command,
              "exitCode": code, "log": path.name}
    (directory / f"{label}.json").write_text(json.dumps(record, indent=2) + "\n")
    raise SystemExit(code)


if __name__ == "__main__":
    main()
