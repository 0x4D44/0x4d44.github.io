#!/usr/bin/env python3
"""Story-variety metrics for the model zoo: models vs. human writing.

Usage: python3 model-zoo/tools/stories.py   (writes model-zoo/site/stories.json)
Paths can be overridden with the MZ_DATA and MZ_OUT environment variables or
function arguments. Output never contains human story text.
"""
import json
import os
import re
import statistics
from collections import Counter
from datetime import datetime, timezone
from itertools import combinations

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")
RAW_WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
MTLD_THRESHOLD = 0.72
NAME_STOP = set("""i the a an and but or so if then when while as at in on of to for from by with
he she it they we you his her its their our my your this that these those there here what who
whom which where why how all any some no not yes oh ah well now just once after before again
mr mrs ms miss dr sir madam lord lady st
monday tuesday wednesday thursday friday saturday sunday
january february march april may june july august september october november december
i'm i'd i'll i've""".split())
AI_WORDS = sorted(set("""whisper whispers whispered whispering tapestry delve delved testament symphony echo echoes
echoed echoing ancient silence shimmer shimmered shimmering flicker flickered flickering hum hummed humming
resonate resonated resonates realm beacon embrace embraced journey ethereal gossamer cascade cascaded
luminous vibrant intricate mosaic""".split()))
AI_WORDS_SET = set(AI_WORDS)

METHOD = {
    "words": "Word count of the prose (model titles are dropped first).",
    "mattr": "Moving-average type-token ratio over 50-word windows: how much of the vocabulary is fresh, "
             "averaged over every window so length does not skew it. Higher means more varied words.",
    "mtld": "Measure of textual lexical diversity (McCarthy and Jarvis 2010): how many words it takes, on "
            "average, before the running type-token ratio falls to 0.72, read forwards and backwards. "
            "Higher means richer vocabulary.",
    "yule_k": "Yule's K: 10,000 x (sum of squared word frequencies minus length) / length squared. "
              "Higher means more repetition of the same words.",
    "distinct_1": "Unique single words divided by all words, pooled over the group's ten stories.",
    "distinct_2": "Unique word pairs divided by all word pairs, pooled over the group. Low means the "
                  "ten stories reuse the same phrases.",
    "distinct_3": "Unique word triples divided by all triples, pooled over the group.",
    "self_overlap": "Average Jaccard similarity (shared / total) between the word-trigram sets of every "
                    "pair of stories in the group. Higher means the stories echo each other.",
    "title_repeat": "Share of a model's stories whose title (ignoring case) matches another of its titles.",
    "openers": "The first four words of each story and how many of the ten share them.",
    "names": "Capitalised words that are not at the start of a sentence (mostly character and place "
             "names). Models: top ten with counts. Humans: only the number of distinct names.",
    "ai_vocab_rate": "Occurrences per 1,000 words of a fixed list of words typical of AI prose "
                     "(whisper, tapestry, echo, flicker, ...).",
    "ai_vocab_list": AI_WORDS,
    "map": "All stories embedded as 1536-number vectors, mean-centred, squashed to two axes by PCA "
           "(singular value decomposition). Nearby points read alike.",
    "spread": "Mean cosine distance from each story to its group's centroid, in the full 1536 dimensions. "
              "Small means the group's stories are alike.",
    "closest_pair": "The two stories of a model that are most similar by cosine similarity.",
}


def norm(text):
    return (text or "").replace("’", "'").replace("‘", "'").replace("`", "'")


def tokenize(text):
    return WORD_RE.findall(norm(text).lower())


# ---- metrics -------------------------------------------------------------

def ttr(tokens):
    return len(set(tokens)) / len(tokens) if tokens else 0.0


def mattr(tokens, window=50):
    n = len(tokens)
    if n == 0:
        return 0.0
    if n <= window:
        return ttr(tokens)
    counts = Counter(tokens[:window])
    acc = len(counts) / window
    for i in range(window, n):
        out, inn = tokens[i - window], tokens[i]
        counts[out] -= 1
        if counts[out] == 0:
            del counts[out]
        counts[inn] += 1
        acc += len(counts) / window
    return acc / (n - window + 1)


def mtld_pass(tokens, threshold=MTLD_THRESHOLD):
    """One directional pass: full factors + partial factor (1-ttr)/(1-threshold)."""
    factors = 0.0
    seen = set()
    count = 0
    cur = 1.0
    for t in tokens:
        count += 1
        seen.add(t)
        cur = len(seen) / count
        if cur <= threshold:
            factors += 1
            seen = set()
            count = 0
            cur = 1.0
    if count > 0:
        factors += (1 - cur) / (1 - threshold)
    return len(tokens) / factors if factors > 0 else float(len(tokens))


