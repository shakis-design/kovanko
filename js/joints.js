// #joints: плечо. Кадр закреплён (sticky), угол руки 0-160° и ракурс камеры идут по ходу прокрутки дорожки #joints-track.
// 3D (shoulder-a.js, три и Draco из vendor\) только при data-hero="3d" и подгружается при подходе к блоку.
// Запасной вариант: кадры той же 3D-модели (img/shoulder-frames, 17 шт., 0-160° с шагом 10°), два <img> с перекрёстным растворением; грузятся только когда 3D не работает.
// Без JS и при reduced-motion: статичный <picture> с кадром 09 (90°).
import { $, root } from './dom.js';

export function initJoints() {
  const out = $('#arm-deg'), stage = $('#joints-stage'), view = $('.joints__view', stage);
  if (!view || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  view.setAttribute('role', 'img');
  // ход по закреплённой дорожке: 0 когда кадр встал под шапку, 1 когда дорожка прокручена
  const track = $('#joints-track');
  const target = () => { const b = track.getBoundingClientRect(), run = b.height - innerHeight; return run > 0 ? Math.min(1, Math.max(0, -b.top / run)) : 0; };
  // сценарий камеры (решение владельца 27.10, по его снимкам): прямо → чуть сверху, лопатка плоскостью → рука идёт на зрителя (+45°)
  // ключи по ходу прокрутки k (0..1): [k, поворот вокруг вертикали, наклон], рад
  const VIEWS = [[0, -.14, .04], [.5, -.35, .25], [1, .7, .18]];
  const viewAt = k => { let i = 1; while (i < VIEWS.length - 1 && k > VIEWS[i][0]) i++; const [k0, y0, p0] = VIEWS[i - 1], [k1, y1, p1] = VIEWS[i];
    let u = Math.min(1, Math.max(0, (k - k0) / (k1 - k0))); u = u * u * (3 - 2 * u); return [y0 + (y1 - y0) * u, p0 + (p1 - p0) * u]; };
  const dark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  let fr = null, startedFr = false;
  const startFrames = () => {
    if (startedFr) return; startedFr = true;
    const dir = new URL(root.dataset.look === 'cine' ? '../img/shoulder-frames-cine/' : '../img/shoulder-frames/', import.meta.url).href, keep = [];   // кино-превью: кадры в новом стиле, на фоне секции
    let ext = 'avif', k = -1, o = -1, la = 0;
    const src = n => `${dir}${dark()}/${String(n).padStart(2, '0')}.${ext}`;
    const [A, B] = [0, 1].map(() => { const im = new Image(); im.alt = ''; im.width = im.height = 600; im.decoding = 'async'; view.append(im); return im; });
    // сначала начало, середина и конец, потом остальные
    const preload = () => [0, 8, 16, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15].forEach((n, i) => setTimeout(() => { const im = new Image(); im.src = src(n); keep.push(im); }, i < 3 ? 0 : 60 * i));
    const set = a => { // запись в DOM только при смене кадра или прозрачности
      la = a; const f = a / 10, n = Math.min(15, Math.floor(f)), p = (f - n).toFixed(2);
      if (n !== k) { k = n; A.src = src(n); B.src = src(n + 1); }
      if (p !== o) B.style.opacity = o = p;
    };
    const probe = new Image(); probe.src = src(0); // формат: AVIF, если браузер его декодирует, иначе WebP
    probe.decode().catch(() => { ext = 'webp'; }).then(() => {
      fr = set; set(160 * smooth(q)); preload();
      A.decode().catch(() => {}).then(() => { stage.dataset.anim = '1'; });
      document.addEventListener('themechange', () => { k = -1; keep.length = 0; set(la); preload(); });
    });
  };
  const smooth = x => x * x * x * (x * (x * 6 - 15) + 10);
  let q = target(), last = 0, raf = 0, vis = false, deg = -1, shown = -1, api = null;
  const tick = now => {
    raf = 0; if (!vis || document.hidden) return;
    const dt = Math.min(.05, (now - (last || now - 16)) / 1000); last = now;
    q += (target() - q) * (1 - Math.exp(-dt * 4)); // мягкое сглаживание поверх прокрутки
    const a = 160 * smooth(q), n = Math.round(a);
    if (api) { if (Math.abs(a - shown) > .05) { shown = a; api.setView(...viewAt(smooth(q))); api.setAngle(a); } } else fr?.(a);
    if (n !== deg) { deg = n; out.textContent = `Рука отведена на ${n}°`; view.setAttribute('aria-label', `Плечевой сустав, рука отведена на ${n}°`); }
    raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf && vis && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
  new IntersectionObserver(e => { vis = e[0].isIntersecting; api?.play(vis); kick(); }).observe(stage);
  document.addEventListener('visibilitychange', kick);

  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    if (root.dataset.hero !== '3d') return startFrames();
    const base = new URL('../', import.meta.url);
    const cine = root.dataset.look === 'cine'; // кино-стиль превью: стеклянные мышцы и кожа, как у колена первого экрана
    Promise.all([import('../vendor/three-r149.min.js'), import('./shoulder-a.js'), cine && import('./hero-cine.js')]).then(([T, m, hc]) => m.createShoulderA({
      cine: hc ? { kit: hc.CINE, tissue: new URL('models/shoulder-cine.draco.glb?b=1028body2', base).href, text: { light: '#0F1B2D', dark: '#E9EFF7' } } : undefined,
      THREE: T, GLTFLoader: T.GLTFLoader, DRACOLoader: T.DRACOLoader, container: view,
      model: new URL('models/shoulder-z.draco.glb', base).href, meta: new URL('models/shoulder-z.meta.json', base).href, body: new URL('models/shoulder-z-body.json', base).href,
      dracoPath: new URL('vendor/draco/', base).href, theme: dark(), angle: 160 * smooth(q),
      yaw: viewAt(smooth(q))[0], pitch: viewAt(smooth(q))[1], // ракурс по сценарию, вместе с подъёмом руки
      labels: innerWidth < 600 ? { forearm: '', hand: '', cuff: '' } : undefined, // на узком экране подписи предплечья, кисти и манжеты не помещаются
    })).then(a => {
      api = a; stage.dataset.live = '1'; a.play(vis);
      document.addEventListener('themechange', () => a.setTheme(dark()));
    }).catch(startFrames); // 3D не стартовал: кадры
  }, { rootMargin: '800px 0px' }).observe(stage);
}
