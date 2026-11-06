#!/usr/bin/env python3
"""Rebuilds glasgow-subway/audio/rumble.mp3, motor.mp3, brake-hiss-1.mp3 and brake-hiss-2.mp3 from the recordings they come from (all CC BY 3.0):

  rumble.mp3, motor.mp3   Wu, Tsan-Cheng (Radio Aporee), "Tamsui Line, Taipei City - Tamsui Line (Taipei Metro)", 2014-01-20, binaural, Zoom H4n + Soundman OKM II
                          https://archive.org/details/aporee_21458_24940   file SoundMap2014012052.ogg  (3997980 bytes, sha256 fcc520d3...111ebd7)
                          curl -L -o SoundMap2014012052.ogg https://archive.org/download/aporee_21458_24940/SoundMap2014012052.ogg
  brake-hiss-1.mp3        Mike Koenig, "Truck Air Brakes"   https://soundbible.com/1056-Truck-Air-Brakes.html  (78730 bytes, sha256 d546165f...35c0b7)
                          curl -L -o sb-1056-truck-air-brakes.mp3 'https://soundbible.com/grab.php?id=1056&type=mp3'
  brake-hiss-2.mp3        Mike Koenig, "Air Break"          https://soundbible.com/525-Air-Break.html           (115943 bytes, sha256 bdae4d2b...025bb2)
                          curl -L -o sb-525-air-break.mp3 'https://soundbible.com/grab.php?id=525&type=mp3'

usage: python3 tools/make_running_audio.py <dir holding the three downloaded files> [out dir (default: glasgow-subway/audio)]
needs python3 with numpy, and ffmpeg with libmp3lame. Prints, for each file, what to put in js/sim/audio.js (SAMPLES) and the numbers it was checked by.

The changes made - which CC BY asks to be stated, and which models/credits.json and credits.html say - are:
  all      mixed to mono (the sim places the sound itself), cut to the part used, filtered, levelled and encoded as MP3
  rumble   12 s of the train running on a steady stretch (58-70 s): high-passed at 25 Hz, a steady 58.8 Hz hum (with its 2nd and 3rd harmonics; not the 60 Hz mains, so its source is unknown) and a constant 1601.5 Hz whistle notched out
           (a hum or whistle that bends in pitch with the train's speed would be wrong), looped by an overlapped cross-fade whose join point is chosen for the best match
  motor    2.4 s of the traction inverter's tones (96.2-98.6 s), high-passed at 1.5 kHz so none of the rumble is in it, the same whistle notched out, looped the same way
  hiss     one release of a truck's air brakes each (1056: 1.30-2.05 s, 525: 2.70-4.20 s), high-passed at 800 Hz (the truck's idling engine sits below), fade-in 5 ms, tail faded, equal loudness
The two loops are stored with a little of themselves on either side (the cycle repeated), and SAMPLES gives where the repeat starts and ends: MP3 has encoder padding at both ends, and
with the loop points inside the file that padding is never heard, whether or not the browser trims it.
The loop's length and its start are whole multiples of 10 ms. A browser turns an MP3 into samples at its own rate (44.1 or 48 kHz, whatever the sound card runs at), and a loop that is not a whole
number of samples there is replayed a fraction of a sample long or short - a phase step at the join of every pass, which a bright tone like the whine shows. Any multiple of 10 ms is a whole
number of samples at 24, 32, 44.1 and 48 kHz alike (and the converter between them repeats exactly every 10 ms), so the loop is the same cycle at all of them.
"""
import os, subprocess, sys, tempfile
import numpy as np

# ---- what to cut and how (seconds in the source file)
RUMBLE = dict(t0=58.0, t1=70.0, p_lo=9.6, hp=25, notch=[(58.79, 15), (117.57, 15), (176.36, 15), (1601.5, 40)], lp=9000, x=1.5, sr=24000, kbps=64, margin=0.4)
MOTOR = dict(t0=96.2, t1=98.6, hp=1500, notch=[(1601.5, 40)], lp=11000, x=0.45, sr=48000, kbps=128, margin=0.3, p_lo=1.2)
HISS = [dict(name='brake-hiss-1', src='hiss1', t0=1.30, t1=2.05, tail=0.30), dict(name='brake-hiss-2', src='hiss2', t0=2.70, t1=4.20, tail=0.60)]
HISS_HP, HISS_FADE_IN, HISS_LOUDEST, HISS_SR, HISS_KBPS = 800, 0.005, 0.2, 44100, 64
SEAM_GATE, CANDIDATES = 90, 60          # a loop's join may sit no higher than this percentile (see seam_report), among the best CANDIDATES joins by correlation
PEAK_DB, HISS_RMS_DB = -1.5, -14.0   # loops are peak-normalised, the hiss takes are levelled to the same loudest-0.2 s RMS (and kept under the peak ceiling)
SRC = dict(train='SoundMap2014012052.ogg', hiss1='sb-1056-truck-air-brakes.mp3', hiss2='sb-525-air-break.mp3')


