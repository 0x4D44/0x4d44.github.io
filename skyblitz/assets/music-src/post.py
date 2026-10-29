"""Post-process one looped track: stem-balance fit, loop-tail fold, loudness, Ogg Opus encode.

ferrosintesis normalises EVERY render to -18 LUFS, so a solo stem is as loud as the full mix. We recover the true
relative levels by least squares: full ~= sum(a_i * stem_i) (the synth mixes linearly), then scale all stems by one
common gain so the summed mix hits the target loudness while peaking under the ceiling.

Loop fold: the render is intro + one loop + a reverb/release tail. The tail after the loop end is mixed onto the start
of the loop (file offset = intro length), so looping back from the end is click-free and the reverb keeps ringing.
"""
import json, os, re, subprocess, sys
import numpy as np
from scipy.io import wavfile

cfg = json.load(open(sys.argv[1]))
D, R = cfg['dir'], cfg['rate']


def load(p):
    sr, d = wavfile.read(p)
    assert sr == R, (p, sr)
    d = d.astype(np.float32)
    d /= 32768.0 if d.dtype != np.float32 and np.abs(d).max() > 2 else 1.0
    return d


def read(p):
    sr, d = wavfile.read(p)
    assert sr == R, (p, sr)
    if d.dtype == np.int16:
        return d.astype(np.float32) / 32768.0
    if d.dtype == np.int32:
        return d.astype(np.float32) / 2147483648.0
    return d.astype(np.float32)


full = read(os.path.join(D, 'full.wav'))
stems = {n: read(os.path.join(D, f'stem_{n}.wav')) for n in cfg['stems']}
L = min([len(full)] + [len(s) for s in stems.values()])
full = full[:L]
for n in stems:
    stems[n] = stems[n][:L]

# --- balance fit
names = list(stems)
# The synth is NOT sample-linear across --solo renders (voice/round-robin RNG shifts), so a waveform fit fails. Energies do add
# (different instruments are ~uncorrelated): fit full_energy[w] ~= sum(a_i^2 * stem_energy_i[w]) over 0.25 s windows, per band.
from scipy.optimize import nnls
from scipy.signal import butter, sosfilt
W = R // 4
nw = L // W
rows, rhs = [], []
for lo, hi in [(40, 250), (250, 2000), (2000, 16000)]:
    sos = butter(4, [lo, hi], btype='band', fs=R, output='sos')
    fb = sosfilt(sos, full.mean(axis=1))[:nw * W].reshape(nw, W)
    sb = [sosfilt(sos, stems[n].mean(axis=1))[:nw * W].reshape(nw, W) for n in names]
    rhs.append((fb ** 2).mean(axis=1))
    rows.append(np.stack([(s ** 2).mean(axis=1) for s in sb], axis=1))
Aeq, beq = np.concatenate(rows), np.concatenate(rhs)
wt = 1.0 / (beq + 1e-6)                      # relative error per window
x, _ = nnls(Aeq * wt[:, None], beq * wt)
nn = np.sqrt(np.maximum(x, 1e-4))
# exact balance: renders used --peak-normalize (linear), the CLI printed each RAW peak -> raw_i = out_i * rawPeak_i / 0.891
fs_full = cfg['peaks']['full'] / 0.8913
coef = np.array([cfg['peaks'][n] / 0.8913 for n in names]) / fs_full      # relative to the raw full mix
pred = Aeq @ (coef ** 2)
beq_raw = beq                                                           # full is peak-normalised too: out_full = raw_full * 0.891/peak_full
resid = float(np.mean(np.abs(pred - beq_raw) / (beq_raw + 1e-6)))
print('raw-peak balance', dict(zip(names, [round(float(c), 3) for c in coef])), 'mean rel energy err %.3f' % resid)
print('nnls cross-check', dict(zip(names, [round(float(c), 3) for c in nn])))

bar_s = 240.0 / cfg['bpm']
intro_n = int(round(cfg['introBars'] * bar_s * R))
loop_n = int(round(cfg['loopBars'] * bar_s * R))
N = intro_n + loop_n
assert L > N + R, 'render shorter than expected: %d vs %d' % (L, N)
tail = min(L - N, int(cfg['tail'] * R), loop_n)

bal = {n: stems[n] * coef[i] for i, n in enumerate(names)}


def active_db(x):
    """Loudness (dB RMS) of a stem over its active 0.25 s windows, so sparse stems are judged on what they play."""
    e = (x[:nw * W].mean(axis=1) ** 2).reshape(nw, W).mean(axis=1) if False else (x[:nw * W, 0] ** 2).reshape(nw, W).mean(axis=1)
    e = e[e > 0.1 * e.max()]
    return 10 * np.log10(e.mean() + 1e-12)


# Automatic stem trim: raw instrument levels differ wildly, so pull each stem to a target offset below the base stem (dB).
targets = {'base': 0.0, 'lead': -5.0, 'drive': -4.0, 'final': -3.0}
targets.update(cfg.get('stemTarget', {}))
ref_db = active_db(bal['base']) if 'base' in bal else 0.0
trims = {}
for n in names:
    t = float(np.clip(targets.get(n, -3.0) - (active_db(bal[n]) - ref_db), -12, 18)) if n != 'base' else 0.0
    trims[n] = t
    bal[n] = bal[n] * (10 ** (t / 20))
