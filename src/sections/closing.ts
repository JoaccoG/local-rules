

export const ncaIntroHTML = `
<section data-zone="ncaintro" data-screen-label="09 Neural CA — intro" style="position:relative;min-height:120vh;display:flex;align-items:center;justify-content:center;padding:0 80px;">
  <div style="display:flex;flex-direction:column;align-items:center;text-align:center;">
    <div data-reveal style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:clamp(56px,5vw,72px);line-height:1;font-variant-numeric:tabular-nums;background-image:linear-gradient(90deg,#4DE1FF,#8B5CF6,#FF3D8B,#FF7A2F,#2BFFB0,#FFE24D,#4DE1FF);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lr-irid 7s linear infinite;">06</div>
    <div data-reveal style="width:56px;height:1px;background:#3A4068;margin:26px auto 30px;"></div>
    <h2 data-reveal style="margin:0 0 24px;font-family:'Anybody','Archivo',sans-serif;font-variation-settings:'wdth' 100;font-weight:700;font-size:clamp(44px,4.5vw,64px);letter-spacing:-0.03em;line-height:0.95;color:#EDEBF5;text-transform:uppercase;">Neural CA</h2>
    <p data-reveal style="margin:0;font-family:'Newsreader','Literata',serif;font-size:23px;line-height:1.55;color:#9A9AB8;max-width:52ch;text-wrap:pretty;">Nobody wrote this rule. A tiny neural network learned it — 8,336 numbers, fitted until a single pixel knew how to grow into a creature and how to heal. What follows is not a recording. It is that network running live in your browser, and I trained it myself.</p>
  </div>
</section>`;

export const climaxHTML = `
<section data-zone="climax" data-screen-label="10 Neural CA — beats" style="position:relative;height:360vh;">
  <div data-climax-sticky style="position:sticky;top:0;height:100vh;">
    <div data-step style="position:absolute;top:96px;right:80px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;letter-spacing:0.16em;color:#EDEBF5;font-variant-numeric:tabular-nums;opacity:0;">STEP 000</div>
    <div data-beat-label="0" style="position:absolute;left:80px;top:22%;opacity:0;max-width:24vw;">
      <div style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#EDEBF5;margin-bottom:12px;">Growth</div>
      <div style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;line-height:1.8;letter-spacing:0.04em;color:#9A9AB8;">no blueprint anywhere. every cell runs the same tiny network and asks its neighbours what to become.</div>
    </div>
    <div data-beat-label="1" style="position:absolute;right:80px;top:42%;opacity:0;max-width:24vw;text-align:right;">
      <div style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#EDEBF5;margin-bottom:12px;">The rule</div>
      <div style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;line-height:1.8;letter-spacing:0.04em;color:#9A9AB8;">twelve of these sixteen channels are invisible. nobody designed them — the optimiser invented them during training.</div>
    </div>
    <div data-beat-label="2" style="position:absolute;left:80px;bottom:20%;opacity:0;max-width:24vw;">
      <div style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#EDEBF5;margin-bottom:12px;">Regeneration</div>
      <div style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;line-height:1.8;letter-spacing:0.04em;color:#9A9AB8;">no repair routine exists. it heals because it was damaged, thousands of times, all through training.</div>
    </div>
  </div>
</section>`;

