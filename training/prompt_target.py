"""Prompt → NCA training target (P1 of the prompt-to-creature pipeline).

The insight: Distill's canonical NCA targets WERE emoji. Twemoji gives us
thousands of iconic, open-licensed shapes; a prompt matcher over them turns
"un corazón" into a 48×48 premultiplied RGBA target in ~1 second, no image
model needed. This v1 uses a curated ES/EN dictionary; the production matcher
(embeddings or an LLM picking a codepoint) slots in behind the same function.

  .venv/bin/python training/prompt_target.py "corazón"
  → training/targets/<slug>.npy (+ preview PNG), prints the slug

Twemoji assets are fetched once and cached in training/twemoji-cache/.
"""
import sys
import unicodedata
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SIZE = 48

LEXICON: dict[str, tuple[str, str]] = {
    'corazon': ('heart', '2764'),
    'heart': ('heart', '2764'),
    'estrella': ('star', '2b50'),
    'star': ('star', '2b50'),
    'cohete': ('rocket', '1f680'),
    'rocket': ('rocket', '1f680'),
    'mariposa': ('butterfly', '1f98b'),
    'butterfly': ('butterfly', '1f98b'),
    'lagarto': ('lizard', '1f98e'),
    'lizard': ('lizard', '1f98e'),
    'pez': ('fish', '1f41f'),
    'fish': ('fish', '1f41f'),
    'hongo': ('mushroom', '1f344'),
    'mushroom': ('mushroom', '1f344'),
    'arbol': ('tree', '1f333'),
    'tree': ('tree', '1f333'),
    'flor': ('flower', '1f33c'),
    'flower': ('flower', '1f33c'),
    'rayo': ('lightning', '26a1'),
    'lightning': ('lightning', '26a1'),
    'luna': ('moon', '1f319'),
    'moon': ('moon', '1f319'),
    'calavera': ('skull', '1f480'),
    'skull': ('skull', '1f480'),
    'gato': ('cat', '1f431'),
    'cat': ('cat', '1f431'),
    'alien': ('alien', '1f47d'),
    'fantasma': ('ghost', '1f47b'),
    'ghost': ('ghost', '1f47b'),
    'cerebro': ('brain', '1f9e0'),
    'brain': ('brain', '1f9e0'),
    'ojo': ('eye', '1f441'),
    'eye': ('eye', '1f441'),
}

def normalise(word: str) -> str:
    w = unicodedata.normalize('NFD', word.lower().strip())
    return ''.join(c for c in w if unicodedata.category(c) != 'Mn')

def match(prompt: str) -> tuple[str, str]:
    for token in normalise(prompt).replace(',', ' ').split():
        if token in LEXICON:
            return LEXICON[token]
    raise SystemExit(f'no match for {prompt!r} — extend LEXICON (or wire the LLM matcher)')

def fetch_twemoji(code: str) -> Image.Image:
    cache = ROOT / 'twemoji-cache'
    cache.mkdir(exist_ok=True)
    f = cache / f'{code}.png'
    if not f.exists():
        url = f'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/{code}.png'
        urllib.request.urlretrieve(url, f)
    return Image.open(f).convert('RGBA')

def to_target(img: Image.Image) -> np.ndarray:
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr[..., :3] *= arr[..., 3:4]
    return arr

if __name__ == '__main__':
    prompt = ' '.join(sys.argv[1:]) or 'corazón'
    slug, code = match(prompt)
    target = to_target(fetch_twemoji(code))
    out = ROOT / 'targets'
    out.mkdir(exist_ok=True)
    np.save(out / f'{slug}.npy', target)
    Image.fromarray((target * 255).astype(np.uint8), 'RGBA').resize((320, 320), Image.NEAREST).save(
        out / f'{slug}_preview.png'
    )
    alive = int((target[..., 3] > 0.1).sum())
    print(f'{slug}\t{code}\talive_px={alive}')
