// Прокрутка колесом мыши с инерцией (пока только превью /preview-cine/).
// Только мышь на компьютере и без reduced-motion. Клавиатура, полоса прокрутки, тачпад-жесты по горизонтали,
// ссылки-якоря и окна (dialog, меню) работают как обычно.
const fine = matchMedia('(hover: hover) and (pointer: fine)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
const K = 9; // скорость доезда: больше = короче хвост
const doc = document.documentElement;
let target = scrollY, cur = scrollY, raf = 0, last = 0, own = false;

const max = () => doc.scrollHeight - innerHeight;
const locked = () => document.querySelector('dialog[open]') || getComputedStyle(doc).overflowY === 'hidden' || getComputedStyle(document.body).overflowY === 'hidden';
// колесо над блоком со своей прокруткой (меню, длинный список): отдаём браузеру
const innerScroll = (el, dy) => {
  for (; el && el !== document.body && el !== doc; el = el.parentElement) {
    const s = getComputedStyle(el).overflowY;
    if ((s === 'auto' || s === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
  }
  return false;
};

const step = now => {
  const dt = Math.min(.05, (now - (last || now)) / 1000 || .016); last = now;
  cur += (target - cur) * (1 - Math.exp(-dt * K));
  if (Math.abs(target - cur) < .5) cur = target;
  own = true; window.scrollTo({ top: cur, behavior: 'instant' });
  raf = cur === target ? 0 : requestAnimationFrame(step);
  if (!raf) last = 0;
};

addEventListener('wheel', e => {
  if (!fine.matches || reduce.matches || e.ctrlKey || e.defaultPrevented) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || locked() || innerScroll(e.target, e.deltaY)) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  if (!raf) cur = target = scrollY; // после клавиатуры, якоря или полосы прокрутки начинаем с текущего места
  target = Math.max(0, Math.min(max(), target + d));
  if (!raf) raf = requestAnimationFrame(step);
}, { passive: false });

// чужая прокрутка (клавиши, якорь, полоса) во время доезда: останавливаемся и не спорим
addEventListener('scroll', () => {
  if (own) { own = false; return; }
  if (raf && Math.abs(scrollY - cur) > 2) { cancelAnimationFrame(raf); raf = 0; last = 0; cur = target = scrollY; }
}, { passive: true });
addEventListener('resize', () => { target = Math.min(target, max()); });
// внешний стоп (переход колено → плечо прыгает сам): бросаем доезд и начинаем с текущего места
addEventListener('smoothwheel:stop', () => { cancelAnimationFrame(raf); raf = 0; last = 0; own = false; cur = target = scrollY; });