export const trainedHTML = `
<section data-zone="trained" data-screen-label="11 Trained, not written" style="position:relative;min-height:130vh;display:flex;align-items:center;justify-content:center;padding:120px 80px;">
  <div style="max-width:640px;display:flex;flex-direction:column;align-items:flex-start;">
    <div data-reveal style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;margin-bottom:34px;">Trained, not written</div>
    <p data-reveal style="margin:0 0 34px;font-family:'Newsreader','Literata',serif;font-size:clamp(28px,2.6vw,36px);line-height:1.35;color:#EDEBF5;max-width:26ch;text-wrap:pretty;">Every rule on this page so far was discovered by someone else. This one is mine.</p>
    <p data-reveal style="margin:0 0 24px;font-family:'Newsreader','Literata',serif;font-optical-sizing:auto;font-size:19px;line-height:1.65;color:#9A9AB8;max-width:52ch;text-wrap:pretty;">There is no butterfly stored anywhere in this page — no sprite, no video, no code that knows what wings are. Each cell runs the same tiny neural network, sees only its eight neighbours, and decides what to become next. The whole brain is 8,336 numbers, 33 kilobytes on disk: smaller than a screenshot of the creature it grows. The shape is stored nowhere. It re-emerges, every time, from local negotiations.</p>
    <p data-reveal style="margin:0 0 34px;font-family:'Newsreader','Literata',serif;font-optical-sizing:auto;font-size:19px;line-height:1.65;color:#9A9AB8;max-width:52ch;text-wrap:pretty;">I trained eight of them — the butterfly, a heart, a mushroom, a lizard that took three attempts. The method is from a 2020 Distill paper; the weights, the scars and the survivors are mine. Training was mostly sabotage: circles punched out of the body, slow cuts dragged across it for hundreds of steps, halves torn away — and a score awarded only for what grew back. Regeneration was never programmed. It is what survived.</p>
    <div data-reveal style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;line-height:1.8;letter-spacing:0.04em;color:#545475;">the whole bestiary is one scroll up. cut them again — they don't mind.</div>
  </div>
</section>`;

const MONO_P = "font-family:'Martian Mono','JetBrains Mono',monospace;";
const factRow = (label: string, value: string, count?: number) => `
<div style="display:flex;justify-content:space-between;gap:20px;${MONO_P}font-size:13px;font-variant-numeric:tabular-nums;">
  <span style="color:#545475;letter-spacing:0.16em;text-transform:uppercase;">${label}</span>
  <span style="color:#EDEBF5;text-align:right;">${count !== undefined ? `<span data-count="${count}">0</span>` : ''}${value}</span>
</div>`;

export const instrumentHTML = `
<section data-zone="instrument" data-screen-label="12 Instrument panel" style="padding:240px 80px;">
  <div style="max-width:900px;margin:0 auto;">
    <div data-reveal style="${MONO_P}font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;margin-bottom:22px;">Measured, not claimed</div>
    <div data-panel style="border:1px solid #232741;padding:44px 48px;">
      <div style="${MONO_P}font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;margin-bottom:26px;">The network</div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${factRow('Parameters', '', 8336)}
        ${factRow('Weights on disk', '.3 KB', 33)}
        ${factRow('Architecture', '48 → 128 → 16')}
        ${factRow('Training', '2.9 H GPU · RTX 4070 TI')}
        ${factRow('Inference', '1.6 MS / FRAME · METAL 3')}
      </div>
      <div style="height:1px;background:#232741;margin:34px 0;"></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <span style="${MONO_P}font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;">The bestiary — eight organisms, one network</span>
        <span style="${MONO_P}font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;">tap one</span>
      </div>
      <div data-bestiary-chips style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:28px;"></div>
      <div data-bestiary-readout style="min-height:132px;"></div>
      <div style="margin-top:30px;${MONO_P}font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;">Grid 64 trained → 160 in the essay · heal &amp; drag IoU on Apple Metal 3 · drag = median of 12 seeded cuts</div>
    </div>
  </div>
</section>`;

export const colophonHTML = `
<section data-zone="colophon" data-screen-label="13 Colophon" style="position:relative;min-height:150vh;display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 56px;">
  <div style="max-width:1280px;margin:0 auto;width:100%;">
    <p style="text-align:center;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;letter-spacing:0.1em;color:#9A9AB8;margin:0 0 140px;">every cell looks at its neighbours. that is the whole trick.</p>
    <div style="height:1px;background:#232741;margin-bottom:22px;"></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:16px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;">
      <span>Local Rules — an interactive essay · © ${new Date().getFullYear()} Joaquín Godoy</span>
      <span style="display:flex;gap:28px;flex-wrap:wrap;">
        <a href="https://distill.pub/2020/growing-ca/" target="_blank" rel="noreferrer">Growing NCA — Distill 2020 ↗</a>
        <a href="https://arxiv.org/abs/1812.05433" target="_blank" rel="noreferrer">Lenia — Chan 2019 ↗</a>
      </span>
    </div>
  </div>
</section>`;
