// Переход «колено → плечо» на превью: дошли до конца первого экрана — наклонная шторка за 0,27 с открывает блок #joints,
// страница сама доезжает до него, заголовок блока собирается из случайных символов. Обратно — та же шторка вниз.
// Только компьютер (≥1024 px), только живое 3D, без «меньше движения». Без библиотек.

// Числа: разворот — решение человека 28.10 (вместо шторки cornrevolution, reference/cornrevolution-chapter/MECHANIC.md).
// Быстрота взята у оригинала (переход ≈ 0,27 с на фазу), остальное подобрано под наше колено.
const MOTION = {
  out: 0.28,           // колено с экраном уходят в разворот, с
  in: 0.32,            // плечо выходит из разворота, с
  spin: -2.4,          // докрутка колена, рад: в ту же сторону, что его собственный поворот в финале (RY в hero-3d.js убывает)
  turn: 72,            // поворот экрана как грани куба, градусы
  blur: 12,            // размытие движения на пике, px
  persp: 1400,         // перспектива поворота экрана, px
  inEase: t => t * t,               // разгон
  outEase: t => 1 - (1 - t) ** 3,   // мягкая остановка
  decode: 0.8,         // сборка заголовка «Колено и плечо», с
  hold: 0.18,          // после перехода колесо ещё не листает дальше, с
};

window.__chapterMotion = MOTION; // для проверки: можно растянуть время и снять кадры
const root = document.documentElement;
const hero = document.getElementById('hero'), joints = document.getElementById('joints');
const ok = matchMedia('(min-width:1024px) and (prefers-reduced-motion:no-preference)');
let busy = false, lastY = scrollY;

const on = () => hero && joints && ok.matches && root.dataset.hero === '3d' && root.dataset.look === 'cine';
const P_GO = 0.96; // решение человека 28.10: этап 06 и «Цель» со своими текстами, разворот после «Цели» (она с 0,9, см. STAGES в hero-3d.js)
const heroEnd = () => hero.offsetTop + P_GO * (hero.offsetHeight - 2 * innerHeight);
const jointsTop = () => joints.getBoundingClientRect().top + scrollY;
const stopGlide = () => dispatchEvent(new Event('smoothwheel:stop')); // плавная прокрутка не должна тянуть страницу к своей старой цели
const jump = y => { stopGlide(); window.scrollTo({ top: y, behavior: 'instant' }); stopGlide(); };

const stage = hero.querySelector('.hero__stage'), pin = joints.querySelector('.joints__pin') || joints;
const fx = window.__heroFx ||= { spin: 0, blur: 0 }; // общий с hero-text-fx.js (поворот за мышью)
const run = (dur, ease, fn) => new Promise(done => {
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / (dur * 1000)); fn(ease(k)); if (k < 1) requestAnimationFrame(step); else done(); };
  requestAnimationFrame(step);
});
// экран-грань: колено уходит влево вокруг левого края, плечо приходит вокруг правого
const face = (el, deg, origin, blur) => {
  el.style.transformOrigin = origin;
  el.style.transform = deg ? `perspective(${MOTION.persp}px) rotateY(${deg.toFixed(2)}deg)` : '';
  el.style.filter = blur > .3 ? `blur(${blur.toFixed(1)}px) brightness(${(1 - blur / MOTION.blur * .35).toFixed(3)})` : '';
};
const clear = el => { el.style.transform = el.style.transformOrigin = el.style.filter = ''; };

// заголовок: каждая буква сначала случайная, к своему моменту встаёт на место; переносы строк и пробелы не трогаем
const GLYPHS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ0123456789#%&';
const decode = el => {
  if (!el || el.dataset.decoding) return;
  const nodes = [], walk = n => n.nodeType === 3 ? nodes.push(n) : n.childNodes.forEach(walk);
  walk(el);
  const orig = nodes.map(n => n.textContent), when = orig.map(s => [...s].map(() => Math.random()));
  el.dataset.decoding = '1'; el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / (MOTION.decode * 1000));
    nodes.forEach((n, i) => { n.textContent = [...orig[i]].map((c, j) => c.trim() && k < when[i][j] ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : c).join(''); });
    if (k < 1) requestAnimationFrame(step); else { nodes.forEach((n, i) => { n.textContent = orig[i]; }); el.removeAttribute('aria-label'); delete el.dataset.decoding; }
  };
  requestAnimationFrame(step);
};

