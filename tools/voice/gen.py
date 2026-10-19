"""Record every catalog phrase with Kokoro (af_heart), trim, and pack into per-category MP3 sprites."""
import json, os, subprocess, sys
import numpy as np, soundfile as sf, pyloudnorm as pyln
from kokoro_onnx import Kokoro

SR = 24000
VOICE, SPEED = 'af_heart', 0.95
LEAD, GAP = 0.5, 0.4          # silence at sprite start and between clips (s)
PRE, POST = 0.03, 0.09        # margin baked into each clip's play window (s)
TARGET_LUFS, PEAK = -18.0, 0.89  # every clip equally loud, no clipping
SPRITE_OF = {'plan': 'me', 'tplan': 'ahead', 'tmr': 'ahead', 'fc': 'outside', 'ask': 'core', 'gen': 'core', 'next': 'core', 'month': 'month', 'date': 'date', 'year': 'year',
             'day': 'days', 'season': 'outside', 'temp': 'outside', 'weather': 'outside', 'act': 'me', 'feel': 'me',
             'hol': 'holiday', 'sleeps': 'sleeps'}

cat = json.load(open(os.environ.get('CATALOG', 'catalog.json')))
out = sys.argv[1]
os.makedirs(out, exist_ok=True); os.makedirs('clips', exist_ok=True)
k = Kokoro('model.onnx', 'voices.npz')

def trim(a, thr=0.012, pad=0.04):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    s = max(0, idx[0] - int(pad * SR)); e = min(len(a), idx[-1] + int(pad * SR))
    return a[s:e]

clips = {}
for n, (cid, c) in enumerate(cat.items()):
    path = f'clips/{cid}.wav'
    say = (c.get('tts') or c['text']).replace('’', "'")
    say = say[0].upper() + say[1:]
    said = f'clips/{cid}.txt'
    # re-record when the wording changed, not only when the file is missing
    if not os.path.exists(path) or not os.path.exists(said) or open(said).read() != say:
        a, sr = k.create(say, voice=VOICE, speed=SPEED, lang='en-us')
        assert sr == SR
        a = trim(np.asarray(a, dtype=np.float32))
        peak = float(np.max(np.abs(a))) or 1.0
        a = a * (0.89 / peak)
        sf.write(path, a, SR)
        open(said, 'w').write(say)
    clips[cid] = sf.read(path, dtype='float32')[0]

meter = pyln.Meter(SR, block_size=0.2)
for cid, a in clips.items():
    pad = np.concatenate([a, np.zeros(int(0.25 * SR), np.float32)]) if len(a) < 0.45 * SR else a
    gain = 10 ** ((TARGET_LUFS - meter.integrated_loudness(pad)) / 20)
    gain = min(gain, PEAK / (float(np.max(np.abs(a))) or 1.0))
    clips[cid] = (a * gain).astype(np.float32)
    if n % 25 == 0: print(n, cid, flush=True)

groups = {}
for cid in cat:
    groups.setdefault(SPRITE_OF[cid.split('.')[0]], []).append(cid)

index = {'voice': f'Kokoro-82M {VOICE}', 'sprites': {}, 'clips': {}}
for g, ids in groups.items():
    parts, t = [np.zeros(int(LEAD * SR), np.float32)], LEAD
    for cid in ids:
        a = clips[cid]
        index['clips'][cid] = [g, round(t - PRE, 3), round(len(a) / SR + PRE + POST, 3)]
        parts += [a, np.zeros(int(GAP * SR), np.float32)]
        t += len(a) / SR + GAP
    wav = f'sprite-{g}.wav'
    sf.write(wav, np.concatenate(parts), SR)
    mp3 = f'{g}.mp3'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '48k', os.path.join(out, mp3)], check=True)
    index['sprites'][g] = mp3
    print(g, len(ids), 'clips', round(t, 1), 's', os.path.getsize(os.path.join(out, mp3)) // 1024, 'KB')
json.dump(index, open(os.path.join(out, 'index.json'), 'w'), separators=(',', ':'))
print('done', len(index['clips']))
