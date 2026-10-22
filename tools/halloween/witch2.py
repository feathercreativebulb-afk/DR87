"""DR87 · Hollow Ridge witch, v2: matched to Bogdan's reference cackle (high, ~600 Hz cackles, wild ~10 st pitch swings, hollow tone).

Kokoro speaks the line; WORLD (pyworld) re-sings it: the pitch goes up and its intonation is exaggerated while the vocal-tract
envelope is kept (only nudged thinner), so she sounds like a shrill old witch, not a sped-up tape. Then a shaky old-age wobble,
a little rasp, and a hollow, slightly nasal tone.

python3 witch2.py audition [style...]   -> out/audition2/witch2-<style>.mp3
python3 witch2.py lines <style>         -> out/witch/witch-<id>.mp3 + manifest.json
"""
import json, os, sys
import numpy as np, pyworld as pw
from scipy import signal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from witch import LINES, speak, peaking, SR
import subprocess

STYLES = {  # voice, speed, target median f0 (Hz), intonation stretch, formant ratio, wobble cents, rasp, cackle f0 (Hz)
    'shriek': ('bf_emma',     1.06, 400, 1.9, 1.12, 70, .07, 640),
    'hag':    ('bf_isabella', 1.0,  340, 1.7, 1.08, 85, .10, 560),
    'toon':   ('af_bella',    1.1,  440, 2.1, 1.15, 60, .05, 700),
}


def save(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ch = 1 if x.ndim == 1 else x.shape[1]; tmp = path + '.f32'; x.astype(np.float32).tofile(tmp)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', tmp,
                    '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-b:a', '96k', path], check=True); os.remove(tmp)


def world_resing(x, f0_target, stretch, fratio, cents, seed=1):
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, SR, f0_floor=70, f0_ceil=700, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, SR); ap = pw.d4c(x, f0, t, SR)
    v = f0 > 0; med = np.median(f0[v]) if v.any() else 200
    st = 12*np.log2(np.where(v, f0, med)/med)
    # exaggerate the melody, and lift the ends of phrases (excited)
    n = len(f0); ramp = np.zeros(n)
    edges = np.flatnonzero(np.diff(v.astype(int)) == -1)
    for e in edges: ramp[max(0, e - 40):e + 1] += np.linspace(0, 3.5, min(41, e + 1))
    st2 = st*stretch + ramp
    # shaky old voice: an irregular ~6 Hz wobble
    rng = np.random.default_rng(seed); tt = np.arange(n)*.005
    rate = 6.0*(1 + .3*np.interp(tt, np.linspace(0, tt[-1] + 1e-3, 10), rng.uniform(-1, 1, 10)))
    st2 += (cents/100)*np.sin(2*np.pi*np.cumsum(rate)*.005)
    f0n = np.where(v, f0_target*2**(st2/12), 0)
    # thinner throat: compress the envelope's frequency axis
    if fratio != 1:
        nb = sp.shape[1]; src = np.clip(np.arange(nb)/fratio, 0, nb - 1)
        sp = np.stack([np.interp(src, np.arange(nb), row) for row in sp])
    ap = np.clip(ap*1.15, 0, 1)                                   # a touch breathier
    y = pw.synthesize(f0n, sp, ap, SR, frame_period=5)
    return y.astype(np.float32)


def tone(y, rasp):
    y = signal.sosfilt(signal.butter(2, 220, 'hp', fs=SR, output='sos'), y)
    y = peaking(y, 1100, 6, 1.4)                                   # hollow, nasal
    y = peaking(y, 4200, -5, .9)                                   # less fizz (the reference is darker)
    y = signal.sosfilt(signal.butter(2, 7500, 'lp', fs=SR, output='sos'), y)
    env = np.abs(signal.hilbert(y)); env = signal.sosfilt(signal.butter(2, 30, 'lp', fs=SR, output='sos'), env)
    nz = np.random.default_rng(3).standard_normal(len(y)).astype(np.float32)
    nz = signal.sosfilt(signal.butter(2, [1500, 5500], 'bp', fs=SR, output='sos'), nz)
    y = y + rasp*nz*env*3
    y = np.tanh(y*1.3)/np.tanh(1.3)
    y = y/np.max(np.abs(y))
    return wet_room(y, WET)


