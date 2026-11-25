#!/usr/bin/env python3
"""Stochasticity experiments: how random are the models, and which knob moves it?

  stochastic.py knobs [MODEL ...]  probe which knob each model takes -> ../data/stoch-knobs.json
  stochastic.py run [EXP ...]      collect (resumable; an ok answer is never re-bought)
  stochastic.py estimate [EXP ...] estimated USD for what is still to ask
  stochastic.py embed              embed relay sentences and repeat stories -> stoch-embeddings.jsonl
  stochastic.py spend

EXP: dial (temperature or effort), repeat (same prompt 20x, seeded where possible),
wording (rephrasings of one question), relay (one opening, five independent relays).
Answers append to ../data/stoch-<exp>.jsonl. Uses run.py's deltic pool connections.
"""
import hashlib, json, os, re, sys, threading, time
from concurrent.futures import ThreadPoolExecutor

import run

BUDGET = float(os.environ.get("STOCH_BUDGET", "10"))
PILOT = ["gpt-4o", "gpt-6.2-sol", "claude-opus-5-5"]  # the relay's three authors
ENDPOINT = dict(run.live_models())
ENDPOINT["gpt-4o"] = "chat"  # the pilot asked gpt-4o on chat completions (it gives logprobs there)


KNOBS = os.path.join(run.DATA, "stoch-knobs.json")


def load_knobs():
    return json.load(open(KNOBS))["models"] if os.path.exists(KNOBS) else {}


def wide():
    """Every model the zoo asks, minus the pro models (tens of cents and tens of seconds a call)."""
    dead = {m for m, k in load_knobs().items()  # retired since the zoo's probe (404 on both knob probes)
            if str(k.get("temperature_error", "")).startswith("404") and str(k.get("effort_error", "")).startswith("404")}
    return sorted(m for m in ENDPOINT if not (m.endswith("@pro") or m.endswith("-pro") or run.is_pro(m))
                  and m not in dead)


MODELS = os.environ["STOCH_MODELS"].split(",") if os.environ.get("STOCH_MODELS") else wide()
WORKERS = min(6, int(os.environ.get("STOCH_WORKERS", "6")))  # the proxy 503s past ~6 connections
LOCK = threading.Lock()
SPENT = [0.0]

NUMBER = "Think of a number between 1 and 100. Reply with only the number."
SHORT = {"number": NUMBER,
         "colour": "What is your favourite colour? Reply with only the colour.",
         "city": "Name a city. Reply with only the city name."}
STORY = ("Write a short story of about 300 words. Reply with only the story, starting with its "
         "title on the first line.")
WORDINGS = {
    "base": NUMBER,
    "pick": "Pick a number between 1 and 100. Reply with only the number.",
    "choose": "Choose any number from 1 to 100. Reply with only the number.",
    "random": "Give me a random number between 1 and 100. Reply with only the number.",
    "words": "Think of a number between one and one hundred. Reply with only the number.",
    "lower": "think of a number between 1 and 100. reply with only the number.",
    "space": NUMBER + " ",
}
RELAY_OPEN = "The lighthouse keeper found the letter on a Tuesday, which was odd, because the post only came on Fridays."
RELAY_NEXT = ("We are writing a story together, one sentence at a time, and each sentence is written by a "
              "different AI model. Here is the story so far:\n\n{story}\n\nAdd exactly one sentence. It must "
              "follow on from the last sentence, but you may take the story in a wild, unexpected new "
              "direction; surprising, funny or strange turns are welcome. Write it as well as you can. "
              "Reply with only your sentence.")


def knobs(model):
    """The randomness knob a model exposes, from the probe (stoch-knobs.json): temperature where
    it is accepted (Anthropic's range stops at 1), else reasoning effort, else none."""
    k = load_knobs().get(model, {})
    if k.get("temperature"):
        ts = [0, 0.5, 1.0] + ([] if ENDPOINT.get(model) == "anthropic" else [1.5])
        return [("t%g" % t, {"temperature": t}) for t in ts]
    if k.get("effort"):
        return [(e, {"effort": e}) for e in ("low", "medium", "high")]
    return []


