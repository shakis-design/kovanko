// Превью, первый экран, компьютер: заголовок «рассыпается» у курсора (буквы контуром + созвездие точек и линий, как на cornrevolution),
// без мыши эффект сам медленно гуляет по тексту; колено слегка поворачивается вслед за мышью.
// Без библиотек. Выключено на сенсорных экранах и при «меньше движения».

const FX = {
  radius: 120,        // радиус линзы: внутри круга текст контуром, px
  lag: 0.3,           // линза догоняет курсор с опозданием: за столько секунд проходит ~63 % пути (0 — прилипает к мыши), правка 29.10
  pts: 40,           // точек созвездия одновременно
  link: 80,          // соединять точки ближе этого, px
  life: [0.9, 2.2],  // жизнь точки, с
  wander: 9,         // без мыши центр эффекта проходит строку за столько секунд
  idleAfter: 1.6,    // мышь стоит дольше — считаем, что её нет, с
  fade: 0.9,         // курсор ушёл с заголовка: линза стоит на месте столько, потом гаснет, с
  hold: 2.5,         // через столько без мыши линза снова появляется и гуляет сама, с
  firstWalk: 3.5,    // первый самостоятельный проход — через столько после въезда заголовка, с (аудит P2-6)
  autoRadius: 95,    // радиус линзы, когда она гуляет сама; под курсором полный radius
  yaw: 0.32,         // поворот колена за мышью по горизонтали, рад (пока виден заголовок)
  pitch: 0.12,       // наклон по вертикали, рад
  follow: 0.07,      // плавность догоняния мыши за кадр (0..1)
  rest: 0.25,        // доля поворота за мышью на этапах осмотра (заголовок уже ушёл)
  // «змейки» внутри линзы: по контуру каждой буквы навстречу друг другу бегут два светящихся отрезка (решение человека 28.10)
  snake: 0.35,       // длина змейки, доля кегля
  gap: 1.5,          // промежуток до следующей, доля кегля
  speed: 0.16,       // скорость, долей кегля в секунду (человек 28.10: «медленнее» — вдвое от 0,32)
};

const root = document.documentElement;
const ok = matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
const hero = document.getElementById('hero'), h1 = document.getElementById('h1');
// только при живом 3D: head-скрипт ставит data-hero="poster" без видеокарты и на слабом компьютере — там линзу считал бы процессор (решение человека 28.10)
if (hero && h1 && ok.matches && root.dataset.look === 'cine' && root.dataset.hero === '3d') init();

