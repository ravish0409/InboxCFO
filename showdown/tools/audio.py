"""Synthesise an episode's soundtrack from its cue sheet. No samples, no licences: every sound is made here.

    node tools/render.js cues        # writes out/tmp/cues.json from the episode
    python3 tools/audio.py           # writes out/tmp/audio.wav (48 kHz stereo)

Cues are [frame at 12 fps, sound, loudness, pan, (length s)]. The score follows the episode's `score` sections.
"""
import json, os, wave
import numpy as np
from scipy import signal

SR = 48000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
rng = np.random.default_rng(7)


def env(n, a=0.005, d=0.3, curve=3.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / max(d, 1e-3))


def noise(n): return rng.standard_normal(n)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR / 2 - 100)], 'bandpass', fs=SR, output='sos'); return signal.sosfilt(sos, x)


def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)


def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)


def sweep(n, f0, f1, k=4.0):
    t = np.arange(n) / SR; f = f1 + (f0 - f1) * np.exp(-k * t / (n / SR)); return np.sin(2 * np.pi * np.cumsum(f) / SR)


def saw(f, n, detune=(0,)):
    t = np.arange(n) / SR; out = np.zeros(n)
    for d in detune: out += signal.sawtooth(2 * np.pi * f * (1 + d) * t + rng.uniform(0, 6.28))
    return out / len(detune)


# ---------- sound effects ----------
def thump(dur=0.5, f0=150, f1=42, drive=2.5):
    n = int(dur * SR); return np.tanh(sweep(n, f0, f1, 9) * env(n, 0.002, dur * 0.45) * drive)


def s_hit(v):
    n = int(0.75 * SR); x = np.zeros(n)
    x += thump(0.75, 190, 36, 3.5)
    c = bp(noise(n), 700, 5200) * env(n, 0.001, 0.06, 4); x += c * 1.4
    x += bp(noise(n), 60, 260) * env(n, 0.01, 0.4) * 0.9
    return np.tanh(x * 1.3)


def s_smack(v): n = int(0.3 * SR); return np.tanh(thump(0.3, 240, 70, 2) * 0.8 + bp(noise(n), 900, 4200) * env(n, 0.001, 0.045, 4) * 1.3)


def s_thud(v): n = int(0.45 * SR); return thump(0.45, 110, 40, 2) + bp(noise(n), 200, 1400) * env(n, 0.002, 0.08) * 0.5


def s_slam(v): n = int(0.9 * SR); return np.tanh(thump(0.9, 95, 30, 3) * 1.2 + bp(noise(n), 2000, 9000) * env(n, 0.001, 0.25) * 0.35 + lp(noise(n), 180) * env(n, 0.01, 0.6) * 1.5)


def whoosh(dur, lo=300, hi=3200, up=True, body=1.0):
    n = int(dur * SR); t = np.linspace(0, 1, n); x = noise(n)
    a = bp(x, lo, lo * 3) ; b = bp(x, hi / 3, hi)
    m = t if up else 1 - t
    shape = np.sin(np.pi * np.clip(t, 0, 1)) ** 1.6
    return (a * (1 - m) + b * m * 1.2) * shape * body


def s_whoosh(v, dur=0.45): return whoosh(dur or 0.45, 250, 2600)


def s_swish(v): return whoosh(0.16, 900, 7000, True, 1.5)


def s_dash(v): return whoosh(0.34, 180, 5200, True, 1.6) + np.pad(thump(0.2, 80, 45, 1.5), (0, int(0.34 * SR) - int(0.2 * SR))) * 0.6


def s_cloth(v): n = int(0.5 * SR); return bp(noise(n), 300, 2400) * (np.sin(np.pi * np.linspace(0, 1, n)) ** 2) * (1 + 0.6 * np.sin(2 * np.pi * 17 * np.arange(n) / SR)) * 0.9


def s_clack(v):
    n = int(0.3 * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in [(820, 38), (1370, 46), (2210, 60), (3350, 80)])
    return x * 0.5 + bp(noise(n), 1500, 7000) * env(n, 0.0005, 0.02, 5) * 1.6 + thump(0.3, 160, 60, 1.5) * 0.5


def s_crack(v):
    n = int(0.35 * SR); x = hp(noise(n), 1800) * env(n, 0.0005, 0.035, 5) * 2.2
    for off in (0.02, 0.05): k = int(off * SR); x[k:] += (bp(noise(n - k), 900, 5000) * env(n - k, 0.0005, 0.03, 5)) * 1.3
    return x + thump(0.35, 300, 90, 1.5) * 0.5


