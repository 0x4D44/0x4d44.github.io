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
  corpus.py wiki                human non-fiction: 50 passages of about 300 words, one each from 50 random
        English Wikipedia articles (wikimedia/wikipedia, the 1 Nov 2023 dump) of 1,200 words or more,
        in 5 groups of 10, into ../data/human/wikipedia.jsonl. CC BY-SA text: it stays out of git
        like the Reddit stories, and the site shows only metrics.
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


WIKI_ROWS = ("https://datasets-server.huggingface.co/rows?dataset=wikimedia%2Fwikipedia"
             "&config=20231101.en&split=train&offset={}&length=20")
WIKI_TOTAL = 6407814
WIKI_END = re.compile(r"^(See also|References|External links|Notes|Further reading|Bibliography|Sources)\s*$")


def wiki_passage(text, lo=250, hi=400):
    """About 300 words of body prose: past the lead, before the reference sections, paragraphs only
    (no headings, list items or table rows). None when the article has too little of it."""
    paras = []
    for p in text.split("\n"):
        p = p.strip()
        if WIKI_END.match(p):
            break
        if len(p.split()) >= 40 and p[-1:] in ".\"')":
            paras.append(p)
    paras = paras[1:]                      # the lead summarises; the body is the writing
    chunks, cur = [], []
    for p in paras:
        cur.append(p)
        if sum(len(c.split()) for c in cur) >= lo:
            chunks.append(cur)
            cur = []
    if not chunks:
        return None
    words = "\n\n".join(chunks[len(chunks) // 2]).split(" ")
    if len(words) > hi:
        t = " ".join(words[:hi])
        return t[:t.rfind(". ") + 1] if t.rfind(". ") > len(t) // 2 else t
    return " ".join(words)


def prep_wiki(n=50):
    import time, urllib.request
    rnd = random.Random(0x4D44)
    got, seen = [], set()
    for off in rnd.sample(range(0, WIKI_TOTAL - 20), 400):
        for wait in (2, 5, 15, 30, 60, 0):
            try:
                rows = json.load(urllib.request.urlopen(WIKI_ROWS.format(off), timeout=60))["rows"]
                break
            except OSError:              # the rows API answers 429 to bursts
                if not wait:
                    raise
                time.sleep(wait)
        time.sleep(1)
        for r in rows:
            a = r["row"]
            if len(a["text"].split()) < 1200 or a["title"] in seen or a["title"].startswith("List of"):
                continue
            t = wiki_passage(a["text"])
            if t:
                seen.add(a["title"])
                got.append((a["title"], t))
                break                       # one article per random offset: neighbours share a topic
        if len(got) >= n:
            break
    with open(os.path.join(HUMAN, "wikipedia.jsonl"), "w") as f:
        for i, (title, t) in enumerate(got):
            f.write(json.dumps({"source": "wikipedia", "group": f"wiki-{i // 10}", "id": f"wiki-{i:02d}",
                                "title": title, "text": t}) + "\n")
    print(f"wikipedia: {len(got)} passages")


NEWS_ROWS = ("https://datasets-server.huggingface.co/rows?dataset=RealTimeData/bbc_news_alltime"
             "&config={}&split=train&offset={}&length=5")
NEWS_MONTHS = ["%d-%02d" % (y, m) for y in (2024, 2025) for m in range(1, 13)][:18]     # Jan 2024 to Jun 2025
NEWS_SKIP = re.compile(r"^(?:Watch|Live|Listen|In pictures|Quiz|Video)\b|weekly quiz|BBC Verify Live", re.I)
NEWS_JUNK = re.compile(r", external\b|^Follow (?:BBC|us)|^Listen to|^Sign up|^Get in touch|bbc\.co\.uk|^Related|^Read more", re.I)


BRAND = re.compile(r"\b(?:the\s+)?BBC(?:\s+(?:News|Sport|Radio(?:\s+\d+)?|World Service|Arabic|Verify|Wales|Scotland|London|One|Two|Three|Four|Breakfast|Newshour))*\b", re.I)


def unbrand(text):
    """The newsroom's name out of its own copy ("told the BBC"): a word only the human side would use."""
    t = text or ""
    return BRAND.sub(lambda m: "The broadcaster" if re.search(r"(?:^|[.!?\"”]\s+|\n)$", t[:m.start()]) else "the broadcaster", t)


def news_passage(text, lo=250, hi=400):
    """About 300 words of an article's body: past its opening paragraph, without the BBC's own sign-off lines."""
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    paras = [p for p in paras[1:] if not NEWS_JUNK.search(p) and len(p.split()) >= 8]
    cur = []
    for p in paras:
        cur.append(p)
        if sum(len(c.split()) for c in cur) >= lo:
            words = "\n\n".join(cur).split(" ")
            if len(words) > hi:
                t = " ".join(words[:hi])
                return t[:t.rfind(". ") + 1] if t.rfind(". ") > len(t) // 2 else t
            return " ".join(words)
    return None


def prep_news(n=150):
    """Human non-fiction written since the models above were trained: BBC News articles, January 2024 to
    June 2025, an even spread over the months. The first 50 (every month represented) are the ones the
    models are asked to match; the rest only add to the human side."""
    import time, urllib.request
    rnd = random.Random(0x4D44 + 7)
    sizes = {}
    meta = json.load(urllib.request.urlopen(
        "https://datasets-server.huggingface.co/size?dataset=RealTimeData/bbc_news_alltime", timeout=60))
    for c in meta["size"]["configs"]:
        sizes[c["config"]] = c["num_rows"]
    per = -(-n // len(NEWS_MONTHS))
    by_month, seen = {}, set()
    for month in NEWS_MONTHS:
        got = []
        for off in rnd.sample(range(0, sizes[month] - 5), 60):
            for wait in (2, 5, 15, 30, 60, 0):
                try:
                    rows = json.load(urllib.request.urlopen(NEWS_ROWS.format(month, off), timeout=60))["rows"]
                    break
                except OSError:              # the rows API answers 429 to bursts
                    if not wait:
                        raise
                    time.sleep(wait)
            time.sleep(1)
            for r in rows:
                a = r["row"]
                title = re.sub(r"\s*-\s*BBC (?:News|Sport)\s*$", "", a.get("title") or "").strip()
                body = a.get("content") or ""
                if not title or title in seen or NEWS_SKIP.search(title) or len(body.split()) < 450:
                    continue
                t = news_passage(body)
                t = t and unbrand(t)
                if t:
                    seen.add(title)
                    got.append((month, title, t))
                    break                   # one article per random offset
            if len(got) >= per:
                break
        by_month[month] = got
        print(f"  {month}: {len(got)}", flush=True)
    order = [by_month[m][k] for k in range(per) for m in NEWS_MONTHS if k < len(by_month[m])][:n]
    with open(os.path.join(HUMAN, "news.jsonl"), "w") as f:
        for i, (month, title, t) in enumerate(order):
            f.write(json.dumps({"source": "bbc-news", "month": month, "group": f"news-{i // 10}", "id": f"news-{i:03d}",
                                "title": title, "text": t}) + "\n")
    print(f"news: {len(order)} passages")


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
    {"prep": lambda: prep(sys.argv[2]), "author": lambda: prep_author(sys.argv[2]), "wiki": prep_wiki,
     "news": prep_news, "embed": embed}[sys.argv[1]]()
