#!/usr/bin/env python3
"""Stochasticity experiments: how random are the models, and which knob moves it?

  stochastic.py run [EXP ...]   collect (resumable; an ok answer is never re-bought)
  stochastic.py spend

EXP: dial (temperature or effort), repeat (same prompt 20x, seeded where possible),
wording (rephrasings of one question), relay (one opening, five independent relays).
Answers append to ../data/stoch-<exp>.jsonl. Uses run.py's deltic pool connections.
"""
import json, os, sys, threading, time
from concurrent.futures import ThreadPoolExecutor

import run

BUDGET = float(os.environ.get("STOCH_BUDGET", "10"))
MODELS = os.environ.get("STOCH_MODELS", "gpt-4o,gpt-6.2-sol,claude-opus-5-5").split(",")
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
    """The randomness knob each model exposes: temperature for gpt-4o; the others refuse
    temperature (gpt-6.2-sol: 'not supported'; claude-opus-5-5: 'deprecated'), so we turn
    reasoning effort instead."""
    if model == "gpt-4o":
        return [("t0", {"temperature": 0}), ("t0.5", {"temperature": 0.5}),
                ("t1", {"temperature": 1.0}), ("t1.5", {"temperature": 1.5})]
    return [("low", {"effort": "low"}), ("medium", {"effort": "medium"}), ("high", {"effort": "high"})]


def call(model, prompt, max_tokens, temperature=None, seed=None, effort=None, logprobs=False):
    t0 = time.time()
    if model.startswith("claude-"):
        body = {"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}
        if effort:
            body["output_config"] = {"effort": effort}
        code, d = run.http("POST", "/v1/messages", body, provider="anthropic")
        if code == 200:
            u = d.get("usage") or {}
            # Opus 5.5 thinks unasked: a cut-off answer is a failure to re-ask, not a short answer
            return {"ok": d.get("stop_reason") != "max_tokens",
                    "text": "".join(b.get("text", "") for b in d["content"] if b.get("type") == "text"),
                    "usage": {"in": u.get("input_tokens", 0), "out": u.get("output_tokens", 0)},
                    "status": d.get("stop_reason"), "resolved_model": d.get("model"),
                    "secs": round(time.time() - t0, 2)}
    elif model == "gpt-4o":
        body = {"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens}
        if temperature is not None:
            body["temperature"] = temperature
        if seed is not None:
            body["seed"] = seed
        if logprobs:
            body["logprobs"] = True; body["top_logprobs"] = 20
        code, d = run.http("POST", "/chat/completions", body)
        if code == 200:
            ch = d["choices"][0]; u = d.get("usage") or {}
            r = {"ok": True, "text": ch["message"].get("content") or "",
                 "usage": {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0)},
                 "resolved_model": d.get("model"), "fingerprint": d.get("system_fingerprint"),
                 "secs": round(time.time() - t0, 2)}
            if logprobs and ch.get("logprobs"):
                first = ch["logprobs"]["content"][0]
                r["top"] = [[t["token"], round(t["logprob"], 4)] for t in first["top_logprobs"]]
            return r
    else:
        body = {"model": model, "input": prompt, "max_output_tokens": max_tokens}
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
    for i in range(6):
        r = call(*a, **k)
        if r["ok"] or r.get("code", 200) not in (0, 200, 429, 500, 502, 503, 529):
            return r
        time.sleep(3 * (i + 1))
    return r


def room(model, long):
    """Output allowance: the reasoners spend hidden tokens before the answer."""
    thinks = model != "gpt-4o"
    return (8000 if long else 4000) if thinks else (1200 if long else 50)


def path(exp):
    return os.path.join(run.DATA, "stoch-%s.jsonl" % exp)


def done(exp):
    p = path(exp)
    if not os.path.exists(p):
        return set()
    return {(r["model"], r["cond"], r["prompt_id"], r["sample"]) for r in map(json.loads, open(p)) if r.get("ok")}


def spent():
    t = 0.0
    for fn in os.listdir(run.DATA):
        if fn.startswith("stoch-"):
            t += sum(json.loads(l).get("cost", 0) for l in open(os.path.join(run.DATA, fn)) if l.strip())
    return t


def job(exp, model, cond, prompt_id, prompt, sample, max_tokens, **kw):
    if SPENT[0] > BUDGET:
        return
    r = call_retry(model, prompt, max_tokens, **kw)
    c = run.cost(model, r.get("usage", {})) if r["ok"] else 0.0
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
            kw = {"temperature": 0} if m == "gpt-4o" else {}
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
            m = MODELS[(turn - 1) % len(MODELS)]
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


def main(exps):
    SPENT[0] = spent()
    for exp in exps:
        if exp == "relay":
            relay(); continue
        have = done(exp)
        todo = [j for j in jobs(exp) if (j[0], j[1], j[2], j[4]) not in have]
        print("%s: %d to ask; spent so far USD %.2f of %.2f" % (exp, len(todo), SPENT[0], BUDGET), flush=True)
        with ThreadPoolExecutor(int(os.environ.get("STOCH_WORKERS", "12"))) as ex:
            for m, cond, pid, p, s, mt, kw in todo:
                ex.submit(job, exp, m, cond, pid, p, s, mt, **kw)
    print("spent USD %.2f" % SPENT[0], flush=True)


if __name__ == "__main__":
    if sys.argv[1:2] == ["spend"]:
        print("USD %.2f" % spent())
    else:
        main(sys.argv[2:] or ["dial", "repeat", "wording", "relay"])
