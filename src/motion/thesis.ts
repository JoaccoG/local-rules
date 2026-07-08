

import gsap from 'gsap';
import { seg } from '../lib/math';

const WINS: ReadonlyArray<readonly [number, number]> = [
  [0.02, 0.32],
  [0.36, 0.66],
  [0.7, 0.98],
];

export class ThesisBeats {
  private tls: gsap.core.Timeline[] = [];

  build(): void {
    const beats = Array.from(document.querySelectorAll<HTMLElement>('[data-beat]'));
    const beatWords: HTMLElement[][] = beats.map((b) => {
      const p = b.querySelector<HTMLElement>('[data-beat-text]')!;
      const words = (p.textContent ?? '').split(' ');
      p.textContent = '';
      const inners: HTMLElement[] = [];
      words.forEach((w, i) => {
        const outer = document.createElement('span');
        outer.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;';
        const inner = document.createElement('span');
        inner.style.cssText = 'display:inline-block;transform:translateY(120%);';
        inner.textContent = w;
        outer.appendChild(inner);
        p.appendChild(outer);
        if (i < words.length - 1) p.appendChild(document.createTextNode(' '));
        inners.push(inner);
      });
      return inners;
    });
    this.tls = beats.map((b, i) => {

      const n = beatWords[i]!.length;
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(
        beatWords[i]!,
        { yPercent: 120, y: 0 },
        {
          yPercent: 0,
          y: 0,
          duration: 0.55,
          stagger: n > 1 ? 0.45 / (n - 1) : 0,
          ease: 'expo.out',
        },
        0,
      );
      tl.fromTo(
        b,
        { opacity: 1, scale: 1, filter: 'blur(0px)' },
        { opacity: 0, scale: 0.965, filter: 'blur(10px)', duration: 0.45, ease: 'power2.in' },
        1.55,
      );
      return tl;
    });
  }

  progress = (ps: number): void => {
    this.tls.forEach((tl, k) => {
      const w = WINS[k]!;
      tl.progress(seg(ps, w[0], w[1]));
    });
  };
}
