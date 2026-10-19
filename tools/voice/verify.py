"""Transcribe every recorded clip and compare it with the phrase it should say."""
import json, re, difflib
import numpy as np, soundfile as sf
from faster_whisper import WhisperModel

import os
cat = json.load(open(os.environ.get('CATALOG', 'catalog.json')))
only = os.environ.get('ONLY')
if only: cat = {k: v for k, v in cat.items() if any(k.startswith(p) for p in only.split(','))}
m = WhisperModel('small.en', device='cpu', compute_type='int8')
norm = lambda s: re.sub(r'[^a-z0-9 ]', '', s.lower().replace('’', "'").replace("'", '').replace('-', ' ')).split()
rows = []
for cid, c in cat.items():
    a, sr = sf.read(f'clips/{cid}.wav', dtype='float32')
    a16 = np.interp(np.arange(0, len(a) * 16000 / sr) * sr / 16000, np.arange(len(a)), a).astype(np.float32)
    segs, _ = m.transcribe(a16, beam_size=5, language='en')
    heard = ' '.join(s.text.strip() for s in segs)
    h = norm(heard)
    score = max(difflib.SequenceMatcher(None, h, norm(t)).ratio() for t in [c['text'], c.get('tts', c['text'])])
    rows.append((score, cid, c['text'], heard))
rows.sort()
json.dump(rows, open(os.environ.get('OUT', 'verify.json'), 'w'), indent=1)
bad = [r for r in rows if r[0] < 0.9]
print(f'{len(rows)} clips checked, {len(bad)} below 0.9')
for r in bad: print(f'{r[0]:.2f} {r[1]:22} want: {r[2]!r:60} heard: {r[3]!r}')