def mtld(tokens, threshold=MTLD_THRESHOLD):
    if not tokens:
        return 0.0
    return (mtld_pass(tokens, threshold) + mtld_pass(tokens[::-1], threshold)) / 2


def yule_k(tokens):
    n = len(tokens)
    if n == 0:
        return 0.0
    freq = Counter(tokens)
    return 10000.0 * (sum(f * f for f in freq.values()) - n) / (n * n)


def ngrams(tokens, n):
    return [tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)]


def distinct_n(token_lists, n):
    allg = [g for toks in token_lists for g in ngrams(toks, n)]
    return len(set(allg)) / len(allg) if allg else 0.0


def jaccard(a, b):
    a, b = set(a), set(b)
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def self_overlap(token_lists, n=3):
    sets = [set(ngrams(t, n)) for t in token_lists]
    pairs = [jaccard(a, b) for a, b in combinations(sets, 2)]
    return sum(pairs) / len(pairs) if pairs else 0.0


def names(text):
    """Counter of capitalised words that do not start a sentence and are not stopwords."""
    t = norm(text)
    out = Counter()
    for m in RAW_WORD_RE.finditer(t):
        w = m.group(0)
        if w.endswith("'s"):
            w = w[:-2]
        if len(w) < 2 or not (w[0].isupper() and w[1:].islower()):
            continue
        before = t[:m.start()].rstrip(" \t\n\"'(*_-—–“”")
        if before == "" or before[-1] in ".!?:":
            continue
        if w.lower() in NAME_STOP:
            continue
        out[w] += 1
    return out


def ai_rate(token_lists):
    total = sum(len(t) for t in token_lists)
    if not total:
        return 0.0
    hits = sum(1 for t in token_lists for w in t if w in AI_WORDS_SET)
    return 1000.0 * hits / total


def pca2(mat):
    """Mean-centre, project to 2 axes. Returns (coords[n,2], explained variance ratio[2])."""
    x = np.asarray(mat, dtype=float)
    x = x - x.mean(axis=0)
    u, s, vt = np.linalg.svd(x, full_matrices=False)
    k = min(2, len(s))
    coords = u[:, :k] * s[:k]
    if k < 2:
        coords = np.hstack([coords, np.zeros((len(x), 2 - k))])
    var = s ** 2
    ratio = var / var.sum() if var.sum() > 0 else var
    return coords, ratio[:2]


def _unit(vecs):
    v = np.asarray(vecs, dtype=float)
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


def cos_dist_spread(vecs):
    v = _unit(vecs)
    c = v.mean(axis=0)
    c = c / max(np.linalg.norm(c), 1e-12)
    return float(np.mean(1 - (v * c).sum(axis=1)))


def closest_pair(ids, vecs):
    v = _unit(vecs)
    sim = np.einsum("ik,jk->ij", v, v)
    np.fill_diagonal(sim, -2)
    i, j = np.unravel_index(np.argmax(sim), sim.shape)
    return ids[int(i)], ids[int(j)], float(sim[i, j])


# ---- pipeline ------------------------------------------------------------

def r4(x):
    return round(float(x), 4)


def mean_sd(vals):
    if not vals:
        return {"mean": 0.0, "sd": 0.0}
    return {"mean": r4(statistics.fmean(vals)),
            "sd": r4(statistics.stdev(vals)) if len(vals) > 1 else 0.0}


def read_jsonl(path):
    out = []
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except ValueError:
                pass  # a run may be mid-append
    return out


