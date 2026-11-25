#!/usr/bin/env python3
"""Could a simple detector tell model stories from human writing?

  detect.py prompts <wp_rows_dir>  the r/WritingPrompts prompts of the 250 sampled Reddit stories, matched
                                   by story text in the euclaise/writingprompts test-split rows corpus.py
                                   used, into ../data/human/prompts/wp.jsonl (local only, like the stories)
  detect.py estimate               what the topic-matched set would cost, from each model's story costs
  detect.py gen                    the topic-matched texts: each model answers the sampled Reddit prompts
                                   and writes essay passages on the titles of this site's author's ten
                                   sampled essays (titles only), into ../data/detect-{wp,essay}.jsonl
                                   (resumable; hard cap DETECT_BUDGET, default USD 12)
  detect.py embed                  embed those texts (text-embedding-3-small) into ../data/embeddings/detect.json
  detect.py                        build ../site/detect.json: grouped-split logistic regression on the
                                   embeddings, error rates per kind, and the topic-matched comparison

The site file holds only rates, counts, distances and 2-D points: never human text, prompts or titles.
"""
import hashlib, json, os, random, re, statistics, sys
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import corpus  # noqa: E402  (both pure on import: no network)
import stories  # noqa: E402

DATA = os.environ.get("MZ_DATA") or os.path.join(ROOT, "data")
SEED = 0x4D44
# Old and new, both families; a cheap and a flagship model on each side.
MODELS = ["gpt-4o-mini", "gpt-4.1", "gpt-5", "gpt-6.2-sol",
          "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-5-5", "claude-fable-5-2"]
N_PROMPTS = 50        # two Reddit stories from each of the 25 groups of ten
ESSAY_SAMPLES = 3     # per model and title
MAX_TOKENS = 4000
BUDGET = float(os.environ.get("DETECT_BUDGET", "12.0"))
K_TOPIC = 5           # topic folds for the matched texts
ALPHA = 1e-2          # L2 strength of the logistic regression (on standardised features)

WP_PROMPT = ("Here is a writing prompt from Reddit's r/WritingPrompts:\n\n{prompt}\n\n"
             "Write a story of about 300 words in response. Reply with only the story: no title, no preamble.")
ESSAY_PROMPT = ("Write a passage of about 300 words from a personal blog essay titled \"{title}\". "
                "Flowing prose paragraphs only: no title, headings, lists or code. Reply with only the passage.")

KINDS = ["reddit", "gutenberg", "author", "gpt", "claude"]


def jl(path):
    return stories.read_jsonl(path)


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def provider(model, meta):
    base = model.split("@")[0]
    return meta.get(base, {}).get("provider") or ("anthropic" if base.startswith("claude-") else "openai")


def model_group(model):
    """A model's thinking variant is the same weights: one group, never split across train and test."""
    return "m:" + model.split("@")[0]


# ---- the topic-matched set ------------------------------------------------------

def sample_prompts(wp_rows):
    """N_PROMPTS Reddit story ids, two from each group of ten, fixed seed."""
    rnd = random.Random(SEED + 1)
    by = {}
    for r in wp_rows:
        by.setdefault(r["group"], []).append(r["id"])
    out = []
    for g in sorted(by):
        out += sorted(rnd.sample(sorted(by[g]), min(2, len(by[g]))))
    return out[:N_PROMPTS]


def clean_prompt(p):
    p = re.sub(r"^\s*\[\s*[A-Z]{2}\s*\]\s*", "", p.strip())
    return stories.norm(corpus.wp_detok(p))


def essay_title(article):
    return re.sub(r"^\d{4}\.\d{2}\.\d{2}\s*-\s*", "", article).strip()


def jobs():
    """Every (set, topic, sample, prompt) to put to each model."""
    out = []
    prompts = {r["id"]: r["prompt"] for r in jl(os.path.join(DATA, "human", "prompts", "wp.jsonl"))}
    for tid in sample_prompts(jl(os.path.join(DATA, "human", "writingprompts.jsonl"))):
        if tid in prompts:
            out.append(("wp", tid, 0, WP_PROMPT.format(prompt=clean_prompt(prompts[tid]))))
    for r in jl(os.path.join(DATA, "human", "author.jsonl")):
        for s in range(ESSAY_SAMPLES):
            out.append(("essay", r["id"], s, ESSAY_PROMPT.format(title=essay_title(r["article"]))))
    return out


