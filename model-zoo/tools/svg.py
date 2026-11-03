#!/usr/bin/env python3
"""Extract each model's SVG for a question, and mechanically repair the broken ones.

  svg.py <qid>     writes ../data/svg/<qid>/<model>.svg  (the model's SVG, untouched)
                   and, when that does not parse, <model>.repaired.svg if a repair works;
                   ../data/svg/<qid>/index.json lists each model's status and the fixes made.

Repairs are mechanical only (no model is asked again), and each is recorded:
  - declare a namespace prefix the SVG uses but never declares (e.g. xlink)
  - drop a repeated attribute on one element, keeping the first value
"""
import json, os, re, sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
KNOWN_NS = {"xlink": "http://www.w3.org/1999/xlink"}


def extract(text):
    m = re.search(r"<svg\b.*</svg>", text or "", re.S)
    return m.group(0) if m else None


def visible(svg):
    """True if anything is drawn outside <defs> (a cut-off file may be all setup)."""
    outside = re.sub(r"<defs\b.*?</defs>", "", svg, flags=re.S)
    return bool(re.search(r"<(rect|circle|ellipse|path|polygon|polyline|line|use|text|image)\b", outside))


def close_truncated(text):
    """An SVG cut off mid-stream: drop the half-written tail, then close every open element.

    Returns (svg, fix description) or (None, None) if there is no <svg to rescue."""
    start = (text or "").find("<svg")
    if start < 0:
        return None, None
    body = text[start:]
    body = body[:body.rfind(">") + 1]  # drop a half-written tag or text after the last complete tag
    stack = []
    for m in re.finditer(r"<(/?)([A-Za-z][\w:-]*)[^>]*?(/?)>|<!--.*?-->|<!\[CDATA\[.*?\]\]>", body, re.S):
        if not m.group(2):
            continue
        if m.group(1):
            if stack and stack[-1] == m.group(2):
                stack.pop()
        elif not m.group(3):
            stack.append(m.group(2))
    closing = "".join(f"</{t}>" for t in reversed(stack))
    return body + closing, f"the reply was cut off mid-drawing; closed {len(stack)} open element(s)"


def parse_error(svg):
    try:
        ET.fromstring(svg)
        return None
    except ET.ParseError as e:
        return e


def repair(svg):
    """Return (repaired_svg, [fixes]) or (None, [fixes tried]) if it cannot be repaired."""
    fixes = []
    for _ in range(50):
        err = parse_error(svg)
        if err is None:
            return svg, fixes
        msg = str(err)
        line, col = err.position
        if msg.startswith("unbound prefix"):
            used = set(re.findall(r"[\s<]([A-Za-z][\w-]*):[A-Za-z]", svg)) - {"xmlns", "xml"}
            missing = [p for p in sorted(used) if f"xmlns:{p}=" not in svg and p in KNOWN_NS]
            if not missing:
                return None, fixes + [f"unrepairable: {msg}"]
            for p in missing:
                svg = re.sub(r"<svg\b", f'<svg xmlns:{p}="{KNOWN_NS[p]}"', svg, count=1)
                fixes.append(f"declared the missing xmlns:{p} namespace on <svg>")
        elif msg.startswith("duplicate attribute"):
            lines = svg.split("\n")
            text = lines[line - 1]
            m = re.match(r'\s*([\w:-]+)\s*=\s*("[^"]*"|\'[^\']*\')', text[col:])
            if not m:
                return None, fixes + [f"unrepairable: {msg}"]
            lines[line - 1] = text[:col] + text[col + m.end():]
            svg = "\n".join(lines)
            fixes.append(f"removed a repeated {m.group(1)}= attribute (line {line}), keeping the first")
        else:
            return None, fixes + [f"unrepairable: {msg}"]
    return None, fixes + ["unrepairable: too many errors"]


def main(qid):
    out = os.path.join(DATA, "svg", qid)
    os.makedirs(out, exist_ok=True)
    index = {}
    for line in open(os.path.join(DATA, f"{qid}.jsonl")):
        r = json.loads(line)
        if not r.get("ok"):
            continue
        name = f"{r['model']}-s{r['sample']}" if r["sample"] else r["model"]
        svg = extract(r.get("text"))
        entry = {"model": r["model"], "sample": r["sample"]}
        partial, why = (None, None) if svg is not None else close_truncated(r.get("text"))
        if partial and not visible(partial):
            entry["status"] = "no-svg"
            entry["note"] = "cut off while still defining its shapes: nothing reached the canvas"
            index[name] = entry
            print(f"{name:22} no-svg    (cut off before drawing anything visible)")
            continue
        if svg is None and partial and parse_error(partial) is None:
            open(os.path.join(out, f"{name}.svg"), "w").write(r["text"][r["text"].find("<svg"):])
            open(os.path.join(out, f"{name}.repaired.svg"), "w").write(partial)
            entry.update(status="repaired", truncated=True, fixes=[why],
                         error="no closing </svg>: the reply ran out of tokens")
            entry["unsafe"] = bool(re.search(r"<script|\bon\w+\s*=|href=[\"']https?:", partial))
        elif svg is None:
            entry["status"] = "no-svg"
            entry["note"] = (f"ran out of output budget ({r.get('incomplete')})"
                             if r.get("incomplete") else "reply contained no <svg> element")
        else:
            open(os.path.join(out, f"{name}.svg"), "w").write(svg)
            err = parse_error(svg)
            if err is None:
                entry["status"] = "valid"
            else:
                entry["error"] = str(err)
                fixed, fixes = repair(svg)
                entry["fixes"] = fixes
                if fixed:
                    open(os.path.join(out, f"{name}.repaired.svg"), "w").write(fixed)
                    entry["status"] = "repaired"
                else:
                    entry["status"] = "broken"
            entry["unsafe"] = bool(re.search(r"<script|\bon\w+\s*=|href=[\"']https?:", svg))
        index[name] = entry
        print(f"{name:22} {entry['status']:9} {'; '.join(entry.get('fixes', []))}")
    json.dump(index, open(os.path.join(out, "index.json"), "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
