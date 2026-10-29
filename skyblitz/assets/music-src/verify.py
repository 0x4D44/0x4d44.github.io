"""Numeric verification of the shipped music (we cannot listen): decodes every Opus stem with ffmpeg and reports, per track,
durations vs meta.json, sizes, loudness / true peak of each stem and of the full stack, spectral balance, DC, clipping and the loop seam.
    python verify.py [track ...]        (default: all tracks found in ../music)   Exit code 1 if a hard limit is broken.
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.normpath(os.path.join(HERE, '..', 'music'))
FFMPEG = os.environ.get('FFMPEG', 'C:/ProgramData/chocolatey/bin/ffmpeg.exe')
FFPROBE = FFMPEG.replace('ffmpeg', 'ffprobe')
bad = []


def decode(path):
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', path, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', tmp], check=True)
    sr, d = wavfile.read(tmp); os.remove(tmp)
    return d.astype(np.float32)


def ebur(x):
    tmp = tempfile.mktemp(suffix='.wav'); wavfile.write(tmp, 48000, x.astype(np.float32))
    r = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    os.remove(tmp)
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1]; p = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
    return float(i), float(p[-1]) if p else None


def probe_dur(path):
    r = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    return float(r.stdout.strip())


def check(cond, msg):
    if not cond:
        bad.append(msg); print('   !!', msg)


def bands(x):
    m = x.mean(axis=1); out = []
    for lo, hi in [(20, 150), (150, 600), (600, 2500), (2500, 8000), (8000, 20000)]:
        sos = butter(4, [lo, hi], btype='band', fs=48000, output='sos'); out.append(float(np.mean(sosfilt(sos, m) ** 2)))
    t = sum(out) or 1
    return [round(100 * o / t, 1) for o in out]


def is_track(d):
    p = os.path.join(MUSIC, d, 'meta.json')
    return os.path.exists(p) and 'stems' in json.load(open(p))


tracks = sys.argv[1:] or [d for d in sorted(os.listdir(MUSIC)) if is_track(d)]
total = 0
print('| track | bpm | key | intro s | loop s | MB | stems (LUFS/TP) | stack LUFS | stack TP | bands % (<150,<600,<2.5k,<8k,>8k) | seam jump/step | DC |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for t in tracks:
    d = os.path.join(MUSIC, t); meta = json.load(open(os.path.join(d, 'meta.json')))
    mix = None; stem_txt = []; size = 0
    for n, st in meta['stems'].items():
        p = os.path.join(d, st['file']); size += os.path.getsize(p)
        dur = probe_dur(p); check(abs(dur - meta['totalSec']) < 0.05, f'{t}/{n}: ffprobe {dur:.3f}s vs meta {meta["totalSec"]:.3f}s')
        x = decode(p); check(abs(len(x) - meta['totalSamples']) <= 1, f'{t}/{n}: decoded {len(x)} samples vs {meta["totalSamples"]}')
        check(bool(np.isfinite(x).all()), f'{t}/{n}: NaN/Inf')
        i, tp = ebur(x); stem_txt.append(f'{n} {i:.1f}/{tp}')
        mix = x if mix is None else mix + x[:len(mix)]
    i, tp = ebur(mix); N = len(mix); I = meta['introSamples']
    check(tp is not None and tp < -0.9, f'{t}: stack true peak {tp}')
    check(-24 < i < -12, f'{t}: stack loudness {i}')
    jump = float(np.max(np.abs(mix[N - 1] - mix[I]))); step = float(np.abs(np.diff(mix[I:I + 4800], axis=0)).mean() + 1e-9)
    clip = int((np.abs(mix) >= 0.999).sum()); check(clip == 0, f'{t}: {clip} clipped samples')
    dc = float(mix.mean()); check(abs(dc) < 0.01, f'{t}: DC {dc}')
    check(size <= 2.0e6, f'{t}: {size/1e6:.2f} MB > 2 MB')
    total += size
    print(f"| {t} | {meta['bpm']} | {meta['key']} | {meta['introSec']:.2f} | {meta['loopSec']:.2f} | {size/1e6:.2f} | {'; '.join(stem_txt)} | {i:.1f} | {tp} | {bands(mix)} | {jump/step:.1f} | {dc:.4f} |")
st = os.path.join(MUSIC, 'stingers')
if os.path.isdir(st):
    for f in sorted(os.listdir(st)):
        if f.endswith('.ogg'):
            p = os.path.join(st, f); total += os.path.getsize(p); x = decode(p); i, tp = ebur(x)
            print(f'| stinger {f} | | | | {len(x)/48000:.2f} | {os.path.getsize(p)/1e6:.3f} | {i:.1f}/{tp} | | | | | |')
print(f'\ntotal music bytes: {total/1e6:.2f} MB (budget 14 MB)')
check(total <= 14e6, 'total over 14 MB')
sys.exit(1 if bad else 0)
