#!/usr/bin/env python3
"""How the detector does on a private library of model writing, and what each model's habits are.

  books.py <books_dir>    sample ~300-word passages from the collections in <books_dir> (a private repo: one
                          folder per collection, "<date> - <model> - <title>"), embed them into
                          ../data/embeddings/books.json (local only), and build ../site/books.json

The library is private. Its text goes nowhere but the embeddings endpoint; the site file holds only
counts, rates and model names: no text, titles, collection or file names.
"""
import hashlib, json, math, os, random, re, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import detect  # noqa: E402

DATA = os.environ.get("MZ_DATA") or os.path.join(os.path.dirname(HERE), "data")
FORMS = ("fiction/short-stories", "fiction/novels", "fiction/scripts-and-tv", "non-fiction")
SKIP_FILE = re.compile(r"(REVIEW|RANKING|SCOR|README|SUMMARY|INDEX|NOTES|OUTLINE|PLAN|STYLE|GUIDE|PROMPT|CHECKLIST"
                       r"|TIMELINE|CHARACTER|BIBLE|FEEDBACK|ANALYSIS|CRITIQUE|TODO)", re.I)
SKIP_DIRS = {"wrk_docs", "audio", "epub", "translations", "originals"}
ENGLISH = set("the and of to a in that was he she it his her with for as on had but at not they you i".split())
CAP, CAP_UNKNOWN = 160, 30          # passages per model; per unlabelled collection
MIN_ID = (40, 3)                    # a model joins the who-wrote-it test with this many passages and files


def label(coll, fname):
    """The model that wrote a file: the collection's tag, corrected where a file says otherwise."""
    m = coll.split(" - ")[1]
    f = fname.lower()
    if "(gpt4)" in f or "claude's standup" in f or "only chapters 1-12" in f:
        return None                 # another model's work, a persona piece, a duplicate
    if m == "o1-pro" and fname.startswith("2025.02.24 - 0"):
        return "gemini"             # these say "Gemini 2.0 Flash Thinking" in their first line
    if m == "mixed":
        for key, tag in (("gemini", "gemini"), ("o1 pro", "o1-pro"), ("o1-pro", "o1-pro"), ("o3-mini", "o3-mini")):
            if key in f:
                return tag
        return None
    return m


def clean(text):
    out = []
    for ln in re.sub(r"<[^>]+>", " ", text).split("\n"):
        s = ln.strip()
        if s.startswith(("#", "|", ">")) or re.fullmatch(r"[-*_=\s]{3,}", s or "x"):
            out.append("")
            continue
        s = re.sub(r"\*\*|__|(?<!\w)[*_](?!\s)|(?<!\s)[*_](?!\w)", "", s)
        out.append(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s))
    return [p.strip() for p in re.split(r"\n\s*\n", "\n".join(out)) if p.strip()]


def chunks(paras, lo=250, hi=400):
    cur, n, res = [], 0, []
    for p in paras:
        cur.append(p)
        n += len(p.split())
        if n >= lo:
            t = "\n\n".join(cur)
            ws = t.split(" ")
            if len(ws) > hi:
                t = " ".join(ws[:hi])
                k = max(t.rfind(". "), t.rfind('." '))
                if k > len(t) * 0.6:
                    t = t[:k + 1]
            res.append(t)
            cur, n = [], 0
    return res


def collect(bdir):
    docs = []
    for form in FORMS:
        fdir = os.path.join(bdir, form)
        for coll in sorted(os.listdir(fdir)) if os.path.isdir(fdir) else []:
            cp = os.path.join(fdir, coll)
            if not os.path.isdir(cp) or coll.count(" - ") < 2:
                continue
            for root, dirs, files in os.walk(cp):
                dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
                for f in sorted(files):
                    if not f.endswith(".md") or SKIP_FILE.search(f):
                        continue
                    m = label(coll, f)
                    if m is None:
                        continue
                    paras = clean(open(os.path.join(root, f), encoding="utf-8", errors="replace").read())
                    words = " ".join(paras).lower().split()
                    if len(words) < 300 or sum(w in ENGLISH for w in words) / len(words) < 0.15:
                        continue
                    docs.append({"model": m, "form": form.split("/")[-1], "coll": coll, "date": coll[:10],
                                 "file": os.path.relpath(os.path.join(root, f), bdir), "words": len(words),
                                 "text": "\n\n".join(paras), "chunks": chunks(paras)})
    return docs


