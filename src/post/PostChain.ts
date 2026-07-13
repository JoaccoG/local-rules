

import * as THREE from 'three';
import { QUAD_VERT, BRIGHT_FRAG, BLUR_FRAG, COMP_FRAG } from '../visuals/gl/shaders';

const mkRT = (w: number, h: number) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

export class PostChain {
  readonly sceneRT: () => THREE.WebGLRenderTarget;
  private renderer: THREE.WebGLRenderer;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private rts: THREE.WebGLRenderTarget[] = [];
  private _sceneRT!: THREE.WebGLRenderTarget;
  private A1!: THREE.WebGLRenderTarget;
  private T1!: THREE.WebGLRenderTarget;
  private A2!: THREE.WebGLRenderTarget;
  private T2!: THREE.WebGLRenderTarget;
  private A3!: THREE.WebGLRenderTarget;
  private T3!: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer, opts: { bloom: number; grain: number }) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.postScene.add(this.quad);
    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: { tSrc: { value: null }, uThresh: { value: 0.6 } },
      depthWrite: false,
      depthTest: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tSrc: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthWrite: false,
      depthTest: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COMP_FRAG,
      uniforms: {
        tScene: { value: null },
        tB1: { value: null },
        tB2: { value: null },
        tB3: { value: null },
        uBloom: { value: opts.bloom },
        uGlitch: { value: 0 },
        uTime: { value: 0 },
        uGrain: { value: opts.grain },
        uCA: { value: 1.5 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthWrite: false,
      depthTest: false,
    });
    this.sceneRT = () => this._sceneRT;
  }

  resize(w: number, h: number): void {
    this.rts.forEach((rt) => rt.dispose());
    this._sceneRT = mkRT(w, h);
    this.A1 = mkRT(w >> 1, h >> 1);
    this.T1 = mkRT(w >> 1, h >> 1);
    this.A2 = mkRT(w >> 2, h >> 2);
    this.T2 = mkRT(w >> 2, h >> 2);
    this.A3 = mkRT(w >> 3, h >> 3);
    this.T3 = mkRT(w >> 3, h >> 3);
    this.rts = [this._sceneRT, this.A1, this.T1, this.A2, this.T2, this.A3, this.T3];
    (this.compMat.uniforms.uRes!.value as THREE.Vector2).set(w, h);
  }

  setGrain(v: number): void {
    this.compMat.uniforms.uGrain!.value = v;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCam);
  }

  composite(bloom: number, glitch: number, time: number): void {
    const u = (m: THREE.ShaderMaterial) => m.uniforms as Record<string, THREE.IUniform>;
    u(this.brightMat).tSrc!.value = this._sceneRT.texture;
    this.pass(this.brightMat, this.A1);
    (u(this.blurMat).uRes!.value as THREE.Vector2).set(this.A1.width, this.A1.height);
    u(this.blurMat).tSrc!.value = this.A1.texture;
    (u(this.blurMat).uDir!.value as THREE.Vector2).set(1, 0);
    this.pass(this.blurMat, this.T1);
    u(this.blurMat).tSrc!.value = this.T1.texture;
    (u(this.blurMat).uDir!.value as THREE.Vector2).set(0, 1);
    this.pass(this.blurMat, this.A1);
    (u(this.blurMat).uRes!.value as THREE.Vector2).set(this.A2.width, this.A2.height);
    u(this.blurMat).tSrc!.value = this.A1.texture;
    (u(this.blurMat).uDir!.value as THREE.Vector2).set(1, 0);
    this.pass(this.blurMat, this.A2);
    u(this.blurMat).tSrc!.value = this.A2.texture;
    (u(this.blurMat).uDir!.value as THREE.Vector2).set(0, 1);
    this.pass(this.blurMat, this.T2);
    (u(this.blurMat).uRes!.value as THREE.Vector2).set(this.A3.width, this.A3.height);
    u(this.blurMat).tSrc!.value = this.T2.texture;
    (u(this.blurMat).uDir!.value as THREE.Vector2).set(1, 0);
    this.pass(this.blurMat, this.A3);
    u(this.blurMat).tSrc!.value = this.A3.texture;
    (u(this.blurMat).uDir!.value as THREE.Vector2).set(0, 1);
    this.pass(this.blurMat, this.T3);
    u(this.compMat).tScene!.value = this._sceneRT.texture;

    u(this.compMat).tB1!.value = this.A1.texture;
    u(this.compMat).tB2!.value = this.T2.texture;
    u(this.compMat).tB3!.value = this.T3.texture;
    u(this.compMat).uBloom!.value = bloom;
    u(this.compMat).uGlitch!.value = glitch;
    u(this.compMat).uTime!.value = time;
    this.pass(this.compMat, null);
  }

  dispose(): void {
    this.rts.forEach((rt) => rt.dispose());
  }
}
