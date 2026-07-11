

import * as THREE from 'three';
import { POINTS_VERT, POINTS_FRAG, SUBJ_VERT, SUBJ_FRAG } from './shaders';
import { PostChain } from '../../post/PostChain';
import { hex2v, lerp3, type Vec3 } from '../../lib/math';
import { mulberry32 } from '../../lib/prng';

export type Density = 'cinema' | 'balanced' | 'light';

export interface SceneOpts {
  density?: Density;
  bloom?: number;
  grain?: number;
  freeze?: boolean;
  seed?: number;
}

export interface GLTargets {
  field?: number;
  amp?: number;
  subj?: number;
  tintAmt?: number;
  bloom?: number;
  maskAmt?: number;
  cx?: number;
  cy?: number;
  scalePx?: number;
  chA?: number;
  chB?: number;
  chMix?: number;
  grow?: number;
  peel?: number;
  bite?: number;
  heal?: number;
  expand?: number;
  accent?: Vec3;
  bg?: Vec3;
  palA?: Vec3;
  palB?: Vec3;
}

const SIDES: Record<Density, number> = { cinema: 384, balanced: 300, light: 208 };

const K = {
  expand: 0.045,
  amp: 0.06,
  field: 0.08,
  subj: 0.1,
  tintAmt: 0.06,
  chMix: 0.12,
  grow: 0.28,
  peel: 0.28,
  bite: 0.3,
  heal: 0.3,
  bloom: 0.06,
  maskAmt: 0.1,
  cx: 0.09,
  cy: 0.09,
  scalePx: 0.09,
} as const;

type ScalarKey = keyof typeof K;

interface State {
  expand: number;
  amp: number;
  field: number;
  subj: number;
  tintAmt: number;
  chA: number;
  chB: number;
  chMix: number;
  grow: number;
  peel: number;
  bite: number;
  heal: number;
  bloom: number;
  maskAmt: number;
  accent: Vec3;
  bg: Vec3;
  palA: Vec3;
  palB: Vec3;
  cx: number;
  cy: number;
  scalePx: number;
}

export class SceneGL {
  private renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
  private points: THREE.Points;
  private subject: THREE.Mesh;
  private puni: Record<string, THREE.IUniform>;
  private suni: Record<string, THREE.IUniform>;
  private post: PostChain;
  private cur: State;
  private tgt: State;
  private glitch = 0;
  private time = 0;
  private last = performance.now();
  private raf = 0;
  private frozen: boolean;
  private W = 1;
  private H = 1;
  private halfW = 1;
  private halfH = 1;
  readonly dpr: number;

