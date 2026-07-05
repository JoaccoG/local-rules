

export const heroHTML = `
<section data-zone="hero" data-screen-label="01 Hero" style="position:relative;min-height:100vh;display:flex;align-items:center;padding:0 80px;">
  <div style="max-width:1440px;margin:0 auto;width:100%;">
    <h1 data-hero-h1 style="margin:0;font-family:'Anybody','Archivo',sans-serif;font-weight:780;font-size:clamp(72px,11vw,168px);line-height:0.88;letter-spacing:-0.04em;color:#EDEBF5;text-transform:uppercase;">
      <span style="display:block;overflow:hidden;padding:0.05em 0;"><span data-hero-line style="display:block;font-variation-settings:'wdth' 75;transform:translateY(115%);">Local</span></span>
      <span style="display:block;overflow:hidden;padding:0.05em 0;"><span data-hero-line style="display:block;font-variation-settings:'wdth' 75;transform:translateY(115%);">Rules</span></span>
    </h1>
    <p data-hero-sub style="margin:44px 0 0;font-family:'Newsreader','Literata',serif;font-optical-sizing:auto;font-size:22px;line-height:1.6;color:#9A9AB8;max-width:36ch;opacity:0;transform:translateY(16px);">Every cell looks at its neighbours and decides what to do. Everything else is emergent.</p>
  </div>
  <div data-hero-corner style="position:absolute;left:80px;bottom:36px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;color:#545475;font-variant-numeric:tabular-nums;opacity:0;">01 / 06</div>
  <div data-hero-corner style="position:absolute;right:80px;bottom:36px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;opacity:0;">Scroll ↓</div>
</section>`;

const beat = (i: number, maxCh: number, text: string, center = false) => `
<div data-beat="${i}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 10vw;">
  <p data-beat-text style="margin:0;font-family:'Anybody','Archivo',sans-serif;font-variation-settings:'wdth' 100;font-weight:700;font-size:clamp(44px,6vw,88px);line-height:1.08;letter-spacing:-0.03em;color:#EDEBF5;max-width:${maxCh}ch;${center ? "text-align:center;" : ""}">${text}</p>
</div>`;

export const thesisHTML = `
<section data-zone="thesis" data-screen-label="02 Thesis" style="position:relative;height:340vh;">
  <div data-thesis-sticky style="position:sticky;top:0;height:100vh;overflow:hidden;">
    ${beat(0, 19, "Conway's Game of Life is a lookup table with eighteen entries")}
    ${beat(1, 24, "A neural network that grows a creature from one pixel is the same idea at higher resolution")}
    ${beat(2, 14, "Four dials separate them...", true)}
  </div>
</section>`;

const dialLabel = (n: number, text: string, tip: string) =>
	`<div data-dial-cell="${n}" data-tip="${tip}" tabindex="0" style="padding:20px 0;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;">${text}</div>`;
const dialValue = (n: number, text: string) =>
	`<div data-dial-cell="${n}" style="padding:20px 0;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;color:#9A9AB8;font-variant-numeric:tabular-nums;">${text}</div>`;
const dialLine = (n: number) =>
	`<div data-dial-line="${n}" style="grid-column:1 / -1;height:1px;background:#232741;"></div>`;

export const dialsHTML = `
<section data-zone="dials" data-screen-label="03 The four dials" style="padding:120px 80px 240px;">
  <div style="max-width:1120px;margin:0 auto;">
    <div data-reveal style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;margin-bottom:56px;">The four dials</div>
    <div data-dials-scroll>
    <div data-dials-grid style="display:grid;grid-template-columns:1.1fr 1fr 1fr 1fr;column-gap:24px;">
      <div data-dial-cell="0" style="padding:0 0 18px;"></div>
      <div data-dial-cell="0" data-tip="col-conway" tabindex="0" style="padding:0 0 18px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#EDEBF5;">Conway</div>
      <div data-dial-cell="0" data-tip="col-lenia" tabindex="0" style="padding:0 0 18px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#EDEBF5;">Lenia</div>
      <div data-dial-cell="0" data-tip="col-nca" tabindex="0" style="padding:0 0 18px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#EDEBF5;">Neural CA</div>
      ${dialLine(1)}
      ${dialLabel(1, "Cell state", "row-state")}
      ${dialValue(1, "1 bit")}
      ${dialValue(1, "1 real number")}
      ${dialValue(1, "16 numbers")}
      ${dialLine(2)}
      ${dialLabel(2, "Neighbourhood", "row-hood")}
      ${dialValue(2, "3×3 uniform")}
      ${dialValue(2, "radius 13")}
      ${dialValue(2, "3×3 gradients")}
      ${dialLine(3)}
      ${dialLabel(3, "Time", "row-time")}
      ${dialValue(3, "integer steps")}
      ${dialValue(3, "continuous dt")}
      ${dialValue(3, "asynchronous")}
      ${dialLine(4)}
      ${dialLabel(4, "Rule author", "row-author")}
      <div data-dial-cell="4" style="padding:20px 0;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;color:#9A9AB8;">a human</div>
      <div data-dial-cell="4" style="padding:20px 0;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;color:#9A9AB8;">a human</div>
      <div data-dial-cell="4" style="padding:20px 0;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;">
        <span data-optimiser style="background-image:linear-gradient(90deg,#4DE1FF,#8B5CF6,#FF3D8B,#FF7A2F,#2BFFB0,#FFE24D,#4DE1FF);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lr-irid 6s linear infinite;">an optimiser</span>
      </div>
      ${dialLine(5)}
    </div>
    </div>
  </div>
</section>`;
