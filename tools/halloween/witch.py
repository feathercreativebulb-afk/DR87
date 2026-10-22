"""DR87 · the Hollow Ridge witch's voice (Kokoro-82M, offline) + an old-crone treatment.

python3 witch.py audition            -> out/audition/<style>-<line>.mp3 and a combined preview
python3 witch.py lines <style>       -> out/witch/witch-<id>.mp3 + manifest.json

The treatment turns a natural voice into a lively old witch, without the robot finish of the announcers:
  pitch up (thin, high), a nasal resonance around 1.4 kHz, a shaky old-age vibrato and tremolo,
  a little breathy rasp, and an excited pitch swing that rises into the ends of lines.
"""
import json, os, subprocess, sys
import numpy as np
from scipy import signal
import librosa
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
K = Kokoro(os.path.join(HERE, 'kokoro-v1.0.int8.onnx'), os.path.join(HERE, 'voices-v1.0.bin'))
SR = 44100

LINES = {
    'follow':   'Follow me!',
    'follow2':  'Follow me, dearies!',
    'follow3':  'Into my sparkles, quick!',
    'follow4':  'Ride my trail, faster, faster!',
    'welcome':  'Welcome, my little racers, to Hollow Ridge! Three laps, falling pumpkins and spooky ghosts. Stay close to me, and I will give you a boost!',
    'lobby':    'The cauldron is bubbling! A race is starting. Hop in, my dears!',
    'practice': 'This is my practice track, dearie. No tricks, no ghosts. Try every vehicle!',
    'grid':     'Ready your wheels, my dears!',
    'finish':   'What a race! Hee hee hee!',
    'best':     'A new best time! Candy for you, maybe!',
    'cackle':   'Hee hee hee hee!',
    'count3':   'Three!',
    'count2':   'Two!',
    'count1':   'One!',
    'go':       'Fly, my dears! Let the haunting begin!',
    'hazard':   'Pumpkin storm! Watch the glowing rings!',
    'gust':     'Splat! Pumpkin goo! Shake it off!',
    'ghost':    'Oooh, the ghosts are rising!',
    'lap':      'Final lap! Hee hee hee!',
    'bestlap':  'A new best lap! Spooktacular!',
    'win':      'First place! Boo-tiful!',
    'second':   'Second place! Lovely, dearie!',
    'third':    'Third place! Not bad at all!',
    'noprize':  'The night is young. Race again!',
    'spider':   'Mind my spider, dearies!',
    'waiting':  'Waiting for one more racer. My cauldron needs two!',
    'join':     'A place is free! Jump in, quick!',
    'soon':     'The big race opens on the twenty ninth, at six in the evening!',
    'over':     'The candles are out. The race is over!',
}

STYLES = {   # voice, speed, pitch (semitones), nasal dB, vibrato cents, tremolo depth, rasp
    'crone':   ('bf_emma',     1.02, 3.0, 7, 45, .16, .10),   # classic storybook witch, British, high and shaky
    'granny':  ('bf_isabella', .98,  2.0, 5, 32, .12, .07),   # warmer old lady, still excited
    'cackler': ('af_bella',    1.08, 4.0, 9, 55, .2,  .13),   # most cartoony: higher, nastier, faster
}


def speak(text, voice, speed):
    lang = 'en-gb' if voice.startswith('b') else 'en-us'
    a, sr = K.create(text, voice=voice, speed=speed, lang=lang)
    return signal.resample_poly(a, SR, sr).astype(np.float32)


def peaking(x, f0, gain_db, q):
    A = 10**(gain_db/40); w = 2*np.pi*f0/SR; al = np.sin(w)/(2*q)
    b = [1 + al*A, -2*np.cos(w), 1 - al*A]; a = [1 + al/A, -2*np.cos(w), 1 - al/A]
    return signal.lfilter(b, a, x).astype(np.float32)


def vibrato(x, cents, rate=6.2, wobble=.35):
    # a shaky voice: a slow, slightly irregular pitch wobble done as a time-varying delay
    n = np.arange(len(x)); t = n/SR
    rng = np.random.default_rng(7)
    rate_t = rate*(1 + wobble*np.interp(t, np.linspace(0, t[-1] + 1e-3, 12), rng.uniform(-1, 1, 12)))
    ph = 2*np.pi*np.cumsum(rate_t)/SR
    depth = (2**(cents/1200) - 1)/(2*np.pi*rate)               # seconds of delay swing for that pitch swing
    d = (.004 + depth*np.sin(ph))*SR
    return np.interp(n - d, n, x).astype(np.float32), ph


def treat(x, pitch, nasal, cents, trem, rasp):
    x = librosa.effects.pitch_shift(x, sr=SR, n_steps=pitch)
    x = signal.sosfilt(signal.butter(2, 180, 'hp', fs=SR, output='sos'), x)
    x = peaking(x, 1400, nasal, 1.6)                           # nasal
    x = peaking(x, 3200, 3, 1.2)                               # a bit of edge so she cuts through the music
    x, ph = vibrato(x, cents)
    x = x*(1 - trem*(.5 + .5*np.sin(ph + .6)))                 # tremolo, in step with the vibrato
    env = np.abs(signal.hilbert(x)); env = signal.sosfilt(signal.butter(2, 30, 'lp', fs=SR, output='sos'), env)
    noise = np.random.default_rng(3).standard_normal(len(x)).astype(np.float32)
    noise = signal.sosfilt(signal.butter(2, [1800, 7000], 'bp', fs=SR, output='sos'), noise)
    x = x + rasp*noise*env*3                                   # breathy rasp that follows the voice
    x = np.tanh(x*1.6)/np.tanh(1.6)                            # a touch of grit
    # a small spooky room
    ir = np.zeros(int(.35*SR), np.float32)
    for d, g in [(.023, .3), (.041, .22), (.067, .16), (.11, .1), (.17, .06)]: ir[int(d*SR)] = g
    ir *= np.exp(-np.arange(len(ir))/SR/.12); ir[0] = 1
    x = signal.fftconvolve(x, ir)[:len(x) + int(.2*SR)]
    x = x/np.max(np.abs(x))*.89
    pad = np.zeros(int(.03*SR), np.float32)
    return np.concatenate([pad, x.astype(np.float32), pad])


def save(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.f32'
    x.astype(np.float32).tofile(tmp)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', tmp,
                    '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-b:a', '64k', path], check=True)
    os.remove(tmp)


def render(style, text):
    v, sp, p, n, c, t, r = STYLES[style]
    return treat(speak(text, v, sp), p, n, c, t, r)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'audition':
        gap = np.zeros(int(.5*SR), np.float32); allc = []
        for s in STYLES:
            parts = []
            for lid in ('follow', 'follow2', 'welcome', 'cackle'):
                y = render(s, LINES[lid]); parts += [y, gap]
            clip = np.concatenate(parts); save(clip, f'out/audition/witch-{s}.mp3'); allc += [clip, gap, gap]
            print(s, round(len(clip)/SR, 1), 's')
    elif cmd == 'lines':
        s = sys.argv[2]; man = {}
        for lid, text in LINES.items():
            y = render(s, text); save(y, f'out/witch/witch-{lid}.mp3'); man[lid] = {'text': text, 'secs': round(len(y)/SR, 2)}
        json.dump({'style': s, 'voice': STYLES[s][0], 'lines': man}, open('out/witch/manifest.json', 'w'), indent=1)
        print(s, len(man), 'clips')
