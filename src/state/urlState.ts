

export interface ShareState {
  v: 1;
  seed: number;
  pal: string;
  prefs?: { motion?: string; density?: string; bloom?: number; grain?: number };
  params?: Record<string, Record<string, number>>;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromB64url = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

export async function encodeState(state: ShareState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));

  try {
    const packed = await pipe(json, new CompressionStream('deflate-raw'));
    return 'd.' + b64url(packed);
  } catch {
    return 'j.' + b64url(json);
  }
}

export async function decodeState(fragment: string): Promise<ShareState | null> {
  try {
    const [kind, payload] = fragment.split('.', 2);
    if (!payload) return null;
    const bytes = fromB64url(payload);
    const json =
      kind === 'd'
        ? new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
        : new TextDecoder().decode(bytes);
    const s = JSON.parse(json) as ShareState;
    if (!s || s.v !== 1) return null;

    if (typeof s.seed !== 'number' || !Number.isFinite(s.seed)) s.seed = 1;
    if (typeof s.pal !== 'string') s.pal = 'spectral';
    if (s.params !== undefined) {
      if (s.params === null || typeof s.params !== 'object') {
        delete s.params;
      } else {
        for (const [k, bag] of Object.entries(s.params)) {
          if (bag === null || typeof bag !== 'object') {
            delete s.params[k];
            continue;
          }
          for (const [pk, pv] of Object.entries(bag)) {
            if (typeof pv !== 'number' || !Number.isFinite(pv)) delete bag[pk];
          }
        }
      }
    }
    if (s.prefs !== null && typeof s.prefs === 'object') {

    } else if (s.prefs !== undefined) {
      delete s.prefs;
    }
    return s;
  } catch {
    return null;
  }
}

export function readStateFromLocation(): Promise<ShareState | null> {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  return m ? decodeState(m[1]!) : Promise.resolve(null);
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;

export function writeStateToLocation(state: ShareState): void {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    const enc = await encodeState(state);
    history.replaceState(null, '', `#s=${enc}`);
  }, 250);
}