  constructor(canvas: HTMLCanvasElement, opts: SceneOpts = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.autoClear = true;
    this.cam.position.set(0, 0, 3);
    this.frozen = !!opts.freeze;

    const side = SIDES[opts.density ?? 'cinema'];
    const N = side * side;
    const pos = new Float32Array(N * 3);
    const rnd = new Float32Array(N);
    const rand = mulberry32(opts.seed ?? 1);
    let k = 0;
    for (let j = 0; j < side; j++)
      for (let i = 0; i < side; i++) {
        pos[k * 3] = (i / (side - 1)) * 2 - 1;
        pos[k * 3 + 1] = (j / (side - 1)) * 2 - 1;
        pos[k * 3 + 2] = 0;
        rnd[k] = rand();
        k++;
      }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pgeo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this.puni = {
      uTime: { value: 0 },
      uExpand: { value: 0.06 },
      uAmp: { value: 0.55 },
      uSize: { value: 1.6 },
      uDpr: { value: this.dpr },
      uSpread: { value: new THREE.Vector2(1, 1) },
      uColA: { value: new THREE.Vector3(...hex2v('#4DE1FF')) },
      uColB: { value: new THREE.Vector3(...hex2v('#8B5CF6')) },
      uTint: { value: new THREE.Vector3(...hex2v('#4DE1FF')) },
      uTintAmt: { value: 0.1 },
      uIntensity: { value: 0 },
      uMask: { value: new THREE.Vector4(-9999, -9999, 1, 1) },
      uMaskAmt: { value: 0 },
    };
    const pmat = new THREE.ShaderMaterial({
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      uniforms: this.puni,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(pgeo, pmat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    const plane = new THREE.PlaneGeometry(2, 2);
    const sgeo = new THREE.InstancedBufferGeometry();
    sgeo.index = plane.index;
    sgeo.attributes.position = plane.attributes.position!;
    sgeo.attributes.uv = plane.attributes.uv!;
    const lay = new Float32Array(16);
    for (let i = 0; i < 16; i++) lay[i] = i;
    sgeo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(lay, 1));
    sgeo.instanceCount = 16;
    this.suni = {
      uTime: { value: 0 },
      uChA: { value: 0 },
      uChB: { value: 0 },
      uChMix: { value: 1 },
      uIntensity: { value: 0 },
      uGrow: { value: 1 },
      uPeel: { value: 0 },
      uBite: { value: 0 },
      uHeal: { value: 0 },
      uIrid: { value: 0 },
      uBiteA: { value: new THREE.Vector2(0.3, 0.16) },
      uBiteB: { value: new THREE.Vector2(0.3, 0.16) },
      uAcc: { value: new THREE.Vector3(...hex2v('#4DE1FF')) },
    };
    const smat = new THREE.ShaderMaterial({
      vertexShader: SUBJ_VERT,
      fragmentShader: SUBJ_FRAG,
      uniforms: this.suni,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.subject = new THREE.Mesh(sgeo, smat);
    this.subject.frustumCulled = false;
    this.subject.renderOrder = 2;
    this.scene.add(this.subject);

    this.post = new PostChain(this.renderer, {
      bloom: opts.bloom ?? 0.8,
      grain: opts.grain ?? 0.028,
    });

    this.cur = {
      expand: 0.06,
      amp: 0.55,
      field: 0,
      subj: 0,
      tintAmt: 0.1,
      chA: 0,
      chB: 0,
      chMix: 1,
      grow: 1,
      peel: 0,
      bite: 0,
      heal: 0,
      bloom: opts.bloom ?? 0.8,
      maskAmt: 0,
      accent: hex2v('#4DE1FF'),
      bg: hex2v('#06070D'),
      palA: hex2v('#4DE1FF'),
      palB: hex2v('#8B5CF6'),
      cx: 0,
      cy: 0,
      scalePx: 600,
    };
    this.tgt = {
      ...this.cur,
      accent: [...this.cur.accent],
      bg: [...this.cur.bg],
      palA: [...this.cur.palA],
      palB: [...this.cur.palB],
    };

    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  resize = (): void => {
    this.W = this.canvas.clientWidth || window.innerWidth;
    this.H = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(this.W, this.H, false);
    this.cam.aspect = this.W / this.H;
    this.cam.updateProjectionMatrix();
    this.halfH = Math.tan((this.cam.fov * Math.PI) / 360) * this.cam.position.z;
    this.halfW = this.halfH * this.cam.aspect;
    (this.puni.uSpread!.value as THREE.Vector2).set(this.halfW * 1.18, this.halfH * 1.18);
    this.post.resize(Math.round(this.W * this.dpr), Math.round(this.H * this.dpr));
  };

  private stepState(): void {
    for (const key of Object.keys(K) as ScalarKey[]) {
      const kk = this.frozen ? 1 : K[key];
      this.cur[key] += (this.tgt[key] - this.cur[key]) * kk;
    }

    if (this.cur.chA !== this.tgt.chA || this.cur.chB !== this.tgt.chB) {
      this.cur.chMix = this.tgt.chMix;
    }
    this.cur.chA = this.tgt.chA;
    this.cur.chB = this.tgt.chB;
    const ck = this.frozen ? 1 : 0.07;
    this.cur.accent = lerp3(this.cur.accent, this.tgt.accent, ck);
    this.cur.bg = lerp3(this.cur.bg, this.tgt.bg, this.frozen ? 1 : 0.05);
    this.cur.palA = lerp3(this.cur.palA, this.tgt.palA, ck);
    this.cur.palB = lerp3(this.cur.palB, this.tgt.palB, ck);
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (!this.frozen) this.time += dt;
    this.glitch = Math.max(0, this.glitch - dt * 2.6);
    this.stepState();
    const { cur, puni, suni, cam, time } = this;

    cam.position.x = Math.sin(time * 0.05) * 0.05;
    cam.position.y = Math.cos(time * 0.043) * 0.035;
    cam.lookAt(0, 0, 0);

    puni.uTime!.value = time * 1.7;
    puni.uExpand!.value = cur.expand;
    puni.uAmp!.value = cur.amp;
    puni.uIntensity!.value = cur.field;
    puni.uTintAmt!.value = cur.tintAmt;
    (puni.uColA!.value as THREE.Vector3).set(...cur.palA);
    (puni.uColB!.value as THREE.Vector3).set(...cur.palB);
    (puni.uTint!.value as THREE.Vector3).set(...cur.accent);
    puni.uMaskAmt!.value = cur.maskAmt;
    this.points.visible = cur.field > 0.004;
    suni.uTime!.value = time;
    suni.uChA!.value = cur.chA;
    suni.uChB!.value = cur.chB;
    suni.uChMix!.value = cur.chMix;
    suni.uIntensity!.value = cur.subj;
    suni.uGrow!.value = cur.grow;
    suni.uPeel!.value = cur.peel;
    suni.uBite!.value = cur.bite;
    suni.uHeal!.value = cur.heal;
    suni.uIrid!.value = time * 0.05;
    (suni.uAcc!.value as THREE.Vector3).set(...cur.accent);
    const wx = cur.cx * this.halfW;
    const wy = cur.cy * this.halfH;
    const ws = (cur.scalePx / this.H) * this.halfH;
    this.subject.position.set(wx, wy, 0.001);
    this.subject.scale.set(ws, ws, 1);
    this.subject.rotation.y = -0.5 * cur.peel;
    this.subject.rotation.x = 0.16 * cur.peel;
    this.subject.visible = cur.subj > 0.004;
    this.renderer.setClearColor(new THREE.Color(...cur.bg), 1);
    this.renderer.setRenderTarget(this.post.sceneRT());
    this.renderer.render(this.scene, this.cam);
    this.post.composite(cur.bloom, this.glitch, time);
  };

  setTargets(o: GLTargets): void {
    Object.assign(this.tgt, o);
  }

  setMask(cx: number, cy: number, rx: number, ry: number): void {
    (this.puni.uMask!.value as THREE.Vector4).set(cx, cy, Math.max(rx, 1), Math.max(ry, 1));
  }

  setBiteSegment(ax: number, ay: number, bx: number, by: number): void {
    (this.suni.uBiteA!.value as THREE.Vector2).set(ax, ay);
    (this.suni.uBiteB!.value as THREE.Vector2).set(bx, by);
  }

  subjectLocalFromClient(x: number, y: number): { x: number; y: number } {
    const cxCss = ((this.cur.cx + 1) / 2) * this.W;
    const cyCss = ((1 - this.cur.cy) / 2) * this.H;
    const half = this.cur.scalePx / 2 || 1;
    return { x: (x - cxCss) / half, y: (cyCss - y) / half };
  }

  subjectRect(): { cx: number; cy: number; size: number } {
    return {
      cx: ((this.cur.cx + 1) / 2) * this.W,
      cy: ((1 - this.cur.cy) / 2) * this.H,
      size: this.cur.scalePx,
    };
  }

  pulse(v = 1): void {
    this.glitch = Math.max(this.glitch, v);
  }

  setGrain(v: number): void {
    this.post.setGrain(v);
  }

  freeze(): void {
    this.frozen = true;
  }

  thaw(): void {
    this.frozen = false;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.post.dispose();
  }
}
