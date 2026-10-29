// Кино-стиль первого экрана (превью /preview-cine/, html[data-look="cine"]): стеклянные мышцы с волокнами, кожа-контур,
// дымчатая кость, золотые мениски, фиолетовые связки, облако боли -> мятный ореол. Цвета как в рендерах docs/preview/cine-test/final.
import { T, sm, sm5, glowTexture, mix } from './scene-kit.js';

const NORMAL = 1, ADD = 2, BACK = 1, DOUBLE = 2; // в обрезанной three r149 нет констант blending/side

const C = {
  dark: { bone: ['#8E92A8', '#C9C6E8', '#EEF3FF'], skin: ['#6A55D6', '#8F7CF0', '#D9D2FF'], muscle: ['#3C56E0', '#6A55D6', '#BFC8FF'],
    lig: ['#8F7CF0', '#C4B8FF'], men: ['#E9D3A0', '#FFF1CC'], halo: '#7F86FF',
    pain: ['#FF4A36', '#FF7A4A', '#FF8FA0'], heal: '#C7E0F6', vign: '#14203A' },
  light: { bone: ['#5F4BCB', '#2E2170', '#2E2170'], skin: ['#5A4AB0', '#5A4AB0', '#5A4AB0'], muscle: ['#8C7FE0', '#A99CF2', '#8C7FE0'],
    lig: ['#6A55D6', '#3A2C80'], men: ['#C99A3C', '#9C6F1E'], halo: '#8F7CF0',
    pain: ['#D63A2E', '#E25A4C', '#EE8F98'], heal: '#5E9BD8', vign: '#FFFFFF' }, // 29.10: красный, не оранжевый (аудит P2-1)
};
// стекло по теме: [a0 тело, ar край, pw степень края, fib волокна, rb подсветка края, kt бедро, kb низ голени, hot белёсое ядро на ободе]
const P = {
  dark: { bone: [.035, 1.25, 2.2, .05, 1.0, .55, .7, .75], muscle: [.018, .34, 1.9, .17, .7, .34, .55, .3], skin: [.0, .62, 3.0, 0, .6, .45, .6, .45] },
  light: { bone: [.02, 1.05, 2.1, .03, 0, .5, .65, 0], muscle: [.0015, .11, 2.6, .045, 0, .25, .45, 0], skin: [.0, .26, 5.0, 0, 0, .35, .5, 0] },
};
// ореол вокруг силуэта (второй проход тех же мешей, раздутых по нормали, задние грани): [толщина мм, яркость, степень]
const HALO = { dark: { bone: [5, .2, 2.2], skin: [16, .11, 2.6] }, light: { bone: [4, .08, 2.4], skin: [12, .025, 3] } };

const NOISE = 'float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}' +
  'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}';
