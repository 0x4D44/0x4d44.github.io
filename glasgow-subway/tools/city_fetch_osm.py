"""Download OSM map tiles (adaptive subdivision) into a cache dir. usage: city_fetch_osm.py CACHE_DIR"""
import sys, os, time, urllib.request, urllib.error, threading
from concurrent.futures import ThreadPoolExecutor
W,S,E,N = -4.330,-0+55.836,-4.230,55.882
cache = sys.argv[1]; os.makedirs(cache, exist_ok=True)
UA = {"User-Agent":"glasgow-subway-explorer/1.0 (static almanac project; martingdavidson@gmail.com)"}
def key(b): return "%.5f_%.5f_%.5f_%.5f.osm"%b
def fetch(b, depth=0):
    f = os.path.join(cache, key(b))
    if os.path.exists(f): return
    url = "https://api.openstreetmap.org/api/0.6/map?bbox=%.5f,%.5f,%.5f,%.5f"%b
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = r.read()
            open(f,"wb").write(data); print("ok", key(b), len(data), flush=True); return
        except urllib.error.HTTPError as e:
            if e.code == 400 or e.code == 509 and False:
                # too many nodes -> split
                w,s,e_,n = b; mx=(w+e_)/2; my=(s+n)/2
                for sb in [(w,s,mx,my),(mx,s,e_,my),(w,my,mx,n),(mx,my,e_,n)]: fetch(sb, depth+1)
                return
            print("http", e.code, key(b), flush=True); time.sleep(5*(attempt+1))
        except Exception as ex:
            print("err", ex, flush=True); time.sleep(5*(attempt+1))
tiles=[]
nx,ny=10,6
for i in range(nx):
    for j in range(ny):
        tiles.append((W+(E-W)*i/nx, S+(N-S)*j/ny, W+(E-W)*(i+1)/nx, S+(N-S)*(j+1)/ny))
with ThreadPoolExecutor(2) as ex: list(ex.map(fetch, tiles))
print("done")