def decode(path, t0, t1, af, sr, pad=1.0):
    """mono float64 of path[t0:t1] at sr, filtered by af; filtered over `pad` seconds more each side, so the filters' start-up is not in what is kept"""
    a = max(0.0, t0 - pad); lead = t0 - a
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{a:.4f}', '-t', f'{t1 - a + pad:.4f}', '-i', path, '-af', 'pan=mono|c0=0.5*c0+0.5*c1,' + af, '-ar', str(sr), '-f', 'f32le', '-']
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).astype(np.float64)
    return x[int(round(lead * sr)):int(round(lead * sr)) + int(round((t1 - t0) * sr))]


def chain(o):
    f = [f'highpass=f={o["hp"]}:poles=2'] + (['highpass=f=%s:poles=2' % o['hp']] if o['hp'] >= 1000 else [])
    f += [f'bandreject=f={fq}:width_type=q:w={q}' for fq, q in o['notch']] + [f'lowpass=f={o["lp"]}:poles=2']
    return ','.join(f)


def db(x): return 20 * np.log10(max(float(x), 1e-12))
def rms(x): return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def join_candidates(S, sr, X, p_lo, p_hi, q=1):
    """every loop length P (samples) in [p_lo, p_hi] that is a multiple of q, with how well the first X samples of S match the X samples that start at P (their normalised cross-correlation), best first"""
    n = len(S); a = S[:X]; a = a - a.mean(); na = np.sqrt(np.sum(a * a))
    N = 1 << int(np.ceil(np.log2(n + X)))
    corr = np.fft.irfft(np.fft.rfft(S - S.mean(), N) * np.conj(np.fft.rfft(a, N)), N)[:n - X + 1]      # corr[p] = sum_i S[p+i] a[i]
    c2 = np.cumsum(np.concatenate([[0.0], (S - S.mean()) ** 2]))
    den = np.sqrt(np.maximum(c2[X:X + len(corr)] - c2[:len(corr)], 1e-30)) * na
    r = corr / den; ps = np.arange(len(r)); ps = ps[(ps >= p_lo) & (ps <= p_hi) & (ps % q == 0)]
    return [(int(p), float(r[p])) for p in ps[np.argsort(-r[ps])]]


def make_loop(S, X, P, rho):
    """a seamless loop out of S: the first X samples are replaced by a cross-fade from the X samples at P to the first X, so the sample after the loop's end (S[P]) is the one that follows the sample before it.
    The fade's weights keep the power constant for content that is partly alike in the two parts (correlation rho): a^2 + b^2 + 2*rho*a*b = 1."""
    rho = max(0.0, rho)
    u = (np.arange(X) + 0.5) / X; a = np.cos(u * np.pi / 2); b = np.sin(u * np.pi / 2); s = 1 / np.sqrt(a * a + b * b + 2 * rho * a * b)
    L = S[:P].copy(); L[:X] = (a * s) * S[P:P + X] + (b * s) * S[:X]
    return L


def lame(x, sr, kbps, path):
    """encode mono float64 (-1..1) as MP3"""
    pcm = np.clip(x, -1, 1).astype('<f4').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-ar', str(sr), path], input=pcm, check=True)


