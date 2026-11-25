#!/usr/bin/env python3
"""Human baselines for the story analysis, and embeddings for every story.

  corpus.py prep <corpus_dir>   sample human texts into ../data/human/*.jsonl
      - WritingPrompts (Reddit, 2018; test split): 250 stories of 200-450 words, in
        25 groups of 10 different authors. Copyright stays with the authors: the site
        publishes only metrics, never this text, and these files stay out of git.
      - Project Gutenberg (public domain, pre-1928): 300-word passages, 10 per author
        (O. Henry, Chekhov tr. Garnett, Saki, Mansfield): one author, ten passages.
  corpus.py author <substack_dir>  this site's author, as the Gutenberg authors: ten 300-word
        passages, each from a different one of his Substack articles (the .docx files in
        <substack_dir>/0x4D44), prose only, into ../data/human/author.jsonl. Private text:
        it stays out of git and goes nowhere but the embeddings endpoint.
  corpus.py embed               embed every human text and model story (text-embedding-3-small)
                                into ../data/embeddings/*.json (resumable)
"""
import glob, json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
HUMAN = os.path.join(DATA, "human")
EMB = os.path.join(DATA, "embeddings")
GUTENBERG = {"pg2776": "O. Henry", "pg13415": "Anton Chekhov", "pg269": "Saki",
             "pg1429": "Katherine Mansfield"}


def wp_detok(s):
    s = s.replace("<newline>", "\n")
    s = re.sub(r" ([.,!?;:'%)\]])", r"\1", s)
    s = re.sub(r"([(\[]) ", r"\1", s)
    s = s.replace(" n't", "n't").replace("`` ", '"').replace(" ''", '"')
    return re.sub(r"[ \t]+", " ", s).strip()


def prep(cdir):
    os.makedirs(HUMAN, exist_ok=True)
    rnd = random.Random(0x4D44)
    rows = []
    for f in sorted(glob.glob(os.path.join(cdir, "wp", "rows-*.json"))):
        rows += [r["row"] for r in json.load(open(f))["rows"]]
    stories = [wp_detok(r["story"]) for r in rows]
    stories = [s for s in stories if 200 <= len(s.split()) <= 450]
    pick = rnd.sample(stories, 250)
    with open(os.path.join(HUMAN, "writingprompts.jsonl"), "w") as f:
        for i, s in enumerate(pick):
            f.write(json.dumps({"source": "writingprompts", "group": f"wp-{i // 10:02d}",
                                "id": f"wp-{i:03d}", "text": s}) + "\n")
    with open(os.path.join(HUMAN, "gutenberg.jsonl"), "w") as f:
        for key, author in GUTENBERG.items():
            raw = open(os.path.join(cdir, "gutenberg", f"{key}.txt"), encoding="utf-8-sig").read()
            body = raw.split("*** START OF", 1)[-1].split("*** END OF", 1)[0]
            words = body.split()
            words = words[len(words) // 10: -len(words) // 20]  # skip front matter and the tail
            starts = sorted(rnd.sample(range(0, len(words) - 300, 300), 10))
            for j, s in enumerate(starts):
                f.write(json.dumps({"source": "gutenberg", "group": author, "id": f"{key}-{j}",
                                    "text": " ".join(words[s:s + 300])}) + "\n")
    print(f"writingprompts: {len(pick)} of {len(stories)} eligible; gutenberg: {10 * len(GUTENBERG)}")


W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DATE_RE = re.compile(r"^[A-Z][a-z]{2} \d{1,2}, \d{4}$")  # the Substack byline date, "Oct 21, 2025"
# Substack's page furniture: the article ends at the first of these (comments follow it).
END_MARKS = ("Thanks for reading", "Discussion about this post", "Top of Form", "Subscribed")
CODE_RE = re.compile(r"[{};<>=\\]|\w\(\)|^\s*(\$|#|//)")


def docx_paras(path):
    import zipfile
    from xml.etree import ElementTree as ET
    root = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
    for p in root.iter(W_NS + "p"):
        yield "".join(n.text or "" if n.tag == W_NS + "t" else " " if n.tag in (
            W_NS + "tab", W_NS + "br", W_NS + "cr") else "" for n in p.iter())


def article_prose(path):
    """The body's prose paragraphs, as words: no title, byline, headings, list items,
    captions, code, links or the comments; a paragraph counts as prose when it has
    eight words or more and ends a sentence."""
    paras = [re.sub(r"\s+", " ", t.replace("\xa0", " ")).strip() for t in docx_paras(path)]
    start = next((i + 1 for i, t in enumerate(paras[:8]) if DATE_RE.match(t)), 0)
    words = []
    for t in paras[start:]:
        if t.startswith(END_MARKS):
            break
        t = re.sub(r"https?://\S+", "", t).strip()
        if len(t.split()) < 8 or not re.search(r"[.!?…][\"'”’)]?$", t) or CODE_RE.search(t):
            continue
        if sum(c.isascii() or c in "‘’“”–—…£€é" for c in t) < 0.98 * len(t):
            continue  # pasted model output in other scripts
        words += t.split()
    return words


def prep_author(sdir):
    os.makedirs(HUMAN, exist_ok=True)
    rnd = random.Random(0x4D44)
    arts = {}
    for f in sorted(glob.glob(os.path.join(sdir, "0x4D44", "*.docx"))):
        words = article_prose(f)
        if len(words) >= 400:
            arts[os.path.basename(f)[:-5]] = words
    pick = sorted(rnd.sample(sorted(arts), 10))
    with open(os.path.join(HUMAN, "author.jsonl"), "w") as f:
        for j, name in enumerate(pick):
            words = arts[name]
            s = rnd.randrange(0, len(words) - 300 + 1)
            f.write(json.dumps({"source": "author", "group": "0x4D44", "id": f"ax-{j}",
                                "article": name, "text": " ".join(words[s:s + 300])}) + "\n")
    print(f"author: 10 passages from {len(pick)} of {len(arts)} eligible articles")
    for name in pick:
        print("  ", name)


def embed():
    import run
    os.makedirs(EMB, exist_ok=True)
    items = []
    for f in glob.glob(os.path.join(HUMAN, "*.jsonl")):
        items += [(r["id"], r["text"]) for r in map(json.loads, open(f))]
    sp = os.path.join(DATA, "q33-story.jsonl")
    if os.path.exists(sp):
        items += [(f"{r['model']}-s{r['sample']}", r["text"]) for r in map(json.loads, open(sp))
                  if r.get("ok") and r.get("text")]
    path = os.path.join(EMB, "stories.json")
    have = json.load(open(path)) if os.path.exists(path) else {}
    todo = [(i, t) for i, t in items if i not in have]
    for k in range(0, len(todo), 100):
        chunk = todo[k:k + 100]
        for attempt in range(6):  # the proxy's connection cap answers 503 while runs are busy
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
                                   "cost": u.get("total_tokens", 0) * 0.02 / 1e6})
        json.dump(have, open(path, "w"))
        print(f"  embedded {len(have)}/{len(items)}")


if __name__ == "__main__":
    {"prep": lambda: prep(sys.argv[2]), "author": lambda: prep_author(sys.argv[2]),
     "embed": embed}[sys.argv[1]]()
