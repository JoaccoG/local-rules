

export const headerHTML = `
<header data-header style="position:fixed;top:0;left:0;right:0;z-index:40;display:flex;justify-content:space-between;align-items:center;padding:20px 80px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;border-bottom:1px solid #232741;background:rgba(6,7,13,0.55);backdrop-filter:blur(10px);opacity:0;transform:translateY(-8px);">
  <div style="display:flex;align-items:center;gap:14px;"><span style="color:#4DE1FF;">⌗</span><span style="color:#EDEBF5;">Local Rules</span></div>
  <div style="color:#545475;">An interactive essay</div>
</header>`;

export const preloaderHTML = `
<div data-preloader style="position:fixed;inset:0;z-index:50;background:#06070D;display:flex;align-items:center;justify-content:center;clip-path:inset(0% 0% 0% 0%);">
  <div data-pre-pixel style="width:3px;height:3px;background:#4DE1FF;box-shadow:0 0 14px 2px rgba(77,225,255,0.85);animation:lr-pulse 1.2s ease-in-out infinite;"></div>
  <div style="position:absolute;left:80px;right:80px;bottom:48px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">
      <span style="color:#EDEBF5;">Local Rules</span>
      <span data-pre-counter style="color:#9A9AB8;font-variant-numeric:tabular-nums;">000</span>
    </div>
    <div style="height:1px;background:#232741;">
      <div data-pre-bar style="height:1px;background:#4DE1FF;transform:scaleX(0);transform-origin:left center;"></div>
    </div>
  </div>
</div>`;

export const hudHTML = `
<div data-hud style="position:fixed;left:80px;bottom:36px;z-index:30;opacity:0;pointer-events:none;width:min(40vw,560px);">
  <div data-hud-line style="height:1px;background:#232741;margin-bottom:12px;"></div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">
    <span style="display:flex;gap:12px;"><span data-hud-num style="color:#4DE1FF;">01</span><span data-hud-name style="color:#EDEBF5;">Conway</span></span>
    <span data-hud-meta style="color:#545475;">3×3 · 1 bit</span>
  </div>
</div>`;
