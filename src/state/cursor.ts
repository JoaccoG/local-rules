

export function mountInstrumentCursor(reducedMotion: boolean): void {
  if (reducedMotion) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  const root = document.createElement('div');
  root.setAttribute('data-cursor', '');
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText =
    'position:fixed;left:0;top:0;z-index:70;pointer-events:none;mix-blend-mode:screen;will-change:transform;visibility:hidden;';
  const ring = document.createElement('div');
  ring.style.cssText =
    'position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border:1px solid rgba(237,235,245,0.5);border-radius:50%;transition:width 0.18s cubic-bezier(0.33,1,0.68,1),height 0.18s cubic-bezier(0.33,1,0.68,1),margin 0.18s cubic-bezier(0.33,1,0.68,1),border-color 0.18s ease;';
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:absolute;left:0;top:0;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;background:#EDEBF5;';
  root.append(ring, dot);
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = 'html.lr-cursor, html.lr-cursor * { cursor: none !important; }';
  document.head.appendChild(style);
  document.documentElement.classList.add('lr-cursor');

  const setTight = (tight: boolean, accent?: string) => {
    const d = tight ? 12 : 26;
    ring.style.width = `${d}px`;
    ring.style.height = `${d}px`;
    ring.style.margin = `-${d / 2}px 0 0 -${d / 2}px`;
    ring.style.borderColor = tight ? (accent ?? '#4DE1FF') : 'rgba(237,235,245,0.5)';
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      root.style.visibility = 'visible';
      root.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const interactive = el?.closest('a,button,input,[data-cut-surface],[data-control],[data-tip]') ?? null;
      setTight(!!interactive);
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', () => setTight(true));
  window.addEventListener('pointerup', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setTight(!!el?.closest('a,button,input,[data-cut-surface],[data-control],[data-tip]'));
  });
}
