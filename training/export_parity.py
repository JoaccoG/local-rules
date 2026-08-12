"""Parity reference for the WGSL NCA (docs/nca.md §Parity testing).

Runs 20 steps from the seed with the EXPORTED weights file (testing the blob
round-trip too), using:
  - float32 arithmetic with the SAME accumulation order as the WGSL loops
    (explicit loops over the 48 and 128 inputs, vectorised over cells), and
  - the SAME pcg stochastic mask: h = pcg(pcg(pcg(seed)^cell)^step),
    fire = h/2^32 < fire_rate.

Writes public/weights/parity.bin (20 concatenated H*W*16 f32 states, one per
step) + parity.json. The browser harness (lab-nca.html?parity=1) asserts the
WGSL states agree within 1e-5.
"""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'weights'
STEPS = 20
SEED = 1

meta = json.loads((OUT / 'butterfly.json').read_text())
CH, HID, GRID = meta['channels'], meta['hidden'], meta['grid']
FIRE, THR = meta['fire_rate'], meta['alpha_threshold']

blob = np.fromfile(OUT / 'butterfly.bin', dtype='<f4')
w1 = blob[: 48 * HID].reshape(48, HID)
b1 = blob[48 * HID : 48 * HID + HID]
w2 = blob[48 * HID + HID : 48 * HID + HID + HID * CH].reshape(HID, CH)
b2 = blob[48 * HID + HID + HID * CH :]
assert b2.shape == (CH,)

M32 = np.uint64(0xFFFFFFFF)

def pcg(v: np.ndarray) -> np.ndarray:

    v = np.asarray(v, dtype=np.uint64) & M32
    state = (v * np.uint64(747796405) + np.uint64(2891336453)) & M32
    shift = ((state >> np.uint64(28)) + np.uint64(4)) & M32
    word = (((state >> shift) ^ state) * np.uint64(277803737)) & M32
    return (((word >> np.uint64(22)) ^ word) & M32).astype(np.uint64)

CELLS = np.arange(GRID * GRID, dtype=np.uint64)

def fire_mask(step: int) -> np.ndarray:
    h = pcg(pcg(pcg(np.uint64(SEED)) ^ CELLS) ^ np.uint64(step))

    hf = h.astype(np.float32)
    return (hf / np.float32(4294967296.0) < np.float32(FIRE)).astype(np.float32).reshape(GRID, GRID)

def alive(x: np.ndarray) -> np.ndarray:
    a = np.pad(x[..., 3], 1)
    m = np.zeros((GRID, GRID), np.float32)
    for dy in range(3):
        for dx in range(3):
            m = np.maximum(m, a[dy : dy + GRID, dx : dx + GRID])
    return (m > THR).astype(np.float32)

def perceive(x: np.ndarray) -> np.ndarray:
    p = np.zeros((GRID, GRID, 48), np.float32)
    xp = np.pad(x, ((1, 1), (1, 1), (0, 0)))
    tl = xp[0:-2, 0:-2]; tc = xp[0:-2, 1:-1]; tr = xp[0:-2, 2:]
    ml = xp[1:-1, 0:-2]; mc = xp[1:-1, 1:-1]; mr = xp[1:-1, 2:]
    bl = xp[2:, 0:-2];   bc = xp[2:, 1:-1];   br = xp[2:, 2:]
    sx = ((tr + 2 * mr + br - tl - 2 * ml - bl) / np.float32(8)).astype(np.float32)
    sy = ((bl + 2 * bc + br - tl - 2 * tc - tr) / np.float32(8)).astype(np.float32)
    p[..., 0::3] = mc
    p[..., 1::3] = sx
    p[..., 2::3] = sy
    return p

def step_fn(x: np.ndarray, step: int) -> np.ndarray:
    pre = alive(x)
    p = perceive(x)

    h = np.broadcast_to(b1, (GRID, GRID, HID)).astype(np.float32).copy()
    for i in range(48):
        h += p[..., i : i + 1] * w1[i]
        h = h.astype(np.float32)
    h = np.maximum(h, 0, dtype=np.float32)
    d = np.broadcast_to(b2, (GRID, GRID, CH)).astype(np.float32).copy()
    for j in range(HID):
        d += h[..., j : j + 1] * w2[j]
        d = d.astype(np.float32)
    x = (x + d * fire_mask(step)[..., None]).astype(np.float32)
    life = (pre * alive(x))[..., None].astype(np.float32)
    return (x * life).astype(np.float32)

x = np.zeros((GRID, GRID, CH), np.float32)
x[GRID // 2, GRID // 2, 3:] = 1.0

states = []
for t in range(STEPS):
    x = step_fn(x, t)
    states.append(x.copy())

np.concatenate([s.ravel() for s in states]).astype('<f4').tofile(OUT / 'parity.bin')
(OUT / 'parity.json').write_text(
    json.dumps({'steps': STEPS, 'grid': GRID, 'channels': CH, 'seed': SEED, 'tolerance': 1e-5})
)
alive_px = int((x[..., 3] > 0.1).sum())
print(f'parity.bin: {STEPS} steps, final alive px {alive_px}, max|state| {np.abs(x).max():.3f}')
