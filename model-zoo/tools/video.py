#!/usr/bin/env python3
"""Model Zoo video: the haggis chase from each Sora model.

  video.py run      submit one clip per model, poll until done, download the MP4

Clips land in ../data/video/<model>.mp4; a ledger line per job goes to ../data/_video.jsonl.
Cost is per second of video (from memory, not the published page: sora-2 $0.10/s,
sora-2-pro $0.30/s at 720p).
"""
import json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

import run

PER_SEC = {"sora-2": 0.10, "sora-2-pro": 0.30}
SECONDS = "8"
PROMPT = ("Comic, affectionate live-action-style short: on a purple heather moor in the Scottish "
          "Highlands, a round haggis with stubby little legs scampers furiously after a red-headed "
          "Scottish gamekeeper in tweeds and a flat cap, who glances back in alarm and runs. "
          "Mountains and drifting mist behind, wide tracking shot, bagpipe music, golden evening light.")
OUT = os.path.join(run.DATA, "video")


def download(vid, path):
    req = urllib.request.Request(f"{run.BASE}/videos/{vid}/content",
                                 headers={"Authorization": "Bearer " + run.TOKEN})
    with urllib.request.urlopen(req, timeout=600) as r, open(path, "wb") as f:
        f.write(r.read())


def one(model):
    path = os.path.join(OUT, f"{model}.mp4")
    if os.path.exists(path):
        return
    t0 = time.time()
    code, d = run.http("POST", "/videos", {"model": model, "prompt": PROMPT, "seconds": SECONDS,
                                            "size": "1280x720"})
    rec = {"model": model, "seconds": int(SECONDS), "code": code, "cost": 0.0}
    if code != 200:
        rec["error"] = json.dumps(d.get("error", d))[:300]
    else:
        vid = d["id"]
        rec["id"] = vid
        while d.get("status") in ("queued", "in_progress"):
            time.sleep(15)
            code, d = run.http("GET", f"/videos/{vid}")
            print(f"  {model}: {d.get('status')} {d.get('progress', '')}%", flush=True)
        rec["status"] = d.get("status")
        if d.get("status") == "completed":
            os.makedirs(OUT, exist_ok=True)
            download(vid, path)
            rec["cost"] = PER_SEC[model] * int(SECONDS)
            rec["bytes"] = os.path.getsize(path)
        else:
            rec["error"] = json.dumps(d.get("error", d))[:300]
    rec["secs"] = round(time.time() - t0, 1)
    run.append("_video", rec)
    print(f"  {model}: {rec.get('status')} {rec.get('error', '')} ${rec['cost']:.2f} {rec['secs']}s",
          flush=True)


if __name__ == "__main__":
    with ThreadPoolExecutor(2) as ex:
        list(ex.map(one, PER_SEC))
