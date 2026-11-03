#!/usr/bin/env python3
"""Sentence relay: every model adds one sentence to a shared story, oldest model first.

  relay.py <name>      run (or resume) the relay into ../data/relay-<name>.jsonl

Each line records the model, its sentence, the turn number, timing and cost. A model that
fails (for example, the OpenAI credit runs out) is recorded as skipped and the story moves on.
"""
import json, os, re, sys

import run

FIRST = ("We are writing a story together, one sentence at a time, and each sentence is written "
         "by a different AI model. You are first. Write the opening sentence of the story, as well "
         "as you can. Reply with only your sentence.")
NEXT = ("We are writing a story together, one sentence at a time, and each sentence is written by a "
        "different AI model. Here is the story so far:\n\n{story}\n\nAdd exactly one sentence. It must "
        "follow on from the last sentence, but you may take the story in a wild, unexpected new "
        "direction; surprising, funny or strange turns are welcome. Write it as well as you can. "
        "Reply with only your sentence.")
SLOW = re.compile(r"-pro$")  # the -pro models take minutes per turn; pro mode on 5.6 Sol stays in


def order():
    meta = json.load(open(os.path.join(run.DATA, "_models.json")))
    live = [m for m in run.live_models() if not SLOW.search(m)]
    return sorted(live, key=lambda m: (meta.get(m.split("@")[0], {}).get("created", "9"), m))


def main(name):
    path = os.path.join(run.DATA, f"relay-{name}.jsonl")
    done = [json.loads(l) for l in open(path)] if os.path.exists(path) else []
    seen = {r["model"] for r in done}
    story = [r["sentence"] for r in done if r.get("sentence")]
    models = order()
    print(f"{len(models)} models; {len(done)} turns already done", flush=True)
    for m in models:
        if m in seen:
            continue
        prompt = NEXT.format(story=" ".join(story)) if story else FIRST
        r = run.call_retry(m, run.live_models()[m], prompt, 3000)
        text = " ".join((r.get("text") or "").split()).strip().strip('"')
        rec = {"turn": len(done) + 1, "model": m, "ok": bool(r["ok"] and text),
               "sentence": text if r["ok"] else None, "cost": run.cost(m, r.get("usage", {})) if r["ok"] else 0.0,
               "secs": r.get("secs"), "usage": r.get("usage"), "error": r.get("error")}
        done.append(rec)
        with open(path, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        if rec["ok"]:
            story.append(text)
        print(f"{rec['turn']:2} {m:28} {text if rec['ok'] else 'SKIPPED: ' + str(r.get('error'))[:80]}",
              flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "1")
