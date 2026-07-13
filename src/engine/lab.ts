export {};

const mode = new URLSearchParams(location.search).get('mode') ?? 'conway';

switch (mode) {
  case 'fft':
    await import('./lab-fft');
    break;
  case 'ltl':
    await import('./lab-ltl');
    break;
  case 'lenia':
    await import('./lab-lenia');
    break;
  case 'rd':
    await import('./lab-rd');
    break;
  case 'explorer':
    await import('./lab-explorer');
    break;
  case 'nca':
    await import('./lab-nca');
    break;
  default:
    await import('./lab-conway');
    break;
}