// BEND: мышцы и кожа гнутся между бедром и голенью (T, w как у мягких тканей в scene-kit); g: раздувание по нормали, мм (ореол)
const VS = `uniform mat4 T;uniform float g;varying vec3 n;varying vec3 v;varying vec3 op;
#ifdef BEND
attribute float w;
#endif
void main(){
#ifdef BEND
vec3 tr=mix(position,(T*vec4(position,1.)).xyz,w);vec3 nn=normalize(mix(normal,mat3(T)*normal,w));
#else
vec3 tr=position;vec3 nn=normal;
#endif
tr+=nn*g;op=position;vec4 mv=modelViewMatrix*vec4(tr,1.);n=normalize(normalMatrix*nn);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
// op.z в мм модели; j0 центр сустава; kt/kb приглушение бедра и низа голени; края обрезки модели уходят в ноль
const FADE = 'float d=op.z-j0;float k=mix(1.,kt,smoothstep(60.,220.,d))*mix(1.,kb,smoothstep(60.,200.,-d))*(1.-smoothstep(top.x,top.y,d))*(1.-smoothstep(bot.x,bot.y,-d))*smoothstep(xf.x,xf.y,op.x);';
const FS = `uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;uniform float a0;uniform float ar;uniform float pw;uniform float fib;uniform float rb;uniform float kt;uniform float kb;uniform float j0;uniform vec2 top;uniform vec2 bot;uniform vec2 xf;uniform float o;uniform float rimCol;uniform float hot;
varying vec3 n;varying vec3 v;varying vec3 op;${NOISE}
void main(){
float f=pow(1.-abs(dot(n,v)),pw);
float s=vn(vec3(op.x*.55,op.y*.55,op.z*.035))*.65+vn(vec3(op.x*1.4,op.y*1.4,op.z*.09))*.35;s=smoothstep(.42,.86,s);
float s2=vn(op*vec3(.035,.035,.012));
${FADE}
vec3 col=mix(mix(c1,c2,s2),mix(c1,c2,f),rimCol)*(1.+f*rb);col=mix(col,c3,clamp(pow(f,2.5)*hot,0.,1.));
gl_FragColor=vec4(col,(a0+ar*f+fib*s)*k*o);}`;
const HALO_FS = `uniform vec3 c1;uniform float a0;uniform float pw;uniform float kt;uniform float kb;uniform float j0;uniform vec2 top;uniform vec2 bot;uniform vec2 xf;uniform float o;varying vec3 n;varying vec3 v;varying vec3 op;
void main(){${FADE}float h=pow(abs(dot(n,v)),pw);gl_FragColor=vec4(c1,h*a0*k*o);}`;

// общие части для кино-плеча #joints (shoulder-a.js): шейдеры, цвета, параметры стекла
export const CINE = { NORMAL, ADD, BACK, DOUBLE, C, P, HALO, NOISE, FADE, FS, HALO_FS };

export function cineKit(P0) {
  const mats = { bone: [], muscle: [], skin: [] }, halos = [], glowTex = glowTexture();
  const uni = (bend, extra) => Object.assign({ c1: { value: new T.Color() }, a0: { value: 0 }, pw: { value: 2 }, kt: { value: 1 }, kb: { value: 1 }, j0: { value: P0.z }, top: { value: { x: 205, y: 258 } }, bot: { value: { x: 185, y: 248 } }, xf: { value: { x: -1e5, y: -9e4 } }, o: { value: 1 }, g: { value: 0 },
    T: bend || { value: new T.Object3D().matrix } }, extra);
  const mk = (kind, bend) => {
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: DOUBLE, vertexShader: VS, fragmentShader: FS, defines: bend ? { BEND: '' } : {},
      uniforms: uni(bend, { c2: { value: new T.Color() }, c3: { value: new T.Color() }, ar: { value: 0 }, fib: { value: 0 }, rb: { value: 0 }, hot: { value: 0 }, rimCol: { value: kind === 'bone' ? 1 : .35 } }) });
    mats[kind].push(m); return m;
  };
  // второй проход: та же геометрия, раздутая по нормали, задние грани, мягкий край наружу (имитация bloom без постобработки)
  const halo = (geo, kind, parent, bend, order) => {
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: BACK, blending: ADD, vertexShader: VS, fragmentShader: HALO_FS, defines: bend ? { BEND: '' } : {}, uniforms: uni(bend) });
    const mesh = new T.Mesh(geo, m); mesh.position.copy(P0).negate(); mesh.renderOrder = order; mesh.frustumCulled = false; parent.add(mesh); halos.push({ m, kind }); return mesh;
  };
  // вес изгиба по высоте относительно сустава: ниже 365 мм целиком голень, выше 430 целиком бедро
  const bendW = geo => {
    const p = geo.attributes.position, w = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) w[i] = 1 - sm(P0.z - 35, P0.z + 30, p.getZ(i));
    geo.setAttribute('w', new T.Float32BufferAttribute(w, 1));
  };
  const sprite = (parent, pos, order) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    s.position.copy(pos); s.renderOrder = order; parent.add(s); return s;
  };
  let dark = true, vign, core, mid, outer, mint, mint2;
  return {
    bone(geo, parent) { // верх кости (срез бедренной) растворяется длинно, как низ голени, без твёрдого края
      geo.computeBoundingBox(); const zt = geo.boundingBox.max.z - P0.z, top = zt > 120 ? [Math.max(60, zt - 170), zt - 6] : [205, 258];
      const h = halo(geo, 'bone', parent, null, -1), m = mk('bone'); h.material.uniforms.top.value = { x: top[0], y: top[1] }; m.uniforms.top.value = { x: top[0], y: top[1] }; return m; },
    // мышцы и кожа из knee-cine.draco.glb: в world, как мягкие ткани (позиция -P), изгиб считает шейдер
    tissue(scene, world, bend) {
      scene.traverse(o => {
        if (!o.isMesh) return;
        const kind = o.name === 'skin' ? 'skin' : 'muscle';
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        bendW(o.geometry);
        const mesh = new T.Mesh(o.geometry, mk(kind, bend)); mesh.position.copy(P0).negate(); mesh.renderOrder = kind === 'skin' ? 7 : 0; mesh.frustumCulled = false; world.add(mesh);
        if (kind === 'skin') halo(o.geometry, 'skin', world, bend, -1);
      });
    },
    // свечение у сустава: виньетка за коленом, облако боли (ядро, тёплое гало, розовый край), мятный ореол в два слоя
    glow(world, center) {
      vign = sprite(world, center, -2); outer = sprite(world, center, 8); mid = sprite(world, center, 8); core = sprite(world, center, 9);
      mint2 = sprite(world, center, 8); mint = sprite(world, center, 9);
    },
    recolor(dk) {
      dark = dk; const c = dk ? C.dark : C.light, p = dk ? P.dark : P.light, hp = dk ? HALO.dark : HALO.light;
      for (const kind of ['bone', 'muscle', 'skin']) mats[kind].forEach(m => {
        const u = m.uniforms, [a0, ar, pw, fib, rb, kt, kb, hot] = p[kind], cc = c[kind];
        u.c1.value.set(cc[0]); u.c2.value.set(cc[1]); u.c3.value.set(cc[2]);
        u.a0.value = a0; u.ar.value = ar; u.pw.value = pw; u.fib.value = fib; u.rb.value = rb; u.kt.value = kt; u.kb.value = kb; u.hot.value = hot;
        m.blending = dk ? ADD : NORMAL;
      });
      halos.forEach(({ m, kind }) => {
        const u = m.uniforms, [g, a, pw] = hp[kind], [, , , , , kt, kb] = p[kind === 'bone' ? 'bone' : 'skin'];
        u.c1.value.set(c.halo); u.g.value = g; u.a0.value = a; u.pw.value = pw; u.kt.value = kt; u.kb.value = kb;
        m.blending = dk ? ADD : NORMAL;
      });
      const add = dk ? ADD : NORMAL;
      for (const s of [outer, mid, core, mint, mint2]) s && (s.material.blending = add);
      if (vign) { vign.material.color.set(c.vign); vign.visible = dk; }
      core?.material.color.set(c.pain[0]); mid?.material.color.set(c.pain[1]); outer?.material.color.set(c.pain[2]);
      mint?.material.color.set(c.heal); mint2?.material.color.set(c.heal);
    },
    // мягкие ткани модели knee-z (softMat): мениски золото, связки фиолет; k: подсветка на своём этапе
    paintSoft(soft, e = {}) {
      const c = dark ? C.dark : C.light;
      soft.forEach(({ mat, kind }) => {
        const k = e[kind] || 0, u = mat.uniforms, col = kind === 'men' ? c.men : c.lig;
        u.base.value.set(col[0]); u.rim.value.set(col[1]);
        if (dark) { u.a0.value = mix(kind === 'men' ? .42 : .3, .85, k); u.a1.value = 1; }
        else { u.a0.value = mix(kind === 'men' ? .62 : .42, .92, k); u.a1.value = 1; }
        u.g.value = k * (kind === 'lat' ? 1.3 : .7);
        mat.blending = dark ? ADD : NORMAL;
      });
    },
    // heal 0..1 (боль -> ореол), pulse 0..1 (дыхание первые секунды), emph >= 1 (этап с болью), size: радиус облака, мм; quiet: тише ткани под заголовком
    frame({ heal, pulse, sec, emph, size, quiet = 0, dim = 0 }) {
      if (!core) return;
      const o = 1 - .45 * quiet;
      for (const m of mats.muscle) m.uniforms.o.value = o;
      for (const m of mats.skin) m.uniforms.o.value = o;
      halos.forEach(({ m, kind }) => { m.uniforms.o.value = kind === 'skin' ? o : 1; });
      const b = .5 + .5 * Math.sin(sec * 2.2) * pulse, pain = (1 - sm5(.15, .75, heal)) * (1 - .4 * dim), e = 1 + (emph - 1) * .35, dk = dark ? 1 : 0;
      core.scale.setScalar(size * 1.15 * (.95 + .2 * b) * e); core.material.opacity = (dk ? .85 : .34) * (.75 + .25 * b) * pain;
      mid.scale.setScalar(size * 2.2 * (1 + .1 * b) * e); mid.material.opacity = (dk ? .42 : .18) * pain;
      outer.scale.setScalar(size * 4.2 * (1 + .06 * b) * e); outer.material.opacity = (dk ? .2 : .1) * pain;
      const h = sm5(.3, 1, heal);
      mint.scale.setScalar(size * mix(2.4, 4.4, h)); mint.material.opacity = (dk ? .4 : .22) * h;
      mint2.scale.setScalar(size * mix(4, 7.5, h)); mint2.material.opacity = (dk ? .2 : .12) * h;
      vign.scale.setScalar(size * 10); vign.material.opacity = .85;
    },
  };
}