def s_crash(v):
    n = int(2.0 * SR); x = lp(noise(n), 320) * env(n, 0.005, 1.1) * 3.0 + bp(noise(n), 500, 4500) * env(n, 0.002, 0.5) * 1.1
    x[: int(0.9 * SR)] += thump(0.9, 130, 28, 4) * 1.4
    for _ in range(26):
        k = int(rng.uniform(0.03, 1.4) * SR); m = int(0.09 * SR); f = rng.uniform(500, 2400)
        x[k:k + m] += bp(noise(m), f, f * 2.2) * env(m, 0.0005, 0.03, 5) * rng.uniform(0.4, 1.1) * (1 - k / n)
    return np.tanh(x)


def s_rubble(v):
    n = int(1.4 * SR); x = np.zeros(n)
    for _ in range(12):
        k = int(rng.uniform(0, 1.2) * SR); m = int(0.07 * SR); f = rng.uniform(600, 2600)
        x[k:k + m] += bp(noise(m), f, f * 2) * env(m, 0.0005, 0.025, 5) * rng.uniform(0.3, 0.8)
    return x


def s_slide(v): n = int(0.55 * SR); return bp(noise(n), 500, 3800) * (1 - np.linspace(0, 1, n)) ** 1.5 * 1.1


def s_tick(v):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) + np.sin(2 * np.pi * 3600 * t) * np.exp(-t * 130) * 0.6 + hp(noise(n), 4000) * env(n, 0.0003, 0.006, 5)) * 0.9


def s_steps(v, dur=3.0):
    n = int(dur * SR); x = np.zeros(n + SR)
    for i, t0 in enumerate(np.arange(0.05, dur, 0.196)):
        k = int(t0 * SR); s = s_thud(1) * 0.55; m = int(0.05 * SR); s[:m] += bp(noise(m), 1200, 5000) * env(m, 0.0005, 0.012, 5) * 0.8
        x[k:k + len(s)] += s * (0.85 + 0.15 * (i % 2))
    return x[:n]


def s_bats(v, dur=2.0):
    n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for _ in range(7):
        r = rng.uniform(15, 27); x += bp(noise(n), rng.uniform(1500, 2800), rng.uniform(5000, 8000)) * (0.5 + 0.5 * np.sin(2 * np.pi * r * t + rng.uniform(0, 6))) ** 3
    for _ in range(int(dur * 16)):
        k = int(rng.uniform(0, dur - 0.06) * SR); m = int(rng.uniform(0.025, 0.06) * SR); f = rng.uniform(5200, 9000)
        x[k:k + m] += np.sin(2 * np.pi * np.cumsum(np.linspace(f, f * rng.uniform(0.7, 1.2), m)) / SR) * np.hanning(m) * rng.uniform(0.5, 1.4)
    shape = np.minimum(1, np.minimum(t / 0.25, (dur - t) / 0.4))
    return x * shape * 0.32


def s_screech(v):
    n = int(1.1 * SR); t = np.arange(n) / SR; f = 1100 + 900 * np.sin(np.pi * t / 1.1) ** 0.6 + 60 * np.sin(2 * np.pi * 31 * t)
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) + 0.6 * signal.sawtooth(2 * np.pi * np.cumsum(f * 1.503) / SR)
    return bp(x + noise(n) * 0.5, 900, 6500) * np.sin(np.pi * t / 1.1) ** 0.8 * 0.8


def s_growl(v):
    n = int(0.9 * SR); t = np.arange(n) / SR; f = 62 + 14 * np.sin(2 * np.pi * 3 * t)
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
    return lp(np.tanh(x * 2), 900) * np.sin(np.pi * t / 0.9) ** 0.7 * 1.2


def s_sting(v): n = int(1.2 * SR); return lp(saw(55, n, (0, 0.007, -0.006)), 500) * env(n, 0.004, 0.7) * 1.4 + thump(1.2, 70, 30, 2) * 0.9 + bp(noise(n), 3000, 9000) * env(n, 0.3, 0.5) * 0.08


def s_riser(v, dur=2.4):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    x = np.sin(2 * np.pi * np.cumsum(80 + 500 * t ** 2.2) / SR) * 0.5 + bp(noise(n), 400, 6000) * t ** 2 * 0.8 + saw(58, n, (0, 0.01, -0.012, 0.5)) * 0.5 * t
    return x * t ** 1.3


def s_bong(v):
    n = int(5.0 * SR); t = np.arange(n) / SR; f0 = 164.8  # an E, like the real one
    parts = [(0.5, 1.0, 0.35), (1, 1.0, 0.55), (1.19, 0.75, 0.8), (1.5, 0.5, 0.9), (2, 0.6, 1.1), (2.51, 0.35, 1.6), (3.01, 0.25, 2.1), (4.1, 0.15, 3.0)]
    x = sum(a * np.sin(2 * np.pi * f0 * r * t + rng.uniform(0, 6)) * np.exp(-t * d) for r, a, d in parts)
    return x * 0.5 + np.pad(s_clack(1) * 0.5, (0, n - int(0.3 * SR))) + np.pad(thump(0.8, 90, 40, 2), (0, n - int(0.8 * SR))) * 0.7


