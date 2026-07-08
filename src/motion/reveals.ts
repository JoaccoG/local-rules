

import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

export function setupReveals(reducedMotion: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    const o = parseFloat(getComputedStyle(el).opacity);
    const target = isNaN(o) ? 1 : o;
    if (reducedMotion) {
      el.style.opacity = String(target);
      return;
    }
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 26 },
      {
        autoAlpha: target,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 86%', toggleActions: 'play none none reverse' },
      },
    );
  });

  if (!reducedMotion) {
    const head = Array.from(document.querySelectorAll<HTMLElement>('[data-dial-cell="0"]'));
    if (head.length) {
      gsap.fromTo(
        head,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 0.7,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: { trigger: head[0]!, start: 'top 85%', toggleActions: 'play none none reverse' },
        },
      );
    }
    for (let n = 1; n <= 5; n++) {
      const line = document.querySelector<HTMLElement>(`[data-dial-line="${n}"]`);
      if (!line) continue;
      const cells = Array.from(document.querySelectorAll<HTMLElement>(`[data-dial-cell="${n}"]`));
      const tl = gsap.timeline({
        scrollTrigger: { trigger: line, start: 'top 82%', toggleActions: 'play none none reverse' },
      });
      tl.fromTo(
        line,
        { scaleX: 0 },
        { scaleX: 1, transformOrigin: 'left center', duration: 0.8, ease: 'expo.out' },
        0,
      );
      if (cells.length) {

        tl.fromTo(
          cells,
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' },
          0.25,
        );
      }
    }
  }

  const panel = document.querySelector<HTMLElement>('[data-panel]');
  if (panel) {
    const run = () => runInstrumentPanel(reducedMotion);
    if (reducedMotion) run();
    else ScrollTrigger.create({ trigger: panel, start: 'top 78%', once: true, onEnter: run });
  }
}

export function runInstrumentPanel(reducedMotion: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-bar-on]').forEach((sp) => {
    const fill = parseFloat(sp.getAttribute('data-fill') ?? '0.5');
    const off = sp.parentElement?.querySelector<HTMLElement>('[data-bar-off]') ?? null;
    const total = 24;
    const target = Math.round(fill * total);
    if (target === 0) {

      sp.textContent = '';
      if (off) off.textContent = '░'.repeat(total);
      return;
    }
    if (reducedMotion) {
      sp.textContent = '█'.repeat(target);
      if (off) off.textContent = '░'.repeat(total - target);
      return;
    }
    const o = { v: 0 };
    gsap.to(o, {
      v: target,
      duration: 1.3,
      ease: 'expo.out',
      onUpdate: () => {
        const k = Math.round(o.v);
        sp.textContent = '█'.repeat(k);
        if (off) off.textContent = '░'.repeat(total - k);
      },
    });
  });
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const val = parseInt(el.getAttribute('data-count')!, 10);
    if (reducedMotion) {
      el.textContent = val.toLocaleString('en-US');
      return;
    }
    const o = { v: 0 };
    gsap.to(o, {
      v: val,
      duration: 1.4,
      ease: 'expo.out',
      onUpdate: () => {
        el.textContent = Math.round(o.v).toLocaleString('en-US');
      },
    });
  });
}