def load_mp3(path, sr):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def seam_report(loop, sr):
    """how a loop sounds at its join, three ways, each judged by comparing the 10 ms before the join with the 10 ms after it, and the same pair of 10 ms either side of every other point of the loop (every 2.5 ms):
    the largest sample step, the jump in RMS level, and the change of spectrum (over the bins within 35 dB of the louder frame's peak - the quiet bins carry nothing that is heard). Each comes back as a
    percentile: the share of those other points whose value is smaller than the join's. ~50 is a join like any other place; above ~95 would be a flaw.
    How well it can tell (the controls in research/running-sounds.md): a step of the signal's own height at the join, a tripled level and a cut with no cross-fade all score 97-100; a doubled level
    scores only ~83 on the rumble, whose lowest components are longer than the 10 ms windows, and the 'step' of the bright motor tone saturates near 92-94 even for a bad cut. It is a filter for gross joins,
    not a proof that none can be heard."""
    y = np.tile(loop, 3); P = len(loop); f = int(0.01 * sr); hop = max(1, int(0.0025 * sr)); w = max(2, int(0.002 * sr))
    def measures(c):
        A, B = y[c - f:c], y[c:c + f]; a, b = np.abs(np.fft.rfft(A * np.hanning(f))), np.abs(np.fft.rfft(B * np.hanning(f)))
        a, b = 20 * np.log10(a + 1e-9), 20 * np.log10(b + 1e-9); top = max(a.max(), b.max()) - 35; sel = (a > top) | (b > top)
        return (np.abs(np.diff(y[c - w:c + w])).max(), abs(db(rms(B)) - db(rms(A))), float(np.sqrt(np.mean((b[sel] - a[sel]) ** 2))))
    cs = [c for c in range(f, len(y) - f, hop) if min(abs(c - P), abs(c - 2 * P)) > 2 * f]
    other = np.array([measures(c) for c in cs]); seam = np.array([measures(P), measures(2 * P)]).max(axis=0)
    r = 100.0 * np.mean(other < seam, axis=0); return dict(step=r[0], level=r[1], spectrum=r[2])


def zone_report(L, X, sr, w=0.1):
    """the level of the cross-faded start of the loop against the rest of it, in w-second windows (dB: mean difference, spread inside and outside the zone, lowest and highest window of the zone against the rest):
    the join is a true continuation of the recording (the sample after the loop's end is the one that followed it), so what a blend of two only partly alike parts can add is a swell or a dip in the zone"""
    n = int(w * sr); e = np.array([db(rms(L[i:i + n])) for i in range(0, len(L) - n + 1, n)]); nz = X // n; z, r = e[:nz], e[nz:]
    return z.mean() - r.mean(), z.std(), r.std(), z.min() - r.mean(), z.max() - r.mean()


def build_loop(name, o, src, out_dir):
    sr = o['sr']; f = chain(o)
    S = decode(src, o['t0'], o['t1'], f, sr); X = int(o['x'] * sr)
    q = sr // 300; assert sr % 300 == 0 and round(o['margin'] * 300) == o['margin'] * 300          # the loop is a whole number of 1/300 s, and so of samples at every rate a browser is likely to run at (see the docstring)
    m = int(o['margin'] * sr); path = os.path.join(out_dir, name + '.mp3'); tried = []
    # the join is chosen by how well the two overlapped parts match; the seam check below then has the last word: a candidate whose join stands out from the rest of the loop (above SEAM_GATE
    # on any of the three measures, as built or after the MP3) is passed over for the next best match
    for P, rho in join_candidates(S, sr, X, int(o['p_lo'] * sr), len(S) - X, q)[:CANDIDATES]:
        L = make_loop(S, X, P, rho); peak = np.max(np.abs(L)); gain = 10 ** (PEAK_DB / 20) / peak; Lg = L * gain
        full = np.concatenate([Lg[-m:], Lg, Lg[:m]])     # the cycle repeated either side
        lame(full, sr, o['kbps'], path)
        dec = load_mp3(path, sr); region = dec[m:m + len(Lg)]                                  # (if the decoder trims the encoder's delay the loop is where it was; if not it is a few ms later - the same cycle)
        rep = seam_report(Lg, sr); repm = seam_report(region, sr); worst = max(max(rep.values()), max(repm.values())); tried.append((P, rho, worst))
        if worst <= SEAM_GATE: break
    else:
        sys.exit(f'{name}: none of the {len(tried)} best joins passes the seam check ({tried})')
    snr = db(rms(Lg) / max(rms(region - Lg), 1e-12))
    src_rms = rms(L)                                                                      # the loop as cut, before it was levelled: what it was in the recording
    print(f'{name}: {o["t0"]}-{o["t1"]} s of the source, loop {len(L) / sr:.4f} s = {P} samples at {sr} Hz (cross-fade {o["x"]} s, join correlation {rho:.2f}; rank {len(tried)} by correlation, {len(tried) - 1} passed over by the seam check); file {os.path.getsize(path)} bytes, {len(dec) / sr:.3f} s decoded ({len(full) / sr:.3f} s written)')
    print(f'  loop: [{m / sr:.6f}, {(m + len(Lg)) / sr:.6f}]   peak {PEAK_DB} dBFS, rms {db(rms(Lg)):.1f} dBFS; in the recording it was {db(src_rms):.1f} dBFS rms, so a level trim of {src_rms / rms(Lg):.4f} puts it back at the recording\'s level')
    print(f'  the join, as a percentile of the same measure anywhere else in the loop (~50 = like any other place, >{SEAM_GATE} = passed over): step {rep["step"]:.0f} level {rep["level"]:.0f} spectrum {rep["spectrum"]:.0f}'
          f'   after MP3 ({snr:.0f} dB codec signal-to-error): step {repm["step"]:.0f} level {repm["level"]:.0f} spectrum {repm["spectrum"]:.0f}')
    zm, zs, rs, zlo, zhi = zone_report(L, X, sr)
    print(f'  the cross-fade zone ({o["x"]} s) against the rest of the loop, in 100 ms windows: mean {zm:+.2f} dB, spread {zs:.2f} dB (rest {rs:.2f}), lowest window {zlo:+.1f} dB, highest {zhi:+.1f} dB')
    print('  candidates by correlation (loop samples, correlation, worst percentile): ' + ', '.join(f'({p}, {r:.2f}, {w:.0f})' for p, r, w in tried))
    return src_rms / rms(Lg)


