import { $ } from './dom.js';

// Аналитика только после согласия. Сейчас аналитики нет: событие consent ждёт будущего подключения.
const KEY = 'cookie-consent';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

export function initCookie() {
  const bar = $('#cookie'), dlg = $('#cookie-dlg'), opt = $('#opt-analytics');
  const show = on => {
    bar.hidden = false; document.dispatchEvent(new CustomEvent('cookie:visible', { detail: on }));
    void bar.offsetWidth; bar.classList.toggle('is-on', on);
    document.documentElement.style.setProperty('--cookie-h', on ? bar.offsetHeight + 'px' : '0px');
    if (!on) setTimeout(() => { bar.hidden = true; }, 340);
  };
  const save = analytics => {
    try { localStorage.setItem(KEY, JSON.stringify({ analytics })); } catch {}
    document.dispatchEvent(new CustomEvent('consent', { detail: { analytics } }));
    show(false);
  };
  bar.addEventListener('click', e => {
    const c = e.target.closest('[data-consent]');
    if (c) save(c.dataset.consent === 'all');
  });
  const openDlg = () => { opt.checked = !!read()?.analytics; dlg.showModal(); };
  $('#cookie-more').addEventListener('click', openDlg);
  $('#cookie-settings').addEventListener('click', openDlg);
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'save') save(opt.checked); dlg.returnValue = ''; });
  if (!read()) {
    // телефон: сразу (баннер компактный); от 768: через 4,5 с или после первой прокрутки
    if (matchMedia('(min-width:768px)').matches) {
      const open = () => { clearTimeout(t); removeEventListener('scroll', open); show(true); };
      const t = setTimeout(open, 4500);
      addEventListener('scroll', open, { once: true, passive: true });
    } else setTimeout(() => show(true), 600);
  }
}