def prep_prompts(rows_dir):
    import glob
    want = {r["text"]: r["id"] for r in jl(os.path.join(DATA, "human", "writingprompts.jsonl"))}
    found = {}
    for f in sorted(glob.glob(os.path.join(rows_dir, "rows-*.json"))):
        for r in read_json(f)["rows"]:
            s = corpus.wp_detok(r["row"]["story"])
            if s in want:
                found[want[s]] = r["row"]["prompt"]
    os.makedirs(os.path.join(DATA, "human", "prompts"), exist_ok=True)
    with open(os.path.join(DATA, "human", "prompts", "wp.jsonl"), "w") as f:
        for i in sorted(found):
            f.write(json.dumps({"id": i, "prompt": found[i]}) + "\n")
    print(f"prompts: {len(found)} of {len(want)} stories matched")


def out_path(kind):
    return os.path.join(DATA, f"detect-{kind}.jsonl")


def spent():
    return sum(r.get("cost", 0.0) for k in ("wp", "essay") for r in jl(out_path(k)))


def estimate():
    q33 = jl(os.path.join(DATA, "q33-story.jsonl"))
    js = jobs()
    total = 0.0
    for m in MODELS:
        c = [r["cost"] for r in q33 if r.get("ok") and r["model"] == m]
        per = statistics.fmean(c) * 1.15 if c else 0.05   # ~15% more input: the prompt is longer
        total += per * len(js)
        print(f"  {m:28} {len(js)} texts x USD {per:.4f} = USD {per * len(js):.2f}")
    print(f"{len(MODELS)} models x {len(js)} = {len(MODELS) * len(js)} texts, about USD {total:.2f}; "
          f"spent so far USD {spent():.2f} of cap USD {BUDGET:.2f}")


def gen():
    import threading
    from concurrent.futures import ThreadPoolExecutor
    import run
    live = run.live_models()
    js = jobs()
    lock = threading.Lock()
    acc = {"spent": spent(), "reserved": 0.0}
    todo = []
    for kind in ("wp", "essay"):
        have = {(r["model"], r["topic"], r["sample"]) for r in jl(out_path(kind)) if r.get("ok") and r.get("text")}
        todo += [(m, j) for m in MODELS for j in js if j[0] == kind and (m, j[1], j[2]) not in have]
    print(f"{len(todo)} calls to make; spent USD {acc['spent']:.2f} of USD {BUDGET:.2f}", flush=True)

    def one(job):
        m, (kind, topic, sample, prompt) = job
        (pi, po), _ = run.price(m)
        worst = (400 * pi + MAX_TOKENS * po) / 1e6
        with lock:
            if acc["spent"] + acc["reserved"] + worst > BUDGET:
                return "budget"
            acc["reserved"] += worst
        r = run.call_retry(m, live[m], prompt, MAX_TOKENS)
        c = run.cost(m, r.get("usage", {})) if r["ok"] else 0.0
        with lock:
            acc["reserved"] -= worst
            acc["spent"] += c
            rec = {"set": kind, "model": m, "topic": topic, "sample": sample, "endpoint": live[m], "cost": c,
                   "ts": run.time.time(), **r}
            with open(out_path(kind), "a") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return "ok" if r["ok"] else "fail %s %s %s" % (m, r.get("code"), r.get("error", "")[:100])

    done = 0
    with ThreadPoolExecutor(12) as ex:
        for res in ex.map(one, todo):
            done += 1
            if res != "ok":
                print("  ", res, flush=True)
            if done % 50 == 0:
                print(f"  {done}/{len(todo)} spent USD {acc['spent']:.2f}", flush=True)
    print(f"done; spent USD {acc['spent']:.2f}", flush=True)


def prose(text):
    """The text as embedded: a leading markdown heading (one model titles everything) is dropped,
    as the human passages carry no titles."""
    return re.sub(r"\A\s*#[^\n]*\n+", "", text or "").strip()


def gen_rows(data_dir=None):
    rows = []
    for kind in ("wp", "essay"):
        last = {}
        for r in jl(os.path.join(data_dir or DATA, f"detect-{kind}.jsonl")):
            if r.get("ok") and (r.get("text") or "").strip():
                last[gen_id(r)] = r
        rows += list(last.values())
    return rows


def gen_id(r):
    return f"{r['set']}:{r['model']}:{r['topic']}:{r['sample']}"