# Drum transients dominate the peak: tame them with a soft clipper (tanh knee at 55 % of the stem peak) so the mix can be louder.
for n in names:
    pk = float(np.abs(bal[n]).max()); k = 0.55 * pk
    bal[n] = (np.tanh(bal[n] / k) * k).astype(np.float32)
print('auto trims dB', {k: round(v, 1) for k, v in trims.items()})


def lowcut(x):
    """Tame the bass-heavy GM kits: 2nd-order 28 Hz high-pass + RBJ low shelf (-4 dB below ~140 Hz)."""
    from scipy.signal import tf2sos
    A = 10 ** (-4 / 40); w0 = 2 * np.pi * 140 / R; cw, sw = np.cos(w0), np.sin(w0); al = sw / 2 * np.sqrt(2)
    b0 = A * ((A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * al); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * al)
    a0 = (A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * al; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * al
    y = sosfilt(tf2sos([b0, b1, b2], [a0, a1, a2]), x, axis=0)
    return sosfilt(butter(2, 28, btype='high', fs=R, output='sos'), y, axis=0).astype(np.float32)


SEAM_MS = float(cfg.get('seamMs', 2.5))


def fold(x):
    f = x[:N].copy()
    t = x[N:N + tail].copy()
    # V-6: the tail is the true continuation of the last sample (so the wrap is continuous), but the NEW material that starts at
    # loopStart is a hard sample onset (kick / string attack): ramp it in over SEAM_MS so the wrap is not a click.
    w = int(SEAM_MS * R / 1000)
    f[intro_n:intro_n + w] *= ((1 - np.cos(np.linspace(0, np.pi, w))) / 2)[:, None]
    f[intro_n:intro_n + len(t)] += t
    # 3 ms fade-in at the very start (no click on the first note) – loop wrap itself is untouched
    k = int(0.003 * R)
    f[:k] *= np.linspace(0, 1, k)[:, None]
    return f


folded = {n: fold(lowcut(bal[n])) for n in names}
mix = sum(folded.values())


def lufs(x):
    tmp = os.path.join(D, '_l.wav')
    wavfile.write(tmp, R, x.astype(np.float32))
    r = subprocess.run([cfg['ffmpeg'], '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    p = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
    return float(m[-1]), float(p[-1]) if p else 0.0


I0, P0 = lufs(mix)
g = 10 ** ((cfg['targetLufs'] - I0) / 20)
peak = float(np.abs(mix).max()) * g
ceil = 10 ** (cfg['peakCeil'] / 20)
if peak > ceil:
    g *= ceil / peak
print('mix integrated %.1f LUFS (pre), gain %.2f dB' % (I0, 20 * np.log10(g)))
mix *= g
for n in names:
    folded[n] *= g

out = cfg['out']
os.makedirs(out, exist_ok=True)
info = {'stems': {}, 'rate': R}
for n in names:
    wav = os.path.join(D, f'out_{n}.wav')
    wavfile.write(wav, R, np.clip(folded[n], -1, 1).astype(np.float32))
    br = cfg['bitrate'].get(n, 52 if n == 'base' else 40)
    ogg = os.path.join(out, f'{n}.ogg')
    subprocess.run([cfg['ffmpeg'], '-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', f'{br}k', '-vbr', 'on',
                    '-compression_level', '10', '-application', 'audio'] + (['-ac', '1'] if n in cfg.get('mono', ['drive', 'final']) else []) + [ogg], check=True)
    sz = os.path.getsize(ogg)
    rms = float(np.sqrt(np.mean(folded[n] ** 2)))
    info['stems'][n] = {'file': f'{n}.ogg', 'bytes': sz, 'kbps': br, 'gain': round(float(coef[names.index(n)]), 3), 'rmsDb': round(20 * np.log10(rms + 1e-9), 1)}
# seam diagnostics on the summed mix
seam_jump = float(np.max(np.abs(mix[N - 1] - mix[intro_n])))
local = np.abs(np.diff(mix[intro_n:intro_n + 4800], axis=0)).mean()          # typical sample-to-sample step near the loop start
seam_ratio = seam_jump / (local + 1e-9)
rms_win = lambda a: float(np.sqrt(np.mean(a ** 2)))
info.update({
    'introSec': intro_n / R, 'loopSec': loop_n / R, 'totalSec': N / R, 'introSamples': intro_n, 'loopSamples': loop_n, 'totalSamples': N,
    'bytes': sum(v['bytes'] for v in info['stems'].values()),
    'stats': {'lufs': round(I0 + 20 * np.log10(g), 1), 'peakDb': round(20 * np.log10(float(np.abs(mix).max()) + 1e-9), 2), 'fitResidual': round(resid, 3),
              'seamJump': round(seam_jump, 5), 'seamRatio': round(float(seam_ratio), 2), 'trimsDb': {k: round(v, 1) for k, v in trims.items()}, 'seamRms': round(rms_win(mix[N - 2400:N]), 4), 'startRms': round(rms_win(mix[intro_n:intro_n + 2400]), 4)},
})
json.dump(info, open(os.path.join(D, 'post.json'), 'w'))
print('bytes', info['bytes'], info['stats'])
