#!/usr/bin/env python3
"""Model Zoo collector: ask every OpenAI pool model the same questions.

  run.py probe            find which models answer, and on which endpoint
  run.py ask Q [Q ...]    ask questions (ids from questions.json), all models each
  run.py spend            show estimated spend so far

Results append to ../data/<qid>.jsonl (resumable: an ok answer is never re-bought).
The proxy token comes from `deltic api openai connect` and is never written anywhere.
"""
import json, os, re, subprocess, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
PRICES = json.load(open(os.path.join(HERE, "prices.json")))
QUESTIONS = {q["id"]: q for q in json.load(open(os.path.join(HERE, "questions.json")))}
BUDGET = float(os.environ.get("ZOO_BUDGET", "23.0"))   # hard cap on estimated spend, USD
WORKERS = int(os.environ.get("ZOO_WORKERS", "16"))
EXCLUDE = os.environ.get("ZOO_EXCLUDE", "")  # regex of models to leave out of this run
ONLY = os.environ.get("ZOO_ONLY", "")  # regex: only these models; the budget then counts only them
# Current Claude family: also run each with extended thinking on, as "<model>@thinking".
THINKING = {"claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"}
LOCK = threading.Lock()
QUOTA_GONE = threading.Event()  # set when OpenAI reports the credit is used up
# gpt-5-pro reasons ~500 tokens even to pick a number ($0.06 a call); batch 1 had 10.
SAMPLE_CAP = {"gpt-5-pro": 3, "gpt-5.6-sol@pro": 3}
# The deprecations page names gpt-5.6-sol with reasoning.mode "pro" as o1-pro's replacement.
VIRTUAL = ["gpt-5.6-sol@pro"]

SKIP = re.compile(r"embedding|moderation|tts|whisper|transcribe|image|sora|realtime|live|dall-e")
SNAPSHOT = re.compile(r"-(\d{4}-\d{2}-\d{2}|\d{4})$")


