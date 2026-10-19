# Recording the calendar's voice

`calendar.html` speaks from recorded clips in `voice/` (MP3 sprites plus `index.json`). Every
phrase comes from `buildCatalog()` in the page, between the `CATALOG-START` and `CATALOG-END`
comments, so the words on screen and the recording always match. After changing a phrase,
re-record:

```sh
cd tools/voice
python3 -m venv venv && ./venv/bin/pip install kokoro-onnx soundfile pyloudnorm faster-whisper
# The voice model (Kokoro-82M, Apache 2.0) and the af_heart voice, about 330 MB, not kept in git
curl -L -o model.onnx https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx
curl -L -o af_heart.bin https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_heart.bin
./venv/bin/python -c "import numpy as np; np.savez('voices.npz', af_heart=np.fromfile('af_heart.bin', dtype=np.float32).reshape(-1, 1, 256))"

node extract.js ../../calendar.html catalog.json
CATALOG=catalog.json ./venv/bin/python gen.py ../../voice
```

`gen.py` only re-records phrases whose wording changed (it keeps a `.txt` next to each clip in
`clips/`), evens out the loudness, and packs the clips into one MP3 per group.

To check the recordings, `CATALOG=catalog.json ./venv/bin/python verify.py` transcribes every
clip with Whisper and lists any that don't match their text. Spelling differences like
"Playdate" or "4th of July" are fine.
