import { $, $$, root } from './dom.js';
import { initChrome } from './chrome.js';

const io = (fn, opts) => new IntersectionObserver(es => es.forEach(fn), opts);

// Общий для главной и страниц /koleno/, /plecho/, /vtoroe-mnenie/: любого блока может не быть, тогда код тихо пропускает его.
export function initUi() {
  const setPast = initChrome();
  const hero = $('#hero'), book = $('#booking'), bar = $('#bottombar'), top = $('#to-top');
  // M7: шапка становится плотной, когда hero позади (на страницах шапка плотная всегда)
  if (hero && !$('.site-header').classList.contains('is-solid')) io(e => setPast(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-224px 0px 0px 0px' }).observe(hero);

  // M8: нижняя панель на телефоне (в 3D-режиме hero прячет свой CTA, тогда панель появляется раньше: событие hero:cta); M20: «Наверх»
  const st = { heroOut: false, ctaGone: false, book: false, cookie: false };
  const barUpdate = () => {
    const on = (st.heroOut || st.ctaGone) && !st.book && !st.cookie;
    bar.classList.toggle('is-on', on); root.classList.toggle('bar-on', on); topUpdate();
  };
  if (hero) io(e => { st.heroOut = !e.isIntersecting && e.boundingClientRect.top < 0; barUpdate(); }).observe(hero);
  if (book) io(e => { st.book = e.isIntersecting; barUpdate(); }).observe(book);
  document.addEventListener('cookie:visible', e => { st.cookie = e.detail; barUpdate(); });
  document.addEventListener('hero:cta', e => { st.ctaGone = !e.detail; barUpdate(); });
  const mark = document.createElement('i');
  mark.style.cssText = 'position:absolute;top:200vh;left:0;width:1px;height:1px;pointer-events:none';
  document.body.append(mark);
  let markPast = false;
  function topUpdate() { top.classList.toggle('is-on', markPast && st.heroOut); }
  io(e => { markPast = !e.isIntersecting && e.boundingClientRect.top < 0; topUpdate(); }).observe(mark);
  top.addEventListener('click', () => scrollTo({ top: 0 }));

  // появления: один раз
  const once = (sel, opts) => {
    const o = io(e => { if (e.isIntersecting) { e.target.classList.add('in'); o.unobserve(e.target); } }, opts);
    $$(sel).forEach(el => o.observe(el));
  };
  once('[data-reveal]:not(.photo),[data-reveal-checks]', { rootMargin: '0px 0px -10% 0px' });
  // фото открывается маской (clip-path), а маска обнуляет пересечение самого фото: следим за его обёрткой
  const op = io(e => { if (e.isIntersecting) { e.target.querySelector('.photo[data-reveal]')?.classList.add('in'); op.unobserve(e.target); } }, { threshold: .25 });
  $$('.photo[data-reveal]').forEach(el => op.observe(el.parentElement));

  initSymptoms();
  initMap();
}

// M6b: строка симптома в активной полосе включает зоны на схеме тела; M21: выноска от зоны к строке
function initSymptoms() {
  const map = $('.bodymap'), rows = $$('#rows li');
  if (!map) return;
  const zones = (list, faint) => $$('.zone', map).forEach(z => {
    const on = list.includes(z.id.split('-')[1]) || list.includes('all');
    z.classList.toggle('on', on && !faint); z.classList.toggle('faint', on && faint);
  });
  zones(['all'], true);

  const lead = $('#leader'), path = lead?.firstElementChild, sec = $('#symptoms'), wide = matchMedia('(min-width:1024px)');
  let active = null, inView = false, shown = '';
  const place = (animate) => {
    const list = active?.dataset.zones.split(' ') || [];
    const on = wide.matches && inView && active && !list.includes('all');
    lead.classList.toggle('on', !!on);
    if (!on) { shown = ''; return; }
    const mid = innerHeight / 2; let best = null, bd = 1e9;
    for (const z of $$('.zone', map)) {
      if (!list.includes(z.id.split('-')[1])) continue;
      const b = $('.mark', z).getBoundingClientRect(), cy = b.top + b.height / 2;
      const d = Math.abs(cy - mid) - b.left * 1e-4; // при равенстве берём правую зону: линия не пересекает фигуру
      if (d < bd) { bd = d; best = [b.left + b.width / 2, cy]; }
    }
    const ar = active.getBoundingClientRect(), ey = ar.top + ar.height / 2, x1 = ar.left - 24, d = `M${best[0].toFixed(1)} ${best[1].toFixed(1)}H${x1.toFixed(1)}V${ey.toFixed(1)}h16`;
    if (d === shown) return;
    shown = d; path.setAttribute('d', d);
    if (!animate) return;
    const len = path.getTotalLength(); // M21: прорисовка 320 мс
    path.style.transition = 'none'; path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    path.getBoundingClientRect(); path.style.transition = ''; path.style.strokeDashoffset = 0;
  };
  let raf = 0;
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(false); }); };
  if (lead) {
    io(e => { inView = e.isIntersecting; place(false); }, { rootMargin: '-30% 0px -30% 0px' }).observe(sec);
    addEventListener('scroll', later, { passive: true }); addEventListener('resize', later);
  }

  // один выбранный элемент: клик (по строке или по зоне карты) приоритетнее подсветки от прокрутки, пока строка в окне
  let chosen = null;
  const select = row => {
    rows.forEach(r => r.classList.toggle('on', r === row));
    const z = row.dataset.zones.split(' ');
    zones(z, z[0] === 'all');
    active = row; if (lead) place(true);
  };
  const band = io(e => { if (e.isIntersecting && !chosen) select(e.target); }, { rootMargin: '-45% 0px -45% 0px' });
  rows.forEach(r => { band.observe(r); r.addEventListener('click', () => { chosen = r; select(r); }); });
  rows.forEach(r => new IntersectionObserver(es => { if (!es[0].isIntersecting && r === chosen) chosen = null; }).observe(r)); // строка ушла из окна: выбор снят
  // зоны схемы: один Tab-стоп, стрелки между зонами; Enter/Space ведёт к строке и сообщает о ней
  const zs = $$('.zone', map), status = $('#zone-status');
  zs.forEach((z, i) => z.tabIndex = i ? -1 : 0);
  const name = z => z.id.split('-')[1];
  const go = z => {
    const row = rows.find(r => r.dataset.zones.split(' ').includes(name(z)));
    if (!row) return;
    row.tabIndex = -1; chosen = row; select(row); row.scrollIntoView({ block: 'center' }); row.focus({ preventScroll: true });
    status.textContent = 'Показан симптом: ' + row.textContent.trim();
  };
  zs.forEach((z, i) => {
    z.addEventListener('click', () => go(z));
    z.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(z); }
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step) { e.preventDefault(); const n = zs[(i + step + zs.length) % zs.length]; zs.forEach(x => x.tabIndex = -1); n.tabIndex = 0; n.focus(); }
    });
  });
}

// «Как добраться»: своя карта (OpenStreetMap, img/map/route.svg). Картинкой она следует только системной теме,
// поэтому у экрана подменяем её на встроенную SVG: цвета из токенов --m-* и переключателя темы сайта (29.10)
function initMap() {
  const box = $('#cmap'), img = box && $('.cmap__img', box);
  if (!img || !('IntersectionObserver' in window)) return;
  const inline = () => fetch(img.currentSrc || img.src).then(r => (r.ok ? r.text() : Promise.reject())).then(t => {
    const svg = new DOMParser().parseFromString(t, 'image/svg+xml').documentElement;
    if (svg.nodeName !== 'svg') return;
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice'); img.replaceWith(document.importNode(svg, true));
  }).catch(() => {}); // не вышло: остаётся картинка, ссылка на маршрут работает
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); inline(); } }, { rootMargin: '600px' });
  io.observe(box);
}
