

export const NOISE = `
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0));
return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float s=0.0;float a=0.5;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(19.7,7.3);a*=0.5;}return s;}
`;

export const POINTS_VERT = NOISE + `
uniform float uTime,uExpand,uAmp,uSize,uDpr;
uniform vec2 uSpread;
attribute float aRand;
varying float vMix; varying float vT;
void main(){
  vec2 base=position.xy;
  float d=length(base);
  float t=clamp(uExpand*1.9-d*1.25-aRand*0.12,0.0,1.0);
  t=t*t*(3.0-2.0*t);
  vT=t;
  vec2 xy=base*uSpread*mix(0.004,1.0,t);
  float n=fbm(base*3.1+uTime*0.05)-0.5;
  float n2=fbm(base*7.3-uTime*0.035+vec2(31.7))-0.5;
  float z=(n*0.85+n2*0.35)*uAmp*t;
  vMix=clamp(0.5+n*1.4+n2*0.5,0.0,1.0);
  vec4 mv=modelViewMatrix*vec4(xy,z,1.0);
  gl_Position=projectionMatrix*mv;
  float ps=uSize*uDpr*(1.0+n2*0.9)*(2.6/max(0.001,-mv.z));
  gl_PointSize=clamp(ps,1.0,4.0*uDpr);
}`;

export const POINTS_FRAG = `
precision highp float;
uniform vec3 uColA,uColB,uTint;
uniform float uTintAmt,uIntensity,uMaskAmt;
uniform vec4 uMask;
varying float vMix; varying float vT;
void main(){
  vec2 pc=gl_PointCoord-0.5;
  float a=smoothstep(0.5,0.12,length(pc));
  vec3 col=mix(uColA,uColB,vMix);
  col=mix(col,uTint,uTintAmt);
  vec2 dm=(gl_FragCoord.xy-uMask.xy)/max(uMask.zw,vec2(1.0));
  float m=exp(-dot(dm,dm)*2.2);
  col*=1.0-uMaskAmt*m*0.78;
  float lum=uIntensity*(0.16+0.84*vT);
  gl_FragColor=vec4(col*lum,a);
}`;