def sample(docs):
    """Up to CAP passages a model, spread round-robin over its files; each unlabelled collection on its own."""
    rng = random.Random(0x4D44)
    by = defaultdict(list)
    for d in docs:
        by[d["model"] if d["model"] != "unknown" else "unknown|" + d["coll"]].append(d)
    out, seen = [], set()
    for key in sorted(by):
        ds = by[key]
        cap = CAP_UNKNOWN if key.startswith("unknown|") else CAP
        per = max(4, -(-cap // len(ds)))
        pools = []
        for d in ds:
            c = len(d["chunks"])
            idx = [round(i * (c - 1) / (per - 1)) for i in range(per)] if c > per else list(range(c))
            pools.append([(d, i) for i in idx])
        rng.shuffle(pools)
        got = []
        while len(got) < cap and any(pools):
            for p in pools:
                if p and len(got) < cap:
                    got.append(p.pop(0))
        for d, i in got:
            h = hashlib.sha1(d["chunks"][i][:400].encode()).hexdigest()
            if h not in seen:
                seen.add(h)
                out.append({"id": "%s#%d" % (d["file"], i), "model": d["model"], "form": d["form"],
                            "coll": d["coll"], "date": d["date"], "file": d["file"], "text": d["chunks"][i]})
    return out


def embed(pas):
    path = os.path.join(DATA, "embeddings", "books.json")
    have = detect.read_json(path) if os.path.exists(path) else {}
    todo = [p for p in pas if p["id"] not in have]
    if todo:
        import run
        for k in range(0, len(todo), 100):
            ch = todo[k:k + 100]
            for attempt in range(6):
                code, d = run.http("POST", "/embeddings", {"model": "text-embedding-3-small",
                                                           "input": [p["text"] for p in ch]})
                if code not in (0, 429, 500, 502, 503):
                    break
                run.time.sleep(5 * (attempt + 1))
            if code != 200:
                raise SystemExit("embed failed: %s %s" % (code, json.dumps(d)[:300]))
            for p, e in zip(ch, d["data"]):
                have[p["id"]] = [round(x, 5) for x in e["embedding"]]
            u = d.get("usage", {})
            run.append("_embeddings", {"n": len(ch), "tokens": u.get("total_tokens", 0),
                                       "cost": u.get("total_tokens", 0) * 0.02 / 1e6, "for": "books"})
            with open(path, "w") as f:
                json.dump(have, f)
    return np.array([have[p["id"]] for p in pas], dtype=float)


def family(m):
    if m.startswith("claude"):
        return "claude"
    if m == "gemini":
        return "gemini"
    return "openai"


def fold(key, k=5):
    return int(hashlib.sha1(key.encode()).hexdigest(), 16) % k


def one_vs_rest(xtr, ytr, xte, classes):
    return np.column_stack([detect.fit_logreg(xtr, (ytr == c).astype(float), alpha=1.0)(xte) for c in classes])


def who_wrote_it(pas, X, models, classes, key):
    """Each passage's writer guessed by a model that never saw its file (5 folds by file)."""
    idx = [i for i, p in enumerate(pas) if p["model"] in models]
    y = np.array([key(pas[i]) for i in idx], dtype=object)
    f = np.array([fold(pas[i]["file"]) for i in idx])
    pred = np.empty(len(idx), dtype=object)
    for k in range(5):
        tr, te = f != k, f == k
        if te.any():
            pred[te] = np.array(classes, dtype=object)[one_vs_rest(X[idx][tr], y[tr], X[idx][te], classes).argmax(1)]
    # A "mixed" collection is several models writing to the same prompts: there subject cannot give it away.
    shared = np.array([pas[i]["coll"].split(" - ")[1] == "mixed" for i in idx], dtype=bool)
    same = {"n": int(shared.sum()), "models": sorted({pas[i]["model"] for k, i in enumerate(idx) if shared[k]})}
    if shared.any():
        same["correct"] = detect.stories.r4(float(np.mean(pred[shared] == y[shared])))
    return {"classes": classes, "n": {c: int((y == c).sum()) for c in classes}, "shared_prompts": same,
            "correct": detect.stories.r4(float(np.mean(pred == y))),
            "per_class": {c: detect.stories.r4(float(np.mean(pred[y == c] == c))) for c in classes},
            "confusion": {c: {d: int(((y == c) & (pred == d)).sum()) for d in classes} for c in classes}}


STYLE = [  # (label, regex, ignore case)
    ("em dashes", r"—|(?<=\w)--(?=\w)|\s--\s|\s–\s", False),
    ("semicolons", r";", False),
    ("ellipses", r"\.\.\.|…", False),
    ("contractions (n't)", r"n['’]t\b", True),
    ("-ly adverbs", r"\b\w{3,}ly\b", True),
    ("“I”", r"\bI\b", False),
    ("“you”", r"\byou\b", True),
    ("“said”", r"\bsaid\b", True),
    ("fancy speech tags", r"\b(?:murmured|whispered|breathed|muttered|exclaimed|retorted|replied|snapped|hissed|intoned|mused)\b", True),
    ("“not X but Y”", r"\bnot (?:just |only |merely |simply )?[\w' ]{1,30}[,;—-]+\s*but\b"
                      r"|\b(?:it|this|that)(?:'s|’s| was| is) not [\w' ]{1,30}[.;—]\s*(?:it|this|that)(?:'s|’s| was| is)\b"
                      r"|\bwasn['’]t (?:just |about )?[\w' ]{1,25}\. (?:It|This) was\b", False),
    ("“perhaps”", r"\bperhaps\b", True),
    ("“maybe”", r"\bmaybe\b", True),
    ("testament, tapestry, delve…", r"\b(?:testament|tapestry|delve|intricate|palpable|symphony|kaleidoscope)\w*", True),
    ("numbers", r"\b\d[\d,.]*\b|\b(?:three|four|five|six|seven|eight|nine|ten|twelve|twenty|forty|hundred)\b", True),
]


def style(docs, min_words=10000):
    """Habits per 1,000 words, over each model's fiction (stories and novels) pooled."""
    agg = defaultdict(lambda: defaultdict(float))
    for d in docs:
        if d["form"] not in ("short-stories", "novels") or d["model"] == "unknown":
            continue
        a, t = agg[d["model"]], d["text"]
        a["words"] += d["words"]
        a["docs"] += 1
        for lab, rx, ci in STYLE:
            a[lab] += len(re.findall(rx, t, flags=(re.I if ci else 0) | re.M))
        ss = [s for s in re.split(r"(?<=[.!?])[\"”’)]*\s+", t) if s.split()]
        a["sents"] += len(ss)
        a["short"] += sum(len(s.split()) <= 5 for s in ss)
        ps = [p for p in t.split("\n\n") if p.strip()]
        a["paras"] += len(ps)
        a["tiny"] += sum(len(p.split()) <= 10 for p in ps)
    out = {}
    for m, a in agg.items():
        if a["words"] < min_words:
            continue
        w = a["words"]
        r = {"files": int(a["docs"]), "words": int(w)}
        r.update({lab: round(1000 * a[lab] / w, 2) for lab, _, _ in STYLE})
        r["words per sentence"] = round(w / a["sents"], 1)
        r["sentences of 5 words or fewer (%)"] = round(100 * a["short"] / a["sents"])
        r["paragraphs of 10 words or fewer (%)"] = round(100 * a["tiny"] / a["paras"])
        out[m] = r
    return out


def build(bdir, data_dir=None):
    docs = collect(bdir)
    pas = sample(docs)
    X = embed(pas)
    items, x = detect.load(data_dir)
    y = np.array([it["y"] for it in items], dtype=float)
    pools = {"plain": [i for i, it in enumerate(items) if it["set"] == "base"],
             "matched": [i for i, it in enumerate(items) if it["set"] in ("base", "wp", "essay")],
             "with_nonfiction": list(range(len(items)))}
    scores = {k: detect.fit_logreg(x[ix], y[ix])(X) for k, ix in pools.items()}
    det = defaultdict(lambda: defaultdict(list))
    for i, p in enumerate(pas):
        for key in (p["model"], p["model"] + "|" + p["form"]):
            for k, s in scores.items():
                det[key][k].append(float(s[i]))
    detector = []
    for key, v in sorted(det.items()):
        m, _, form = key.partition("|")
        detector.append({"model": m, "form": form or None, "n": len(v["plain"]),
                         **{k: detect.stories.r4(float(np.mean(np.array(s) >= 0.5))) for k, s in v.items()}})
    cnt, files = Counter(p["model"] for p in pas), defaultdict(set)
    for p in pas:
        files[p["model"]].add(p["file"])
    ms = sorted(m for m in cnt if m != "unknown" and cnt[m] >= MIN_ID[0] and len(files[m]) >= MIN_ID[1])
    fams = sorted({family(m) for m in ms})
    # The unlabelled collections: which model would the who-wrote-it test name? (dates and forms only)
    lab = [i for i, p in enumerate(pas) if p["model"] in ms]
    S = one_vs_rest(X[lab], np.array([pas[i]["model"] for i in lab], dtype=object), X, ms)
    unk = defaultdict(list)
    for i, p in enumerate(pas):
        if p["model"] == "unknown":
            unk[(p["date"], p["coll"])].append(i)
    unknown = []
    for (date, _), ix in sorted(unk.items()):
        if len(ix) < 10:
            continue
        votes = Counter(ms[j] for j in S[ix].argmax(1)).most_common()
        unknown.append({"date": date, "form": pas[ix[0]]["form"], "n": len(ix), "top": votes[0][0],
                        "top_share": detect.stories.r4(votes[0][1] / len(ix)),
                        "claude_share": detect.stories.r4(sum(c for m, c in votes if family(m) == "claude") / len(ix)),
                        "caught": detect.stories.r4(float(np.mean(scores["with_nonfiction"][ix] >= 0.5)))})
    return {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "n_passages": len(pas), "n_files": len({p["file"] for p in pas}),
            "n_labelled": sum(1 for p in pas if p["model"] != "unknown"),
            "detector": detector,
            "who": {"models": who_wrote_it(pas, X, ms, ms, lambda p: p["model"]),
                    "families": who_wrote_it(pas, X, ms, fams, lambda p: family(p["model"]))},
            "style": style(docs), "unknown": unknown}


def main():
    out = os.environ.get("MZ_OUT") or os.path.join(os.path.dirname(HERE), "site", "books.json")
    res = build(sys.argv[1])
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
    print(json.dumps({k: res[k] for k in ("n_passages", "n_files", "who")}, indent=1)[:3000])
    print("wrote", out)


if __name__ == "__main__":
    main()
