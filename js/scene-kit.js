// Общее для сцен hero (колено) и #joints (плечо): математика, шейдер кости, срезы КТ в воркере, точки, цикл кадров, цвета из CSS.
import * as T from '../vendor/three-r149.min.js';
import { root } from './dom.js';
export { T };

export const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
export const sm5 = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * x * (x * (x * 6 - 15) + 10); };
export const mix = (a, b, t) => a + (b - a) * t;
export const kf = (x, K) => { // ключи [прогресс, значение] с мягкой интерполяцией
  if (x <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (x <= K[i][0]) return mix(K[i - 1][1], K[i][1], sm5(K[i - 1][0], K[i][0], x));
  return K.at(-1)[1];
};

const FRESNEL_VS = 'varying vec3 n;varying vec3 v;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}';
const FRESNEL_FS = 'uniform vec3 rim;uniform vec3 base;uniform float a0;uniform float a1;varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(n,v)),2.2);float l=.78+.22*dot(n,normalize(vec3(.4,.8,.5)));gl_FragColor=vec4(mix(base*l,rim,f),mix(a0,a1,f));}';

// мягкие ткани: тот же fresnel, прозрачность и «изгиб» между двумя жёсткими телами (T у вершины w=1 как у большеберцовой, w=0 как у бедра) и скин плеча (isSkinned)
const SKIN = ['beginnormal_vertex', 'skinbase_vertex', 'skinnormal_vertex', 'begin_vertex', 'skinning_vertex'].map(c => `#include <${c}>`).join('\n');
const SOFT_VS = skinned => `uniform mat4 T;uniform float g;attribute float w;varying vec3 n;varying vec3 v;
${skinned ? '#include <skinning_pars_vertex>' : ''}
void main(){
${skinned ? SKIN : 'vec3 transformed=mix(position,(T*vec4(position,1.)).xyz,w);vec3 objectNormal=normalize(mix(normal,mat3(T)*normal,w));'}
transformed+=objectNormal*g;vec4 mv=modelViewMatrix*vec4(transformed,1.);n=normalize(normalMatrix*objectNormal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`; // g: утолщение вдоль нормали, мм (подсветка этапа)
export const softMat = (list, bend, skinned = false) => {
  const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: SOFT_VS(skinned), fragmentShader: FRESNEL_FS,
    uniforms: { rim: { value: new T.Color() }, base: { value: new T.Color() }, a0: { value: .5 }, a1: { value: .95 }, g: { value: 0 }, T: bend || { value: new T.Object3D().matrix } } });
  list.push(m); return m;
};
// вес изгиба по высоте z: 1 у нижнего конца (голень), 0 у верхнего (бедро); flat: целиком голень
export const addBend = (geo, flat) => {
  geo.computeBoundingBox(); const { min, max } = geo.boundingBox, p = geo.attributes.position, w = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) w[i] = flat ? 1 : 1 - sm(min.z, max.z, p.getZ(i));
  geo.setAttribute('w', new T.Float32BufferAttribute(w, 1));
};

export const loadGlb = (url, dracoPath) => new Promise((ok, fail) => {
  const draco = new T.DRACOLoader().setDecoderPath(dracoPath);
  new T.GLTFLoader().setDRACOLoader(draco).load(url, g => { draco.dispose(); ok(g); }, undefined, fail);
});

// цвета берём из CSS (light-dark не читается как переменная, поэтому через вычисленный color)
let probe;
const cssColor = name => {
  probe ||= Object.assign(document.body.appendChild(document.createElement('i')), { hidden: true });
  probe.style.color = `var(${name})`; return new T.Color(getComputedStyle(probe).color);
};
export const palette = () => ({
  dark: root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches,
  acc: cssColor('--accent'), txt: cssColor('--text'),
});
export const RED = new T.Color(0xE5484D);

export const fresnel = list => {
  const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: FRESNEL_VS, fragmentShader: FRESNEL_FS,
    uniforms: { rim: { value: new T.Color() }, base: { value: new T.Color() }, a0: { value: .1 }, a1: { value: .9 } } });
  list.push(m); return m;
};
export const paint = (fres, lines, { dark, acc, txt }) => {
  fres.forEach(m => { m.uniforms.rim.value.copy(acc); m.uniforms.base.value.set(dark ? 0x39404f : 0xF3F0EA); m.uniforms.a0.value = dark ? .14 : .68; });
  lines.forEach(m => { m.color.copy(txt); m.userData.o = dark ? .2 : .13; });
};
// линии срезов проявляются за 200 мс по готовности воркера
export const fadeLines = (lines, now) => lines.forEach(m => { m.opacity = (m.userData.o || 0) * (m.userData.t0 ? 1 - (1 - Math.min(1, (now - m.userData.t0) / 200)) ** 3 : 0); });