def s_sizzle(v, dur=1.7):
    n = int(dur * SR); t = np.linspace(0, 1, n); x = hp(noise(n), 3500) * (0.4 + 0.6 * rng.random(n) ** 6 * 3) * 0.35
    return x * np.minimum(1, t / 0.1) * (0.6 + 0.4 * t)


def s_burst(v): n = int(1.6 * SR); return whoosh(1.6, 200, 6000, False, 1.4) * env(n, 0.01, 0.9) * 2 + lp(noise(n), 200) * env(n, 0.005, 0.8) * 2.5


SFX = {k[2:]: f for k, f in list(globals().items()) if k.startswith('s_')}


# ---------- the score ----------
BPM = 150; BEAT = 60 / BPM
NOTE = {'D': 73.42, 'E': 82.41, 'F': 87.31, 'G': 98.0, 'A': 110.0, 'Bb': 116.54, 'C': 130.81, 'F#': 92.5, 'B': 123.47, 'C#': 138.59}


def place(buf, x, t, gain=1.0, pan=0.0):
    k = int(t * SR)
    if k >= len(buf) or k < 0: return
    x = x[: len(buf) - k]; l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    buf[k:k + len(x), 0] += x * gain * l * 1.414; buf[k:k + len(x), 1] += x * gain * r * 1.414


def taiko(g=1.0): return thump(0.5, 120, 48, 3) * g + bp(noise(int(0.5 * SR)), 1500, 5000) * env(int(0.5 * SR), 0.0005, 0.02, 5) * 0.4 * g


def rim(): n = int(0.1 * SR); return bp(noise(n), 1800, 6000) * env(n, 0.0005, 0.02, 5) + np.sin(2 * np.pi * 1700 * np.arange(n) / SR) * env(n, 0.0005, 0.015, 5) * 0.5


def hat(): n = int(0.05 * SR); return hp(noise(n), 7000) * env(n, 0.0005, 0.012, 5) * 0.5


def bass(f, dur): n = int(dur * SR); return lp(saw(f, n, (0, 0.004)) + 0.6 * np.sign(np.sin(2 * np.pi * f / 2 * np.arange(n) / SR)), 420 + f * 2) * env(n, 0.004, dur * 0.7, 2.5)


def stab(fs, dur=0.22): n = int(dur * SR); return lp(sum(saw(f, n, (0, 0.006, -0.007)) for f in fs) / len(fs), 2600) * env(n, 0.004, dur * 0.5, 3)


def pad(fs, dur, bright=1400, attack=0.6):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(saw(f, n, (0, 0.004, -0.005, 0.009)) for f in fs) / len(fs)
    return lp(x, bright) * np.minimum(1, t / attack) * np.minimum(1, (dur - t) / min(1.2, dur * 0.4))


