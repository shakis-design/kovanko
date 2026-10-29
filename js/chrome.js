import { $, $$, root } from './dom.js';

// Тема и меню: общие для главной и служебных страниц. Возвращает setPast(bool) для M7.
export function initChrome() {
  const header = $('.site-header'), nav = $('#menu'), btn = $('#menu-btn'), wide = matchMedia('(min-width:64em)');
  let past = !!header.classList.contains('is-solid'), open = false;
  const solid = () => header.classList.toggle('is-solid', past || open);


  // тема: переключатель + системная
  const themeBtn = $('#theme'), dark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const syncTheme = () => {
    themeBtn.setAttribute('aria-pressed', dark());
    if (root.dataset.theme) $$('source[data-t]').forEach(s => { s.media = s.dataset.t === root.dataset.theme ? (s.dataset.m || 'all') : 'not all'; });
    document.dispatchEvent(new Event('themechange'));
  };
  themeBtn.addEventListener('click', () => {
    root.dataset.theme = dark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch {}
    syncTheme();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  syncTheme();

  // M17: меню на телефоне и планшете (закрытое меню не в табуляции)
  const setMenu = (on, back = true) => {
    open = on; nav.classList.toggle('is-open', on); nav.inert = !on && !wide.matches;
    btn.setAttribute('aria-expanded', on); solid();
    if (on) $('a', nav).focus(); else if (back) btn.focus({ preventScroll: true });
  };
  nav.inert = !wide.matches;
  btn.addEventListener('click', () => setMenu(!open));
  nav.addEventListener('click', e => { if (open && e.target.closest('a')) setMenu(false, false); });
  wide.addEventListener('change', () => setMenu(false, false));
  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') return setMenu(false);
    if (e.key !== 'Tab') return;
    const f = $$('a[href],button', nav).concat(btn), first = f[0], last = f.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // один источник номера: <body data-phone="+7 900 000 00 00">; пока пусто, a[data-tel] остаются серым текстом без ссылки
  const phone = document.body.dataset.phone.trim();
  if (phone) $$('a[data-tel]').forEach(a => { a.href = 'tel:+' + phone.replace(/\D/g, ''); if (!a.querySelector('svg')) a.textContent = phone; });
  return v => { past = v; solid(); };
}
