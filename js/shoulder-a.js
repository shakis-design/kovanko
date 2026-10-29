// Вариант A: схема плеча и руки в 3D спереди с контуром тела; кости и мягкие ткани (манжета, связки, губа) из атласа Z-Anatomy. ES-модуль без импортов: THREE и загрузчики передаёт вызывающий код.
// Кинематика (схема, ритм лопатка:рука 1:2): ключица a/10 вокруг грудинного конца, лопатка суммарно a/3 вокруг АК-сустава, плечевая кость относительно лопатки 2a/3.
// Использование: см. assets/shoulder-a-README.md
export async function createShoulderA(o) {
  const { THREE, GLTFLoader, DRACOLoader, container } = o;
  const J = async (x) => (typeof x === 'string' ? (await fetch(x)).json() : x);
  const meta = await J(o.meta), BODY = await J(o.body);
  const glb = typeof o.model === 'string' ? await (await fetch(o.model)).arrayBuffer() : o.model;
  const LABELS = { clavicle: 'ключица', scapula: 'лопатка', humerus: 'плечевая кость', forearm: 'предплечье', hand: 'кисть', cuff: 'вращательная манжета', ...o.labels };
  const PAL = { light: { text: '#16181D', accent: '#4B3A9C', base: 0xDDD9EA, a0: .72, a1: .9, slice: [.12, .1, .05, .04], cuff: '#C0574C', lig: '#6A55D6' }, dark: { text: '#E6E8EA', accent: '#9A89E8', base: 0x6b7794, a0: .42, a1: 1, slice: [.26, .22, .12, .1], cuff: '#A5544D', lig: '#8F7CF0' }, ...o.palette };
  if (o.cine?.text) { PAL.light = { ...PAL.light, text: o.cine.text.light }; PAL.dark = { ...PAL.dark, text: o.cine.text.dark }; }
  const STEP = 16, Y0 = -75, FOV = 22, RED = 0xE5484D; let YAW = o.yaw ?? -.14, PITCH = o.pitch ?? .04;
  let theme = o.theme === 'dark' ? 'dark' : 'light', style = o.contour || 'anat', ANG = o.angle || 0;
  const rad = (d) => d * Math.PI / 180, rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)).join(',');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const mk = (tag, css) => { const e = document.createElement(tag); e.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;' + (css || ''); container.appendChild(e); return e; };
  const cBack = mk('canvas'), cGl = mk('canvas'), cFront = mk('canvas'), lab = mk('div', 'overflow:hidden');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = new THREE.WebGLRenderer({ canvas: cGl, antialias: true, alpha: true, preserveDrawingBuffer: !!o.preserveDrawingBuffer }); r.setPixelRatio(dpr);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(FOV, 1, 10, 12000);
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);
  const V3 = (a) => new THREE.Vector3(...a), L = meta.landmarks, P = V3(meta.pivot);
  const joint = (parent, pt) => { const g = new THREE.Group(); g.position.copy(pt); const q = new THREE.Group(); q.position.copy(pt).negate(); g.add(q); parent.add(g); q.rot = g; return q; };
  const fresnel = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { rim: { value: new THREE.Color() }, base: { value: new THREE.Color() }, a0: { value: .2 }, a1: { value: .9 } },
    vertexShader: 'varying vec3 n;varying vec3 v;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 rim;uniform vec3 base;uniform float a0;uniform float a1;varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(n,v)),2.2);float l=.78+.22*dot(n,normalize(vec3(.4,.8,.5)));gl_FragColor=vec4(mix(base*l,rim,f),mix(a0,a1,f));}' });
  // мягкие ткани: тот же fresnel, но вершинный шейдер со скином (две кости: лопатка и плечо); без чанков скина мышцы стоят на месте
  const skinMat = () => { const m = fresnel(), inc = ['beginnormal_vertex', 'skinbase_vertex', 'skinnormal_vertex', 'begin_vertex', 'skinning_vertex'].map((c) => `#include <${c}>`).join('\n');
    m.vertexShader = `varying vec3 n;varying vec3 v;\n#include <skinning_pars_vertex>\nvoid main(){\n${inc}\nvec4 mv=modelViewMatrix*vec4(transformed,1.);n=normalize(normalMatrix*objectNormal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`; return m; };
  // срезы КТ: пересечения треугольников с плоскостями z = k * step
  const slices = (geo, step) => { const pos = geo.attributes.position, idx = geo.index, out = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) { a.fromBufferAttribute(pos, idx.getX(t)); b.fromBufferAttribute(pos, idx.getX(t + 1)); c.fromBufferAttribute(pos, idx.getX(t + 2));
      const zmin = Math.min(a.z, b.z, c.z), zmax = Math.max(a.z, b.z, c.z);
      for (let k = Math.ceil(zmin / step); k * step <= zmax; k++) { const z = k * step, pts = [];
        for (const [p, q2] of [[a, b], [b, c], [c, a]]) if ((p.z - z) * (q2.z - z) < 0) { const u = (z - p.z) / (q2.z - p.z); pts.push(p.x + (q2.x - p.x) * u, p.y + (q2.y - p.y) * u); }
        if (pts.length === 4) out.push(pts[0], pts[1], z, pts[2], pts[3], z); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); return g; };
  const draco = new DRACOLoader().setDecoderPath(o.dracoPath || 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  const gl = await new Promise((ok, fail) => new GLTFLoader().setDRACOLoader(draco).parse(glb, '', ok, fail)); draco.dispose();
  // ---- кино-стиль (превью, o.cine = { kit: CINE из hero-cine.js, tissue: url мышц и кожи }): стеклянные мышцы, дымчатая кость, облако боли -> голубой ореол ----
  const K = o.cine?.kit, cineM = [], cineH = [];
  const SKINC = ['beginnormal_vertex', 'skinbase_vertex', 'skinnormal_vertex', 'begin_vertex', 'skinning_vertex'].map((c) => `#include <${c}>`).join('\n');
  const CVS = (sk) => `uniform float g;varying vec3 n;varying vec3 v;varying vec3 op;\n${sk ? '#include <skinning_pars_vertex>' : ''}\nvoid main(){\n${sk ? SKINC : 'vec3 transformed=position;vec3 objectNormal=normal;'}\ntransformed+=normalize(objectNormal)*g;op=position;vec4 mv=modelViewMatrix*vec4(transformed,1.);n=normalize(normalMatrix*objectNormal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
  const cUni = (fade) => ({ c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, a0: { value: 0 }, ar: { value: 0 }, pw: { value: 2 }, fib: { value: 0 }, rb: { value: 0 }, hot: { value: 0 }, rimCol: { value: 1 },
    kt: { value: 1 }, kb: { value: 1 }, j0: { value: meta.pivot[2] }, top: { value: { x: fade[0], y: fade[1] } }, bot: { value: { x: fade[2], y: fade[3] } }, xf: { value: { x: -1e5, y: -9e4 } }, o: { value: 1 }, g: { value: 0 } });
  // fade: [верх от, до, низ от, до] в мм от центра сустава по z модели (рука в покое висит вдоль -z)
  const cMat = (kind, sk, fade) => { const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: K.DOUBLE, vertexShader: CVS(sk), fragmentShader: K.FS, uniforms: cUni(fade) });
    m.uniforms.rimCol.value = kind === 'bone' ? 1 : .35; cineM.push({ m, kind }); return m; };
  const cHalo = (kind, sk, fade) => { const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: K.BACK, blending: K.ADD, vertexShader: CVS(sk), fragmentShader: K.HALO_FS, uniforms: cUni(fade) }); cineH.push({ m, kind }); return m; };
  const FADE_BONE = [400, 500, 600, 660], FADE_SOFT = [130, 210, 445, 505], FADE_SKIN = [12, 44, 470, 512];
  // кожа фигуры: [верх, низ] растворения; туловище гаснет к пупку и на шее, кисти чуть к кончикам пальцев
  const FADE_BODY = { body: [130, 182, 330, 440], skin_l: FADE_SKIN, hand_r: [400, 500, 622, 642], hand_l: [400, 500, 622, 642] };
  const STATIC = ['body', 'skin_l', 'hand_l'];   // неподвижны: туловище и вторая рука
  const geo = {}, soft = []; gl.scene.traverse((m) => { if (!m.isMesh) return; m.geometry.computeVertexNormals(); if (m.isSkinnedMesh) soft.push(m); else { m.geometry.computeBoundingBox(); geo[m.name] = m.geometry; } });   // в урезанной сборке three нет Skeleton, берём конструктор у загруженного меша
  const sc = V3(meta.sternal_end);   // грудинный конец ключицы
  const oC = joint(world, sc), oS = joint(oC, V3(L.ac_joint)), oA = joint(oS, P), gC = oC.rot, gS = oS.rot, gA = oA.rot;
  const put = { clavicle: oC, scapula: oS, humerus: oA, radius: oA, ulna: oA, hand: oA }, SL = { clavicle: 0, humerus: 1, radius: 1, ulna: 1, scapula: 2, hand: 3 };
  const mats = {}, lines = {}, meshes = [], ctr = {};
  for (const n of Object.keys(put)) { const g = geo[n]; if (!g) continue;
    if (K) { const m = new THREE.Mesh(g, cMat('bone', false, FADE_BONE)); m.renderOrder = 2; put[n].add(m); meshes.push(m); m.userData.part = n;
      if (n === 'scapula') m.material.userData.scap = 1; if (n === 'hand') m.material.userData.dim = 1;   // кости кисти тише: сверху стеклянная кожа   // лопатка тонкой пластиной ребром к камере: край светится по всей площади, приглушаем
      const h = new THREE.Mesh(g, cHalo('bone', false, FADE_BONE)); if (n === 'scapula') h.material.userData.scap = 1; if (n === 'hand') h.material.userData.dim = 1; h.renderOrder = -1; put[n].add(h); g.boundingBox.getCenter(ctr[n] = new THREE.Vector3()); continue; }
    const m = new THREE.Mesh(g, fresnel()); m.renderOrder = n === 'scapula' ? 1 : 2; put[n].add(m); mats[n] = m.material; meshes.push(m);
    const ls = new THREE.LineSegments(slices(g, n === 'scapula' ? STEP * 2 : STEP), new THREE.LineBasicMaterial({ transparent: true, depthWrite: false })); ls.renderOrder = 3; put[n].add(ls); lines[n] = ls.material;
    g.boundingBox.getCenter(ctr[n] = new THREE.Vector3()); }
  // скин: кости = вращающиеся группы лопатки и плеча (порядок важен), поза покоя до bind
  const sm = {}, cuffC = new THREE.Vector3(), cb = new THREE.Box3(), CUFF = ['supraspinatus', 'infraspinatus', 'subscapularis', 'teres_minor'];
  for (const m of soft) { m.material = skinMat(); m.renderOrder = 4; m.frustumCulled = false; world.add(m); sm[m.name] = m.material; }
  world.updateMatrixWorld(true);
  if (soft.length) { const sk = new (soft[0].skeleton.constructor)([gS, gA]); for (const m of soft) m.bind(sk, m.matrixWorld.clone()); }
  for (const m of soft) if (CUFF.includes(m.name)) { m.geometry.computeBoundingBox(); cb.union(m.geometry.boundingBox); } cb.getCenter(cuffC);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 10), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: .45, depthTest: false, depthWrite: false }));
  dot.renderOrder = 9; dot.position.copy(V3(L.greater_tubercle)); oA.add(dot);
  let glow = null; const fadeOut = [];
  if (K) {
    dot.visible = false;
    const tg = await new Promise((ok, fail) => { const d2 = new DRACOLoader().setDecoderPath(o.dracoPath); new GLTFLoader().setDRACOLoader(d2).load(o.cine.tissue, (x) => { d2.dispose(); ok(x); }, undefined, fail); });
    const SM = soft[0]?.constructor, SK = soft[0]?.skeleton.constructor;
    if (SM && SK) {
      const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const hw = (x, z) => ss(P.z + 30, P.z - 50, z) * ss(P.x - 75, P.x - 25, x);   // как hw() в zanat-shoulder-cine-export.py
      const TORSO = { m_pector: [55, 125], m_trapez: [45, 115] }, tm = [];   // мышцы туловища обрезаны по x: к срезу растворяются
      tg.scene.traverse((m) => { if (m.isMesh) tm.push(m); });
      const sk = new SK([world, gS, gA]);   // туловище (неподвижно), лопатка, плечо
      for (const src of tm) {
        const g = src.geometry; if (!g.attributes.normal) g.computeVertexNormals();
        const rigid = src.name === 'skin' || src.name === 'hand_r', still = STATIC.includes(src.name);   // кожа руки идёт с плечом целиком: без растяжения в подмышке (верх трубы и так растворяется)
        const p = g.attributes.position, idx = new Float32Array(p.count * 4), wt = new Float32Array(p.count * 4), rest = TORSO[src.name] || still ? 0 : 1;
        for (let i = 0; i < p.count; i++) { const w = still ? 0 : rigid ? 1 : hw(p.getX(i), p.getZ(i)); idx[i * 4] = rest; idx[i * 4 + 1] = 2; wt[i * 4] = 1 - w; wt[i * 4 + 1] = w; }
        g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(idx, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
        const kind = src.name === 'skin' || FADE_BODY[src.name] ? 'skin' : 'muscle', fade = FADE_BODY[src.name] || (kind === 'skin' ? FADE_SKIN : FADE_SOFT);
        const cm = cMat(kind, true, fade); if (TORSO[src.name]) cm.uniforms.xf.value = { x: TORSO[src.name][0], y: TORSO[src.name][1] };
        if (TORSO[src.name] || src.name === 'm_teres_major') fadeOut.push(cm);   // тянутся между туловищем и рукой: гасим по углу
        if (src.name === 'body') cm.userData.body = 1;   // туловище чуть тише: главная двигающаяся рука
        const m = new SM(g, cm); m.renderOrder = kind === 'skin' ? 7 : 0; m.frustumCulled = false; m.userData.cine = 1; world.add(m);
        if (kind === 'skin') { const hm = cHalo('skin', true, fade); if (src.name === 'body') hm.userData.body = 1; const h = new SM(g, hm); h.renderOrder = -1; h.frustumCulled = false; h.userData.cine = 1; world.add(h); }
      }
      world.updateMatrixWorld(true);
      world.traverse((m) => { if (m.userData.cine) m.bind(sk, m.matrixWorld.clone()); });
    }
    // свечение у манжеты (на плечевой кости): облако боли в три слоя, к концу подъёма руки голубой ореол; виньетка за плечом в тёмной теме
    const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gx = gc.getContext('2d'), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(gc), spr = (order) => { const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 })); s2.renderOrder = order; s2.position.copy(V3(L.greater_tubercle)).lerp(cuffC, .35); oA.add(s2); return s2; };
    glow = { vign: spr(-3), outer: spr(8), mid: spr(8), core: spr(9), heal2: spr(8), heal: spr(9) };
  }
  // кадр свечения по углу руки: до 95° боль, к 155° голубой ореол; t: секунды (лёгкое дыхание)
  const glowFrame = (t) => { if (!glow) return; const dk = theme === 'dark' ? 1 : 0, h = Math.min(1, Math.max(0, (ANG - 95) / 60)), hs = h * h * (3 - 2 * h), pain = 1 - hs, b = .5 + .5 * Math.sin(t * 2.2), S0 = 50;
    glow.core.scale.setScalar(S0 * 1.15 * (.95 + .15 * b)); glow.core.material.opacity = (dk ? .9 : .4) * pain;
    glow.mid.scale.setScalar(S0 * 2.2 * (1 + .08 * b)); glow.mid.material.opacity = (dk ? .5 : .2) * pain;
    glow.outer.scale.setScalar(S0 * 4.2); glow.outer.material.opacity = (dk ? .2 : .09) * pain;
    glow.heal.scale.setScalar(S0 * (2.4 + 2 * hs)); glow.heal.material.opacity = (dk ? .4 : .22) * hs;
    glow.heal2.scale.setScalar(S0 * (4 + 3.5 * hs)); glow.heal2.material.opacity = (dk ? .2 : .12) * hs;
    glow.vign.scale.setScalar(S0 * 14); glow.vign.material.opacity = dk ? .85 : 0;
    const fo = Math.min(1, Math.max(0, (ANG - 55) / 65)), fs = 1 - .92 * fo * fo * (3 - 2 * fo); for (const m of fadeOut) m.uniforms.o.value = fs; };   // 55°-120°: мышцы туловища плавно уходят
  function cineRecolor() { if (!K) return; const dk = theme === 'dark', c = dk ? K.C.dark : K.C.light, p = dk ? K.P.dark : K.P.light, hp = dk ? K.HALO.dark : K.HALO.light, bl = dk ? K.ADD : K.NORMAL;
    for (const { m, kind } of cineM) { const u = m.uniforms, [a0, ar, pw, fib, rb, , , hot] = p[kind], cc = c[kind];
      const lk = dk || kind === 'bone' ? 1 : kind === 'skin' ? 2.3 : 1.7;   // светлая тема: плечо мельче колена, стекло плотнее, иначе тело почти не видно
      u.c1.value.set(cc[0]); u.c2.value.set(cc[1]); u.c3.value.set(cc[2]); u.a0.value = a0 * lk; u.ar.value = ar * lk; u.pw.value = pw; u.fib.value = fib * lk; u.rb.value = rb; u.hot.value = hot; u.o.value = m.userData.scap ? (dk ? .42 : .5) : m.userData.dim ? .28 : m.userData.body ? .78 : 1; m.blending = bl; }
    for (const { m, kind } of cineH) { const u = m.uniforms, [g2, a, pw] = hp[kind]; u.c1.value.set(c.halo); u.g.value = g2; u.a0.value = a; u.pw.value = pw; u.o.value = m.userData.scap ? .4 : m.userData.dim ? .2 : m.userData.body ? .7 : 1; m.blending = bl; }
    if (glow) { for (const k of ['outer', 'mid', 'core', 'heal', 'heal2']) glow[k].material.blending = bl;
      glow.core.material.color.set(c.pain[0]); glow.mid.material.color.set(c.pain[1]); glow.outer.material.color.set(c.pain[2]); const hc = dk ? '#6FB2F2' : c.heal; glow.heal.material.color.set(hc); glow.heal2.material.color.set(hc); glow.vign.material.color.set(c.vign); }
    // манжета и связки: фиолетовое стекло, манжета ярче
    for (const n in sm) { const u = sm[n].uniforms, cu = CUFF.includes(n), col = new THREE.Color(cu ? (dk ? '#9A89E8' : '#6A55D6') : (dk ? '#C4B8FF' : '#8F7CF0'));
      u.rim.value.copy(col); u.base.value.copy(col); u.a0.value = dk ? (cu ? .16 : .2) : (cu ? .14 : .18); u.a1.value = cu ? (dk ? .42 : .5) : .8; sm[n].blending = bl; } }   // манжета лежит пластинами на лопатке: край тише, иначе ребром светится клином
  const LB = {}; for (const k of Object.keys(LABELS)) { const d = document.createElement('div'); d.textContent = LABELS[k]; d.style.cssText = 'position:absolute;font:14px/1.2 Geologica,"Segoe UI",system-ui,sans-serif;white-space:nowrap;opacity:.92'; lab.appendChild(d); LB[k] = d; }
  if (o.labels === false) lab.style.display = 'none';

  // ---- тема ----
  let draw = true;
  function applyTheme() { const c = PAL[theme], acc = new THREE.Color(c.accent);
    for (const n in mats) { const u = mats[n].uniforms; u.rim.value.copy(acc); u.base.value.set(c.base); u.a0.value = c.a0; u.a1.value = c.a1; lines[n].color.set(c.text); lines[n].opacity = c.slice[SL[n]]; }
    for (const n in sm) { const u = sm[n].uniforms, col = new THREE.Color(CUFF.includes(n) ? c.cuff : c.lig); u.rim.value.copy(col); u.base.value.copy(col).lerp(new THREE.Color(theme === 'dark' ? 0x1a1d27 : 0xffffff), theme === 'dark' ? .1 : .18); u.a0.value = theme === 'dark' ? .26 : .22; u.a1.value = .85; }
    lab.style.color = c.text; cineRecolor(); draw = true; }
  // ---- поза и кадр ----
  const target = new THREE.Vector3(); let wantDist = 1000, fit = 0, W = 1, H = 1;
  const dirDefault = () => new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
  function setAngle(a, opt = {}) { ANG = Math.max(0, Math.min(170, a)); const PHI = ANG / 10, SCAP = ANG / 3 - PHI, GH = ANG * 2 / 3;
    gC.rotation.y = -rad(PHI); gS.rotation.y = -rad(SCAP); gA.rotation.y = -rad(GH);
    const keep = world.position.clone(); world.position.set(0, 0, 0); scene.updateMatrixWorld(true);
    const b = new THREE.Box3(); for (const m of meshes) b.union(new THREE.Box3().setFromObject(m, true));
    for (const p of [[-40, 1300], [70, 1520]]) b.expandByPoint(new THREE.Vector3(p[0], Y0, p[1]).applyMatrix4(world.matrixWorld));   // шея и грудь тоже в кадре
    const e = BODY.anat.axis[BODY.anat.axis.length - 1];                                                                     // кончик кисти по контуру кожи тоже в кадре
    for (const dx of [-45, 45]) { const v = new THREE.Vector3(e[0] + dx, Y0, e[1] - 28); oA.localToWorld(v); b.expandByPoint(v); }
    // телефон: рука поднята — в кадр берём плечо, плечевую кость и корпус, предплечье и кисть могут уйти за текст сверху (решение владельца 29.10)
    const up = K && innerWidth < 860 ? Math.min(1, Math.max(0, (ANG - 90) / 60)) : 0;
    if (up > 0) { const bs = new THREE.Box3(); for (const m of meshes) if (!/^(radius|ulna|hand)$/.test(m.userData.part)) bs.union(new THREE.Box3().setFromObject(m, true));
      for (const p of [[-40, 1300], [70, 1520]]) bs.expandByPoint(new THREE.Vector3(p[0], Y0, p[1]).applyMatrix4(world.matrixWorld));
      b.min.lerp(bs.min, up); b.max.lerp(bs.max, up); }
    const sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    // телефон: холст заходит под текст на 120 px — пока рука не поднята, рисуем ниже текста (кадр смещён вниз), поднятая рука может уйти за текст
    if (K && innerWidth < 860) { cam.setViewOffset(W, H, 0, -60 * (1 - up), W, H); } else if (cam.view) cam.clearViewOffset();
    world.position.copy(keep); target.copy(c).negate(); if (W < 860) target.y += sz.y * .06; fit = 60;   // телефон: туловище выше, подпись «лопатка» над нижним затуханием (29.10)
    wantDist = Math.max(sz.y, sz.x / (cam.aspect || 1.33)) * 1.16 / 2 / Math.tan(rad(FOV / 2)) + sz.z / 2;
    if (opt.immediate) { world.position.copy(target); if (!opt.keepCamera) cam.position.copy(dirDefault().multiplyScalar(wantDist)); cam.lookAt(0, 0, 0); }
    draw = true; }
  const setTheme = (t) => { theme = t === 'dark' ? 'dark' : 'light'; applyTheme(); };
  const setContour = (s) => { style = s; draw = true; };
  // ракурс камеры: поворот вокруг вертикали и наклон (рад), расстояние сохраняется; кадр под позу подгоняет fit
  const setView = (y, p = PITCH) => { if (Math.abs(y - YAW) < 1e-4 && Math.abs(p - PITCH) < 1e-4) return; YAW = y; PITCH = p; cam.position.copy(dirDefault().multiplyScalar(cam.position.length())); cam.lookAt(0, 0, 0); draw = true; };
  const resetView = () => { cam.position.copy(dirDefault().multiplyScalar(wantDist)); cam.lookAt(0, 0, 0); draw = true; };
  function resize() { W = container.clientWidth || 1; H = container.clientHeight || 1; r.setSize(W, H, false); for (const c of [cBack, cFront]) { c.width = W * dpr; c.height = H * dpr; } cam.aspect = W / H; cam.updateProjectionMatrix(); setAngle(ANG, { immediate: false }); draw = true; }
  const ro = new ResizeObserver(resize); ro.observe(container);

  // ---- 2D-слои: контур тела и руки, ориентиры, подписи ----
  const B = cBack.getContext('2d'), F = cFront.getContext('2d');
  const w3 = (obj, p) => { const v = V3(p); obj.localToWorld(v); v.project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  const pt = (obj, x, z) => w3(obj, [x, Y0, z]);
  const al = BODY.axisDeg * Math.PI / 180, dd = [Math.sin(al), -Math.cos(al)], nn = [Math.cos(al), Math.sin(al)];
  const sw = ([s, w]) => [P.x + dd[0] * s + nn[0] * w, P.z + dd[1] * s + nn[1] * w], mir = (a) => a.map(([x, z]) => [-x, z]);
  const cap = BODY.lat.slice(0, 3).map(sw), AX = BODY.anat, ZM = 1236;
  // сплайн Катмулла-Рома -> кубические Безье: плавные линии без изломов
  const spline = (g, p, from = 0) => { g.moveTo(...p[from]); for (let i = from; i < p.length - 1; i++) { const p0 = p[Math.max(i - 1, 0)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(i + 2, p.length - 1)];
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); } };
  // Контур руки строится на экране: ось руки (по костям) в текущей позе, ширины откладываются по нормали к оси на экране с масштабом px/мм в этой точке.
  // proj: [x,z] покоя -> экран; sg: +1 левая рука, -1 зеркальная правая. Возвращает верхний (lat) и нижний (med) края и дугу кончика.
  function armShape(proj, sg) {
    const A = AX.axis, n = A.length, Pp = A.map(proj), lat = [], med = [], T = [], N = [], K = [];
    for (let i = 0; i < n; i++) { const a = Pp[Math.max(i - 1, 0)], b = Pp[Math.min(i + 1, n - 1)], ia = Math.max(i - 1, 0), ib = Math.min(i + 1, n - 1);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, mm = Math.hypot(A[ib][0] - A[ia][0], A[ib][1] - A[ia][1]) || 1;
      T[i] = [dx / len, dy / len]; N[i] = [sg * T[i][1], -sg * T[i][0]]; K[i] = len / mm; }
    for (let i = 1; i < n; i++) { lat.push([Pp[i][0] + N[i][0] * AX.wl[i] * K[i], Pp[i][1] + N[i][1] * AX.wl[i] * K[i]]);
      if (A[i][1] <= ZM) med.push([Pp[i][0] - N[i][0] * AX.wm[i] * K[i], Pp[i][1] - N[i][1] * AX.wm[i] * K[i]]); }
    const e = n - 1, rr = (AX.wl[e] + AX.wm[e]) / 2 * K[e], tip = [];
    for (let k = 1; k <= 5; k++) { const a = k * Math.PI / 6; tip.push([Pp[e][0] + N[e][0] * rr * Math.cos(a) + T[e][0] * rr * Math.sin(a), Pp[e][1] + N[e][1] * rr * Math.cos(a) + T[e][1] * rr * Math.sin(a)]); }
    return { lat, med, tip }; }
  const capS = (proj) => cap.map(proj);
  function drawBody() {
    const c = PAL[theme], rgb = rgbOf(c.text), dk = theme === 'dark', al0 = dk ? .36 : .32, S = (obj, a) => a.map(([x, z]) => pt(obj, x, z));
    B.setTransform(dpr, 0, 0, dpr, 0, 0); B.clearRect(0, 0, W, H); B.lineCap = B.lineJoin = 'round'; B.lineWidth = 1.5;
    const pL = (p) => pt(oA, p[0], p[1]), pR = (p) => pt(world, -p[0], p[1]), L1 = armShape(pL, 1), R1 = armShape(pR, -1);
    const g0 = pt(world, ...BODY.trap[BODY.trap.length - 1]), g1 = pt(world, ...cap[2]);
    const gr = (p0, p1, a0, a1) => { const g = B.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); g.addColorStop(0, `rgba(${rgb},${a0 * al0})`); g.addColorStop(1, `rgba(${rgb},${a1 * al0})`); return g; };
    const line = (pts, st, from) => { B.strokeStyle = st; B.beginPath(); spline(B, pts, from); B.stroke(); }, plain = `rgba(${rgb},${al0})`;
    const trapL = [...BODY.trap, cap[1], cap[2]];
    const chains = (sh, proj) => ({ lat: [...capS(proj), ...sh.lat, ...sh.tip], med: [sh.tip[3], sh.tip[4], ...sh.med.slice().reverse()] });
    if (K) return;   // кино: фигура человека в 3D (туловище, вторая рука, кисти), 2D-контур не нужен
    if (style === 'soft') {
      // мягкий силуэт: тело и руки одной заливкой на временном холсте, край размыт; линий нет
      const T = document.createElement('canvas'); T.width = W * dpr; T.height = H * dpr; const G = T.getContext('2d'); G.setTransform(dpr, 0, 0, dpr, 0, 0);
      const half = [...BODY.trap, ...BODY.cap, ...BODY.side, [131, 900]], yT = pt(world, 0, 1120)[1], yB = pt(world, 0, 930)[1], gb = G.createLinearGradient(0, yT, 0, yB);
      gb.addColorStop(0, '#000'); gb.addColorStop(1, 'rgba(0,0,0,0)'); G.fillStyle = gb; G.beginPath(); spline(G, [...S(world, half), ...S(world, mir(half)).reverse()]); G.closePath(); G.fill();
      G.fillStyle = '#000';
      for (const [sh, proj] of [[L1, pL], [R1, pR]]) { const ch = chains(sh, proj); G.beginPath(); spline(G, [...ch.lat, ...sh.med.slice().reverse()]); G.closePath(); G.fill(); }
      const c0 = pt(oA, P.x, P.z), c1 = pt(oA, P.x + 48, P.z); G.beginPath(); G.arc(c0[0], c0[1], Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), 0, 7); G.fill();   // округлое плечо
      G.globalCompositeOperation = 'source-in'; G.fillStyle = `rgb(${rgb})`; G.fillRect(0, 0, W, H);
      B.save(); B.setTransform(1, 0, 0, 1, 0, 0); if ('filter' in B) B.filter = `blur(${7 * dpr}px)`; B.globalAlpha = .13; B.drawImage(T, 0, 0); B.restore();
    } else {
      line(S(world, mir(trapL)), plain); line(S(world, mir(BODY.side)), plain); line(S(world, trapL), gr(g0, g1, 1, 0)); line(S(world, BODY.side), gr(pt(world, 0, 1240), pt(world, 0, 1185), 0, 1));
      if (style === 'anat') {
        const cr = chains(R1, pR), cl = chains(L1, pL);
        line(cr.lat, plain); line(cr.med, plain, 1);                                   // правая рука вдоль тела
        line(cl.lat, gr(pt(oA, ...BODY.trap[BODY.trap.length - 1]), pt(oA, ...cap[2]), 0, 1));        // верхний край: из надплечья в руку
        const m0 = AX.axis[AX.axis.findIndex((p) => p[1] <= ZM)];
        line(cl.med, gr(pt(oA, ...m0), pt(oA, m0[0] + 4, m0[1] - 60), 0, 1), 1);       // нижний край: из подмышки
      } }
    B.save(); B.globalAlpha = .55; B.setLineDash([4, 5]); B.strokeStyle = `rgba(${rgb},${al0})`; B.beginPath(); B.moveTo(...pt(world, -70, 1322)); B.quadraticCurveTo(...pt(world, 0, 1294), ...pt(world, 70, 1322)); B.stroke(); B.restore(); }
  function drawFront() {
    const c = PAL[theme]; F.setTransform(dpr, 0, 0, dpr, 0, 0); F.clearRect(0, 0, W, H);
    F.strokeStyle = c.accent; F.lineWidth = 1.4; F.globalAlpha = 1;
    const ln = (a, b) => { F.beginPath(); F.moveTo(...a); F.lineTo(...b); F.stroke(); };
    const ac = w3(oS, L.acromion), co = w3(oS, L.coracoid), hd = w3(oA, L.humeral_head), tu = w3(oA, L.greater_tubercle);
    ln(ac, co); ln(co, hd); ln(ac, tu); F.fillStyle = c.accent; for (const p of [ac, co, hd]) { F.beginPath(); F.arc(p[0], p[1], 2.6, 0, 7); F.fill(); }
    // подписи: ключица и лопатка слева, кости руки сбоку от оси руки
    const place = (k, a, dx, dy0, align) => { if (o.labels === false || !LABELS[k]) return; /* пустая подпись: без выноски */
      let dy = dy0; if (K) { const hh = (LB[k].offsetHeight || 18) / 2 + 6; dy = Math.min(H * .84 - hh, Math.max(H * .16 + hh, a[1] + dy0)) - a[1]; }   /* кино: подпись не заходит в затухание краёв .joints__view (16 % сверху и снизу, 29.10) */   // кино: подпись по высоте не выходит из кадра, выноска идёт к ней
      F.globalAlpha = .45; F.strokeStyle = c.text; F.lineWidth = 1; F.beginPath(); F.moveTo(...a); F.lineTo(a[0] + dx, a[1] + dy); F.stroke();
      const d = LB[k]; let px = a[0] + dx + (align === 'r' ? -6 : 6); const w = d.offsetWidth, l0 = align === 'r' ? px - w : align === 'c' ? px - w / 2 : px; px += Math.max(0, 4 - l0) - Math.max(0, l0 + w - (W - 4)); // подпись не выходит за кадр
      d.style.left = px + 'px'; d.style.top = (a[1] + dy) + 'px'; d.style.transform = `translate(${align === 'r' ? '-100%' : align === 'c' ? '-50%' : '0'},-50%)`; };
    place('clavicle', w3(oC, [60, -110, 1342]), -26, -56, 'r'); place('scapula', w3(oS, [95, -30, 1250]), -70, 56, 'r');
    const h0 = w3(oA, [P.x, Y0, P.z]), h1 = w3(oA, [ctr.hand.x, Y0, ctr.hand.z]); let ax = [h1[0] - h0[0], h1[1] - h0[1]]; const len = Math.hypot(...ax) || 1; ax = [ax[0] / len, ax[1] / len];
    let n = [-ax[1], ax[0]]; if (n[0] - n[1] * .5 < 0) n = [-n[0], -n[1]];
    const cu = w3(oS, [cuffC.x, Y0, cuffC.z]); if (Math.abs(ax[0]) > .6) place('cuff', cu, 45, 90, 'c'); else place('cuff', cu, 60, -70, 'l');   // рука горизонтально: подпись под плечом, не на линии плечевой кости
    for (const [k, p] of [['humerus', [ctr.humerus.x, Y0, ctr.humerus.z]], ['forearm', [ctr.radius.x, Y0, ctr.radius.z]], ['hand', [ctr.hand.x, Y0, ctr.hand.z]]]) {
      place(k, w3(oA, p), n[0] * 52, n[1] * 52, n[0] > .3 ? 'l' : n[0] < -.3 ? 'r' : 'c'); } }

  let raf = 0, settled = false, run = true;
  function loop() { if (!run) { raf = 0; return; } raf = requestAnimationFrame(loop);
    const k = o.immediate ? 1 : .18; world.position.lerp(target, k);
    if (fit > 0) { fit--; const cur = cam.position.length(); cam.position.multiplyScalar((cur + (wantDist - cur) * k) / cur); }
    const changed = o.onFrame ? o.onFrame() : false, moving = world.position.distanceToSquared(target) > 1e-3;
    glowFrame(performance.now() / 1000);
    if (changed || draw || moving) { scene.updateMatrixWorld(true); cam.updateMatrixWorld(); drawBody(); drawFront(); draw = false; }
    r.render(scene, cam); settled = !moving && fit === 0 || (!moving && o.immediate); }
  applyTheme(); resize(); setAngle(ANG, { immediate: true }); loop();
  return { setAngle, setView, setYaw: (y) => setView(y), setTheme, setContour, resetView, resize, camera: cam, renderer: r, scene, stopFit: () => { fit = 0; }, isSettled: () => settled,
    getAngle: () => ANG, play(on) { run = on; if (on && !raf) { draw = true; loop(); } },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); r.dispose(); for (const e of [cBack, cGl, cFront, lab]) e.remove(); } };
}
