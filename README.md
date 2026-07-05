# Local Rules

An interactive essay on cellular automata — from Conway's Game of Life to neural
cellular automata — where **every simulation on the page is real**. Six chapters,
six engines, all running live in WebGPU compute shaders; nothing is a video,
nothing is procedural fakery.

## Measured, not claimed

Every number below was measured on real hardware; anything not yet measured is
written as `—`, never estimated. Hardware: **Apple M-series, Metal 3**, headless
Chromium (real GPU). Timing is CPU-side wall clock around batched GPU-synced
submissions — GPU timestamp queries not yet enabled — and the full method is
logged in [docs/engine-log.md](docs/engine-log.md).

### Conway engine throughput

| grid | cell updates / s |
|---|---|
| 512² | 5.1 × 10⁹ |
| 1024² | 5.7 × 10⁹ |
| 2048² | 5.8 × 10⁹ |

### Lenia convolution: FFT vs direct — the crossover

Lenia's neighbourhood is a ring kernel of radius R. The direct convolution costs
O(R²) per cell; the Stockham FFT path (radix-2, f32, WGSL —
[src/engine/fft.ts](src/engine/fft.ts)) is radius-independent. Measured ms per
convolution, same field, same `buildKernel` weights:

| | 256² | 512² | 1024² |
|---|---|---|---|
| FFT (any R) | 0.64 | 2.16 | 8.96 |
| direct R=4 | 0.19 | 0.69 | 2.68 |
| direct R=8 | 0.60 | 2.27 | 8.94 |
| direct R=13 (Orbium) | 1.46 | 5.57 | 21.9 |
| direct R=26 | 5.49 | 21.0 | 83.4 |
| direct R=64 | 33.1 | 128.4 | 504.9 |

**The crossover radius is R ≈ 8–9** (R≈9 at 256², R≈8 at 512² and 1024²). At
Orbium's own R=13 the FFT is already 2.3–2.6× faster; at R=64 it is ~56× faster.
The FFT path agrees with the direct convolution to max |Δ| ≈ 1×10⁻⁶ on Metal
(committed parity gate: 2×10⁻⁴ tolerance). The essay's Lenia chapter runs a 160²
world (not a power of two) where direct R=13 costs well under a millisecond, so
it keeps the fused direct path; the FFT is the large-grid path and the
measurement instrument (`/lab-fft.html`).

### Neural CA frame budget

The climax creature (16-channel NCA, 8,336 parameters, 33.3 KB of weights on
disk) at the shipped configuration — 160² world, full-screen 2880×1800 overlay
render: **1.6 ms simulation / 9.4 ms post** per frame (A/B amortised timing).

## Engine principles

- **Determinism**: same seed + same parameters = same simulation, always. All
  shader randomness derives from `hash(cell, step, seed)`; there is no
  unseeded source anywhere.
- **f32 simulation state everywhere** — Lenia's growth width (σ ≈ 0.015) does
  not survive half precision.
- **No per-frame CPU readback**: statistics come from a reduction shader, read
  back at most every 30 frames.
- **Nothing is faked**: if a chapter could not be made real, the plan was to
  cut it, not fake it. (One chapter — SmoothLife — was cut.)

## Running

```
npm install
npm run dev        # the essay
npm run test:engine  # 12 correctness gates, headless (SwiftShader — CPU-only, deterministic)
```

Engine labs: `/lab.html` (Conway + any Life-like rule, bench),
`/lab-explorer.html` (64-rule wall), `/lab-ltl.html` (Larger than Life),
`/lab-lenia.html` (Lenia + parity), `/lab-rd.html` (Gray-Scott),
`/lab-nca.html` (neural CA), `/lab-fft.html` (FFT parity + crossover bench).

## Stack

TypeScript · WebGPU (WGSL) for simulation and rendering · Vite. The NCA training
pipeline is Python/PyTorch (`training/`); trained weights ship as static files.
Project documentation lives in [docs/](docs/README.md).