def group_stats(items, kind, emb, provider=None):
    """items: list of dicts with id, title (or None), text."""
    toks = [tokenize(i["text"]) for i in items]
    g = {"kind": kind, "n": len(items)}
    if provider is not None:
        g["provider"] = provider
    for key, fn in (("words", len), ("mattr", mattr), ("mtld", mtld), ("yule_k", yule_k)):
        g[key] = mean_sd([fn(t) for t in toks])
    for n in (1, 2, 3):
        g["distinct_%d" % n] = r4(distinct_n(toks, n))
    g["self_overlap"] = r4(self_overlap(toks))
    g["ai_vocab_rate"] = r4(ai_rate(toks))
    nm = Counter()
    for i in items:
        nm.update(names(i["text"]))
    if kind == "model":
        titles = [(i["title"] or "").strip().casefold() for i in items]
        tc = Counter(titles)
        g["title_repeat"] = r4(sum(1 for t in titles if tc[t] > 1) / len(titles))
        ops = [" ".join(t[:4]) for t in toks]
        oc = Counter(ops)
        g["openers"] = [{"text": o, "count": oc[o]} for o in ops]
        g["names_top"] = [{"name": k, "count": v} for k, v in nm.most_common(10)]
    else:
        g["names_distinct"] = len(nm)
    have = [(i["id"], emb[i["id"]]) for i in items if i["id"] in emb]
    g["n_embedded"] = len(have)
    if len(have) >= 2:
        g["spread"] = r4(cos_dist_spread([v for _, v in have]))
        if kind == "model":
            a, b, s = closest_pair([i for i, _ in have], [v for _, v in have])
            title = {i["id"]: i["title"] for i in items}
            g["closest_pair"] = {"a": a, "b": b, "title_a": title[a], "title_b": title[b],
                                 "similarity": r4(s)}
    else:
        g["spread"] = None
    return g


def build(data_dir=None, models_path=None):
    data_dir = data_dir or os.environ.get("MZ_DATA") or os.path.join(ROOT, "data")
    models_path = models_path or os.path.join(data_dir, "_models.json")
    meta = {}
    if os.path.exists(models_path):
        with open(models_path, encoding="utf-8") as f:
            meta = json.load(f)
    emb = {}
    ep = os.path.join(data_dir, "embeddings", "stories.json")
    if os.path.exists(ep):
        with open(ep, encoding="utf-8") as f:
            emb = json.load(f)

    groups = {}
    members = {}

    by_model = {}
    for r in read_jsonl(os.path.join(data_dir, "q33-story.jsonl")):
        text = r.get("text") or ""
        if not r.get("ok") or not text.strip():
            continue
        lines = text.strip().split("\n", 1)
        title = lines[0].strip().strip("*#_ ").strip()
        body = lines[1] if len(lines) > 1 else ""
        by_model.setdefault(r["model"], {})[r["sample"]] = {
            "id": "%s-s%s" % (r["model"], r["sample"]), "title": title, "text": body}
    for model in sorted(by_model):
        items = [by_model[model][k] for k in sorted(by_model[model])]
        prov = meta.get(model.split("@")[0], {}).get("provider")
        groups[model] = group_stats(items, "model", emb, prov)
        members[model] = [i["id"] for i in items]

    for fname, kind in (("writingprompts.jsonl", "writingprompts"), ("gutenberg.jsonl", "gutenberg")):
        by_g = {}
        for r in read_jsonl(os.path.join(data_dir, "human", fname)):
            if (r.get("text") or "").strip():
                by_g.setdefault(r["group"], []).append(
                    {"id": r["id"], "title": None, "text": r["text"]})
        for gname in sorted(by_g):
            groups[gname] = group_stats(by_g[gname], kind, emb)
            members[gname] = [i["id"] for i in by_g[gname]]

    pts_ids, pts_grp = [], []
    for gname, ids in members.items():
        for i in ids:
            if i in emb:
                pts_ids.append(i)
                pts_grp.append(gname)
    points = []
    explained = [0.0, 0.0]
    if len(pts_ids) >= 2:
        coords, ratio = pca2([emb[i] for i in pts_ids])
        explained = [r4(x) for x in ratio]
        for i, g, (x, y) in zip(pts_ids, pts_grp, coords):
            points.append({"id": i, "group": g, "x": r4(x), "y": r4(y)})
    method = dict(METHOD)
    method["pca_explained"] = explained
    return {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "method": method, "groups": groups, "points": points}


def main():
    out = os.environ.get("MZ_OUT") or os.path.join(ROOT, "site", "stories.json")
    result = build()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print("%-34s %3s %7s %6s %6s %6s" % ("group", "n", "MTLD", "dist2", "selfov", "spread"))
    for name, g in result["groups"].items():
        sp = g["spread"]
        print("%-34s %3d %7.1f %6.3f %6.3f %6s" % (
            name[:34], g["n"], g["mtld"]["mean"], g["distinct_2"], g["self_overlap"],
            "-" if sp is None else "%.3f" % sp))
    print("wrote", out, "(%d groups, %d points)" % (len(result["groups"]), len(result["points"])))


if __name__ == "__main__":
    main()
