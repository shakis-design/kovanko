// Первый экран (docs/02-design-spec.md, разделы 14 и 15.2): колено из атласа Z-Anatomy (кости, мениски, связки), вход по времени, осмотр по скроллу, финал.
// Грузится динамически после load. Бросает исключение, если нет WebGL2 или модель не загрузилась: main.js вернёт постер.
import { T, sm, sm5, mix, kf, loadGlb, palette, fresnel, softMat, addBend, paint, fadeLines, slicer, glowTexture, dot, sprite, loop, quality, perfDebug, RED } from './scene-kit.js';
import { $, root } from './dom.js';

// этапы: [от, до, номер, подпись слева, мелко]
// [врач проверит] тексты шести этапов осмотра и подписи ниже написаны по клиническим чек-листам, нужна вычитка врача
const STAGES = [
  [0, .13, '01', 'Смотрю, как вы стоите и где болит', 'Ось ноги и положение надколенника.'],
  [.13, .3, '02', 'Проверяю, разгибается ли колено полностью', 'Вид спереди.'],
  [.3, .5, '03', 'Смотрю, до какого угла сгибается и где появляется боль', 'Объём движений.'],
  [.5, .6, '04', 'Проверяю, не смещается ли голень вперёд', 'Тест Лахмана: смещение голени вперёд-назад. В центре сустава подсвечена передняя крестообразная связка.'],
  [.6, .73, '05', 'Проверяю боковую устойчивость колена', 'Отклонение голени в стороны.'],
  [.73, .9, '06', 'Ищу боль и щелчки при повороте голени', 'Осмотр менисков. Два полукольца на большеберцовой кости: мениски.'],
  [.9, 1.01, 'Цель', 'Вернуть нагрузку по плану врача', 'Схема, не снимок пациента. Результат лечения у каждого свой.'],
];
// [врач проверит] подписи в нижней строке
const CAPS = [
  [0, .13, 'Осмотр спереди: ось ноги, надколенник'], [.13, .3, 'Вид спереди: разгибание'], [.3, .5, 'Сгибание'],
  [.5, .6, 'Тест Лахмана:\nсмещение голени вперёд-назад'], [.6, .73, 'Боковая устойчивость: отклонение голени'], [.73, .9, 'Мениски: поворот голени при сгибании'],
];
const RY = [[0, -.5], [.13, 0], [.26, 0], [.38, -1.5], [.54, -1.5], [.63, -.15], [.72, -.15], [.8, -1.15], [.9, -1], [1, -2.2]];
const FLEX = [[0, 0], [.28, 0], [.44, 90], [.5, 30], [.7, 30], [.76, 90], [1, 90]];
const PAIN = ['patella_center', 'epicondyle_medial', 'epicondyle_lateral', 'tibial_tuberosity'];
// мягкие ткани из модели: [узел, вес изгиба (1 целиком голень), порядок отрисовки, светлота тона (0 тёмный, 1 светлый), этап]
// тон строится от акцента: ПКС и ЗКС темнее, мениски светлее; на своём этапе плавно в полный акцент
const SOFT = { meniscus_medial: [1, 3, .55, 'men'], meniscus_lateral: [1, 3, .55, 'men'], pcl: [0, 4, 0, 'pcl'], acl: [0, 5, 0, 'acl'], mcl: [0, 4, .2, 'lat'], lcl: [0, 4, .2, 'lat'] };
const NARROW = 860, PHONE = 768;

