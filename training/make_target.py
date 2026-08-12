"""Generate the butterfly target image for NCA training.

Deterministic, no font/emoji dependencies: the silhouette is the same math as
the page's procedural creature() (src/visuals/gl/shaders.ts, author-directed
butterfly reshape), coloured with the project's spectral ladder. Output:
training/target.png (RGBA, premultiplied like the Distill recipe expects) and
a 40x40 float array embedded in the training script via np.load.
"""
import os

import numpy as np
from PIL import Image

SIZE = int(os.environ.get('NCA_TARGET', 40))

LADDER = [
    (0.302, 0.882, 1.000),
    (0.545, 0.361, 0.965),
    (1.000, 0.239, 0.545),
    (1.000, 0.478, 0.184),
    (0.169, 1.000, 0.690),
    (1.000, 0.886, 0.302),
]

def ladder_color(h):
    h = np.mod(h, 1.0) * 6.0
    i = np.floor(h).astype(int) % 6
    j = (i + 1) % 6
    f = h - np.floor(h)
    a = np.array(LADDER)[i]
    b = np.array(LADDER)[j]
    return a + (b - a) * f[..., None]

def butterfly_rgba(size=SIZE):
    y, x = np.mgrid[0:size, 0:size]

    px = (x + 0.5) / size * 2 - 1
    py = 1 - (y + 0.5) / size * 2
    r = np.hypot(px, py)
    a = np.arctan2(py, px)

    wings = np.abs(np.sin(2.0 * a))
    upper = 0.52 + (1.0 - 0.52) * np.clip((np.sin(a) + 0.25) / 0.80, 0, 1) ** 2 * (
        3 - 2 * np.clip((np.sin(a) + 0.25) / 0.80, 0, 1)
    )
    body = 0.10 * np.abs(np.sin(a)) ** 6
    R = 0.24 + 0.30 * wings**1.35 * upper + body
    R = R / 0.62

    alpha = np.clip((R - r) / 0.10, 0, 1)

    hue = 0.28 + 0.38 * r + 0.06 * np.sin(3 * a)
    rgb = ladder_color(hue)
    rim = np.clip((r - (R - 0.22)) / 0.22, 0, 1)
    rgb = rgb * (0.78 + 0.22 * rim[..., None])

    body_mask = np.exp(-((px / 0.10) ** 2)) * (np.abs(py) < R * 0.9)
    rgb = rgb * (1 - 0.65 * body_mask[..., None])

    out = np.zeros((size, size, 4), dtype=np.float32)
    out[..., :3] = rgb * alpha[..., None]
    out[..., 3] = alpha
    return out

if __name__ == '__main__':
    img = butterfly_rgba()
    np.save('training/target.npy', img)
    Image.fromarray((img * 255).astype(np.uint8), 'RGBA').resize((320, 320), Image.NEAREST).save(
        'training/target_preview.png'
    )
    print('target.npy', img.shape, 'alpha px:', int((img[..., 3] > 0.1).sum()))
