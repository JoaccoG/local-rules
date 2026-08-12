"""Growing Neural Cellular Automata — training (Mordvintsev et al., Distill 2020).

Recipe per docs/nca.md: 16 channels, fixed perception (identity/SobelX/SobelY),
Dense 48-128 ReLU, Dense 128-16 zero-initialised residual, stochastic update
p=0.5, alive mask alpha>0.1 (3x3 maxpool, pre AND post), pool trick (1024
states, batch 8, worst reset to seed) and the damage trick (random circular
erasures on the best samples) so regeneration is EMERGENT — no repair routine.

Outputs:
  public/weights/butterfly.bin   f32 LE: W1[48*128] b1[128] W2[128*16] b2[16]
  public/weights/butterfly.json  metadata + measured training numbers
  training/train.log             loss curve (real measurements only)

Zero padding at the grid edge (paper's convention; the creature never touches
the boundary). Logged as a deliberate deviation from engine.md's toroidal
default for this chapter.
"""
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parent.parent
CH, HIDDEN = 16, 128
GRID = int(os.environ.get('NCA_GRID', 48))
NAME = os.environ.get('NCA_NAME', 'butterfly')
TARGET_NPY = os.environ.get('NCA_TARGET_NPY', '')
INIT_BIN = os.environ.get('NCA_INIT', '')
FIRE, ALPHA_THR = 0.5, 0.1
POOL, BATCH = 1024, 8
STEPS = int(os.environ.get('NCA_STEPS', 8000))

ROLL_LO = int(os.environ.get('NCA_ROLL_LO', 64))
ROLL_HI = int(os.environ.get('NCA_ROLL_HI', 97))
DAMAGE_N = 3

DMG_LO = float(os.environ.get('NCA_DMG_LO', 3.0))
DMG_HI = float(os.environ.get('NCA_DMG_HI', 10.0))

V2 = os.environ.get('NCA_V2', '') == '1'
CUT_R_LO = float(os.environ.get('NCA_CUT_R_LO', 4.0))
CUT_R_HI = float(os.environ.get('NCA_CUT_R_HI', 16.0))
OVER_W = float(os.environ.get('NCA_OVER_W', 0.05 if V2 else 0.0))

V2_ROLL_LO = int(os.environ.get('NCA_V2_ROLL_LO', 128))
V2_ROLL_HI = int(os.environ.get('NCA_V2_ROLL_HI', 225))
V2_DRAG_LO = int(os.environ.get('NCA_V2_DRAG_LO', 24))
V2_DRAG_HI = int(os.environ.get('NCA_V2_DRAG_HI', 65))

LR = float(os.environ.get('NCA_LR', 2e-3))
MILESTONE = int(os.environ.get('NCA_MILESTONE', 2000))

SKIP_NAN = os.environ.get('NCA_SKIP_NAN', '') == '1'

SEED = int(os.environ.get('NCA_SEED', 7))

torch.manual_seed(SEED)
np.random.seed(SEED)
device = torch.device(
    'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
)
print('device:', device)

target_small = np.load(TARGET_NPY or (ROOT / 'training' / 'target.npy'))
ts = target_small.shape[0]
pad = (GRID - ts) // 2
target = np.zeros((GRID, GRID, 4), np.float32)
target[pad : pad + ts, pad : pad + ts] = target_small
target_t = torch.tensor(target, device=device).permute(2, 0, 1)[None]
TARGET_ALIVE = max(float((target[..., 3] > 0.1).sum()), 1.0)

