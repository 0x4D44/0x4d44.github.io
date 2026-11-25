#!/usr/bin/env python3
"""Summarise the stochasticity experiments: stoch_report.py  (reads ../data/stoch-*.jsonl)."""
import collections, itertools, json, math, os, random, re

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def load(exp):
    p = os.path.join(DATA, "stoch-%s.jsonl" % exp)
    return [r for r in map(json.loads, open(p)) if r.get("ok")] if os.path.exists(p) else []


def norm(t):
    return re.sub(r"[^\w ]", "", t.strip().lower())


def entropy(xs):
    c = collections.Counter(xs); n = len(xs)
    return -sum(v / n * math.log2(v / n) for v in c.values())


def words(t):
    return re.findall(r"\w+|[^\w\s]", t.lower())


def first_split(a, b):
    a, b = words(a), words(b)
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return i
    return min(len(a), len(b)) if len(a) != len(b) else None  # None: identical


def shingles(t, k=3):
    w = words(t)
    return {tuple(w[i:i + k]) for i in range(len(w) - k + 1)}


def jacc(a, b):
    return len(a & b) / len(a | b) if a | b else 1.0


def stories(texts):
    pairs = list(itertools.combinations(texts, 2))
    splits = [first_split(a, b) for a, b in pairs]
    ident = sum(s is None for s in splits)
    real = sorted(s for s in splits if s is not None)
    sim = sum(jacc(shingles(a), shingles(b)) for a, b in pairs) / len(pairs)
    titles = collections.Counter(t.strip().split("\n")[0].strip("#* ").lower() for t in texts)
    return {"n": len(texts), "distinct": len(set(texts)), "identical_pairs": "%d/%d" % (ident, len(pairs)),
            "median_split_word": real[len(real) // 2] if real else None,
            "trigram_overlap": round(sim, 2), "titles": titles.most_common(3)}


def embeddings():
    """(exp, model, cond, sample, turn) -> unit vector, from stoch-embeddings.jsonl."""
    p = os.path.join(DATA, "stoch-embeddings.jsonl")
    out = {}
    if os.path.exists(p):
        for r in map(json.loads, open(p)):
            v = r["vec"]; n = math.sqrt(sum(x * x for x in v)) or 1.0
            out[(r["exp"], r["model"], r["cond"], r["sample"], r.get("turn"))] = [x / n for x in v]
    return out


def cos(a, b):
    return sum(x * y for x, y in zip(a, b))


def mean_cos(vecs):
    """Mean pairwise cosine similarity: 1.0 = the same meaning every time."""
    pairs = list(itertools.combinations(vecs, 2))
    return round(sum(cos(a, b) for a, b in pairs) / len(pairs), 3) if pairs else None


def report():
    out = {}
    dial = load("dial")
    g = collections.defaultdict(list)
    for r in dial:
        g[(r["model"], r["cond"], r["prompt_id"])].append(r)
    out["dial_short"] = {}
    out["dial_story"] = {}
    out["logprobs"] = {}
    for (m, c, p), rs in sorted(g.items()):
        if p == "story":
            out["dial_story"]["%s %s" % (m, c)] = stories([r["text"] for r in rs])
        elif p == "number-lp":
            top = rs[0].get("top") or []
            out["logprobs"]["%s %s" % (m, c)] = [(t, round(math.exp(lp), 3)) for t, lp in top[:6]]
        else:
            a = [norm(r["text"]) for r in rs]
            cnt = collections.Counter(a)
            out["dial_short"]["%s %s %s" % (m, c, p)] = {"distinct": len(cnt), "bits": round(entropy(a), 2),
                                                        "top": cnt.most_common(3)}
    emb = embeddings()
    rep = load("repeat")
    g = collections.defaultdict(list)
    for r in rep:
        g[(r["model"], r["cond"])].append(r)
    out["repeat"] = {}
    for (m, c), rs in sorted(g.items()):
        s = stories([r["text"] for r in rs])
        vecs = [emb[k] for k in (("repeat", m, c, r["sample"], None) for r in rs) if k in emb]
        if len(vecs) > 1:
            s["cosine"] = mean_cos(vecs)
        fps = collections.Counter(r.get("fingerprint") for r in rs)
        if any(fps):
            s["fingerprints"] = dict(fps)
        out["repeat"]["%s %s" % (m, c)] = s
    wd = load("wording")
    g = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in wd:
        g[r["model"]][r["prompt_id"]].append(norm(r["text"]))
    out["wording"] = {}
    rnd = random.Random(1)
    for m, by in g.items():
        tops = {w: collections.Counter(a).most_common(2) for w, a in by.items()}
        within = sum(entropy(a) for a in by.values()) / len(by)
        pooled = entropy([x for a in by.values() for x in a])
        # the share of pooled spread that comes from the wording: 1 - within/pooled
        out["wording"][m] = {"within_bits": round(within, 2), "pooled_bits": round(pooled, 2),
                             "from_wording": round(1 - within / pooled, 2) if pooled else 0.0, "tops": tops}
    rl = load("relay")
    if rl:
        chains = collections.defaultdict(dict)
        for r in rl:
            chains[r["sample"]][r["turn"]] = r["text"]
        turns = sorted({t for c in chains.values() for t in c})
        div = {}
        for t in turns:
            sents = [c[t] for c in chains.values() if t in c]
            pairs = list(itertools.combinations(sents, 2))
            div[t] = round(sum(jacc(set(words(a)), set(words(b))) for a, b in pairs) / len(pairs), 2) if pairs else None
        out["relay_word_overlap_by_turn"] = div
        # meaning, not words: mean pairwise cosine of the five chains' sentences at each turn
        out["relay_cosine_by_turn"] = {t: mean_cos([emb[k] for k in (("relay", r["model"], r["cond"], r["sample"], t)
                                                                    for r in rl if r["turn"] == t) if k in emb])
                                       for t in turns}
        out["relay_turn1"] = [c.get(1, "")[:110] for c in chains.values()]
        out["relay_last"] = [c.get(max(c), "")[:110] for c in chains.values()]
    out["wording_rank"] = sorted(((m, w["within_bits"], w["from_wording"]) for m, w in out["wording"].items()),
                                 key=lambda x: -x[1])
    out["spent"] = round(sum(r.get("cost", 0) for e in ("dial", "repeat", "wording", "relay", "embeddings")
                             for r in load(e)), 2)
    return out


if __name__ == "__main__":
    print(json.dumps(report(), indent=1, ensure_ascii=False))