def build_hiss(o, srcs, out_dir):
    sr = HISS_SR; src = srcs[o['src']]
    f = f'highpass=f={HISS_HP}:poles=2,highpass=f={HISS_HP}:poles=2'
    x = decode(src, o['t0'], o['t1'], f, sr); n = len(x)
    fi = int(HISS_FADE_IN * sr); x[:fi] *= np.linspace(0, 1, fi) ** 2
    ft = int(o['tail'] * sr); x[n - ft:] *= np.cos(np.linspace(0, np.pi / 2, ft)) ** 2
    w = int(HISS_LOUDEST * sr); loudest = max(rms(x[i:i + w]) for i in range(0, n - w, w // 10))
    gain = 10 ** (HISS_RMS_DB / 20) / loudest; y = x * gain; peak = np.max(np.abs(y))
    if peak > 10 ** (PEAK_DB / 20): y *= 10 ** (PEAK_DB / 20) / peak
    path = os.path.join(out_dir, o['name'] + '.mp3'); lame(y, sr, HISS_KBPS, path); dec = load_mp3(path, sr)
    print(f'{o["name"]}: {o["t0"]}-{o["t1"]} s of the source ({n / sr:.2f} s), high-passed at {HISS_HP} Hz, tail {o["tail"]} s; file {os.path.getsize(path)} bytes, {len(dec) / sr:.3f} s decoded; loudest {HISS_LOUDEST} s rms {db(max(rms(dec[i:i + w]) for i in range(0, len(dec) - w, w // 10))):.1f} dBFS, peak {db(np.max(np.abs(dec))):.1f} dBFS')


def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    src_dir = sys.argv[1]; out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')
    srcs = {k: os.path.join(src_dir, v) for k, v in SRC.items()}
    for k, p in srcs.items():
        if not os.path.isfile(p): sys.exit(f'missing {p} (see the top of this file for where it comes from)')
    os.makedirs(out_dir, exist_ok=True)
    tr_r = build_loop('rumble', RUMBLE, srcs['train'], out_dir)
    tr_m = build_loop('motor', MOTOR, srcs['train'], out_dir)
    for h in HISS: build_hiss(h, srcs, out_dir)
    print(f'\nlevel trims that restore the recording\'s own balance between the two loops: rumble {tr_r:.4f}, motor {tr_m:.4f} (motor / rumble = {tr_m / tr_r:.2f}); the gains in js/sim/audio.js SAMPLES are these, scaled to sit level with the synthesised layers')


if __name__ == '__main__':
    main()