ident = torch.tensor([[0, 0, 0], [0, 1, 0], [0, 0, 0]], dtype=torch.float32)
sobel_x = torch.tensor([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=torch.float32) / 8.0
sobel_y = sobel_x.T
kernels = torch.stack([ident, sobel_x, sobel_y])
perc_w = kernels[None].repeat(CH, 1, 1, 1).reshape(CH * 3, 1, 3, 3).to(device)

class NCA(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = torch.nn.Conv2d(CH * 3, HIDDEN, 1)
        self.fc2 = torch.nn.Conv2d(HIDDEN, CH, 1, bias=True)
        torch.nn.init.zeros_(self.fc2.weight)
        torch.nn.init.zeros_(self.fc2.bias)

    def perceive(self, x):
        return F.conv2d(x, perc_w, padding=1, groups=CH)

    def alive(self, x):
        return F.max_pool2d(x[:, 3:4], 3, stride=1, padding=1) > ALPHA_THR

    def forward(self, x):
        pre = self.alive(x)
        dx = self.fc2(F.relu(self.fc1(self.perceive(x))))
        fire = (torch.rand(x.shape[0], 1, GRID, GRID, device=x.device) < FIRE).float()
        x = x + dx * fire
        life = (pre & self.alive(x)).float()
        return x * life

def make_seed(n=1):
    x = torch.zeros(n, CH, GRID, GRID, device=device)
    x[:, 3:, GRID // 2, GRID // 2] = 1.0
    return x

def damage_masks(n, dev):
    """(n,1,H,W) float keep-masks. v1: circles only (byte-compatible recipe).
    v2 mix: 45% circle, 40% capsule stroke (the essay's drag cut), 15%
    half-plane fragment (the chimera case)."""
    yy, xx = torch.meshgrid(
        torch.arange(GRID, device=dev, dtype=torch.float32),
        torch.arange(GRID, device=dev, dtype=torch.float32),
        indexing='ij',
    )
    out = []
    for _ in range(n):
        mode = np.random.rand() if V2 else 0.0
        if mode < 0.45:
            r = np.random.uniform(DMG_LO, DMG_HI)
            cx = np.random.uniform(GRID * 0.25, GRID * 0.75)
            cy = np.random.uniform(GRID * 0.25, GRID * 0.75)
            mask = ((xx - cx) ** 2 + (yy - cy) ** 2) > r * r
        elif mode < 0.85:
            r = np.random.uniform(CUT_R_LO, CUT_R_HI)
            x1, y1, x2, y2 = np.random.uniform(GRID * 0.15, GRID * 0.85, 4)
            dx, dy = x2 - x1, y2 - y1
            L2 = dx * dx + dy * dy + 1e-6
            t = (((xx - x1) * dx + (yy - y1) * dy) / L2).clamp(0, 1)
            mask = ((xx - (x1 + t * dx)) ** 2 + (yy - (y1 + t * dy)) ** 2) > r * r
        else:
            th = np.random.uniform(0, 2 * np.pi)
            d = np.random.uniform(-0.12, 0.12) * GRID
            mask = (xx - GRID / 2) * np.cos(th) + (yy - GRID / 2) * np.sin(th) > d
        out.append(mask.float()[None, None])
    return torch.cat(out, 0)

def damage(x):
    return x * damage_masks(x.shape[0], x.device)

def circle_masks(cxs, cys, rs, dev):
    """(n,1,H,W) keep-masks for n circles — one sweep step of a slow drag."""
    yy, xx = torch.meshgrid(
        torch.arange(GRID, device=dev, dtype=torch.float32),
        torch.arange(GRID, device=dev, dtype=torch.float32),
        indexing='ij',
    )
    out = []
    for cx, cy, r in zip(cxs, cys, rs):
        out.append((((xx - cx) ** 2 + (yy - cy) ** 2) > r * r).float()[None, None])
    return torch.cat(out, 0)

def loss_f(x):
    return F.mse_loss(x[:, :4], target_t.expand(x.shape[0], -1, -1, -1), reduction='none').mean(
        dim=(1, 2, 3)
    )

model = NCA().to(device)
if INIT_BIN:

    blob0 = np.fromfile(INIT_BIN, dtype='<f4')
    w1_0 = blob0[: 48 * HIDDEN].reshape(48, HIDDEN).T.reshape(HIDDEN, CH * 3, 1, 1)
    b1_0 = blob0[48 * HIDDEN : 48 * HIDDEN + HIDDEN]
    w2_0 = (
        blob0[48 * HIDDEN + HIDDEN : 48 * HIDDEN + HIDDEN + HIDDEN * CH]
        .reshape(HIDDEN, CH)
        .T.reshape(CH, HIDDEN, 1, 1)
    )
    b2_0 = blob0[48 * HIDDEN + HIDDEN + HIDDEN * CH :]
    with torch.no_grad():
        model.fc1.weight.copy_(torch.tensor(w1_0))
        model.fc1.bias.copy_(torch.tensor(b1_0))
        model.fc2.weight.copy_(torch.tensor(w2_0))
        model.fc2.bias.copy_(torch.tensor(b2_0))
    print(f'warm-started from {INIT_BIN}')
opt = torch.optim.Adam(model.parameters(), lr=LR)
sched = torch.optim.lr_scheduler.MultiStepLR(opt, milestones=[MILESTONE], gamma=0.1)
pool = make_seed(POOL)

log = open(ROOT / 'training' / 'train.log', 'w')
t0 = time.time()
nan_skips = 0
for step in range(STEPS):
    idx = torch.tensor(np.random.choice(POOL, BATCH, replace=False), device=device)
    x = pool[idx]
    with torch.no_grad():
        order = loss_f(x).argsort(descending=True)
        x = x[order]
        x[0] = make_seed(1)[0]
        if not V2:
            x[-DAMAGE_N:] = damage(x[-DAMAGE_N:])
    if V2:

        k = np.random.randint(V2_ROLL_LO, V2_ROLL_HI)
        sustained = np.random.rand() < 0.7
        if sustained:
            S = int(np.random.randint(V2_DRAG_LO, V2_DRAG_HI))

            dmg_at = np.random.randint(0, max(1, k - S - 64))
            stroke = np.random.uniform(GRID * 0.15, GRID * 0.85, (DAMAGE_N, 4))
            srad = np.random.uniform(CUT_R_LO, CUT_R_HI * 0.6, DAMAGE_N)
        else:
            S = 0
            dmg_at = np.random.randint(0, k - 63)
    else:
        k = np.random.randint(ROLL_LO, ROLL_HI)
        dmg_at, sustained, S = -1, False, 0
    for si in range(k):
        if V2 and sustained and dmg_at <= si < dmg_at + S:
            t = (si - dmg_at) / max(S - 1, 1)
            m = circle_masks(
                stroke[:, 0] + (stroke[:, 2] - stroke[:, 0]) * t,
                stroke[:, 1] + (stroke[:, 3] - stroke[:, 1]) * t,
                srad,
                device,
            )
            x = torch.cat([x[:-DAMAGE_N], x[-DAMAGE_N:] * m], 0)
        elif si == dmg_at and not sustained and dmg_at >= 0:
            masks = damage_masks(DAMAGE_N, device)
            x = torch.cat([x[:-DAMAGE_N], x[-DAMAGE_N:] * masks], 0)
        x = model(x)
    loss = loss_f(x).mean()
    if OVER_W > 0:

        soft = torch.sigmoid((x[:, 3] - ALPHA_THR) / 0.02).sum(dim=(1, 2))
        loss = loss + OVER_W * (F.relu(soft / TARGET_ALIVE - 1.15) ** 2).mean()
    if SKIP_NAN and not torch.isfinite(loss):
        with torch.no_grad():
            pool[idx] = make_seed(BATCH)
        sched.step()
        nan_skips += 1
        if nan_skips % 20 == 1:
            print(f'{step}\tSKIP-NAN\t{nan_skips} descartados', flush=True)
        continue
    opt.zero_grad()
    loss.backward()
    with torch.no_grad():
        for p in model.parameters():
            if p.grad is not None:
                p.grad /= p.grad.norm() + 1e-8
    opt.step()
    sched.step()
    with torch.no_grad():
        pool[idx] = x.detach()[order.argsort()]
    if step % 100 == 0 or step == STEPS - 1:
        msg = f'{step}\t{loss.item():.6f}\t{time.time() - t0:.1f}s'
        print(msg, flush=True)
        log.write(msg + '\n')
        log.flush()

out = Path(os.environ.get('NCA_OUT', ROOT / 'public' / 'weights'))
out.mkdir(parents=True, exist_ok=True)
w1 = model.fc1.weight.detach().cpu().numpy().reshape(HIDDEN, CH * 3).T
b1 = model.fc1.bias.detach().cpu().numpy()
w2 = model.fc2.weight.detach().cpu().numpy().reshape(CH, HIDDEN).T
b2 = model.fc2.bias.detach().cpu().numpy()
blob = np.concatenate([w1.ravel(), b1, w2.ravel(), b2]).astype('<f4')
blob.tofile(out / f'{NAME}.bin')

n_params = int(sum(p.numel() for p in model.parameters()))
meta = {
    'name': NAME,
    'channels': CH,
    'hidden': HIDDEN,
    'grid': GRID,
    'fire_rate': FIRE,
    'alpha_threshold': ALPHA_THR,
    'padding': 'zero',
    'params': n_params,
    'bytes': int(blob.nbytes),
    'training_steps': STEPS,
    'final_loss': float(loss.item()),
    'train_seconds': round(time.time() - t0, 1),
    'device': str(device),
    'layout': 'f32le: W1[48*128 in-major] b1[128] W2[128*16 in-major] b2[16]',
}
(out / f'{NAME}.json').write_text(json.dumps(meta, indent=2))
print('exported', n_params, 'params,', blob.nbytes, 'bytes ->', out / f'{NAME}.bin')