export const SUBJ_VERT = `
attribute float aLayer;
uniform float uPeel;
varying vec2 vUv; varying float vLayer;
void main(){
  vUv=uv; vLayer=aLayer;
  vec3 p=position;
  p.z-=aLayer*0.14*uPeel;
  p.x+=aLayer*0.05*uPeel;
  p.y+=aLayer*0.03*uPeel;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;

export const SUBJ_FRAG = `
precision highp float;
varying vec2 vUv; varying float vLayer;
uniform float uTime,uChA,uChB,uChMix,uIntensity,uGrow,uPeel,uBite,uHeal,uIrid;
uniform vec2 uBiteA,uBiteB;
uniform vec3 uAcc;
` + NOISE + `
vec3 lad(float h){
  h=fract(h)*6.0;
  vec3 c0=vec3(0.302,0.882,1.0);
  vec3 c1=vec3(0.545,0.361,0.965);
  vec3 c2=vec3(1.0,0.239,0.545);
  vec3 c3=vec3(1.0,0.478,0.184);
  vec3 c4=vec3(0.169,1.0,0.690);
  vec3 c5=vec3(1.0,0.886,0.302);
  float f=fract(h);
  if(h<1.0)return mix(c0,c1,f);
  if(h<2.0)return mix(c1,c2,f);
  if(h<3.0)return mix(c2,c3,f);
  if(h<4.0)return mix(c3,c4,f);
  if(h<5.0)return mix(c4,c5,f);
  return mix(c5,c0,f);
}
vec3 chConway(vec2 p,float t){
  float G=44.0;
  vec2 q=(p*0.5+0.5)*G;
  vec2 g=floor(q);
  float st=floor(t*6.5);
  float r1=hash21(g*1.01+st*7.31);
  float region=vnoise(g*0.11+st*0.05+vec2(3.7));
  float alive=step(0.60,r1)*step(0.42,region);
  float bl=step(0.985,hash21(floor(g/vec2(1.0,3.0))))*step(0.5,fract(t*1.5+hash21(g.yx)));
  alive=max(alive,bl);
  vec2 f=fract(q);
  float pad=step(0.10,f.x)*step(0.10,f.y)*step(f.x,0.96)*step(f.y,0.96);
  float gridl=(step(0.97,f.x)+step(0.97,f.y))*0.045;
  float crisp=step(max(abs(p.x),abs(p.y)),0.985);
  vec3 cold=mix(uAcc,vec3(0.72,0.78,0.88),0.22);
  return cold*(alive*pad*0.40+gridl)*crisp;
}
vec3 chRule(vec2 p,float t){
  vec2 q=p*0.5+0.5;
  vec2 T=floor(q*8.0); vec2 tu=fract(q*8.0);
  float seed=hash21(T*3.7+vec2(11.0));
  float G=floor(mix(6.0,22.0,fract(seed*7.13)));
  float sp=mix(2.0,10.0,fract(seed*3.71));
  float world=step(0.86,seed);
  float dens=mix(0.78,0.55,world);
  float a=step(dens,hash21(floor(tu*G)+T*17.3+floor(t*sp)*3.7));
  float bd=min(min(tu.x,1.0-tu.x),min(tu.y,1.0-tu.y));
  float inn=step(0.035,bd);
  float bright=mix(0.16,0.75,world);
  float crisp=step(max(abs(p.x),abs(p.y)),0.995);
  return uAcc*(a*inn*bright+(1.0-inn)*0.05)*crisp;
}
vec3 chLtL(vec2 p,float t){
  float f=0.0;
  for(int i=0;i<7;i++){
    float fi=float(i);
    vec2 c=vec2(sin(t*0.21+fi*2.4)*0.55+sin(t*0.09+fi*1.1)*0.18,cos(t*0.17+fi*1.9)*0.5);
    float k=mix(7.0,15.0,fract(fi*0.618));
    vec2 d=p-c; f+=exp(-dot(d,d)*k);
  }
  float body=smoothstep(0.55,0.95,f);
  float edge=smoothstep(0.42,0.58,f)-smoothstep(0.72,1.05,f);
  vec2 gq=fract((p*0.5+0.5)*20.0);
  float grid=(step(0.95,gq.x)+step(0.95,gq.y))*0.05*(1.0-body);
  float fade=smoothstep(1.05,0.8,length(p));
  return (uAcc*(body*0.38+edge*0.85)+uAcc*grid)*fade;
}
vec3 chSmooth(vec2 p,float t){
  vec3 col=vec3(0.0);
  for(int i=0;i<4;i++){
    float fi=float(i);
    float dirv=mix(-1.0,1.0,step(0.5,fract(fi*0.5)));
    for(int k=0;k<6;k++){
      float fk=float(k);
      float tk=t-fk*0.16;
      vec2 c=vec2(mod(tk*(0.16+0.045*fi)*dirv,2.6)-1.3,sin(tk*0.5+fi*2.7)*0.55);
      vec2 d=p-c; d.x*=0.8;
      float amp=exp(-dot(d,d)*26.0)*exp(-fk*0.7);
      col+=uAcc*amp;
    }
  }
  float fade=smoothstep(1.1,0.85,length(p));
  return col*0.7*fade;
}
float leniaField(vec2 p,float t){
  vec2 w=p+0.34*(vec2(fbm(p*2.2+t*0.07),fbm(p*2.2-t*0.06+vec2(9.4)))-0.5);
  float f=0.0;
  for(int i=0;i<2;i++){
    float fi=float(i);
    vec2 c=vec2(sin(t*0.10+fi*3.9)*0.30+(fi-0.5)*0.5,cos(t*0.13+fi*2.4)*0.28);
    vec2 q=w-c;
    float r=length(q)*(3.0+fi*0.7);
    float ang=atan(q.y,q.x);
    float ring=exp(-pow(r-0.62,2.0)*16.0)+0.75*exp(-pow(r-0.30,2.0)*30.0)+0.4*exp(-r*r*3.0);
    float lob=0.62+0.38*sin(ang*(5.0+fi*2.0)+t*(0.5+fi*0.23)+fbm(q*2.6+t*0.18)*3.4);
    f+=ring*lob*exp(-r*r*0.32);
  }
  return f;
}
vec3 chLenia(vec2 p,float t){
  float e=0.035;
  float f0=leniaField(p,t);
  float fx=leniaField(p+vec2(e,0.0),t);
  float fy=leniaField(p+vec2(0.0,e),t);
  vec3 n=normalize(vec3((f0-fx)/e,(f0-fy)/e,1.6));
  vec3 L=normalize(vec3(cos(t*0.3)*0.6,sin(t*0.27)*0.6,0.75));
  float dif=max(dot(n,L),0.0);
  float spec=pow(max(dot(reflect(-L,n),vec3(0.0,0.0,1.0)),0.0),26.0);
  vec3 col=uAcc*(f0*0.5+f0*dif*0.55);
  col+=vec3(0.85,1.0,0.95)*spec*smoothstep(0.15,0.9,f0)*0.9;
  col+=uAcc*pow(max(f0,0.0),3.0)*0.30;
  float fade=smoothstep(1.15,0.9,length(p));
  return col*1.35*fade;
}
vec3 chRD(vec2 p,float t){
  vec2 w=p+0.20*(vec2(fbm(p*3.1+t*0.015),fbm(p*3.1-t*0.012+vec2(5.2)))-0.5);
  float s=fbm(w*3.4+vec2(t*0.01,0.0));
  float zone=vnoise(p*1.4+vec2(7.7));
  float band=abs(sin(s*21.0+t*0.25));
  float th=mix(0.80,0.92,zone);
  float v=smoothstep(th,th+0.10,band);
  float g=1.05+0.25*sin(t*0.1);
  v*=smoothstep(g,g-0.5,length(p));
  vec3 col=uAcc*v*0.5;
  col+=uAcc*smoothstep(0.6,1.0,v)*0.22;
  return col;
}
float creature(vec2 p,float t){
  float r=length(p); float a=atan(p.y,p.x);

  float wings=abs(sin(2.0*a));
  float upper=mix(0.52,1.0,smoothstep(-0.25,0.55,sin(a)));
  float pulse=1.0+0.05*sin(t*0.9+abs(cos(a))*1.7);
  float body=0.10*pow(abs(sin(a)),6.0);
  float R=0.24+0.30*pow(wings,1.35)*upper*pulse+body+0.05*(fbm(vec2(abs(cos(a))*1.4,t*0.15))-0.5);
  return smoothstep(R,R-0.07,r);
}
float sdSeg(vec2 p,vec2 a,vec2 b){
  vec2 pa=p-a,ba=b-a;
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0);
  return length(pa-ba*h);
}
vec3 chNCA(vec2 p,float t){
  float r=length(p);
  float aA=atan(p.y,p.x);
  float edgeN=fbm(vec2(aA*1.6,t*0.5))-0.5;
  float front=uGrow*1.25;
  float gmask=smoothstep(front,front-0.10,r-edgeN*0.14*uGrow);
  float shape=creature(p,t);
  float br=uBite*0.44;
  float dB=sdSeg(p,uBiteA,uBiteB);
  float biteMask=smoothstep(br-0.05,br+0.01,dB);
  float body=shape*gmask*biteMask;
  float tis=fbm(p*4.6+vec2(fbm(p*2.7+t*0.12))*1.5);
  vec3 col=lad(tis*0.9+r*0.5-t*0.05+uIrid)*(0.35+0.75*tis)*body;
  col+=lad(r*1.4-t*0.06)*exp(-pow(r-0.30,2.0)*40.0)*0.35*body;
  float fr=smoothstep(0.05,0.0,abs(r-(front-0.03)))*step(uGrow,0.995)*step(0.05,uGrow);
  col+=lad(t*0.07)*fr*1.6*shape;
  float rim=smoothstep(0.06,0.0,abs(dB-br))*step(0.02,uBite);
  col+=lad(t*0.1+0.3)*rim*uHeal*1.3*shape*gmask;
  return col*1.2;
}
vec3 chDispatch(int m,vec2 p,float t){
  if(m==1)return chConway(p,t);
  if(m==2)return chRule(p,t);
  if(m==3)return chLtL(p,t);
  if(m==4)return chSmooth(p,t);
  if(m==5)return chLenia(p,t);
  if(m==6)return chRD(p,t);
  if(m==7)return chNCA(p,t);
  return vec3(0.0);
}
void main(){
  vec2 p=vUv*2.0-1.0;
  float t=uTime;
  if(vLayer>0.5){
    if(uPeel<0.02)discard;
    float s=creature(p,t)*smoothstep(uGrow*1.25,uGrow*1.25-0.1,length(p));
    float l=vLayer;
    vec3 lc=l<1.5?vec3(1.0,0.25,0.30):l<2.5?vec3(0.30,1.0,0.45):l<3.5?vec3(0.35,0.50,1.0):mix(vec3(0.62,0.60,0.85),vec3(0.35,0.33,0.50),fract(l*0.618));
    float al=(l<3.5?0.30:0.10)*uPeel;
    gl_FragColor=vec4(lc*s*al*uIntensity,1.0);
    return;
  }
  int a=int(uChA+0.5); int b=int(uChB+0.5);
  vec3 ca=chDispatch(a,p,t);
  vec3 cb=(uChMix>0.001)?chDispatch(b,p,t):vec3(0.0);
  float n=fbm(p*5.0+vec2(3.3));
  float m=smoothstep(n-0.18,n+0.18,uChMix*1.36-0.18);
  vec3 col=mix(ca,cb,m);
  gl_FragColor=vec4(col*uIntensity,1.0);
}`;

export const QUAD_VERT = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;

export const BRIGHT_FRAG = `
precision highp float; varying vec2 vUv;
uniform sampler2D tSrc; uniform float uThresh;
void main(){
  vec3 c=texture2D(tSrc,vUv).rgb;
  float l=max(c.r,max(c.g,c.b));
  float w=smoothstep(uThresh,uThresh+0.35,l);
  gl_FragColor=vec4(c*w,1.0);
}`;

export const BLUR_FRAG = `
precision highp float; varying vec2 vUv;
uniform sampler2D tSrc; uniform vec2 uDir; uniform vec2 uRes;
void main(){
  vec2 px=uDir/uRes*1.6;
  vec3 c=texture2D(tSrc,vUv).rgb*0.2270;
  c+=texture2D(tSrc,vUv+px*1.3846).rgb*0.3162;
  c+=texture2D(tSrc,vUv-px*1.3846).rgb*0.3162;
  c+=texture2D(tSrc,vUv+px*3.2308).rgb*0.0703;
  c+=texture2D(tSrc,vUv-px*3.2308).rgb*0.0703;
  gl_FragColor=vec4(c,1.0);
}`;

export const COMP_FRAG = `
precision highp float; varying vec2 vUv;
uniform sampler2D tScene,tB1,tB2,tB3;
uniform float uBloom,uGlitch,uTime,uGrain,uCA;
uniform vec2 uRes;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 uv=vUv;
  float slice=step(0.92,hash21(vec2(floor(uv.y*42.0),floor(uTime*24.0))))*uGlitch;
  uv.x+=(hash21(vec2(floor(uv.y*42.0),floor(uTime*24.0)+7.0))-0.5)*0.09*slice;
  vec2 cuv=uv-0.5;
  float rd=dot(cuv,cuv);
  float edge=smoothstep(0.02,0.5,rd);
  vec2 dir=normalize(cuv+vec2(1e-6))*(uCA*edge+uGlitch*4.0)/uRes.x;
  vec3 scene;
  scene.r=texture2D(tScene,uv+dir*1.5).r;
  scene.g=texture2D(tScene,uv).g;
  scene.b=texture2D(tScene,uv-dir*1.5).b;
  vec3 bloom=texture2D(tB1,uv).rgb*0.55+texture2D(tB2,uv).rgb*0.40+texture2D(tB3,uv).rgb*0.30;
  scene+=bloom*uBloom;
  scene+=(hash21(uv*uRes*0.5+vec2(uTime*13.7))-0.5)*uGlitch*0.35;
  scene=1.0-exp(-scene*1.2);
  float g=(hash21(gl_FragCoord.xy+fract(uTime)*vec2(917.0,311.0))-0.5)*uGrain;
  scene+=g;
  scene*=1.0-edge*0.34;
  gl_FragColor=vec4(scene,1.0);
}`;