def score(buf, sections, D):
    for i, (f, kind) in enumerate(sections[:-1]):
        t0, t1 = f / 12, sections[i + 1][0] / 12; dur = t1 - t0; nb = int(dur / BEAT)
        if kind == 'tense':
            place(buf, pad([NOTE['D'] / 2, NOTE['D'], NOTE['A']], dur + 0.5, 500, 1.5), t0, 0.5)
            for b in range(0, nb, 2): place(buf, s_tick(1), t0 + b * BEAT, 0.25, 0.5 if b % 4 else -0.5)
            for b in (8, 12, 14, 15): place(buf, taiko(0.6 + 0.1 * (b - 8) / 7), t0 + b * BEAT, 0.5)
        elif kind in ('fight', 'chase'):
            fast = kind == 'chase'; riff = ['D', 'D', 'F', 'D', 'A', 'D', 'G', 'F'] if not fast else ['D', 'A', 'D', 'C', 'D', 'A', 'Bb', 'A']
            for s in range(int(dur / (BEAT / 2))):
                t = t0 + s * BEAT / 2; bar = s // 8
                root = [1, 1, 0.891, 1, 1, 1.189, 1.122, 0.891][bar % 8] if not fast else [1, 1, 1.189, 1.335][bar % 4]
                place(buf, bass(NOTE[riff[s % 8]] * root * (2 if fast and s % 2 else 1), BEAT / 2 * 0.95), t, 0.5, -0.1)
                if s % 8 in (0, 3, 6): place(buf, taiko(1.0), t, 0.62, 0)
                if s % 8 in (4,): place(buf, rim(), t, 0.5, 0.2)
                if s % 2 == 1 or fast: place(buf, hat(), t, 0.3 if s % 2 else 0.2, 0.4)
                if fast and s % 8 in (2, 5, 7): place(buf, taiko(0.6), t, 0.4, -0.3)
                if s % 16 in (0, 6, 12): place(buf, stab([NOTE['D'] * 2 * root, NOTE['F'] * 2 * root, NOTE['A'] * 2 * root]), t, 0.3, 0.3)
            if fast: place(buf, pad([NOTE['D'] * 2, NOTE['A'] * 2, NOTE['F'] * 4], dur, 2200, dur * 0.8), t0, 0.22)
        elif kind == 'still':
            place(buf, pad([NOTE['D'] / 2, NOTE['A'] / 2, NOTE['F']], dur + 0.4, 420, 0.8), t0, 0.5)
        elif kind == 'dread':
            for j, semi in enumerate([0, 1, 3, 4, 6, 7]):
                tt = t0 + j * dur / 6; k = 2 ** (semi / 12)
                place(buf, pad([NOTE['D'] / 2 * k, NOTE['D'] * k, NOTE['Bb'] * k], dur / 6 + 0.5, 600 + j * 260, 0.25), tt, 0.45 + j * 0.05)
                place(buf, taiko(0.8), tt, 0.5); place(buf, taiko(0.6), tt + dur / 12, 0.35)
        elif kind == 'hush':
            place(buf, pad([NOTE['D'] / 2, NOTE['D']], dur + 0.3, 260, 0.5), t0, 0.45)
            for b in np.arange(0, dur - 0.2, 0.86): place(buf, thump(0.25, 70, 45, 1.5), t0 + b, 0.5); place(buf, thump(0.22, 64, 42, 1.5), t0 + b + 0.24, 0.35)
        elif kind == 'sunrise':
            for j, ch in enumerate([['D', 'A', 'F#'], ['G', 'D', 'B'], ['A', 'E', 'C#'], ['D', 'A', 'F#']]):
                fs = [NOTE.get(n, 138.59) * (1 if k == 0 else 2) for k, n in enumerate(ch)] + [NOTE.get(ch[0], 73.4) * 4]
                place(buf, pad(fs, dur / 4 + 0.8, 900 + j * 700, 0.5), t0 + j * dur / 4, 0.42 + j * 0.06)
            place(buf, bp(noise(int(dur * SR)), 5000, 12000) * np.linspace(0, 1, int(dur * SR)) ** 2 * 0.12, t0, 1)
        elif kind == 'theme':
            for j, (ch, b) in enumerate([(['D', 'F#', 'A'], 0), (['G', 'B', 'D'], 2), (['A', 'C#', 'E'], 4), (['D', 'F#', 'A'], 6)]):
                fs = [NOTE.get(n, 138.59) * 2 for n in ch]
                place(buf, pad(fs + [fs[0] / 4], BEAT * 2.4 if j < 3 else 3.2, 2400, 0.03), t0 + b * BEAT, 0.5); place(buf, taiko(1), t0 + b * BEAT, 0.6)
                place(buf, stab([f * 2 for f in fs], 0.5), t0 + b * BEAT, 0.3, 0.2)


def main():
    cue = json.load(open(os.path.join(ROOT, 'out', 'tmp', 'cues.json')))
    D = cue['D']; n = int((D + 0.5) * SR)
    music = np.zeros((n, 2)); fx = np.zeros((n, 2))
    score(music, cue['score'], D)
    for c in cue['cues']:
        f, name, vol, pan = c[:4]; x = SFX[name](vol, c[4]) if len(c) > 4 else SFX[name](vol)
        place(fx, x, f / 12, vol * 0.9, pan)
    # wind over the rooftops, all the way through
    w = bp(noise(n), 180, 900) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * np.arange(n) / SR)) * 0.035
    fx[:, 0] += w; fx[:, 1] += np.roll(w, 2400)
    # one room for everything: a short dark tail
    ir = noise(int(1.1 * SR)) * np.exp(-np.arange(int(1.1 * SR)) / SR * 5.5); ir = lp(ir, 3800)
    dry = fx * 1.0 + music * 0.62
    wet = np.stack([signal.fftconvolve(dry[:, ch], np.roll(ir, ch * 331), mode='full')[:n] for ch in (0, 1)], axis=1)
    mix = dry + wet * 0.012
    mix = np.tanh(mix / np.percentile(np.abs(mix), 99.9) * 1.1) * 0.89
    mix[-int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))[:, None]
    out = os.path.join(ROOT, 'out', 'tmp', 'audio.wav')
    with wave.open(out, 'wb') as wv:
        wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes((mix[: int(D * SR)] * 32767).astype('<i2').tobytes())
    print('audio ->', out, f'{D:.2f} s')


if __name__ == '__main__':
    main()