export async function initHero3d() {
  const phone = innerWidth < PHONE, INTRO_MS = phone ? 1600 : 3200;
  const base = new URL('../', import.meta.url), cine = root.dataset.look === 'cine'; // cine: кино-стиль (превью /preview-cine/, hero-cine.js)
  const [meta, gltf, cgl, ckit] = await Promise.all([
    fetch(new URL('models/knee-z.meta.json', base)).then(r => r.json()),
    loadGlb(new URL('models/knee-z.draco.glb', base).href, new URL('vendor/draco/', base).href),
    cine && loadGlb(new URL('models/knee-cine.draco.glb', base).href, new URL('vendor/draco/', base).href),
    cine && import('./hero-cine.js'),
  ]);
  const hero = $('#hero'), stage = $('.hero__stage', hero), header = $('.site-header');
  const joinsEl = document.getElementById('joints');
  const el = { type: $('.hero__type', hero), copy: $('.hero__copy', hero), edge: $('#hero-edge'), en: $('#hero-edge .n'), et: $('#hero-edge .t'),
    doc: $('.hero__doc', hero), urgent: $('.hero__urgent', hero), ticket: $('#hero-ticket'), cap: $('#hero-cap'), scheme: $('#hero-scheme'), read: $('.hero__read', hero), live: $('#hero-live') };
  const cv = Object.assign(document.createElement('canvas'), { className: 'hero__canvas' });
  cv.setAttribute('aria-hidden', 'true');
  stage.insertBefore(cv, el.copy);
  // угломер (15.13.2): дуга, деления, стрелка и центр в SVG, число отдельно; всё aria-hidden, цвета из CSS
  const gauge = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), deg = document.createElement('span');
  gauge.setAttribute('class', 'hero__gauge'); gauge.setAttribute('aria-hidden', 'true');
  gauge.innerHTML = '<g><path class="ga" pathLength="1"/><path class="gt" pathLength="1"/><line class="gr" x1="0" y1="0"/><circle r="2"/></g>';
  deg.className = 'hero__deg'; deg.setAttribute('aria-hidden', 'true');
  stage.insertBefore(gauge, el.copy); stage.insertBefore(deg, el.copy);
  const gg = gauge.firstChild, [gArc, gTicks, gArrow] = gg.children;
  // телефон, кино-стиль: подписи частей колена с выносками по обе стороны (29.10), чтобы согнутое колено не читалось как локоть.
  // Точки берутся с модели каждый кадр, подписи едут за коленом; слева бедро и сустав, справа надколенник и голень
  const KL = [
    { t: 'бедренная кость', side: -1, pt: 'femur' }, { t: 'коленный сустав', side: -1, pt: 'joint', key: true },
    { t: 'надколенник', side: 1, pt: 'patella' }, { t: 'большеберцовая кость', side: 1, pt: 'tibia' },
  ];
  const kBox = document.createElement('div'); kBox.className = 'klabels'; kBox.setAttribute('aria-hidden', 'true');
  const kSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); kBox.append(kSvg);
  KL.forEach(k => {
    k.el = Object.assign(document.createElement('span'), { className: 'kl' + (k.side > 0 ? ' r' : '') + (k.key ? ' key' : ''), textContent: k.t }); kBox.append(k.el);
    k.path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); k.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); k.dot.setAttribute('r', '2.5');
    if (k.key) { k.path.setAttribute('class', 'key-line'); k.dot.setAttribute('class', 'key'); }
    kSvg.append(k.path, k.dot);
  });
  if (cine) stage.insertBefore(kBox, el.copy);

  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' });
  let W = 1, H = 1;
  const q = quality(renderer, () => [W, H], phone ? { pr: Math.min(devicePixelRatio, 1.25), min: .6, maxArea: .6e6 } : { pr: Math.min(devicePixelRatio, 1.5), min: .5 });
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 10, 9000);
  const orbit = new T.Group(), world = new T.Group(), shank = new T.Group(), spin = new T.Group(), pat = new T.Group();
  scene.add(orbit); orbit.add(world); world.rotation.x = -Math.PI / 2; shank.add(spin); world.add(shank, pat);
  const P = new T.Vector3(...meta.pivot);
  const ck = cine ? ckit.cineKit(P) : null;

  const fres = [], lineMats = [], dotMats = [], anchors = {}, pain = [];
  const glow = glowTexture(), slice = slicer();

  const soft = [], bend = { value: new T.Object3D().matrix }, SM = [];
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const sf = SOFT[o.name];
    if (sf) { // мягкая ткань: в world, изгиб между бедром и голенью считает шейдер
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      addBend(o.geometry, sf[0]);
      const mat = softMat(SM, bend), mesh = new T.Mesh(o.geometry, mat); mesh.position.copy(P).negate(); mesh.renderOrder = sf[1]; mesh.frustumCulled = false;
      world.add(mesh); soft.push({ mat, tone: sf[2], kind: sf[3] }); return;
    }
    o.geometry.computeVertexNormals();
    const parent = o.name === 'femur' ? world : o.name === 'patella' ? pat : spin;
    const mesh = new T.Mesh(o.geometry, ck ? ck.bone(o.geometry, parent) : fresnel(fres)); mesh.position.copy(P).negate(); mesh.renderOrder = 1; parent.add(mesh);
    if (ck) return; // в кино-стиле без срезов КТ
    const lm = new T.LineBasicMaterial({ transparent: true, depthWrite: false }); lineMats.push(lm);
    slice(o.geometry, o.name === 'patella' ? 8 : 16, lm, parent, P);
  });
  const lm = meta.landmarks, add = (n, parent) => { anchors[n] = dot(parent, lm[n], P, dotMats); };
  add('epicondyle_medial', world); add('epicondyle_lateral', world); add('tibial_plateau', spin);
  add('fibular_head', spin); add('tibial_tuberosity', spin); add('patella_center', pat);
  const marks = Object.values(anchors), cineExt = [], MC = new T.Vector3(), EX = new T.Vector3();
  if (ck) { // мышцы и кожа, свечение у сустава вместо точек
    ck.tissue(cgl.scene, world, bend);
    const c = new T.Vector3(...lm.epicondyle_medial).add(new T.Vector3(...lm.epicondyle_lateral)).add(new T.Vector3(...lm.tibial_plateau)).multiplyScalar(1 / 3).sub(P);
    ck.glow(world, c); marks.forEach(m => { m.visible = false; });
    // у кино-колена кадр выше: мышцы и кожа бедра и голени; эти точки входят в рамку камеры (на телефоне всегда, на компьютере к финалу)
    for (const [grp, dz] of [[world, 300], [spin, -240]]) { const o = new T.Object3D(); o.position.set(c.x, c.y, c.z + dz); grp.add(o); cineExt.push(o); }
    // ширина мягких тканей бедра и голени (±65 мм от оси): в финале «Цель» на телефоне бедро не уходит за левый край (29.10)
    for (const [grp, dz] of [[world, 260], [world, 120], [spin, -200]]) for (const [dx, dy] of [[45, 0], [-45, 0], [0, 45], [0, -45]]) { const o = new T.Object3D(); o.position.set(c.x + dx, c.y + dy, c.z + dz); o.userData.soft = 1; grp.add(o); cineExt.push(o); }
  }

  // связка надколенника (в модели её нет): тонкая линия, в покое --text
  const patMat = new T.LineBasicMaterial({ depthTest: false, transparent: true });
  const pl = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), patMat);
  pl.renderOrder = 9; pl.frustumCulled = false; scene.add(pl);

  PAIN.forEach((n, i) => { // красные точки боли: пульс + кольцо «снятия боли»
    const s = sprite(glow, RED, 1), c = sprite(glow, RED, 0);
    anchors[n].add(c, s); pain.push({ n, s, c, m: anchors[n].material, i });
  });

  const WHITE = new T.Color(1, 1, 1), tmp = new T.Color();
  // тон в покое и на этапе: от акцента через светлоту; в покое чуть приглушён к --text
  const paintSoft = (e = {}) => ck ? ck.paintSoft(soft, e) : soft.forEach(({ mat, tone, kind }) => {
    const k = e[kind] || 0, u = mat.uniforms;
    tmp.copy(ACC).lerp(WHITE, dk ? tone * .45 : tone * .5); if (!dk && kind !== 'men') tmp.multiplyScalar(kind === 'lat' ? .9 : .68);
    u.rim.value.copy(tmp).lerp(TXT, (1 - k) * .3); u.base.value.copy(tmp).lerp(dk ? TXT : WHITE, (1 - k) * (dk ? .1 : .3));
    u.a0.value = mix(dk ? .5 : .66, dk ? .88 : .96, k); u.a1.value = 1; u.g.value = k * (kind === 'lat' ? 1.3 : .7);
  });
  let pal = palette(), ACC = pal.acc, TXT = pal.txt, dk = pal.dark;
  const recolor = () => {
    pal = palette(); ACC = pal.acc; TXT = pal.txt; dk = pal.dark;
    paint(fres, lineMats, pal); ck?.recolor(dk); paintSoft(); dotMats.forEach(m => m.color.copy(ACC));
  };
  recolor();
  document.addEventListener('themechange', recolor);

  // размер и безопасная область (15.2.3): колено не режется краем и не наезжает на текст
  let narrow = false, R = null, D = 1, offX = 0, offY = 0, stageIdx = -1, edgeAnim = [], swapT = 0, lastSwap = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // заголовок этапа (15.13.1): строки режем по реальным переносам, каждая строка в своей маске (.line)
  const toLines = (node, txt) => {
    node.textContent = '';
    const ws = txt.split(' ').map(w => { const e = document.createElement('span'); e.textContent = w + ' '; node.append(e); return e; });
    const rows = []; let top = null;
    for (const e of ws) { if (e.offsetTop !== top) { rows.push([]); top = e.offsetTop; } rows.at(-1).push(e.textContent); }
    node.textContent = '';
    for (const r of rows) { const l = document.createElement('span'), i = document.createElement('span'); l.className = 'line'; i.textContent = r.join('').trimEnd(); l.append(i); node.append(l); }
  };
  const renderEdge = () => {
    const s = STAGES[stageIdx];
    el.edge.classList.toggle('is-final', stageIdx === STAGES.length - 1); el.en.textContent = s[2]; toLines(el.et, narrow ? s[3] : s[3].replace(/ /g, ' ')); // неразрывные пробелы в заголовках этапов — только телефон
    // слово «колено» в заголовке этапа цветом (29.10); строки уже разбиты, слово целиком внутри своей строки
    el.et.querySelectorAll('.line>span').forEach(n => { if (/колен/i.test(n.textContent)) n.innerHTML = n.textContent.replace(/(колен[а-яё]*)/gi, '<em class="kw">$1</em>'); });
    let small = el.edge.querySelector('small'); if (!small) small = el.edge.appendChild(document.createElement('small'));
    small.textContent = s[4]; return small;
  };
  const measure = () => {
    const sb = stage.getBoundingClientRect(); stage.classList.add('is-measuring');
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left - sb.left, r: b.right - sb.left, t: b.top - sb.top, b: b.bottom - sb.top }; };
    R = { copy: r(el.copy), read: r(el.read), edge: r(el.edge), doc: r(el.doc), title: r($('h1', el.type)) };
    stage.style.setProperty('--deg-top', r(el.et).t + 'px'); // телефон: число угла в строке с заголовком этапа
    stage.classList.remove('is-measuring');
  };
  const resize = () => {
    W = stage.clientWidth; H = stage.clientHeight; narrow = W < NARROW;
    q.area(W * H); cam.aspect = W / H;
    cam.position.set(0, 0, narrow ? 1700 : 1250 * D); cam.lookAt(0, 0, 0);
    if (narrow) stage.style.setProperty('--fog-h', el.copy.offsetTop + el.copy.offsetHeight + 28 + 'px');
    stage.style.setProperty('--copy-h', el.copy.offsetHeight + 'px'); // кино-превью, телефон: заголовок стоит над блоком текста внизу
    gauge.setAttribute('viewBox', `0 0 ${W} ${H}`); kSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    KL.forEach(k => { k.w = k.el.offsetWidth; k.h = k.el.offsetHeight; });
    if (stageIdx >= 0) renderEdge(); // строки зависят от ширины колонки
    measure();
  };
  // телефон: один свайп = один этап. Точки привязки прокрутки на середине каждого этапа и в конце первого экрана,
  // scroll-snap-stop: always не даёт инерции проскочить этап (29.10). Вне первого экрана точек нет, страница листается как обычно
  const snaps = [];
  if (phone && cine && !reduce.matches) {
    for (const p0 of [0, ...STAGES.slice(1).map(s => (s[0] + Math.min(1, s[1])) / 2)]) { const m = document.createElement('i'); m.className = 'hero__snap'; m.dataset.p = p0; m.setAttribute('aria-hidden', 'true'); hero.append(m); snaps.push(m); }
  }
  // строгая привязка только внутри сцены колена: дошли до последней точки — снимаем, дальше страница листается свободно
  let snapEnd = 0;
  const placeSnaps = () => { const range = hero.offsetHeight - innerHeight * 2; snaps.forEach(m => { m.style.top = (+m.dataset.p * range).toFixed(0) + 'px'; }); snapEnd = snaps.length ? hero.offsetTop + range * +snaps.at(-1).dataset.p : 0; snapToggle(); }; // конец привязки = точка «Цели»
  const snapToggle = () => { if (snaps.length) document.documentElement.classList.toggle('hero-snap', scrollY < snapEnd - 2); };
  if (snaps.length) addEventListener('scroll', snapToggle, { passive: true });
  new ResizeObserver(resize).observe(stage); resize(); placeSnaps(); addEventListener('resize', placeSnaps);
  document.fonts?.ready.then(() => { if (stageIdx >= 0) { renderEdge(); R && measure(); } }); // после подмены шрифта переносы другие
  const baseZ = () => (narrow ? 1700 : 1250);
  const safe = (p, lift) => {
    const hh = header.offsetHeight;
    if (narrow) {
      const u = sm(.12, .2, p);
      if (cine) return { l: W * .06, r: W * .94, t: hh + 16, b: mix(R.title.t - 16, R.edge.t - 12 - lift, u) }; // кино-превью: текст внизу, колено вверху с первого кадра
      return { l: W * .06, r: W * .94, t: mix(R.copy.b + 16, hh + 16, u), b: mix(R.read.t - 12, R.edge.t - 12 - lift, u) };
    }
    return { l: Math.max(R.edge.r + 32, W * .26), r: Math.min(R.doc.l - 32, W * .82), t: hh + 24, b: R.read.t - 24 };
  };

  renderer.compile(scene, cam); // шейдеры до первого кадра

  // состояние
  let p = 0, t0 = 0, last = 0, lastDraw = 0, introOff = false, dead = false, ctaOn = true;
  const set = (node, prop, v) => { if (node.__v?.[prop] !== v) { (node.__v ||= {})[prop] = v; node.style[prop] = v; } };
  const text = (node, v) => { if (node.__t !== v) { node.__t = v; node.textContent = v; } };
  // cine: последний экран hero занят наездом блока #joints (hero.css), p = 1 в момент, когда он показался снизу
  const scrollP = () => { const b = hero.getBoundingClientRect(); return Math.min(1, Math.max(0, -b.top / (b.height - innerHeight * (cine ? 2 : 1)))); };
  const poster = () => { // откат на постер: гасим холст, затем меняем режим
    if (dead) return; dead = true; lp.stop();
    cv.style.transition = 'opacity .32s cubic-bezier(.32,0,.67,0)'; cv.style.opacity = '0'; gauge.remove(); deg.remove();
    setTimeout(() => { cv.remove(); root.dataset.hero = 'poster'; renderer.dispose(); }, 340);
  };
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); dead = true; lp.stop(); cv.style.display = 'none'; }); // высоту hero не меняем: страница не прыгнет
  new ResizeObserver(() => { R && measure(); }).observe(el.edge);
  new ResizeObserver(() => { stage.style.setProperty('--read-h', el.read.offsetHeight + 'px'); R && measure(); }).observe(el.read); // подпись этапа стоит над строкой read, какой бы высоты она ни была
  let liveT = 0, edgeVisible = false, lastDeg = -1, dw = 0, gShown = 0, gT = 0;
  const gs = { x: 0, y: 0, a: 0, r: 0, b: 0, nx: 0, ny: 0 }, C3 = new T.Vector3(), Q3 = new T.Vector3(), RAD = Math.PI / 180;
  const gp = (v) => { v.project(cam); return [(v.x * .5 + .5) * W, (.5 - v.y * .5) * H]; };
  // экранное направление от центра сустава к точке на 100 мм по оси группы (y, z в её системе)
  const axis = (grp, y, z, cx, cy) => { Q3.copy(C3); grp.worldToLocal(Q3); Q3.y += y; Q3.z += z; grp.localToWorld(Q3); const [x, yy] = gp(Q3), l = Math.hypot(x - cx, yy - cy) || 1; return [(x - cx) / l, (yy - cy) / l]; };
  const EASE_Q = 'cubic-bezier(.22,1,.36,1)', EASE_C = 'cubic-bezier(.33,1,.68,1)';
  const A = new T.Vector3(), B = new T.Vector3(), tick = perfDebug();

  const applyCam = (ie, p0) => {
    cam.position.z = baseZ() * D;
    const bx = narrow ? 0 : -W * .2 * ie * (1 - sm(.08, .26, p0)); // лид и кнопки остаются на чистом фоне
    cam.setViewOffset(W, H, bx + offX, offY, W, H); cam.updateMatrixWorld();
  };

  const KV = { femur: new T.Vector3(0, 0, 150), tibia: new T.Vector3(6, -12, -165) }, KP = new T.Vector3(), KQ = new T.Vector3();
  const kPoint = k => { // точка на модели в координатах экрана
    if (k.pt === 'femur') { world.updateWorldMatrix(true, false); KP.copy(KV.femur); KP.z *= 1 - .4 * kBig; world.localToWorld(KP); } // крупный план: точка бедра ближе к суставу, не под шапкой
    else if (k.pt === 'tibia') { spin.updateWorldMatrix(true, false); KP.copy(KV.tibia); spin.localToWorld(KP); }
    else if (k.pt === 'patella') anchors.patella_center.getWorldPosition(KP);
    else { anchors.epicondyle_medial.getWorldPosition(KP); anchors.epicondyle_lateral.getWorldPosition(KQ); KP.add(KQ); anchors.tibial_plateau.getWorldPosition(KQ); KP.add(KQ).multiplyScalar(1 / 3); }
    return gp(KP);
  };
  let kShown = -1, kBig = 0;
  const placeLabels = (p, itp, lift, flex) => {
    const lv = sm(.5, 1, itp) * (1 - sm(.86, .9, p)); // после въезда колена и до финала «Цель»
    if (Math.abs(lv - kShown) > .002) { kShown = lv; kBox.style.opacity = lv.toFixed(3); }
    if (lv < .002) return;
    const big = kBig = sm(.12, .17, p) * (1 - sm(.27, .31, p)); // этап 02 крупно: подписи ниже, почти на уровне точек
    const rc = safe(p, lift), pad = 16, gap = 10, REACH = 80, RAISE = 26 * (1 - big) - 6 * big; // колонка в 80 px от кости (за краем ноги), подпись выше точки
    for (const k of KL) [k.ax, k.ay] = kPoint(k);
    const K = Object.fromEntries(KL.map(k => [k.pt, k]));
    if (flex > 45) { // колено согнуто (вид сбоку, голень вправо): свободно справа над голенью и под коленом (правки человека 29.10)
      const fe = K.femur, jo = K.joint, pa = K.patella, ti = K.tibia;
      fe.tx = fe.ax + 56; fe.ty = fe.ay - 9 - RAISE; fe.ts = 1;                      // бедро: вправо, в пустоту над голенью
      jo.tx = pad; jo.ty = jo.ay + 52; jo.ts = -1; jo.white = true;                  // сустав: ниже сустава, белым
      pa.tx = pa.ax + 36; pa.ty = pa.ay + 26; pa.ts = 1;                             // надколенник: вплотную к колену, снизу справа
      ti.tx = Math.min(W - pad - 24 - ti.w, ti.ax - 10); ti.ty = Math.max(ti.ay + 46, pa.ty + pa.h + gap); ti.ts = 1; // голень: ниже и не у края
      for (const k of KL) { k.tx = Math.max(pad, Math.min(W - pad - k.w, k.tx)); k.ty = Math.max(rc.t, Math.min(rc.b - k.h, k.ty)); }
    } else for (const side of [-1, 1]) { // прямое колено: колонки у ноги по сторонам, сверху вниз по высоте точек, без наложений
      const ks = KL.filter(k => k.side === side).sort((a, b) => a.ay - b.ay), wmax = Math.max(...ks.map(k => k.w));
      const col = side > 0 ? Math.min(W - pad - 16 - wmax, Math.max(...ks.map(k => k.ax)) + REACH) : Math.max(pad + wmax, Math.min(...ks.map(k => k.ax)) - REACH);
      let minY = rc.t;
      for (const k of ks) {
        const under = side < 0 ? k.ax < col + 28 : k.ax > col - 28; // точка под колонкой: подпись ниже точки, а не поверх сустава
        const own = k.pt === 'femur' || k.pt === 'joint' ? -14 : k.pt === 'tibia' ? 30 : 18; // правки владельца 29.10: бедро и сустав ниже, надколенник и голень выше
        k.ty = Math.max(minY, Math.min(rc.b - k.h, under ? k.ay + 34 : k.ay - 9 - RAISE - own)); minY = k.ty + k.h + gap;
        k.tx = side > 0 ? col : col - k.w; k.ts = side; k.white = false;
      }
    }
    for (const k of KL) {
      // плавно к цели: смена раскладки на границе этапов без прыжка
      if (k.x == null) { k.x = k.tx; k.y = k.ty; } else { k.x += (k.tx - k.x) * .18; k.y += (k.ty - k.y) * .18; }
      k.el.style.transform = `translate(${k.x.toFixed(1)}px,${k.y.toFixed(1)}px)`;
      if (k.key && k.el.classList.contains('white') !== !!k.white) { k.el.classList.toggle('white', !!k.white); k.path.classList.toggle('white', !!k.white); k.dot.classList.toggle('white', !!k.white); }
      // выноска: прямая полка от ближнего к точке края подписи, затем излом под 45° к точке
      const right = k.x + k.w / 2 > k.ax, lx = right ? k.x - 6 : k.x + k.w + 6, ly = k.y + 9, dy = Math.abs(k.ay - ly), dir = right ? 1 : -1;
      let ex = k.ax + dir * dy; if (right ? ex > lx : ex < lx) ex = lx;
      k.path.setAttribute('d', `M${lx.toFixed(1)} ${ly.toFixed(1)}H${ex.toFixed(1)}L${k.ax.toFixed(1)} ${k.ay.toFixed(1)}`);
      k.dot.setAttribute('cx', k.ax.toFixed(1)); k.dot.setAttribute('cy', k.ay.toFixed(1));
    }
  };

  function frame(now) {
    if (dead) return;
    if (now - lastDraw < q.gap) return;
    lastDraw = now;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!t0) { t0 = now; introOff = scrollP() > .02; } // страница открыта посреди прокрутки: без входа
    p += (scrollP() - p) * (1 - Math.exp(-dt * 5));

    const flex = kf(p, FLEX), th = flex * Math.PI / 180;
    const env = (a, b) => sm5(a, a + .03, p) * (1 - sm5(b - .03, b, p)), ph = (a, b) => (p - a) / (b - a);
    const lach = env(.5, .6) * Math.sin(ph(.5, .6) * Math.PI * 2) * 6;      // мм вперёд-назад
    const tilt = env(.62, .72) * Math.sin(ph(.62, .72) * Math.PI * 2) * .07; // ~4° в стороны
    const rot = env(.76, .88) * Math.sin(ph(.76, .88) * Math.PI * 2) * .22;  // ~13° внутрь-наружу
    shank.rotation.x = th; spin.rotation.set(0, tilt, rot); shank.position.y = -lach; pat.rotation.x = th * .42; pat.position.y = -lach * .3;

    const itp = introOff ? 1 : Math.min(1, (now - t0) / INTRO_MS), ie = sm5(0, 1, itp);
    const zz = .0108 * sm(.9, .92, p) + (cine ? 0 : .9892 * sm(.975, 1, p) ** 2); // cine: без улёта, кадр «Цель» накрывает следующий блок; // кадр «Цель» держится с 92% до 97,5%, улёт в последние 2,5%
    const lift = phone ? sm(.18, .2, p) * 72 : 0;

    // подгон камеры: меряем суставную область без входного масштаба и поворота, потом двигаем камеру к безопасной области
    const ry = kf(p, RY), rx = Math.sin(sm(.3, .9, p) * Math.PI) * .18 + .05;
    if (p <= (ck ? .975 : .9) && R && (narrow || (p > .1))) { // кино: рамка держит колено и в финале (бедро длиннее)
      applyCam(ie, p); orbit.rotation.set(rx, ry, 0); orbit.scale.setScalar(1); orbit.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const put = v => { v.project(cam); const sx = (v.x * .5 + .5) * W, sy = (.5 - v.y * .5) * H; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); };
      MC.set(0, 0, 0);
      for (const o of marks) { o.getWorldPosition(A); MC.add(A); put(A); }
      // телефон, этап 02 (вид спереди): колено крупно — в рамку берём меньше бедра и голени (решение владельца 29.10)
      const big = cine && narrow ? sm(.12, .17, p) * (1 - sm(.27, .31, p)) : 0;
      const ce = cineExt.length ? Math.max(narrow ? .75 * (1 - .55 * big) : 0, sm(.78, .9, p)) : 0;
      if (ce > 0) { MC.multiplyScalar(1 / marks.length); for (const o of cineExt) { if (o.userData.soft && !narrow) continue; o.getWorldPosition(EX); put(EX.sub(MC).multiplyScalar(ce).add(MC)); } }
      const pad = .045 * H, rc = safe(p, lift), bw = x1 - x0 + 2 * pad, bh = y1 - y0 + 2 * pad, rw = rc.r - rc.l, rh = rc.b - rc.t;
      if (rw > 80 && rh > 80) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx0 = (rc.l + rc.r) / 2 + (cine && narrow && p > .88 ? W * .06 : 0), ry0 = (rc.t + rc.b) / 2;
        let k = Math.min(rw / bw, rh / bh) * (cine && narrow && p > .88 ? .97 : .9); // телефон, «Цель»: колено крупнее
        const outside = k < 1 || cx < rc.l || cx > rc.r || cy < rc.t || cy > rc.b
          || (ck && (y0 - pad < rc.t || y1 + pad > rc.b || x0 - pad < rc.l || x1 + pad > rc.r)); // кино: край рамки (бедро) тоже не выходит за безопасную область
        if (narrow || outside) {
          if (!narrow) k = Math.min(1, k);
          const a = 1 - Math.exp(-dt * 4);
          D = Math.min(2.2, Math.max(.7, D + (D / k - D) * a));
          offX += (cx - rx0) * a; offY += (cy - ry0) * a;
        }
      }
    }
    else if (!narrow && p <= .1) { // компьютер, начало: подгон выключен, камера плавно возвращается в исходный кадр (иначе после прокрутки к плечу и обратно колено остаётся ниже, 29.10)
      const a = 1 - Math.exp(-dt * 4); D += (1 - D) * a; offX -= offX * a; offY -= offY * a;
    }
    applyCam(ie, p);
    const turn = phone ? 1.2 * Math.PI : 2.25 * Math.PI;
    const fx = window.__heroFx; // переход колено → плечо (chapter-wipe.js): докрутка и размытие разворота
    orbit.rotation.set(rx + (1 - ie) * .12 + (fx ? fx.my || 0 : 0), ry - (1 - ie) * turn + (fx ? fx.spin + (fx.mx || 0) : 0), 0); // mx/my: поворот за мышью (hero-text-fx.js)
    orbit.scale.setScalar((1 + (1 - ie) * (phone ? 1 : narrow ? 1.5 : 2.2)) * (1 + zz * 9));

    set(cv, 'opacity', String((phone ? sm(0, .6, itp) : Math.min(1, (now - t0) / 320)) * (cine ? 1 : 1 - sm(.985, 1, p))));
    const blur = phone ? 0 : (1 - sm5(0, .85, itp)) * 14 * (1 - sm(0, .08, p)) + (cine ? 0 : sm(.98, 1, p) * 6) + (fx ? fx.blur : 0);
    set(cv, 'filter', blur > .3 ? `blur(${blur.toFixed(1)}px)` : 'none');

    if (narrow) stage.style.setProperty('--fog', String(1 - sm(.1, .22, p)));
    const tf = cine && narrow ? sm(.07, .15, p) : sm(.1, .22, p); // телефон (кино): заголовок уходит раньше, чтобы этап 02 сразу показал свой номер и текст
    set(el.type, 'opacity', String(1 - tf)); set(el.type, 'transform', `translateY(${(-tf * 6).toFixed(1)}svh)`);
    set(el.copy, 'opacity', String(1 - sm(.08, .18, p))); set(el.copy, 'visibility', p > .18 ? 'hidden' : 'visible');
    if (phone && (p <= .18) !== ctaOn) { ctaOn = p <= .18; document.dispatchEvent(new CustomEvent('hero:cta', { detail: ctaOn })); }

    const cap = CAPS.find(c => p >= c[0] && p < c[1]);
    text(el.cap, cap ? cap[2] : p >= .9 ? '' : 'Осмотр спереди');
    set(el.read, 'opacity', String(sm(.03, .05, p) * (1 - sm(.88, .9, p)))); // подпись и «схема» идут вместе с этапами осмотра

    const st = STAGES.findIndex(s => p >= s[0] && p < s[1]);
    if (st !== stageIdx && st >= 0) { // подпись в aria-live меняется только при смене этапа
      // M27: уход 200 мс, вход построчно; без анимации при первом показе, скрытой колонке, быстрой прокрутке (< 300 мс) и reduced-motion
      const quick = stageIdx < 0 || !edgeVisible || reduce.matches || now - lastSwap < 300, old = el.edge.querySelector('small');
      stageIdx = st; lastSwap = now; clearTimeout(swapT); edgeAnim.forEach(a => a.cancel()); edgeAnim = [];
      const show = () => {
        edgeAnim.forEach(a => a.cancel()); edgeAnim = [];
        const small = renderEdge(); R && measure();
        if (quick) return;
        el.et.querySelectorAll('.line>span').forEach((e, i) => edgeAnim.push(e.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 560, delay: i * 60, easing: EASE_Q, fill: 'backwards' })));
        edgeAnim.push(small.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 160, easing: EASE_C, fill: 'backwards' }));
      };
      if (quick) show(); else {
        for (const n of [el.et, old]) n && edgeAnim.push(n.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 200, easing: 'cubic-bezier(.32,0,.67,0)', fill: 'forwards' }));
        swapT = setTimeout(show, 200);
      }
      clearTimeout(liveT); liveT = setTimeout(() => { el.live.textContent = edgeVisible ? `${STAGES[st][2]}. ${STAGES[st][3]}. ${STAGES[st][4]}` : ''; }, 800);
    }
    const edgeO = (cine && narrow ? sm(.14, .19, p) : sm(.22, .28, p)) * (cine ? 1 : 1 - sm(.99, 1, p));
    set(el.edge, 'opacity', String(edgeO)); edgeVisible = edgeO > .05;
    set(el.doc, 'opacity', String(sm(.2, .3, p) * (1 - sm(.9, .95, p))));
    const n = Math.round(sm(.12, .85, p) * 6);
    if (n !== el.ticket.__n) { el.ticket.__n = n; el.ticket.style.setProperty('--printed', n); }
    // cine: финал не гаснет (на компьютере его накрывает разворот, chapter-wipe.js); без разворота (телефон, планшет, клавиатура)
    // плашки гаснут, пока «Колено и плечо» подъезжает снизу, а не режутся его краем (аудит 28.10, P2-5)
    const jt = cine && joinsEl ? joinsEl.getBoundingClientRect().top / innerHeight : 9, ovr = cine ? sm(.98, 1.12, jt) : 1;
    set(el.ticket, 'opacity', String((cine ? sm(.08, .13, p) : 1 - sm(.92, .98, p)) * ovr)); // cine: на первом экране края талона нет (аудит P2-4)
    // телефон (кино): после первого свайпа плашка «сильная боль… 103/112» уходит, она закрывала колено (решение владельца 29.10); тот же текст есть в блоке «Не ждите приёма»
    const urgO = (cine ? (phone ? 1 - sm(.04, .09, p) : 1) : 1 - sm(.94, .97, p)) * ovr;
    set(el.urgent, 'opacity', String(urgO)); set(el.urgent, 'visibility', urgO < .02 ? 'hidden' : 'visible');
    if (cine && phone && hero.classList.contains('urg-off') !== urgO < .02) { hero.classList.toggle('urg-off', urgO < .02); requestAnimationFrame(() => R && measure()); } // плашки нет: подписи этапа опускаются вниз // в конце hero не просвечивает сквозь шапку
    if (cine && phone) el.urgent.classList.toggle('is-chip', p > .1); // телефон: после первого шага плашка в одну строку (P2-8)

    // боль: красные точки пульсируют, на этапе усиливаются, с 82% тают в акцент, к 92% отметок нет
    const pulseEnd = t0 + INTRO_MS + 5000, pulse = 1 - sm(pulseEnd, pulseEnd + 600, now);
    const sec = now / 1000, heal = sm5(.82, .93, p), env2 = (a, b) => sm(a, a + .03, p) * (1 - sm(b - .03, b, p));
    const emph = { patella_center: 1 + .9 * env2(.3, .5), epicondyle_medial: 1 + .9 * env2(.6, .9), epicondyle_lateral: 1 + .9 * env2(.6, .9), tibial_tuberosity: 1 + .9 * env2(.5, .6) };
    for (const o of pain) {
      const w = .5 + .5 * Math.sin(sec * 2.6 + o.i * 1.7) * pulse; // WCAG 2.2.2: пульс не дольше 5 с
      o.s.scale.setScalar((16 + 14 * w) * emph[o.n] * (1 - heal * .7)); o.s.material.opacity = (.35 + .5 * w) * (1 - sm5(.35, 1, heal));
      o.s.material.color.copy(RED).lerp(ACC, sm5(0, .6, heal));
      o.c.scale.setScalar(26 + heal * 46); o.c.material.opacity = .55 * Math.sin(Math.PI * heal); o.c.material.color.copy(ACC);
      o.m.color.copy(RED).lerp(ACC, sm5(0, .6, heal)); o.m.opacity = 1 - sm5(.5, 1, heal);
    }

    // мягкие ткани: в покое приглушены, на своём этапе плавно в полный тон (15.2.2)
    const eAcl = env(.5, .6), eLat = env(.6, .73), eMen = env(.73, .9);
    paintSoft({ acl: eAcl, lat: eLat, men: eMen });
    patMat.color.copy(TXT); patMat.opacity = dk ? .55 : .45;
    const m06 = phone ? sm(.73, .78, p) * (1 - sm(.86, .9, p)) : 0; // телефон, этап 06: сустав крупно, свечение тише, иначе формы сливаются в ком (P2-9)
    if (ck) { patMat.color.set(dk ? '#8F7CF0' : '#6A55D6'); patMat.opacity = dk ? .4 : .35; ck.frame({ heal, pulse, sec, emph: Math.max(...Object.values(emph)), size: 70, quiet: Math.max(1 - sm(.08, .18, p), m06 * .8), dim: m06 }); }
    orbit.updateMatrixWorld(true);
    bend.value.copy(shank.matrix).multiply(spin.matrix); // положение голени относительно бедра: ткани между ними изгибаются
    { const T4 = bend.value, e = T4.elements; // T = M в системе мешей: p -> P + M (p - P)
      const x = P.x, y = P.y, z = P.z; e[12] += x - (e[0] * x + e[4] * y + e[8] * z); e[13] += y - (e[1] * x + e[5] * y + e[9] * z); e[14] += z - (e[2] * x + e[6] * y + e[10] * z); }
    anchors.patella_center.getWorldPosition(A); anchors.tibial_tuberosity.getWorldPosition(B);
    { const pa = pl.geometry.attributes.position; pa.setXYZ(0, A.x, A.y, A.z); pa.setXYZ(1, B.x, B.y, B.z); pa.needsUpdate = true; }
    fadeLines(lineMats, now);

    // угломер (15.13.2): число видно на этапах 03-06, дуга ещё и только когда колено повёрнуто боком и окно шире 860
    const nv = sm(.28, .32, p) * (1 - sm(.88, .9, p)), dgr = Math.round(flex);
    if (dgr !== lastDeg) { lastDeg = dgr; const t = dgr + '°'; deg.innerHTML = dgr + '<span class="dg">°</span>'; dw = (t.length * .6 - .1) * parseFloat(getComputedStyle(deg).fontSize); }
    set(deg, 'opacity', nv.toFixed(3));
    if (narrow || nv < .002) { set(gauge, 'opacity', '0'); } else {
      const gv = sm(.55, .9, Math.abs(Math.sin(ry))) * nv;
      anchors.epicondyle_medial.getWorldPosition(C3); anchors.epicondyle_lateral.getWorldPosition(A); anchors.tibial_plateau.getWorldPosition(B);
      C3.add(A).add(B).multiplyScalar(1 / 3); A.copy(C3);
      const [cx, cy] = gp(A), u0 = axis(world, 0, -100, cx, cy), u1 = axis(spin, 0, -100, cx, cy), uf = axis(world, 50, -86.6, cx, cy); // uf: опорное сгибание 30°, задаёт сторону шкалы
      const side = Math.sign(u0[0] * uf[1] - u0[1] * uf[0]) || 1, a0 = Math.atan2(u0[1], u0[0]);
      const beta = Math.max(-10 * RAD, Math.min(125 * RAD, side * Math.atan2(u0[0] * u1[1] - u0[1] * u1[0], u0[0] * u1[0] + u0[1] * u1[1])));
      const rc = safe(p, lift), r = Math.max(48, Math.min(.22 * H, cx - rc.l - 24, rc.r - cx - 24, cy - rc.t - 24, rc.b - cy - 24));
      if (Math.abs(r - gs.r) > .5) { // деления строятся при смене радиуса, поворот группой
        gs.r = r; let d = '';
        for (let f = 0; f <= 120; f += 5) { const l = f % 15 ? 6 : 12, c = Math.cos(f * RAD), sn = Math.sin(f * RAD); d += `M${((r - l) * c).toFixed(1)} ${((r - l) * sn).toFixed(1)}L${(r * c).toFixed(1)} ${(r * sn).toFixed(1)}`; }
        gTicks.setAttribute('d', d); gArc.setAttribute('d', `M${r.toFixed(1)} 0A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(r * Math.cos(120 * RAD)).toFixed(1)} ${(r * Math.sin(120 * RAD)).toFixed(1)}`);
        gs.b = 1e9;
      }
      if (Math.abs(cx - gs.x) > .5 || Math.abs(cy - gs.y) > .5 || Math.abs(a0 - gs.a) > .25 * RAD || gs.side !== side) {
        gs.x = cx; gs.y = cy; gs.a = a0; gs.side = side; gg.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(a0 / RAD).toFixed(2)}) scale(1 ${side})`);
      }
      if (Math.abs(beta - gs.b) > .25 * RAD || gs.rr !== gs.r) {
        gs.b = beta; gs.rr = gs.r; gArrow.setAttribute('x2', ((r + 8) * Math.cos(beta)).toFixed(1)); gArrow.setAttribute('y2', ((r + 8) * Math.sin(beta)).toFixed(1));
      }
      if (gv > .05) { if (!gShown) { gShown = 1; gT = now; } } else if (gv < .02) gShown = 0;
      const ap = reduce.matches ? gShown : gShown * (1 - (1 - Math.min(1, (now - gT) / 480)) ** 3), off = (1 - ap).toFixed(3); // M28: дуга и деления вычерчиваются 480 мс
      set(gArc, 'strokeDashoffset', off); set(gTicks, 'strokeDashoffset', off); set(gauge, 'opacity', gv.toFixed(3));
      // число на биссектрисе раскрытого угла, на r + 24 от дуги; не влезло в безопасную область: на другую сторону центра
      const ba = a0 + side * Math.max(beta, 50 * RAD) / 2, bx = Math.cos(ba), by = Math.sin(ba), fs = dw / (String(dgr).length + 1) / .6;
      const dist = r + 24 + (dw / 2) * Math.abs(bx) + (fs / 2) * Math.abs(by), fit = (x, y) => x - dw / 2 >= rc.l && x + dw / 2 <= rc.r && y - fs / 2 >= rc.t && y + fs / 2 <= rc.b;
      let nx = cx + bx * dist, ny = cy + by * dist;
      if (!fit(nx, ny)) { const mx = cx - bx * dist, my = cy - by * dist; if (fit(mx, my)) { nx = mx; ny = my; } else { nx = Math.min(rc.r - dw / 2, Math.max(rc.l + dw / 2, nx)); ny = Math.min(rc.b - fs / 2, Math.max(rc.t + fs / 2, ny)); } }
      if (Math.abs(nx - gs.nx) > .5 || Math.abs(ny - gs.ny) > .5) { gs.nx = nx; gs.ny = ny; deg.style.transform = `translate(${(nx - dw / 2).toFixed(1)}px,${(ny - fs / 2).toFixed(1)}px)`; }
    }
    if (narrow && deg.style.transform) deg.style.transform = '';
    if (cine && narrow) placeLabels(p, itp, lift, Math.abs(flex));
    const r0 = performance.now();
    renderer.render(scene, cam);
    tick(now);
    const slow = q.after(now, performance.now() - r0);
    // телефон: просадка кадров до начала прокрутки возвращает постер (после начала прокрутки высота hero меняться не должна)
    if (phone && slow > 1500 && p < .02) poster();
  }
  const lp = loop(hero, frame, { vis: true });
  lp.kick();
}