def embed():
    import run
    path = os.path.join(DATA, "embeddings", "detect.json")
    have = read_json(path) if os.path.exists(path) else {}
    todo = [(gen_id(r), prose(r["text"])) for r in gen_rows() if gen_id(r) not in have]
    for k in range(0, len(todo), 100):
        chunk = todo[k:k + 100]
        for attempt in range(6):
            code, d = run.http("POST", "/embeddings", {"model": "text-embedding-3-small",
                                                       "input": [t for _, t in chunk]})
            if code not in (0, 429, 500, 502, 503):
                break
            run.time.sleep(5 * (attempt + 1))
        if code != 200:
            print("embed failed:", code, json.dumps(d)[:300])
            break
        for (i, _), e in zip(chunk, d["data"]):
            have[i] = [round(x, 5) for x in e["embedding"]]
        u = d.get("usage", {})
        run.append("_embeddings", {"n": len(chunk), "tokens": u.get("total_tokens", 0),
                                   "cost": u.get("total_tokens", 0) * 0.02 / 1e6, "for": "detect"})
        with open(path, "w") as f:
            json.dump(have, f)
        print(f"  embedded {len(have)}")


# ---- the detector ---------------------------------------------------------------

def fit_logreg(x, y, alpha=ALPHA, iters=25):
    """L2 logistic regression by Newton's method; the two classes weigh the same in total.
    Features are standardised on the training rows. Returns a scorer: rows -> P(model)."""
    # numpy 2 on macOS Accelerate flags spurious divide/overflow in matmul even for finite inputs
    # (np.ones @ zeros reproduces it); the weights are checked finite instead.
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        return _fit_logreg(x, y, alpha, iters)


def _fit_logreg(x, y, alpha, iters):
    mu, sd = x.mean(axis=0), x.std(axis=0) + 1e-9
    z = np.hstack([(x - mu) / sd, np.ones((len(x), 1))])
    wt = np.where(y == 1, 0.5 / max((y == 1).sum(), 1), 0.5 / max((y == 0).sum(), 1))
    reg = np.full(z.shape[1], alpha)
    reg[-1] = 0.0
    w = np.zeros(z.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-np.clip(z @ w, -30, 30)))
        g = z.T @ (wt * (p - y)) + reg * w
        hess = (z * (wt * p * (1 - p))[:, None]).T @ z + np.diag(reg + 1e-9)
        step = np.linalg.solve(hess, g)
        w -= step
        if np.abs(step).max() < 1e-6:
            break
    if not np.isfinite(w).all():
        raise FloatingPointError("logistic regression diverged")

    def score(rows):
        zz = np.hstack([(rows - mu) / sd, np.ones((len(rows), 1))])
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            s = 1 / (1 + np.exp(-np.clip(zz @ w, -30, 30)))
        if not np.isfinite(s).all():
            raise FloatingPointError("non-finite score")
        return s
    return score


def topic_fold(topic, k=K_TOPIC):
    if topic is None:
        return None
    return int(hashlib.sha1(topic.encode()).hexdigest(), 16) % k


def splits(items, pool):
    """Grouped splits. A test unit is one group (a model, a Reddit group, a Gutenberg author, this site's
    author) and one topic fold. Train on the pool minus that whole group, and minus every text on a topic
    in that fold, so no writer and no prompt or title is on both sides. Yields (train, test) index lists."""
    units = sorted({(it["group"], topic_fold(it["topic"])) for it in items}, key=str)
    for g, f in units:
        test = [i for i, it in enumerate(items) if it["group"] == g and topic_fold(it["topic"]) == f]
        train = [i for i in pool if items[i]["group"] != g and (f is None or topic_fold(items[i]["topic"]) != f)]
        yield train, test


def leaks(items, train, test):
    """What a split shares across train and test: groups, and topics."""
    tg = {items[i]["group"] for i in test}
    tt = {items[i]["topic"] for i in test} - {None}
    return ({items[i]["group"] for i in train} & tg) | ({items[i]["topic"] for i in train} & tt)


def cross_scores(items, x, pool):
    """Every item scored by a detector that never saw its group or its topic."""
    s = np.full(len(items), np.nan)
    y = np.array([it["y"] for it in items], dtype=float)
    for train, test in splits(items, pool):
        if not test or len({items[i]["y"] for i in train}) < 2:
            continue
        s[test] = fit_logreg(x[train], y[train])(x[test])
    return s