def connect():
    out = subprocess.run(["deltic", "api", "openai", "connect", "--app", "model-zoo"],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    return d["base_url"].rstrip("/"), d["token"]


BASE, TOKEN = connect()
_ANTHROPIC = []


def anthropic():
    """The Anthropic pool proxy (base_url, token), connected on first use."""
    if not _ANTHROPIC:
        out = subprocess.run(["deltic", "api", "anthropic", "connect", "--app", "model-zoo"],
                             capture_output=True, text=True, check=True).stdout
        d = json.loads(out)
        _ANTHROPIC.append((d["base_url"].rstrip("/"), d["token"]))
    return _ANTHROPIC[0]


def http(method, path, body=None, timeout=900, provider="openai"):
    if provider == "anthropic":
        base, tok = anthropic()
        headers = {"x-api-key": tok, "anthropic-version": "2023-06-01",
                   "Content-Type": "application/json"}
    else:
        base, headers = BASE, {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}
    req = urllib.request.Request(base + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": {"message": raw[:500].decode(errors="replace")}}
    except Exception as e:  # timeout, connection reset
        return 0, {"error": {"message": f"{type(e).__name__}: {e}"}}


def price(model):
    # assumption: pro mode bills at the base model's token rates; thinking is billed as output
    model = model.split("@")[0]
    m = SNAPSHOT.sub("", model) if not model.startswith("claude-") else re.sub(r"-\d{8}$", "", model)
    for table in ("published", "memory", "anthropic"):
        if m in PRICES[table]:
            return PRICES[table][m], table
    return PRICES["default_unknown"], "unknown"


def is_pro(model):
    return model.endswith("@pro") or price(model)[0][1] >= 100


def cost(model, usage):
    (pi, po), _ = price(model)
    return (usage.get("in", 0) * pi + usage.get("out", 0) * po) / 1e6


def call(model, endpoint, prompt, max_tokens):
    """One request. Returns dict(ok, text, usage, status, error, secs)."""
    t0 = time.time()
    if endpoint == "anthropic":
        real, _, variant = model.partition("@")
        body = {"model": real, "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}]}
        if variant == "thinking":  # extended thinking, half the allowance, like the GPT reasoners
            body["thinking"] = {"type": "enabled", "budget_tokens": max(1024, max_tokens // 2)}
        code, d = http("POST", "/v1/messages", body, provider="anthropic")
        if code == 400 and variant == "thinking" and "adaptive" in json.dumps(d):
            # The newest models refuse a budget: adaptive thinking, steered by an effort level.
            body["thinking"] = {"type": "adaptive"}
            body["output_config"] = {"effort": "high"}
            code, d = http("POST", "/v1/messages", body, provider="anthropic")
        if code == 200:
            text = "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")
            think = sum(len(b.get("thinking", "")) for b in d.get("content", []) if b.get("type") == "thinking")
            u = d.get("usage") or {}
            usage = {"in": u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
                     + u.get("cache_creation_input_tokens", 0),
                     "out": u.get("output_tokens", 0), "thinking_chars": think}
            return {"ok": True, "text": text, "usage": usage, "status": d.get("stop_reason"),
                    "incomplete": "max_tokens" if d.get("stop_reason") == "max_tokens" else None,
                    "resolved_model": d.get("model"), "thinking_type": (body.get("thinking") or {}).get("type"),
                    "secs": round(time.time() - t0, 2)}
    elif endpoint == "responses":
        body = {"model": model, "input": prompt, "max_output_tokens": max_tokens}
        if model.endswith("@pro"):  # a virtual model: pro reasoning mode on a current model
            body["model"] = model[:-4]
            body["reasoning"] = {"mode": "pro"}
        code, d = http("POST", "/responses", body)
        if code == 200:
            text = "".join(c.get("text", "") for o in d.get("output", []) if o.get("type") == "message"
                           for c in o.get("content", []) or [] if c.get("type") == "output_text")
            u = d.get("usage") or {}
            usage = {"in": u.get("input_tokens", 0), "out": u.get("output_tokens", 0),
                     "reasoning": (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0)}
            return {"ok": True, "text": text, "usage": usage, "status": d.get("status"),
                    "incomplete": (d.get("incomplete_details") or {}).get("reason"),
                    "resolved_model": d.get("model"), "secs": round(time.time() - t0, 2)}
    elif endpoint == "chat":
        body = {"model": model, "messages": [{"role": "user", "content": prompt}],
                "max_completion_tokens": max_tokens}
        if model.startswith("gpt-audio"):
            body["modalities"] = ["text"]
        code, d = http("POST", "/chat/completions", body)
        if code == 400 and "max_completion_tokens" in json.dumps(d):
            body.pop("max_completion_tokens"); body["max_tokens"] = max_tokens
            code, d = http("POST", "/chat/completions", body)
        if code == 200:
            ch = d["choices"][0]
            u = d.get("usage") or {}
            usage = {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0),
                     "reasoning": (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)}
            return {"ok": True, "text": ch["message"].get("content") or "", "usage": usage,
                    "status": ch.get("finish_reason"), "resolved_model": d.get("model"),
                    "secs": round(time.time() - t0, 2)}
    else:  # legacy completions
        code, d = http("POST", "/completions", {"model": model, "prompt": prompt,
                                                "max_tokens": min(max_tokens, 1000)})
        if code == 200:
            ch = d["choices"][0]
            u = d.get("usage") or {}
            return {"ok": True, "text": ch.get("text", ""), "status": ch.get("finish_reason"),
                    "usage": {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0)},
                    "resolved_model": d.get("model"), "secs": round(time.time() - t0, 2)}
    return {"ok": False, "code": code, "error": (d.get("error") or {}).get("message", str(d))[:400],
            "secs": round(time.time() - t0, 2)}


def call_retry(model, endpoint, prompt, max_tokens, tries=6):
    """Retry transient failures: the proxy's connection cap (503), rate limits, resets."""
    for i in range(tries):
        if QUOTA_GONE.is_set():
            return {"ok": False, "code": 429, "error": "insufficient_quota (credit exhausted)", "secs": 0}
        r = call(model, endpoint, prompt, max_tokens)
        # OpenAI says insufficient_quota; the deltic proxy answers 402 "every ... key is spent".
        if not r["ok"] and (r.get("code") == 402 or re.search(
                r"insufficient_quota|exceeded your current quota|billing|key is spent", r.get("error", ""), re.I)):
            QUOTA_GONE.set()
            print(f"CREDIT EXHAUSTED at {model}: {r['error'][:160]}", flush=True)
            return r
        if r["ok"] or r.get("code") not in (0, 429, 500, 502, 503):
            return r
        time.sleep(3 * (i + 1))
    return r


# ---------------------------------------------------------------- ledger

def records(qid):
    p = os.path.join(DATA, f"{qid}.jsonl")
    if not os.path.exists(p):
        return []
    return [json.loads(l) for l in open(p) if l.strip()]


def append(qid, rec):
    with LOCK:
        with open(os.path.join(DATA, f"{qid}.jsonl"), "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def spent():
    total = 0.0
    for fn in os.listdir(DATA):
        if fn.endswith(".jsonl"):
            for l in open(os.path.join(DATA, fn)):
                if l.strip():
                    r = json.loads(l)
                    if not ONLY or re.search(ONLY, r.get("model", "")):
                        total += r.get("cost", 0.0)
    return total


SPENT = [0.0]
RESERVED = [0.0]


def try_reserve(model, max_tokens):
    """Reserve worst-case cost before a call; refuse past the budget."""
    (pi, po), _ = price(model)
    worst = (300 * pi + max_tokens * po) / 1e6
    with LOCK:
        if SPENT[0] + RESERVED[0] + worst > BUDGET:
            return None
        RESERVED[0] += worst
        return worst


def settle(worst, actual):
    with LOCK:
        RESERVED[0] -= worst
        SPENT[0] += actual


# ---------------------------------------------------------------- commands

def probe():
    code, d = http("GET", "/models")
    assert code == 200, d
    ids = sorted(m["id"] for m in d["data"])
    cands = [m for m in ids if not SKIP.search(m) and not SNAPSHOT.search(m)] + VIRTUAL
    code, d = http("GET", "/v1/models?limit=100", provider="anthropic")
    assert code == 200, d
    claude = [m["id"] for m in d["data"]]
    cands += claude + [f"{m}@thinking" for m in claude if m in THINKING]
    if ONLY:
        cands = [m for m in cands if re.search(ONLY, m)]
    print(f"{len(ids)} listed, {len(cands)} candidates", flush=True)
    prev = {r["model"]: r for r in records("_probe") if r.get("endpoint")}
    todo = [m for m in cands if m not in prev]

    def one(m):
        errs = []
        for ep in (("anthropic",) if m.startswith("claude-") else ("responses", "chat", "completions")):
            worst = try_reserve(m, 2000)
            if worst is None:
                return {"model": m, "endpoint": None, "errors": ["budget"]}
            r = call_retry(m, ep, "Reply with the single word: ok", 2000)
            c = cost(m, r.get("usage", {})) if r["ok"] else 0.0
            settle(worst, c)
            if r["ok"]:
                rec = {"model": m, "endpoint": ep, "reply": r["text"][:80], "usage": r["usage"],
                       "cost": c, "secs": r["secs"], "resolved_model": r.get("resolved_model"),
                       "price_source": price(m)[1]}
                append("_probe", rec)
                return rec
            errs.append(f"{ep}: {r.get('code')} {r['error'][:160]}")
        rec = {"model": m, "endpoint": None, "errors": errs, "cost": 0.0}
        append("_probe", rec)
        return rec

    with ThreadPoolExecutor(WORKERS) as ex:
        for fut in as_completed([ex.submit(one, m) for m in todo]):
            r = fut.result()
            print(f"  {r['model']:32} {r.get('endpoint') or 'DEAD'}  "
                  f"{(r.get('reply') or '|'.join(r.get('errors', [])))[:110]!r}", flush=True)


def live_models():
    best = {}
    for r in records("_probe"):
        best[r["model"]] = r if r.get("endpoint") else best.get(r["model"], r)
    return {m: r["endpoint"] for m, r in best.items() if r.get("endpoint")}


def ask(qids):
    models = live_models()
    for qid in qids:
        q = QUESTIONS[qid]
        have = {(r["model"], r["sample"]) for r in records(qid) if r.get("ok")}
        jobs = []
        for m, ep in sorted(models.items()):
            if EXCLUDE and re.search(EXCLUDE, m):
                continue
            if ONLY and not re.search(ONLY, m):
                continue
            if "models" in q and m not in q["models"]:
                continue
            n = q.get("samples_pro", 1) if is_pro(m) else q.get("samples", 1)
            n = min(n, SAMPLE_CAP.get(m, n))
            n = q.get("model_samples", {}).get(m, n)
            jobs += [(m, ep, s) for s in range(n) if (m, s) not in have]
        print(f"[{qid}] {len(jobs)} calls over {len(models)} models; spent so far ${SPENT[0]:.2f}", flush=True)
        skipped = []

        def one(job):
            m, ep, s = job
            worst = try_reserve(m, q["max_tokens"])
            if worst is None:
                skipped.append(job)
                return None
            r = call_retry(m, ep, q["prompt"], q["max_tokens"])
            c = cost(m, r.get("usage", {})) if r["ok"] else 0.0
            settle(worst, c)
            if not r["ok"] and QUOTA_GONE.is_set():
                return None  # not an answer: leave it for a resume if credit returns
            rec = {"q": qid, "model": m, "sample": s, "endpoint": ep, "cost": c, "ts": time.time(), **r}
            append(qid, rec)
            return rec

        with ThreadPoolExecutor(WORKERS) as ex:
            futs = [ex.submit(one, j) for j in jobs]
            done = 0
            for fut in as_completed(futs):
                r = fut.result()
                done += 1
                if r and not r["ok"]:
                    print(f"  FAIL {r['model']} s{r['sample']}: {r.get('code')} {r['error'][:120]}", flush=True)
                if done % 50 == 0:
                    print(f"  {done}/{len(jobs)}  spent ${SPENT[0]:.2f}", flush=True)
        print(f"[{qid}] done; spent ${SPENT[0]:.2f}; budget-skipped {len(skipped)}", flush=True)
        if skipped:
            print("BUDGET REACHED - stopping", flush=True)
            return
        if QUOTA_GONE.is_set():
            print("CREDIT EXHAUSTED - stopping", flush=True)
            return


def report():
    by = {}
    for fn in sorted(os.listdir(DATA)):
        if fn.endswith(".jsonl"):
            for l in open(os.path.join(DATA, fn)):
                r = json.loads(l)
                by.setdefault(fn[:-6], [0, 0.0])
                by[fn[:-6]][0] += 1
                by[fn[:-6]][1] += r.get("cost", 0.0)
    for k, (n, c) in by.items():
        print(f"{k:12} {n:5} calls  ${c:.3f}")
    print(f"total ${sum(c for _, c in by.values()):.3f} of budget ${BUDGET:.2f}")


if __name__ == "__main__":
    os.makedirs(DATA, exist_ok=True)
    SPENT[0] = spent()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "spend"
    if cmd == "probe":
        probe()
    elif cmd == "ask":
        ask(sys.argv[2:])
    else:
        report()
