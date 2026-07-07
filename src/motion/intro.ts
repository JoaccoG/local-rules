

import gsap from 'gsap';

export function preCount(reducedMotion: boolean): Promise<void> {
  const cEl = document.querySelector<HTMLElement>('[data-pre-counter]');
  const bar = document.querySelector<HTMLElement>('[data-pre-bar]');
  if (reducedMotion) return Promise.resolve();
  return new Promise((res) => {
    const o = { v: 0 };
    gsap.to(o, {
      v: 99,
      duration: 1.5,
      ease: 'power1.inOut',
      onUpdate: () => {
        const n = Math.round(o.v);
        if (cEl) cEl.textContent = String(n).padStart(3, '0');
        if (bar) bar.style.transform = `scaleX(${n / 100})`;
      },
      onComplete: () => res(),
    });
  });
}

export function finishPre(reducedMotion: boolean): Promise<void> {
  const pre = document.querySelector<HTMLElement>('[data-preloader]');
  if (!pre) return Promise.resolve();
  if (reducedMotion) {
    pre.style.display = 'none';
    return Promise.resolve();
  }
  const cEl = document.querySelector<HTMLElement>('[data-pre-counter]');
  const bar = document.querySelector<HTMLElement>('[data-pre-bar]');
  const px = document.querySelector<HTMLElement>('[data-pre-pixel]');
  if (cEl) cEl.textContent = '100';
  return new Promise((res) => {
    const tl = gsap.timeline({
      onComplete: () => {
        pre.style.display = 'none';
        res();
      },
    });
    if (bar) tl.to(bar, { scaleX: 1, duration: 0.18, ease: 'power2.out' }, 0);
    if (px) tl.to(px, { scale: 26, opacity: 0, duration: 0.55, ease: 'power2.in' }, 0.05);
    tl.to(pre, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.7, ease: 'expo.inOut' }, 0.32);
  });
}

export function heroIn(reducedMotion: boolean): void {
  const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-hero-line]'));
  if (reducedMotion) {
    gsap.set('[data-header],[data-hero-sub],[data-hero-corner]', { autoAlpha: 1, y: 0 });
    lines.forEach((l) => {
      l.style.transform = 'none';
      l.style.fontVariationSettings = '"wdth" 110';
    });
    return;
  }
  gsap.to('[data-header]', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out', delay: 0.15 });
  gsap.fromTo(
    lines,
    { yPercent: 115, y: 0 },
    { yPercent: 0, y: 0, duration: 0.7, stagger: 0.09, ease: 'expo.out' },
  );
  lines.forEach((l) => {
    l.style.transition = 'font-variation-settings 0.9s cubic-bezier(0.16,1,0.3,1)';
    requestAnimationFrame(() => {
      l.style.fontVariationSettings = '"wdth" 110';
    });
  });
  gsap.to('[data-hero-sub]', { autoAlpha: 1, y: 0, duration: 0.9, delay: 0.25, ease: 'expo.out' });
  gsap.to('[data-hero-corner]', { autoAlpha: 1, duration: 0.8, delay: 0.55, ease: 'power2.out' });
}

export function staticLayout(): void {
  const th = document.querySelector<HTMLElement>('[data-zone="thesis"]');
  if (th) {
    th.style.height = 'auto';
    th.style.padding = '20vh 80px';
    const st = th.querySelector<HTMLElement>('[data-thesis-sticky]');
    if (st) {
      st.style.position = 'static';
      st.style.height = 'auto';
      st.style.overflow = 'visible';
    }
    document.querySelectorAll<HTMLElement>('[data-beat]').forEach((b) => {
      b.style.position = 'static';
      b.style.inset = 'auto';
      b.style.margin = '12vh 0';
      b.style.padding = '0';
    });
  }
  const cl = document.querySelector<HTMLElement>('[data-zone="climax"]');
  if (cl) {
    cl.style.height = 'auto';
    cl.style.padding = '20vh 80px';
    const st = cl.querySelector<HTMLElement>('[data-climax-sticky]');
    if (st) {
      st.style.position = 'static';
      st.style.height = 'auto';
    }
    document.querySelectorAll<HTMLElement>('[data-beat-label]').forEach((b) => {
      b.style.position = 'static';
      b.style.opacity = '1';
      b.style.margin = '40px 0';
    });
    const step = document.querySelector<HTMLElement>('[data-step]');
    if (step) {
      step.style.position = 'static';
      step.style.opacity = '1';
      step.textContent = 'STEP 128';
    }
  }
}