def auc(neg, pos):
    """Chance a random model text scores above a random human text (ties count half)."""
    neg, pos = np.asarray(neg), np.asarray(pos)
    return float(((pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum())
                 / (len(pos) * len(neg)))


def rates(items, s, idx):
    """Error rates over items idx at threshold 0.5: humans called AI (fpr), models called human (fnr)."""
    hum = [i for i in idx if items[i]["y"] == 0 and not np.isnan(s[i])]
    mod = [i for i in idx if items[i]["y"] == 1 and not np.isnan(s[i])]
    out = {"n_human": len(hum), "n_model": len(mod)}
    if hum:
        out["fpr"] = stories.r4(np.mean([s[i] >= 0.5 for i in hum]))
    if mod:
        out["fnr"] = stories.r4(np.mean([s[i] < 0.5 for i in mod]))
    if hum or mod:
        out["accuracy"] = stories.r4(np.mean([(s[i] >= 0.5) == (items[i]["y"] == 1) for i in hum + mod]))
        out["mean_p_model"] = stories.r4(np.mean([s[i] for i in hum + mod]))
    if hum and mod:
        out["auc"] = stories.r4(auc([s[i] for i in hum], [s[i] for i in mod]))
    return out


def cos_dist(a, b):
    a, b = stories._unit([a])[0], stories._unit([b])[0]
    return float(1 - a @ b)


# ---- the build ------------------------------------------------------------------

def load(data_dir=None):
    d = data_dir or DATA
    meta = {}
    mp = os.path.join(d, "_models.json")
    if os.path.exists(mp):
        meta = read_json(mp)
    emb = {}
    for name in ("stories.json", "detect.json"):
        p = os.path.join(d, "embeddings", name)
        if os.path.exists(p):
            emb.update(read_json(p))
    items = []

    def add(**it):
        if it["id"] in emb:
            items.append(it)
    for r in jl(os.path.join(d, "q33-story.jsonl")):
        if r.get("ok") and (r.get("text") or "").strip():
            add(id="%s-s%s" % (r["model"], r["sample"]), model=r["model"], group=model_group(r["model"]),
                kind="gpt" if provider(r["model"], meta) == "openai" else "claude", y=1, topic=None, set="base")
    for fname, kind in (("writingprompts.jsonl", "reddit"), ("gutenberg.jsonl", "gutenberg"),
                        ("author.jsonl", "author")):
        for r in jl(os.path.join(d, "human", fname)):
            topic = r["id"] if kind in ("reddit", "author") else None
            add(id=r["id"], group="h:" + r["group"], kind=kind, y=0, topic=topic, set="base")
    for r in gen_rows(d):
        add(id=gen_id(r), model=r["model"], group=model_group(r["model"]), y=1, topic=r["topic"], set=r["set"],
            kind="gpt" if provider(r["model"], meta) == "openai" else "claude")
    # Only a topic someone matched is a topic: an unused Reddit prompt constrains nothing.
    used = {it["topic"] for it in items if it["set"] != "base"}
    for it in items:
        if it["topic"] not in used:
            it["topic"] = None
    return items, np.array([emb[it["id"]] for it in items], dtype=float)


def build(data_dir=None):
    items, x = load(data_dir)
    n = len(items)
    base = [i for i in range(n) if items[i]["set"] == "base"]
    sA = cross_scores(items, x, base)          # trained on the original texts only
    matched_models = sorted({items[i]["model"] for i in range(n) if items[i]["set"] != "base"})
    sC = cross_scores(items, x, list(range(n))) if matched_models else sA   # with the matched texts too

    def kidx(kind, sets=("base",), pred=lambda it: True):
        return [i for i in range(n) if items[i]["kind"] == kind and items[i]["set"] in sets and pred(items[i])]

    out = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "models_matched": matched_models, "alpha": ALPHA, "k_topic": K_TOPIC,
           "n_groups": len({it["group"] for it in items})}
    out["base"] = {"all": rates(items, sA, base), "kinds": {k: rates(items, sA, kidx(k)) for k in KINDS}}
    per = {}
    for i in base:
        if items[i]["y"] == 1:
            per.setdefault(items[i]["model"], []).append(i)
    out["base"]["models"] = sorted(({"model": m, **rates(items, sA, ix)} for m, ix in per.items()),
                                   key=lambda r: (-r.get("fnr", 0), r.get("mean_p_model", 1)))
    if matched_models:
        mm = set(matched_models)
        hum_wp = [i for i in range(n) if items[i]["kind"] == "reddit" and items[i]["topic"] is not None]
        hum_ax = kidx("author")
        rows = []
        for label, hum, sets in (("stories", hum_wp, ("wp",)), ("essays", hum_ax, ("essay",))):
            for fam in ("gpt", "claude"):
                unmatched = kidx(fam, ("base",), lambda it: it["model"] in mm)
                matched = kidx(fam, sets)
                rows.append({"genre": label, "family": fam,
                             "unmatched": rates(items, sA, hum + unmatched),
                             "matched_old": rates(items, sA, hum + matched),
                             "matched_new": rates(items, sC, hum + matched)})
        models = []
        for m in matched_models:
            r = {"model": m, "unmatched": rates(items, sA, [i for i in base if items[i].get("model") == m])}
            for label, s in (("stories", "wp"), ("essays", "essay")):
                ix = [i for i in range(n) if items[i].get("model") == m and items[i]["set"] == s]
                r[label] = {"old": rates(items, sA, ix), "new": rates(items, sC, ix)}
            models.append(r)
        out["matched"] = {"rows": rows, "models": models,
                          "humans_old": {"reddit": rates(items, sA, hum_wp), "author": rates(items, sA, hum_ax)},
                          "humans_new": {"reddit": rates(items, sC, hum_wp), "author": rates(items, sC, hum_ax)}}
        out["distances"] = distances(items, x, mm)
        out["map"] = map_points(items, x)
    return out


