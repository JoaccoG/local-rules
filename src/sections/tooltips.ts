

interface Tip {
  title: string;
  accent: string;
  body: string;
}

const TIPS: Record<string, Tip> = {
  'row-state': {
    title: 'Cell state',
    accent: '#3A4068',
    body: 'How much one cell can hold. One bit is alive-or-dead, nothing between. One real number lets a cell be 0.37 alive. Sixteen numbers give a cell its colour, its aliveness, and twelve channels of private memory that training invents.',
  },
  'row-hood': {
    title: 'Neighbourhood',
    accent: '#3A4068',
    body: 'Who a cell consults before changing. Conway polls its eight touching cells, all counted equally. Lenia weighs hundreds of neighbours by distance through a ring-shaped kernel of radius 13. The Neural CA senses its 3×3 patch as directional gradients, and a trained network decides what they mean.',
  },
  'row-time': {
    title: 'Time',
    accent: '#3A4068',
    body: 'How the clock ticks. Integer steps: the whole grid updates at once, like frames of film. Continuous dt: many tiny fractional updates approximate smoothly flowing time. Asynchronous: each cell applies its update only on a private coin flip, so neighbours drift out of phase — the lockstep is broken, like living tissue.',
  },
  'row-author': {
    title: 'Rule author',
    accent: '#3A4068',
    body: "Who wrote the law of the universe. Conway's table and Lenia's growth curve were chosen by people. The Neural CA's rule is 8,336 numbers fitted by an optimiser until a creature grew — nobody wrote it, and no line of it says how to heal.",
  },
  'col-conway': {
    title: 'Conway · 1970',
    accent: '#4DE1FF',
    body: 'The chessboard universe. The simplest settings on every dial — yet people have built clocks, computers and self-copying machines inside it.',
  },
  'col-lenia': {
    title: 'Lenia · 2019',
    accent: '#2BFFB0',
    body: 'Three dials turned continuous: state, space and time. Out comes a bestiary of hundreds of catalogued lifeforms that swim, spin, pulse and die.',
  },
  'col-nca': {
    title: 'Neural CA · 2020',
    accent: '#FF7A2F',
    body: 'The last dial flips: the rule stops being chosen and starts being learned. Gradient descent fits it until a single pixel grows into a creature — and regrows it when cut.',
  },
};

const MONO = "font-family:'Martian Mono','JetBrains Mono',monospace;";
const SERIF = "font-family:'Newsreader','Literata',serif;";

export function mountDialTooltips(reducedMotion: boolean): void {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'tooltip');
  panel.id = 'dial-tooltip';
  panel.style.cssText =
    'position:fixed;z-index:60;max-width:320px;background:#0C0D18;border:1px solid #232741;' +
    'border-radius:2px;padding:13px 16px 14px;pointer-events:none;opacity:0;' +
    (reducedMotion
      ? ''
      : 'transition:opacity 0.18s cubic-bezier(0.33,1,0.68,1),transform 0.18s cubic-bezier(0.33,1,0.68,1);transform:translateY(4px);');
  const line = document.createElement('div');
  line.style.cssText = 'height:1px;margin:-13px -16px 11px;background:#3A4068;';
  const title = document.createElement('div');
  title.style.cssText = `${MONO}font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#EDEBF5;margin-bottom:8px;`;
  const body = document.createElement('div');
  body.style.cssText = `${SERIF}font-optical-sizing:auto;font-size:15px;line-height:1.55;color:#9A9AB8;text-wrap:pretty;`;
  panel.append(line, title, body);
  document.body.appendChild(panel);

  let current: HTMLElement | null = null;

  const position = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let x = r.left + r.width / 2 - pw / 2;
    x = Math.max(16, Math.min(x, innerWidth - pw - 16));
    let y = r.top - ph - 10;
    if (y < 76) y = r.bottom + 10;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  };

  const show = (el: HTMLElement): void => {
    const tip = TIPS[el.getAttribute('data-tip') ?? ''];
    if (!tip) return;
    if (current === el) return;
    current = el;
    line.style.background = tip.accent;
    title.textContent = tip.title;
    title.style.color = tip.accent === '#3A4068' ? '#EDEBF5' : tip.accent;
    body.textContent = tip.body;
    panel.style.opacity = '0';
    el.setAttribute('aria-describedby', 'dial-tooltip');

    requestAnimationFrame(() => {
      if (current !== el) return;
      position(el);
      panel.style.opacity = '1';
      if (!reducedMotion) panel.style.transform = 'translateY(0)';
    });
  };

  const hide = (el: HTMLElement | null): void => {
    if (el && current !== el) return;
    current?.removeAttribute('aria-describedby');
    current = null;
    panel.style.opacity = '0';
    if (!reducedMotion) panel.style.transform = 'translateY(4px)';
  };

  const hoverCapable = matchMedia('(hover: hover)').matches;
  document.querySelectorAll<HTMLElement>('[data-tip]').forEach((el) => {
    if (hoverCapable) {
      el.addEventListener('mouseenter', () => show(el));
      el.addEventListener('mouseleave', () => hide(el));
    }
    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', () => hide(el));
  });

  window.addEventListener('scroll', () => current && position(current), { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide(null);
  });
}