WET = {'mix': .3, 'decay': 1.0, 'pre': .015, 'tone': 4500}   # 'room' (the 'crypt' variant: mix .4, decay 1.7)


def wet_room(y, w):
    """A natural room around her: early reflections plus a dense, darkening tail, decorrelated left and right (stereo)."""
    n = int((w['decay']*1.4 + .1)*SR); t = np.arange(n)/SR; out = []
    for ch in (0, 1):
        rng = np.random.default_rng(11 + ch)
        tail = rng.standard_normal(n).astype(np.float32)*np.exp(-6.9*t/w['decay'])
        tail = signal.sosfilt(signal.butter(1, w['tone'], 'lp', fs=SR, output='sos'), tail)
        tail = signal.sosfilt(signal.butter(1, 180, 'hp', fs=SR, output='sos'), tail)
        tail[:int(w['pre']*SR)] = 0
        for d, g in [(.011, .5), (.017, .38), (.023 + .004*ch, .34), (.031, .26), (.043 - .003*ch, .2), (.059, .14)]: tail[int(d*SR)] += g
        tail /= np.sqrt(np.sum(tail**2))
        r = signal.fftconvolve(y, tail)[:len(y) + int(w['decay']*.9*SR)]
        d = np.concatenate([y, np.zeros(len(r) - len(y), np.float32)])
        out.append((1 - w['mix'])*d + w['mix']*r*1.0)
    st = np.stack(out, 1); st = st/np.max(np.abs(st))*.89
    pad = np.zeros((int(.03*SR), 2), np.float32)
    return np.concatenate([pad, st.astype(np.float32), pad])


def cackle(f0hi, n=7, seed=4):
    """A cackle sung on WORLD: Kokoro's 'ha' syllables re-pitched into a falling, bouncing run, like the reference."""
    v, sp_ = 'bf_emma', 1.25
    x = speak('Heh! ' + ' '.join(['ha'] * n) + '!', v, sp_)
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, SR, f0_floor=70, f0_ceil=700, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, SR); ap = pw.d4c(x, f0, t, SR)
    m = len(f0); u = np.linspace(0, 1, m)
    rng = np.random.default_rng(seed)
    bounce = 1 + .22*np.abs(np.sin(u*np.pi*n*1.05))                # each 'ha' jumps up and falls back
    fall = f0hi*(1.25 - .55*u)                                      # the whole run falls (the classic witch cackle)
    f0n = np.where(f0 > 0, fall*bounce*(1 + .03*rng.standard_normal(m)), 0)
    nb = sp.shape[1]; src = np.clip(np.arange(nb)/1.15, 0, nb - 1)
    sp = np.stack([np.interp(src, np.arange(nb), row) for row in sp])
    y = pw.synthesize(f0n, sp, np.clip(ap*1.3, 0, 1), SR, frame_period=5).astype(np.float32)
    return y


def render(style, lid):
    v, sp, f0t, st, fr, c, r, ck = STYLES[style]
    if lid == 'cackle':
        return tone(cackle(ck), r*.6)
    return tone(world_resing(speak(LINES[lid], v, sp), f0t, st, fr, c), r)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'audition':
        gap = np.zeros((int(.3*SR), 2), np.float32)
        rooms = {'room': {'mix': .3, 'decay': 1.0, 'pre': .015, 'tone': 4500}, 'crypt': {'mix': .4, 'decay': 1.7, 'pre': .025, 'tone': 3600}}
        for name, w in rooms.items():
            WET.update(w)
            clip = np.concatenate(sum([[render('toon', lid), gap] for lid in ('follow', 'follow2', 'welcome', 'cackle')], []))
            save(clip, f'out/audition2/witch2-toon-{name}.mp3'); print(name, round(len(clip)/SR, 1), 's')
    elif cmd == 'lines':
        s = sys.argv[2]; man = {}
        for lid, text in LINES.items():
            y = render(s, lid); save(y, f'out/witch/witch-{lid}.mp3'); man[lid] = {'text': text, 'secs': round(len(y)/SR, 2)}
        json.dump({'style': 'v2-' + s, 'voice': STYLES[s][0], 'lines': man}, open('out/witch/manifest.json', 'w'), indent=1)
        print(s, len(man), 'clips')
