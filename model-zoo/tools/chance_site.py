#!/usr/bin/env python3
"""Build site/chance.json for the "Same question, twice" chapter from data/stoch-*.jsonl.

  chance_site.py      (run after stochastic.py; build.py does not touch this file)
"""
import collections, itertools, json, math, os, re

import build
import stoch_report as sr

DATA, SITE = build.DATA, build.SITE
STORY_TITLE = re.compile(r"^[#*\s]+|[#*\s]+$")


def model_order(ids):
    meta = build.META
    return sorted(ids, key=lambda m: (meta.get(build.base(m), {}).get("created", "9"), m))


def counts(answers, k=6):
    c = collections.Counter(answers)
    return {"n": len(answers), "distinct": len(c), "bits": round(sr.entropy(answers), 2),
            "counts": c.most_common(k)}


def title(t):
    return STORY_TITLE.sub("", t.strip().split("\n")[0]).strip()


def fork(texts):
    """The pair of texts that ran together longest, cut where they part."""
    best = None
    for a, b in itertools.combinations(texts, 2):
        wa, wb = a.split(), b.split()
        i = 0
        while i < min(len(wa), len(wb)) and wa[i] == wb[i]:
            i += 1
        if i == len(wa) == len(wb):
            continue
        if best is None or i > best[0]:
            best = (i, wa, wb)
    if not best:
        return None
    i, wa, wb = best
    return {"words": i, "prefix": " ".join(wa[:i]), "a": " ".join(wa[i:i + 18]), "b": " ".join(wb[i:i + 18])}


def stories(texts):
    pairs = list(itertools.combinations(texts, 2))
    splits = [sr.first_split(a, b) for a, b in pairs]
    real = sorted(s for s in splits if s is not None)
    titles = collections.Counter(title(t) for t in texts)
    return {"n": len(texts), "distinct": len(set(texts)), "identical_pairs": sum(s is None for s in splits),
            "pairs": len(pairs), "median_split": real[len(real) // 2] if real else None,
            "titles": len(titles), "top_titles": titles.most_common(3), "fork": fork(texts)}


def main():
    dial, rep, wd, rl = (sr.load(e) for e in ("dial", "repeat", "wording", "relay"))
    ids = model_order({r["model"] for r in dial + rep + wd + rl})
    out = {"models": ids, "labels": {m: build.label(m) for m in ids},
           "prompts": {"short": sr.__dict__.get("SHORT_PROMPTS") or {
               "number": "Think of a number between 1 and 100. Reply with only the number.",
               "colour": "What is your favourite colour? Reply with only the colour.",
               "city": "Name a city. Reply with only the city name."},
               "story": "Write a short story of about 300 words. Reply with only the story, starting with its title on the first line."}}
    knobs_path = os.path.join(DATA, "stoch-knobs.json")
    knobs = json.load(open(knobs_path)) if os.path.exists(knobs_path) else {}

    # 1. The dial: what each setting does to the spread.
    g = collections.defaultdict(list)
    for r in dial:
        g[(r["model"], r["cond"], r["prompt_id"])].append(r)
    D = {}
    for (m, c, p), rs in g.items():
        d = D.setdefault(m, {"conds": [], "short": {}, "story": {}})
        if c not in d["conds"]:
            d["conds"].append(c)
        if p == "story":
            d["story"][c] = stories([r["text"] for r in rs])
        elif p == "number-lp":
            top = rs[0].get("top") or []
            d["logprobs"] = [[t, round(math.exp(lp), 4)] for t, lp in top]
        else:
            d["short"].setdefault(p, {})[c] = counts([sr.norm(r["text"]) for r in rs])
    order = ["t0", "t0.5", "t1", "t1.5", "t2", "low", "medium", "high", "xhigh", "max", "default"]
    for m, d in D.items():
        d["conds"].sort(key=lambda c: order.index(c) if c in order else 99)
        d["knob"] = "temperature" if any(c.startswith("t") for c in d["conds"]) else "effort"
        knobs.setdefault(m, {"temperature": d["knob"] == "temperature", "effort": d["knob"] == "effort"})
    out["dial"] = D
    out["knobs"] = knobs

    # 2. Repeats: the same story prompt twenty times.
    g = collections.defaultdict(list)
    for r in rep:
        g[(r["model"], r["cond"])].append(r)
    out["repeat"] = {}
    for (m, c), rs in g.items():
        s = stories([r["text"] for r in rs])
        fps = collections.Counter(r.get("fingerprint") for r in rs if r.get("fingerprint"))
        if fps:
            s["fingerprints"] = len(fps)
        out["repeat"].setdefault(m, {})[c] = s

    # 3. Wording: seven ways to ask one question.
    g = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in wd:
        g[r["model"]][r["prompt_id"]].append(sr.norm(r["text"]))
    out["wordings"] = {}
    try:
        import stochastic
        out["wordings"] = stochastic.WORDINGS
    except Exception:
        pass
    W = {}
    for m, by in g.items():
        within = sum(sr.entropy(a) for a in by.values()) / len(by)
        pooled = sr.entropy([x for a in by.values() for x in a])
        W[m] = {"within": round(within, 2), "pooled": round(pooled, 2),
                "from_wording": round(1 - within / pooled, 2) if pooled else 0.0,
                "by": {w: counts(a, 4) for w, a in by.items()}}
    out["wording"] = W

    # 4. Relay: one opening, independent chains.
    chains = collections.defaultdict(list)
    for r in rl:
        chains[r["sample"]].append({"turn": r["turn"], "model": r["model"], "text": r["text"]})
    out["relay"] = {"opening": getattr(__import__("stochastic"), "RELAY_OPEN", ""),
                    "chains": [sorted(c, key=lambda x: x["turn"]) for _, c in sorted(chains.items())]}
    rep_ = sr.report()
    out["relay"]["overlap"] = rep_.get("relay_word_overlap_by_turn", {})
    out["answers"] = len(dial) + len(rep) + len(wd) + len(rl)
    out["spent"] = round(sum(r.get("cost", 0) for r in dial + rep + wd + rl), 2)
    p = os.path.join(SITE, "chance.json")
    with open(p, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("chance", os.path.getsize(p) // 1024, "KB;", len(ids), "models;", out["answers"], "answers")


if __name__ == "__main__":
    main()