def call(model, prompt, max_tokens, temperature=None, seed=None, effort=None, logprobs=False):
    t0 = time.time()
    ep = ENDPOINT.get(model, "responses")
    if ep == "anthropic":
        real, _, variant = model.partition("@")
        body = {"model": real, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}
        if variant == "thinking":  # as run.py: a thinking budget, or adaptive where budgets are refused
            body["thinking"] = {"type": "enabled", "budget_tokens": max(1024, max_tokens // 2)}
        if temperature is not None:
            body["temperature"] = temperature
        if effort:
            body["output_config"] = {"effort": effort}
        code, d = run.http("POST", "/v1/messages", body, provider="anthropic")
        if code == 400 and variant == "thinking" and "adaptive" in json.dumps(d):
            body["thinking"] = {"type": "adaptive"}
            body.setdefault("output_config", {"effort": "high"})
            code, d = run.http("POST", "/v1/messages", body, provider="anthropic")
        if code == 200:
            u = d.get("usage") or {}
            # Opus 5.5 thinks unasked: a cut-off answer is a failure to re-ask, not a short answer
            r = {"ok": d.get("stop_reason") != "max_tokens",
                 "text": "".join(b.get("text", "") for b in d["content"] if b.get("type") == "text"),
                 "usage": {"in": u.get("input_tokens", 0), "out": u.get("output_tokens", 0)},
                 "status": d.get("stop_reason"), "resolved_model": d.get("model"),
                 "secs": round(time.time() - t0, 2)}
            if variant == "thinking":
                r["thinking_type"] = body["thinking"]["type"]
            return r
    elif ep == "chat":
        body = {"model": model, "messages": [{"role": "user", "content": prompt}]}
        body["max_tokens" if model == "gpt-4o" else "max_completion_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature
        if effort:
            body["reasoning_effort"] = effort
        if seed is not None:
            body["seed"] = seed
        if logprobs:
            body["logprobs"] = True; body["top_logprobs"] = 20
        code, d = run.http("POST", "/chat/completions", body)
        if code == 200:
            ch = d["choices"][0]; u = d.get("usage") or {}
            r = {"ok": ch.get("finish_reason") != "length", "text": ch["message"].get("content") or "",
                 "usage": {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0)},
                 "resolved_model": d.get("model"), "fingerprint": d.get("system_fingerprint"),
                 "secs": round(time.time() - t0, 2)}
            if model != "gpt-4o":
                r["status"] = ch.get("finish_reason")
            if logprobs and ch.get("logprobs"):
                first = ch["logprobs"]["content"][0]
                r["top"] = [[t["token"], round(t["logprob"], 4)] for t in first["top_logprobs"]]
            return r
    else:
        body = {"model": model, "input": prompt, "max_output_tokens": max_tokens}
        if temperature is not None:
            body["temperature"] = temperature
        if seed is not None:
            body["seed"] = seed
        if effort:
            body["reasoning"] = {"effort": effort}
        code, d = run.http("POST", "/responses", body)
        if code == 200:
            u = d.get("usage") or {}
            text = "".join(c.get("text", "") for o in d.get("output", []) if o.get("type") == "message"
                           for c in o.get("content", []) or [] if c.get("type") == "output_text")
            return {"ok": d.get("status") == "completed", "text": text,
                    "usage": {"in": u.get("input_tokens", 0), "out": u.get("output_tokens", 0),
                              "reasoning": (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0)},
                    "resolved_model": d.get("model"), "status": d.get("status"), "secs": round(time.time() - t0, 2)}
    return {"ok": False, "code": code, "error": json.dumps(d.get("error", d))[:300], "secs": round(time.time() - t0, 2)}


def call_retry(*a, **k):
    for i in range(8):
        r = call(*a, **k)
        if r["ok"] or r.get("code", 200) not in (0, 200, 429, 500, 502, 503, 529):
            return r
        time.sleep(3 * (i + 1))
    return r


def room(model, long):
    """Output allowance: the reasoners spend hidden tokens before the answer. Generous for every
    model but the pilot's gpt-4o (kept as the pilot asked it): only tokens used are billed."""
    return (1200 if long else 50) if model == "gpt-4o" else (8000 if long else 4000)


def probe_knobs(models):
    """One call each: is temperature 0 accepted? is low reasoning effort accepted?"""
    have = json.load(open(KNOBS)) if os.path.exists(KNOBS) else {"models": {}}
    todo = [m for m in models if m not in have["models"]]

    def one(m):
        out = {"endpoint": ENDPOINT.get(m), "cost": 0.0}
        for knob, kw in (("temperature", {"temperature": 0}), ("effort", {"effort": "low"})):
            r = call_retry(m, NUMBER, room(m, False), **kw)
            out[knob] = bool(r["ok"])
            if r["ok"]:
                out[knob + "_reply"] = (r.get("text") or "")[:40]
                out["cost"] += run.cost(m, r.get("usage", {}))
            else:
                out[knob + "_error"] = "%s %s" % (r.get("code"), r.get("error", r.get("status", "")))[:200]
        out["knob"] = "temperature" if out["temperature"] else "effort" if out["effort"] else None
        out["cost"] = round(out["cost"], 6)
        print("%-28s temp=%-5s effort=%-5s %s" % (m, out["temperature"], out["effort"],
              (out.get("temperature_error") or "")[:90]), flush=True)
        return m, out

    with ThreadPoolExecutor(WORKERS) as ex:
        for m, out in ex.map(one, todo):
            have["models"][m] = out
    have["note"] = ("One probe per model with the number prompt: temperature=0, then low reasoning effort "
                    "(OpenAI reasoning.effort, Anthropic output_config.effort). knob = what the dial turns.")
    have["models"] = dict(sorted(have["models"].items()))
    with open(KNOBS, "w") as f:
        json.dump(have, f, indent=1, ensure_ascii=False)
        f.write("\n")


def path(exp):
    return os.path.join(run.DATA, "stoch-%s.jsonl" % exp)


def done(exp):
    p = path(exp)
    if not os.path.exists(p):
        return set()
    return {(r["model"], r["cond"], r["prompt_id"], r["sample"]) for r in map(json.loads, open(p)) if r.get("ok")}


def spent():
    t = sum(k.get("cost", 0) for k in load_knobs().values())
    for fn in os.listdir(run.DATA):
        if fn.startswith("stoch-") and fn.endswith(".jsonl"):
            t += sum(json.loads(l).get("cost", 0) for l in open(os.path.join(run.DATA, fn)) if l.strip())
    return t


def job(exp, model, cond, prompt_id, prompt, sample, max_tokens, **kw):
    if SPENT[0] > BUDGET:
        return
    r = call_retry(model, prompt, max_tokens, **kw)
    if r["ok"] and not (r.get("text") or "").strip():  # an empty answer is not an answer: re-ask it
        r = {**r, "ok": False, "error": "empty answer"}
    c = run.cost(model, r.get("usage", {})) if r.get("usage") else 0.0  # an empty or cut answer is still billed
    rec = {"exp": exp, "model": model, "cond": cond, "prompt_id": prompt_id, "sample": sample,
           "params": {k: v for k, v in kw.items() if v is not None and v is not False},
           "cost": round(c, 6), "ts": time.time(), **r}
    with LOCK:
        SPENT[0] += c
        with open(path(exp), "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print("%-7s %-16s %-8s %-7s #%-2d %r" % (exp, model, cond, prompt_id, sample,
                                            (r.get("text") or r.get("error") or "")[:60]), flush=True)


def jobs(exp):
    out = []
    for m in MODELS:
        if exp == "dial":
            for cond, kw in knobs(m):
                for pid, p in SHORT.items():
                    out += [(m, cond, pid, p, s, room(m, False), kw) for s in range(20)]
                out += [(m, cond, "story", STORY, s, room(m, True), kw) for s in range(8)]
                if m == "gpt-4o":  # what it believes vs what it says: the first token's top 20
                    out.append((m, cond, "number-lp", NUMBER, 0, 5, {**kw, "logprobs": True}))
        elif exp == "repeat":
            kw = {"temperature": 0} if load_knobs().get(m, {}).get("temperature") else {}
            out += [(m, "t0" if kw else "default", "story", STORY, s, room(m, True), kw) for s in range(20)]
            if m == "gpt-4o":
                out += [(m, "t1-seed", "story", STORY, s, 1200, {"temperature": 1.0, "seed": 4242}) for s in range(20)]
                out += [(m, "t1", "story", STORY, s, 1200, {"temperature": 1.0}) for s in range(20)]
        elif exp == "wording":
            for wid, p in WORDINGS.items():
                out += [(m, "default", wid, p, s, room(m, False), {}) for s in range(20)]
    return out


def relay():
    """Five independent relays from one opening; the models take turns, twelve sentences each."""
    have = [json.loads(l) for l in open(path("relay"))] if os.path.exists(path("relay")) else []

    def one(chain):
        story = [RELAY_OPEN] + [r["text"] for r in sorted((r for r in have if r["sample"] == chain and r.get("ok")),
                                                          key=lambda r: r["turn"])]
        turn = len(story)
        while turn <= 12 and SPENT[0] <= BUDGET:
            m = PILOT[(turn - 1) % len(PILOT)]
            r = call_retry(m, RELAY_NEXT.format(story=" ".join(story)), room(m, True) if m != "gpt-4o" else 300)
            text = " ".join((r.get("text") or "").split()).strip().strip('"')
            c = run.cost(m, r.get("usage", {})) if r["ok"] else 0.0
            rec = {"exp": "relay", "model": m, "cond": "default", "prompt_id": "relay", "sample": chain,
                   "turn": turn, "cost": round(c, 6), "ts": time.time(), **r, "text": text}
            with LOCK:
                SPENT[0] += c
                with open(path("relay"), "a") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            print("relay %d t%2d %-16s %r" % (chain, turn, m, text[:70]), flush=True)
            if not r["ok"]:
                return
            story.append(text); turn += 1
    with ThreadPoolExecutor(5) as ex:
        list(ex.map(one, range(5)))


def todo(exp):
    have = done(exp)
    return [j for j in jobs(exp) if (j[0], j[1], j[2], j[4]) not in have]


def unit_cost():
    """Mean cost of one short and one story answer per model: from our own data where we have
    it, else from the zoo's number (q01) and story (q33) questions."""
    acc = {}
    def add(m, kind, c):
        a = acc.setdefault((m, kind), [0.0, 0]); a[0] += c; a[1] += 1
    for fn in os.listdir(run.DATA):
        if fn.startswith("stoch-") and fn.endswith(".jsonl") and fn != "stoch-embeddings.jsonl":
            for r in map(json.loads, open(os.path.join(run.DATA, fn))):
                if r.get("ok") and r.get("exp") != "relay":
                    add(r["model"], "story" if r["prompt_id"] == "story" else "short", r["cost"])
    for q, kind in (("q01-number", "short"), ("q33-story", "story")):
        for r in run.records(q):
            if r.get("ok") and (r["model"], kind + "!") not in acc:
                add(r["model"], kind + "?", r["cost"])
    def mean(m, kind):
        for k in (kind, kind + "?"):
            if (m, k) in acc:
                return acc[(m, k)][0] / acc[(m, k)][1]
        return 0.05 if kind == "story" else 0.005  # unknown: pessimistic
    return mean


def estimate(exps):
    mean = unit_cost()
    tot = 0.0
    for exp in exps:
        per = {}
        for m, cond, pid, p, s, mt, kw in todo(exp):
            per[m] = per.get(m, 0.0) + mean(m, "story" if pid == "story" else "short")
        n = len(todo(exp))
        print("%-8s %5d calls  ~USD %.2f   (dearest: %s)" % (exp, n, sum(per.values()), ", ".join(
            "%s %.2f" % kv for kv in sorted(per.items(), key=lambda kv: -kv[1])[:4])), flush=True)
        tot += sum(per.values())
    print("total ~USD %.2f; spent so far USD %.2f of cap %.2f" % (tot, spent(), BUDGET), flush=True)


def main(exps):
    SPENT[0] = spent()
    for exp in exps:
        if exp == "relay":
            relay(); continue
        work = todo(exp)
        print("%s: %d to ask; spent so far USD %.2f of %.2f" % (exp, len(work), SPENT[0], BUDGET), flush=True)
        # one pool per proxy, each under its connection cap
        oa, an = ThreadPoolExecutor(WORKERS), ThreadPoolExecutor(WORKERS)
        for m, cond, pid, p, s, mt, kw in work:
            (an if ENDPOINT.get(m) == "anthropic" else oa).submit(job, exp, m, cond, pid, p, s, mt, **kw)
        oa.shutdown(wait=True); an.shutdown(wait=True)
        if SPENT[0] > BUDGET:
            print("BUDGET REACHED at USD %.2f: %d left in %s" % (SPENT[0], len(todo(exp)), exp), flush=True)
            break
    print("spent USD %.2f" % SPENT[0], flush=True)


EMBED_MODEL, EMBED_DIMS = "text-embedding-3-small", 256  # shortened vectors keep the file small


def embed():
    """Embed every ok relay sentence and repeat story (meaning-based divergence)."""
    p = path("embeddings")
    have = {r["key"] for r in map(json.loads, open(p))} if os.path.exists(p) else set()
    items = []
    for exp in ("relay", "repeat"):
        if not os.path.exists(path(exp)):
            continue
        for r in map(json.loads, open(path(exp))):
            if not r.get("ok") or not r.get("text"):
                continue
            key = hashlib.sha1(("%s|%s|%s|%s|%s|%s" % (exp, r["model"], r["cond"], r["sample"],
                                                        r.get("turn"), r["text"])).encode()).hexdigest()[:16]
            if key not in have:
                have.add(key)
                items.append({"exp": exp, "model": r["model"], "cond": r["cond"], "sample": r["sample"],
                              **({"turn": r["turn"]} if "turn" in r else {}), "key": key, "text": r["text"]})
    print("embed: %d texts to embed" % len(items), flush=True)
    for i in range(0, len(items), 100):
        chunk = items[i:i + 100]
        for t in range(6):
            code, d = run.http("POST", "/embeddings", {"model": EMBED_MODEL, "dimensions": EMBED_DIMS,
                                                       "input": [c["text"] for c in chunk]})
            if code == 200:
                break
            time.sleep(3 * (t + 1))
        assert code == 200, (code, str(d)[:200])
        c = (d.get("usage") or {}).get("total_tokens", 0) * 0.02 / 1e6
        with open(p, "a") as f:
            for it, e in zip(chunk, sorted(d["data"], key=lambda e: e["index"])):
                it = {k: v for k, v in it.items() if k != "text"}
                f.write(json.dumps({**it, "embed_model": EMBED_MODEL, "dims": EMBED_DIMS,
                                    "cost": round(c / len(chunk), 8),
                                    "vec": [round(x, 5) for x in e["embedding"]]}) + "\n")
        print("  %d/%d" % (min(i + 100, len(items)), len(items)), flush=True)


if __name__ == "__main__":
    if sys.argv[1:2] == ["spend"]:
        print("USD %.2f" % spent())
    elif sys.argv[1:2] == ["knobs"]:
        probe_knobs(sys.argv[2:] or MODELS)
    elif sys.argv[1:2] == ["estimate"]:
        estimate(sys.argv[2:] or ["wording", "dial", "repeat"])
    elif sys.argv[1:2] == ["embed"]:
        embed()
    else:
        main(sys.argv[2:] or ["dial", "repeat", "wording", "relay"])