function init() {
  // линза: копия заголовка контуром поверх, видна только внутри круга у курсора; основной текст в круге скрыт (маски в hero.css)
  h1.setAttribute('aria-label', [...h1.querySelectorAll('.line')].map(l => l.textContent.trim()).join(' '));
  const wire = document.createElement('span'); wire.className = 'h1-wire'; wire.setAttribute('aria-hidden', 'true');
  h1.querySelectorAll('.line').forEach(l => wire.append(l.cloneNode(true)));
  h1.append(wire); h1.classList.add('has-lens');
  let lensR = 0;

  // в копии строки текст заменяем SVG: CSS-обводка не умеет бегущий штрих. Тот же шрифт, позиция — по замеру исходной строки
  const NS = 'http://www.w3.org/2000/svg', snakes = [];
  const origLines = [...h1.querySelectorAll(':scope > .line')];
  [...wire.children].forEach((l, i) => {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'h1-snake');
    const mk = cls => { const t = document.createElementNS(NS, 'text'); t.setAttribute('class', cls); t.textContent = l.textContent; svg.append(t); return t; };
    mk('base'); const a = mk('sn'), b = mk('sn');
    l.append(svg); snakes.push({ l, src: origLines[i].firstElementChild, svg, ts: [...svg.children], a, b });
  });
  let fs = 0;
  const layout = () => {
    for (const s of snakes) {
      const rg = document.createRange(); rg.selectNodeContents(s.src); // сам текст, а не блок: строка может стоять со сдвигом
      const cs = getComputedStyle(s.src), lr = s.l.getBoundingClientRect(), sr = rg.getBoundingClientRect();
      fs = parseFloat(cs.fontSize);
      for (const t of s.ts) { t.style.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; t.style.letterSpacing = cs.letterSpacing; t.setAttribute('x', 0); t.setAttribute('y', 0); }
      const bb = s.ts[0].getBBox(); // верх текста SVG над базовой линией = верх строчного блока HTML
      for (const t of s.ts) { t.setAttribute('x', (sr.left - lr.left - bb.x).toFixed(2)); t.setAttribute('y', (sr.top - lr.top - bb.y).toFixed(2)); }
      const da = `${(fs * FX.snake).toFixed(1)} ${(fs * FX.gap).toFixed(1)}`; s.a.setAttribute('stroke-dasharray', da); s.b.setAttribute('stroke-dasharray', da);
    }
  };
  document.fonts.ready.then(layout); new ResizeObserver(layout).observe(h1); layout();
  const intro = Promise.all(origLines.flatMap(l => l.firstElementChild.getAnimations().map(a => a.finished))); // строки заголовка въезжают
  intro.then(layout, layout); // меряем после въезда
  let snakeT = 0;
  const lines = [...h1.querySelectorAll('.line')]; // свои и копии: маска у каждой строки в её координатах
  const cv = Object.assign(document.createElement('canvas'), { className: 'hero__constellation' });
  cv.setAttribute('aria-hidden', 'true');
  hero.querySelector('.hero__stage').append(cv);
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const size = () => { const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio, 2); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; };
  new ResizeObserver(size).observe(cv); size();

  const fx = window.__heroFx ||= { spin: 0, blur: 0 };
  fx.mx = fx.my = 0;
  let lastOver = -1e9, autoT0 = 0, autoS0 = 0, autoRow = 0;
  let mouse = null, lastMove = -1e9, mxT = 0, myT = 0, cx = 0, cy = 0, has = false;
  addEventListener('mousemove', e => { mouse = [e.clientX, e.clientY]; lastMove = performance.now(); mxT = e.clientX / innerWidth - .5; myT = e.clientY / innerHeight - .5; }, { passive: true });
  document.addEventListener('mouseleave', () => { mouse = null; mxT = myT = 0; });

  const pts = [];
  const spawn = (x, y, now) => { const a = Math.random() * Math.PI * 2, d = FX.radius * (.8 + Math.random() * .45); pts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: (Math.random() - .5) * 18, vy: (Math.random() - .5) * 18 - 6, r: .8 + Math.random() * 2.2, t0: now, life: (FX.life[0] + Math.random() * (FX.life[1] - FX.life[0])) * 1000 }); };
  let colT = 0, AC = '#9A89E8', INK = '#E9EFF7'; // цвета из темы, обновляем раз в секунду (переключение темы)
  const colors = now => { if (now - colT > 1000) { colT = now; const cs = getComputedStyle(root); AC = cs.getPropertyValue('--accent').trim() || AC; INK = cs.getPropertyValue('--text').trim() || INK; } };

  let last = performance.now();
  const type = h1.closest('.hero__type'); let tOp = 1, tOpT = 0; // прозрачность блока заголовка читаем 4 раза в секунду, а не каждый кадр
  const lv = lines.map(() => ['', '', '']); // последние записанные --lx/--ly/--lr: одинаковое не пишем
  const frame = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const hr = h1.getBoundingClientRect(), vis = Math.max(0, 1 - Math.max(0, -hero.getBoundingClientRect().top) / (innerHeight * .5)); // заголовок виден в начале прокрутки
    if (now - tOpT > 250) { tOpT = now; tOp = +getComputedStyle(type).opacity; }
    const lr = lines.map(l => l.getBoundingClientRect()), cr = cv.getBoundingClientRect(); // все замеры до записей: иначе браузер пересчитывает раскладку на каждой строке

    // колено за мышью: сильнее, пока виден заголовок
    const k = FX.rest + (1 - FX.rest) * vis;
    fx.mx += (mxT * FX.yaw * k - fx.mx) * FX.follow; fx.my += (myT * FX.pitch * k - fx.my) * FX.follow;

    // центр эффекта: курсор над заголовком; ушёл — линза едет за ним и гаснет; долго без мыши — автопилот с того же места
    const over = mouse && now - lastMove < FX.idleAfter * 1000 && mouse[0] > hr.left - 40 && mouse[0] < hr.right + 40 && mouse[1] > hr.top - 40 && mouse[1] < hr.bottom + 40;
    let tx = cx, ty = cy, want = FX.radius, chase = false;
    if (over) {
      tx = mouse[0]; ty = mouse[1]; chase = true; lastOver = now; autoT0 = 0; // без рамки заголовка: линза доезжает до курсора и у края букв (правка 29.10)
    } else if (now - lastOver < FX.hold * 1000) {
      if (mouse) { tx = mouse[0]; ty = mouse[1]; chase = true; } // курсор ушёл с заголовка: линза едет за ним дальше и по пути гаснет
      if (now - lastOver > FX.fade * 1000) want = 0; // через секунду гаснет
    } else {
      want = now < walkAt ? 0 : FX.autoRadius; // до первого прохода линзы нет, потом круг меньше
      if (!autoT0) { autoT0 = now; autoS0 = Math.min(1, Math.max(0, ((has ? cx : hr.left) - hr.left - hr.width * .1) / (hr.width * .8))); autoRow = has && cy > hr.top + hr.height / 2 ? 1 : 0; }
      const q = autoS0 + (now - autoT0) / 1000 / FX.wander, k = Math.floor(q), f = q - k; // туда-обратно по строке, на развороте смена строки
      tx = hr.left + hr.width * (.1 + .8 * (k % 2 ? 1 - f : f)); ty = hr.top + hr.height * ((autoRow + k) % 2 ? .72 : .28);
    }
    if (!has) { cx = tx; cy = ty; has = true; }
    const ca = chase ? 1 - Math.exp(-dt / FX.lag) : 1 - Math.pow(.88, dt * 60); // под курсором: опаздывает на FX.lag, одинаково при 60 и 120 Гц; автопилот как раньше
    cx += (tx - cx) * ca; cy += (ty - cy) * ca;
    const active = tOp > .05 && vis > .05;

    // радиус линзы: раскрывается, когда эффект активен, схлопывается, когда курсор ушёл или заголовок уехал
    lensR += ((active ? want : 0) - lensR) * .15;
    lines.forEach((l, i) => {
      const v = [(cx - lr[i].left).toFixed(1) + 'px', (cy - lr[i].top).toFixed(1) + 'px', lensR.toFixed(1) + 'px'], o = lv[i];
      if (v[0] !== o[0]) l.style.setProperty('--lx', o[0] = v[0]);
      if (v[1] !== o[1]) l.style.setProperty('--ly', o[1] = v[1]);
      if (v[2] !== o[2]) l.style.setProperty('--lr', o[2] = v[2]);
    });
    if (lensR > .5) { // змейки бегут, только пока линза открыта
      snakeT += dt; const off = snakeT * fs * FX.speed, per = fs * (FX.snake + FX.gap);
      for (const s of snakes) { s.a.setAttribute('stroke-dashoffset', (-off % per).toFixed(1)); s.b.setAttribute('stroke-dashoffset', ((off + per / 2) % per).toFixed(1)); }
    }
    if (!active && !pts.length && lensR < .5) { g.clearRect(0, 0, cv.width, cv.height); requestAnimationFrame(frame); return; } // заголовок ушёл: только поворот колена

    // созвездие
    const ox = cr.left, oy = cr.top;
    if (active && want) while (pts.length < FX.pts) spawn(cx - ox, cy - oy, now);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    colors(now); const ac = AC, tx2 = INK;
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; p.x += p.vx * dt; p.y += p.vy * dt; if (now - p.t0 > p.life || !active) pts.splice(i, 1); }
    g.globalAlpha = 1;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < FX.link) { g.globalAlpha = (1 - d / FX.link) * .45 * tOp; g.strokeStyle = tx2; g.lineWidth = .7; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    }
    for (const p of pts) { const age = (now - p.t0) / p.life, al = Math.sin(Math.PI * Math.min(1, age)) * tOp; g.globalAlpha = al; g.fillStyle = p.r > 2.3 ? ac : tx2; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
    requestAnimationFrame(frame);
  };
  // линза начинает гулять, когда заголовок въехал (≈1 с), а не во время загрузки (решение человека 28.10)
  let walkAt = 0;
  const start = () => { last = performance.now(); walkAt = last + FX.firstWalk * 1000; requestAnimationFrame(frame); };
  intro.then(start, start);
}
