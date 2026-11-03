#!/usr/bin/env python3
"""Turn the raw answer ledgers into the small JSON files the site loads (../site/*.json).

  build.py        rebuild everything from ../data (re-run as answers land)

Nothing here calls an API. Each chapter file carries only what its page draws.
"""
import collections, json, math, os, random, re, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
SITE = os.path.join(HERE, "..", "site")
QUESTIONS = {q["id"]: q for q in json.load(open(os.path.join(HERE, "questions.json")))}
META = json.load(open(os.path.join(DATA, "_models.json")))

PICKS = ["q02-colour", "q03-boy", "q04-girl", "q05-address", "q09-card", "q10-fruit", "q11-city",
         "q12-dog", "q13-word", "q14-coins", "q15-password", "q19-emoji", "q20-lottery",
         "q21-animal", "q22-three-words", "q28-ai-risk", "q16-strawberry", "q24-date"]
NUMBERS = ["q01-number", "q29-number-10", "q31-rand-single"]
TEXTS = ["q06-0x4d44", "q23-whoami", "q18-false-premise", "q17-poem", "q26-haiku",
         "q27-scotland-joke", "q25-highland-cow"]


def load(qid):
    p = os.path.join(DATA, f"{qid}.jsonl")
    if not os.path.exists(p):
        return []
    return [r for r in map(json.loads, open(p)) if r.get("ok")]


def base(model):
    return model.split("@")[0]


def label(model):
    """Human label: 'GPT-5.4 mini', 'Claude Opus 5.5 · thinking', 'GPT-5.6 Sol · pro mode'."""
    m, _, variant = model.partition("@")
    if m.startswith("claude-"):
        name = META.get(m, {}).get("display_name") or m
        name = re.sub(r"\s*\(\d{8}\)", "", name)
    else:
        name = m.replace("gpt-", "GPT-").replace("-mini", " mini").replace("-nano", " nano") \
            .replace("-pro", " pro").replace("-search-api", " search").replace("-codex", " Codex")
        name = re.sub(r"-(sol|luna|terra|astra)$", lambda x: " " + x.group(1).title(), name)
        name = {"chat-latest": "ChatGPT (chat-latest)", "o3": "o3"}.get(m, name)
    return name + {"pro": " · pro mode", "thinking": " · thinking", "": ""}[variant]


def models_index():
    seen = set()
    for fn in os.listdir(DATA):
        if fn.startswith("q") and fn.endswith(".jsonl"):
            seen |= {r["model"] for r in load(fn[:-6])}
    out = []
    for m in seen:
        info = META.get(base(m), {})
        out.append({"id": m, "label": label(m), "provider": info.get("provider", "openai"),
                    "created": info.get("created", ""), "variant": m.partition("@")[2] or None})
    out.sort(key=lambda x: (x["created"], x["id"]))
    return out


def norm(text, qid):
    t = (text or "").strip().strip("`").strip()
    t = t.splitlines()[0].strip() if t else ""
    if qid in ("q05-address", "q13-word", "q15-password", "q14-coins", "q19-emoji", "q20-lottery",
               "q24-date"):
        return t.strip(" .\"'")
    t = re.sub(r"[.!\"*]+$", "", t).strip(" \"'*")
    return t.lower() if qid not in ("q09-card", "q11-city") else t.title()


def entropy(counts):
    n = sum(counts.values())
    return -sum(c / n * math.log2(c / n) for c in counts.values() if c)


def summary(rs, key):
    by = collections.defaultdict(list)
    for r in rs:
        by[r["model"]].append(key(r))
    return by


def number_stats(values, lo, hi):
    counts = collections.Counter(v for v in values if v is not None and lo <= v <= hi)
    n = sum(counts.values())
    k = hi - lo + 1
    chi2 = sum((counts.get(i, 0) - n / k) ** 2 / (n / k) for i in range(lo, hi + 1)) if n else None
    return {"n": n, "counts": {str(i): c for i, c in sorted(counts.items())},
            "distinct": len(counts), "entropy": round(entropy(counts), 3) if n else None,
            "chi2": round(chi2, 1) if chi2 is not None else None,
            "top": counts.most_common(1)[0] if counts else None,
            "invalid": len(values) - n}


def to_int(t):
    m = re.search(r"-?\d+", t or "")
    return int(m.group(0)) if m else None


def list_stats(lists):
    """Stats for 'give me 100 random numbers' replies, plus a true-random baseline."""
    per = []
    pooled = []
    for xs in lists:
        xs = [x for x in xs if 1 <= x <= 100]
        if not xs:
            continue
        pooled += xs
        per.append({"len": len(xs), "distinct": len(set(xs)),
                    "adjacent_repeats": sum(a == b for a, b in zip(xs, xs[1:])),
                    "sorted": xs == sorted(xs)})
    if not per:
        return None
    mean = lambda k: round(statistics.mean(p[k] for p in per), 2)
    s = number_stats(pooled, 1, 100)
    s.update({"lists": len(per), "mean_len": mean("len"), "mean_distinct": mean("distinct"),
              "mean_adjacent_repeats": mean("adjacent_repeats"),
              "sorted_lists": sum(p["sorted"] for p in per)})
    return s


