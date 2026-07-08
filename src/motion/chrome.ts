

import type Lenis from 'lenis';

export interface ChromeOpts {
  lenis: Lenis | null;
  reducedMotion: boolean;
}

const MONO = "font-family:'Martian Mono','JetBrains Mono',monospace;";

export class Chrome {
  private progressEl: HTMLElement;
  private toastEl: HTMLElement;
  private recEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private zoneTops: number[] = [];

  constructor(private opts: ChromeOpts) {
    this.progressEl = document.createElement('div');
    this.progressEl.setAttribute('data-progress', '');
    this.progressEl.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:1px;z-index:41;background:#4DE1FF;opacity:0.55;transform:scaleX(0);transform-origin:left center;pointer-events:none;';
    document.body.appendChild(this.progressEl);

    this.toastEl = document.createElement('div');
    this.toastEl.style.cssText = `position:fixed;right:80px;bottom:36px;z-index:60;${MONO}font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#EDEBF5;opacity:0;transition:opacity 0.18s ease;pointer-events:none;background:rgba(12,13,24,0.9);border:1px solid #232741;border-radius:2px;padding:8px 12px;`;
    document.body.appendChild(this.toastEl);

    this.recEl = document.createElement('div');
    this.recEl.style.cssText = `position:fixed;top:60px;right:80px;z-index:60;${MONO}font-size:11px;letter-spacing:0.16em;color:#FF3D8B;opacity:0;pointer-events:none;font-variant-numeric:tabular-nums;`;
    this.recEl.textContent = '● REC 00:00';
    document.body.appendChild(this.recEl);
  }

  measureZones(): void {
    const y = window.scrollY || 0;
    this.zoneTops = Array.from(document.querySelectorAll<HTMLElement>('[data-zone]')).map(
      (el) => el.getBoundingClientRect().top + y,
    );
  }

  frame(scrollY: number, accent: string): void {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.progressEl.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    this.progressEl.style.background = accent;
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.style.opacity = '0'), 1600);
  }

  setRecording(active: boolean, seconds = 0): void {
    this.recEl.style.opacity = active ? '1' : '0';
    if (active) {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(Math.floor(seconds % 60)).padStart(2, '0');
      this.recEl.textContent = `● REC ${m}:${s}`;
    }
  }

  private scrollTo(y: number): void {
    if (this.opts.lenis && !this.opts.reducedMotion) this.opts.lenis.scrollTo(y);
    else window.scrollTo({ top: y, behavior: this.opts.reducedMotion ? 'auto' : 'smooth' });
  }

  bindKeys(onShare: () => void, onExportToggle: () => void): void {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const y = window.scrollY || 0;
      const next = () => this.zoneTops.find((z) => z > y + 8);
      const prev = () => [...this.zoneTops].reverse().find((z) => z < y - 8);
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
        case 'PageDown': {
          const target = next();
          if (target !== undefined) {
            this.scrollTo(target);
            e.preventDefault();
          }
          break;
        }
        case 'k':
        case 'ArrowUp':
        case 'PageUp': {
          const target = prev();
          if (target !== undefined) {
            this.scrollTo(target);
            e.preventDefault();
          }
          break;
        }
        case 'Home':
          this.scrollTo(0);
          e.preventDefault();
          break;
        case 'End':
          this.scrollTo(document.documentElement.scrollHeight);
          e.preventDefault();
          break;
        case 's':
          onShare();
          break;
        case 'e':
          onExportToggle();
          break;
        default: {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= 7) {

            const idx = n <= 5 ? n + 2 : n === 6 ? 8 : 9;
            const target = this.zoneTops[idx];
            if (target !== undefined) this.scrollTo(target);
          }
        }
      }
    });
  }
}