def distances(items, x, mm):
    """Mean cosine distance from a human text to model texts on its own prompt or title, and to the same
    models' free stories. Human-to-human pairs in the same set give the floor."""
    vec = {it["id"]: x[i] for i, it in enumerate(items)}
    by_topic, free = {}, []
    for it in items:
        if it["y"] == 1 and it["set"] != "base":
            by_topic.setdefault(it["topic"], []).append(it["id"])
        if it["y"] == 1 and it["set"] == "base" and it["model"] in mm:
            free.append(it["id"])

    def cen(ids):
        return stories._unit([np.mean(stories._unit([vec[i] for i in ids]), axis=0)])[0]
    res = {}
    for label, kind in (("stories", "reddit"), ("essays", "author")):
        hum = [it["id"] for it in items if it["kind"] == kind and it["topic"] in by_topic]
        if not hum:
            continue
        mods = [m for h in hum for m in by_topic[h]]
        res[label] = {
            "n_human": len(hum), "n_model": len(mods),
            "matched": stories.r4(np.mean([cos_dist(vec[h], vec[m]) for h in hum for m in by_topic[h]])),
            "unmatched": stories.r4(np.mean([cos_dist(vec[h], vec[m]) for h in hum for m in free])),
            "human_human": stories.r4(np.mean([cos_dist(vec[a], vec[b]) for j, a in enumerate(hum) for b in hum[j + 1:]])),
            "centroid_matched": stories.r4(1 - cen(hum) @ cen(mods)),
            "centroid_unmatched": stories.r4(1 - cen(hum) @ cen(free))}
    return res


def map_points(items, x):
    """The topic-matched texts placed on the Stories map's own axes: the same texts and PCA as stories.py,
    with each axis's sign matched to site/stories.json."""
    base = [i for i, it in enumerate(items) if it["set"] == "base"]
    sp = os.path.join(ROOT, "site", "stories.json")
    ref = {p["id"]: (p["x"], p["y"]) for p in (read_json(sp).get("points", []) if os.path.exists(sp) else [])}
    xb = x[base]
    mean = xb.mean(axis=0)
    axes = np.linalg.svd(xb - mean, full_matrices=False)[2][:2].copy()
    pb = (xb - mean) @ axes.T
    common = [k for k, i in enumerate(base) if items[i]["id"] in ref]
    for a in range(2):
        if common and np.dot([ref[items[base[k]]["id"]][a] for k in common], pb[common, a]) < 0:
            axes[a] = -axes[a]
    pts = []
    for i, it in enumerate(items):
        if it["set"] != "base":
            px, py = (x[i] - mean) @ axes.T
            pts.append({"set": it["set"], "kind": it["kind"], "model": it["model"],
                        "x": stories.r4(px), "y": stories.r4(py)})
    return pts


def main():
    out = os.environ.get("MZ_OUT") or os.path.join(ROOT, "site", "detect.json")
    res = build()
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
    print(json.dumps({k: res[k] for k in ("base", "distances") if k in res}, indent=1)[:4000])
    print("wrote", out)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    {"prompts": lambda: prep_prompts(sys.argv[2]), "estimate": estimate, "gen": gen, "embed": embed,
     "build": main}[cmd]()