def numbers():
    out = {}
    for qid in NUMBERS:
        lo, hi = (1, 10) if qid == "q29-number-10" else (1, 100)
        by = summary(load(qid), lambda r: to_int(r.get("text")))
        out[qid] = {"prompt": QUESTIONS[qid]["prompt"], "range": [lo, hi],
                    "models": {m: number_stats(v, lo, hi) for m, v in by.items()}}
    lists = summary(load("q32-rand-list"),
                    lambda r: [int(x) for x in re.findall(r"\d+", r.get("text") or "")])
    rnd = random.Random(0x4D44)
    out["q32-rand-list"] = {
        "prompt": QUESTIONS["q32-rand-list"]["prompt"],
        "models": {m: list_stats(v) for m, v in lists.items()},
        "baseline": list_stats([[rnd.randint(1, 100) for _ in range(100)] for _ in range(100)]),
        "expected_distinct": round(100 * (1 - (99 / 100) ** 100), 2),
    }
    rnd = random.Random(0x4D45)
    out["baseline_single"] = number_stats([rnd.randint(1, 100) for _ in range(100)], 1, 100)
    return out


def picks():
    out = {}
    for qid in PICKS:
        rs = load(qid)
        if not rs:
            continue
        by = summary(rs, lambda r: norm(r.get("text"), qid))
        overall = collections.Counter(a for v in by.values() for a in v)
        out[qid] = {"prompt": QUESTIONS[qid]["prompt"],
                    "overall": overall.most_common(40), "distinct": len(overall),
                    "answers": sum(overall.values()),
                    "models": {m: {"counts": collections.Counter(v).most_common(),
                                   "n": len(v), "distinct": len(set(v))} for m, v in by.items()}}
    return out


def meta(r):
    u = r.get("usage") or {}
    return {"secs": r.get("secs"), "cost": round(r.get("cost", 0.0), 6),
            "out": u.get("out"), "reasoning": u.get("reasoning"),
            "incomplete": r.get("incomplete")}


def texts():
    out = {}
    for qid in TEXTS:
        rs = load(qid)
        if rs:
            out[qid] = {"prompt": QUESTIONS[qid]["prompt"],
                        "models": {m: [{"text": r["text"], **meta(r)} for r in sorted(v, key=lambda r: r["sample"])]
                                   for m, v in summary(rs, lambda r: r).items()}}
    return out


def haggis():
    idx = json.load(open(os.path.join(DATA, "svg", "q07-haggis-svg", "index.json")))
    recs = {(r["model"], r["sample"]): r for r in load("q07-haggis-svg")}
    out = []
    for name, e in idx.items():
        r = recs.get((e["model"], e["sample"]), {})
        out.append({**e, "file": name, **meta(r)})
    imgs = []
    for r in map(json.loads, open(os.path.join(DATA, "_images.jsonl"))):
        if r.get("code") == 200 and r["prompt"] != "_test":
            imgs.append({"model": r["model"], "scene": r["prompt"], "secs": r["secs"],
                         "cost": round(r["cost"], 4), "file": f"{r['prompt']}/{r['model']}.jpg"})
    return {"prompt": QUESTIONS["q07-haggis-svg"]["prompt"], "svgs": out, "images": imgs}


def raw(qid):
    return {"prompt": QUESTIONS[qid]["prompt"],
            "models": {r["model"]: {"text": r["text"], **meta(r)} for r in load(qid)}}


def bill():
    per = collections.defaultdict(lambda: {"calls": 0, "cost": 0.0, "secs": [], "out": 0, "reasoning": 0})
    for fn in os.listdir(DATA):
        if not (fn.startswith("q") and fn.endswith(".jsonl")):
            continue
        for r in load(fn[:-6]):
            p = per[r["model"]]
            u = r.get("usage") or {}
            p["calls"] += 1
            p["cost"] += r.get("cost", 0.0)
            p["secs"].append(r.get("secs") or 0)
            p["out"] += u.get("out", 0) or 0
            p["reasoning"] += u.get("reasoning", 0) or 0
    models = {m: {"calls": p["calls"], "cost": round(p["cost"], 4),
                  "median_secs": round(statistics.median(p["secs"]), 2),
                  "out_tokens": p["out"], "reasoning_tokens": p["reasoning"]} for m, p in per.items()}
    extra = {k: round(sum(r.get("cost", 0.0) for r in map(json.loads, open(os.path.join(DATA, f))) ), 4)
             for k, f in (("images", "_images.jsonl"), ("probes", "_probe.jsonl"),
                          ("embeddings", "_embeddings.jsonl")) if os.path.exists(os.path.join(DATA, f))}
    return {"models": models, "extra": extra}


def relay():
    out = {}
    for fn in sorted(os.listdir(DATA)):
        if fn.startswith("relay-") and fn.endswith(".jsonl"):
            out[fn[6:-6]] = [{k: r.get(k) for k in ("turn", "model", "ok", "sentence", "cost", "secs")}
                             for r in map(json.loads, open(os.path.join(DATA, fn)))]
    return out


def main():
    os.makedirs(SITE, exist_ok=True)
    parts = {"models": models_index(), "numbers": numbers(), "picks": picks(), "texts": texts(),
             "haggis": haggis(), "jokes": raw("q08-joke-program"), "moonlight": raw("q30-moonlight"),
             "bill": bill(), "relay": relay()}
    for name, obj in parts.items():
        with open(os.path.join(SITE, f"{name}.json"), "w") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{name:10} {os.path.getsize(os.path.join(SITE, f'{name}.json')) // 1024:6} KB")


if __name__ == "__main__":
    main()
