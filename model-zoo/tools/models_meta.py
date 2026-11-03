#!/usr/bin/env python3
"""Save each model's provider and creation date (from both APIs) to ../data/_models.json."""
import datetime, json, os

import run

meta = {}
code, d = run.http("GET", "/models")
for m in d["data"]:
    meta[m["id"]] = {"provider": "openai",
                     "created": datetime.datetime.utcfromtimestamp(m["created"]).date().isoformat()}
code, d = run.http("GET", "/v1/models?limit=100", provider="anthropic")
for m in d["data"]:
    meta[m["id"]] = {"provider": "anthropic", "created": m["created_at"][:10],
                     "display_name": m.get("display_name")}
json.dump(meta, open(os.path.join(run.DATA, "_models.json"), "w"), indent=1, sort_keys=True)
live = run.live_models()
for m in sorted(live, key=lambda m: meta.get(m.split("@")[0], {}).get("created", "?")):
    print(meta.get(m.split("@")[0], {}).get("created", "?"), m)
