#!/usr/bin/env python3
"""Model Zoo image gallery: the same scene from every image model.

  images.py test                 one cheap image, to check the proxy serves /images
  images.py run [quality]        every image model x every prompt (resumable)

Images land in ../data/images/<prompt>/<model>.png; a ledger line per call goes to
../data/_images.jsonl with token usage and estimated cost.
"""
import base64, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor

import run  # reuses the proxy connection, http() and the ledger lock

MODELS = ["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5", "gpt-image-2",
          "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "chatgpt-image-latest"]
# USD per 1M image-output tokens (published 2026-11-03; gpt-image-1 from memory, 40)
OUT_PRICE = {"gpt-image-1": 40, "gpt-image-1-mini": 8, "gpt-image-1.5": 32, "gpt-image-2": 30,
             "gpt-image-2.5-flare": 30, "gpt-image-2.5-sunburst": 30, "chatgpt-image-latest": 32}
PROMPTS = {
    "haggis": "A haggis with stubby legs chasing a red-headed Scottish gamekeeper in tweeds across a "
              "purple heather moor, Highland mountains behind, comic and affectionate, wide shot.",
    "zoo": "A Victorian zoo where the animals in the enclosures are glowing computer chips of different "
           "sizes, families peering at them through the railings, a sign reading 'MODEL ZOO'.",
    "glasgow": "A rainy Glasgow street at dusk, red sandstone tenements, reflections in the wet "
               "pavement, a single orange umbrella.",
}
OUT = os.path.join(run.DATA, "images")


def gen(model, key, prompt, quality):
    path = os.path.join(OUT, key, f"{model}.png")
    if os.path.exists(path):
        return None
    t0 = time.time()
    for i in range(4):
        code, d = run.http("POST", "/images/generations",
                           {"model": model, "prompt": prompt, "size": "1536x1024",
                            "quality": quality, "n": 1})
        if code not in (0, 429, 500, 502, 503):
            break
        time.sleep(5 * (i + 1))
    rec = {"model": model, "prompt": key, "quality": quality, "code": code,
           "secs": round(time.time() - t0, 1)}
    if code == 200:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(base64.b64decode(d["data"][0]["b64_json"]))
        u = d.get("usage") or {}
        rec["usage"] = {"in": u.get("input_tokens", 0), "out": u.get("output_tokens", 0)}
        rec["cost"] = (rec["usage"]["in"] * 8 + rec["usage"]["out"] * OUT_PRICE[model]) / 1e6
        rec["revised_prompt"] = d["data"][0].get("revised_prompt")
    else:
        rec["error"] = json.dumps(d.get("error", d))[:300]
        rec["cost"] = 0.0
    run.append("_images", rec)
    print(f"  {model:24} {key:8} {code} ${rec['cost']:.3f} {rec['secs']}s {rec.get('error', '')[:100]}",
          flush=True)
    return rec


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "test"
    if cmd == "jpeg":  # web copies of the PNG originals (macOS sips)
        import glob, subprocess
        for png in sorted(glob.glob(os.path.join(OUT, "*", "*.png"))):
            jpg = png[:-4] + ".jpg"
            if not os.path.exists(jpg):
                subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82",
                                png, "--out", jpg], check=True, capture_output=True)
            print(f"{os.path.getsize(jpg) // 1024:6} KB  {os.path.relpath(jpg, OUT)}")
    elif cmd == "test":
        gen("gpt-image-1-mini", "_test", "A small haggis on a heather moor, watercolour", "low")
    else:
        q = sys.argv[2] if len(sys.argv) > 2 else "medium"
        jobs = [(m, k, p) for k, p in PROMPTS.items() for m in MODELS]
        with ThreadPoolExecutor(4) as ex:
            list(ex.map(lambda j: gen(*j, q), jobs))