// срезы считает воркер: геометрия копируется и передаётся как Transferable, готовые линии добавляются в parent
export function slicer() {
  const w = new Worker(new URL('./slice-worker.js', import.meta.url)), jobs = new Map();
  let n = 0;
  w.onmessage = ({ data: { id, out } }) => { jobs.get(id)(out); jobs.delete(id); if (!jobs.size) w.terminate(); };
  return (geo, step, mat, parent, P) => new Promise(ok => {
    const pos = geo.attributes.position.array.slice(), idx = geo.index.array.slice(), id = n++;
    jobs.set(id, out => {
      const ls = new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(out, 3)), mat);
      ls.position.copy(P).negate(); ls.renderOrder = 2; parent.add(ls); mat.userData.t0 = performance.now(); ok();
    });
    w.postMessage({ id, pos, idx, step }, [pos.buffer, idx.buffer]);
  });
}

export const glowTexture = () => {
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
};
export const dot = (parent, pt, P, mats, r = 2.6) => {
  const m = new T.Mesh(new T.SphereGeometry(r, 12, 8), new T.MeshBasicMaterial({ depthTest: false, transparent: true }));
  m.renderOrder = 9; m.position.set(...pt).sub(P); parent.add(m); mats.push(m.material); return m;
};
export const sprite = (tex, color, opacity) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, depthTest: false, depthWrite: false, opacity }));
  s.renderOrder = 10; return s;
};

// цикл кадров: только пока блок в окне и вкладка видна
export function loop(el, frame, { margin = '0px', vis = false } = {}) {
  let raf = 0;
  const tick = now => { raf = 0; if (!vis || document.hidden) return; frame(now); raf = requestAnimationFrame(tick); };
  const kick = () => { if (!raf && vis && !document.hidden) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(e => { vis = e[0].isIntersecting; kick(); }, { rootMargin: margin }).observe(el);
  document.addEventListener('visibilitychange', kick);
  return { kick, stop() { vis = false; cancelAnimationFrame(raf); } };
}

// авто-снижение разрешения и частоты кадров. after(now, ms) вызывать после каждого рисования; возвращает, сколько мс кадры держатся дольше 34 мс при минимальном pr
export function quality(renderer, size, { pr, min, maxArea = 0 }) {
  const top = pr; // исходная чёткость: к ней возвращаемся, когда кадры снова быстрые
  let ema = 0, fps = 0, prev = 0, n = 0, low = 0, cap = Infinity, good = 0, cool = 0;
  const apply = () => { renderer.setPixelRatio(Math.min(pr, cap)); renderer.setSize(...size(), false); };
  const q = {
    gap: 0,
    area(px) { cap = maxArea ? Math.sqrt(maxArea / px) : Infinity; apply(); },
    after(now, ms) {
      // пауза отрисовки (блок ушёл из вида, вкладка в фоне, переход между экранами) — не тормоза: начинаем замер заново
      if (prev && now - prev > 250) { prev = now; fps = 0; ema = 0; n = 0; good = 0; return 0; }
      ema = ema ? ema * .8 + ms * .2 : ms;
      if (prev) fps = fps ? fps * .9 + (now - prev) * .1 : now - prev;
      prev = now;
      if (++n > 3) {
        if ((ema > 24 || fps > 34) && pr > min && now > cool) { pr = Math.max(min, pr * .75); apply(); good = 0; cool = now + 500; }
        else if (ema < 12 && fps < 20 && pr < top) { if (++good > 90) { pr = Math.min(top, pr / .75); apply(); good = 0; cool = now + 500; } } // ~1,5 с быстрых кадров: ступень вверх
        else good = 0;
        q.gap = ema > 40 ? Math.min(250, ema * 1.5) : 0;
        if (fps > 34 && pr <= min) low ||= now; else low = 0;
      }
      return low ? now - low : 0;
    },
  };
  renderer.setPixelRatio(Math.min(pr, cap));
  return q;
}

// ?debug=perf: долгие задачи и время кадра в консоль, на странице ничего не рисуется
export function perfDebug() {
  if (!/debug=perf/.test(location.search)) return () => {};
  new PerformanceObserver(l => l.getEntries().forEach(e => console.log('longtask', Math.round(e.duration), 'ms'))).observe({ type: 'longtask', buffered: true });
  const a = []; let prev = 0;
  return now => { if (prev) a.push(now - prev); prev = now; if (a.length === 120) { a.sort((x, y) => x - y); console.log('frame p95', a[113].toFixed(1), 'ms'); a.length = 0; } };
}