const go = async dir => {
  busy = true;
  const M = MOTION;
  if (dir > 0) { // вниз: колено докручивается и уводит экран, из того же движения выходит плечо
    await run(M.out, M.inEase, t => { fx.spin = M.spin * t; fx.blur = M.blur * t; face(stage, -M.turn * t, '0% 50%', M.blur * t); });
    jump(jointsTop()); fx.spin = fx.blur = 0; clear(stage);
    await run(M.in, M.outEase, t => face(pin, M.turn * (1 - t), '100% 50%', M.blur * (1 - t)));
    clear(pin); decode(document.getElementById('joints-h'));
  } else { // вверх: плечо уходит вправо, колено возвращается из разворота
    jump(jointsTop());
    await run(M.out, M.inEase, t => face(pin, M.turn * t, '100% 50%', M.blur * t));
    jump(heroEnd()); clear(pin);
    await run(M.in, M.outEase, t => { const r = 1 - t; fx.spin = M.spin * r; fx.blur = M.blur * r; face(stage, -M.turn * r, '0% 50%', M.blur * r); });
    fx.spin = fx.blur = 0; clear(stage);
  }
  setTimeout(() => {
    busy = false; lastY = scrollY;
    const y = scrollY, a = heroEnd(), b = jointsTop(); // осталась внутри стыка — доводим к ближайшему концу
    if (performance.now() >= navUntil && y > a + 2 && y < b - 2) go(y - a > b - y ? 1 : -1);
  }, M.hold * 1000);
};

// колесо: на стыке сами решаем, куда ехать; пока идёт переход, колесо не листает (ловим раньше плавной прокрутки)
addEventListener('wheel', e => {
  if (!on()) return;
  const y = scrollY, a = heroEnd(), b = jointsTop();
  if (busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (e.deltaY > 0 && y >= a - 4 && y < b - 2) { e.preventDefault(); e.stopImmediatePropagation(); go(1); }
  else if (e.deltaY < 0 && y > a + 2 && y <= b + 4) { e.preventDefault(); e.stopImmediatePropagation(); go(-1); }
}, { capture: true, passive: false });

// переход только от рук человека (колесо, клавиши, полоса прокрутки), а не от ссылок меню: они плавно едут через стык к своему разделу
let lastInput = 0, navUntil = 0;
const mark = () => { lastInput = performance.now(); };
addEventListener('wheel', mark, { capture: true, passive: true });
addEventListener('keydown', e => { if (e.key !== 'Tab') mark(); }, { capture: true }); // Tab: браузер сам подвозит к элементу в фокусе, переход не нужен (иначе прыжок уводит фокус за экран)
addEventListener('pointerdown', e => { if (e.target === root || e.target === document.body) mark(); }, { capture: true }); // полоса прокрутки
addEventListener('click', e => { if (e.target.closest?.('a[href*="#"]')) navUntil = performance.now() + 2500; }, { capture: true });

// клавиатура, полоса прокрутки, разгон колеса: попали внутрь стыка — доводим переход в сторону движения
addEventListener('scroll', () => {
  const y = scrollY, dir = Math.sign(y - lastY); lastY = y;
  const now = performance.now();
  if (busy || !on() || !dir || now < navUntil || now - lastInput > 900) return;
  const a = heroEnd(), b = jointsTop();
  if (y > a + 2 && y < b - 2) go(dir);
}, { passive: true });

// клавиши на стыке ведут себя как колесо: иначе плавная прокрутка браузера проскакивает начало плеча
const DOWN = ['PageDown', 'ArrowDown', ' ', 'Spacebar'], UP = ['PageUp', 'ArrowUp'];
addEventListener('keydown', e => {
  if (!on() || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  const down = DOWN.includes(e.key) && !e.shiftKey, up = UP.includes(e.key) || (e.key === ' ' && e.shiftKey);
  if (!down && !up) return;
  const y = scrollY, a = heroEnd(), b = jointsTop();
  if (busy && y >= a - 4 && y <= b + 4) { e.preventDefault(); return; }
  if (down && y >= a - 4 && y < b - 2) { e.preventDefault(); go(1); }
  else if (up && y > a + 2 && y <= b + 4) { e.preventDefault(); go(-1); }
});
