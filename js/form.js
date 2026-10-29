import { $, icon } from './dom.js';

// Данные никуда не уходят, пока action не абсолютный https-адрес; значения не логируются и не сохраняются.
const phoneOk = v => { const d = v.replace(/\D/g, ''); return (d.length === 11 && /^[78]/.test(d)) || (d.length === 10 && d[0] === '9'); };

export function initForm() {
  const form = $('#form'), btn = $('#submit'), summary = $('#summary'), fail = $('#fail'), done = $('#done');
  const rules = [
    { el: $('#f-name'), err: $('#e-name'), check: el => (el.value.trim() ? '' : 'Укажите имя') },
    { el: $('#f-tel'), err: $('#e-tel'), check: el => (!el.value.trim() ? 'Укажите телефон' : phoneOk(el.value) ? '' : 'Введите телефон полностью, например +7 900 000 00 00') },
    { el: $('#f-agree'), err: $('#e-agree'), check: el => (el.checked ? '' : 'Нужно согласие на обработку данных') },
  ];
  const label = btn.textContent;

  const validate = r => {
    const msg = r.check(r.el);
    if (msg) r.el.setAttribute('aria-invalid', 'true'); else r.el.removeAttribute('aria-invalid');
    r.err.hidden = !msg;
    if (msg) r.err.innerHTML = `${icon('alert-circle')}<span>${msg}</span>`;
    return msg;
  };
  rules.forEach(r => {
    r.el.addEventListener(r.el.type === 'checkbox' ? 'change' : 'blur', () => validate(r));
    r.el.addEventListener('input', () => { if (r.el.getAttribute('aria-invalid')) validate(r); });
  });

  const busy = on => {
    btn.setAttribute('aria-busy', on);
    if (on) { btn.style.width = btn.offsetWidth + 'px'; btn.innerHTML = 'Отправляем<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>'; }
    else { btn.textContent = label; btn.style.width = ''; }
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    fail.hidden = true;
    const bad = rules.filter(r => validate(r));
    summary.hidden = !bad.length;
    if (bad.length) {
      summary.innerHTML = '<p>Проверьте поля:</p><ul>' + bad.map(r => `<li><a href="#${r.el.id}">${r.err.textContent}</a></li>`).join('') + '</ul>';
      summary.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); $(a.getAttribute('href')).focus(); }));
      summary.scrollIntoView({ block: 'center' });
      return bad[0].el.focus({ preventScroll: true });
    }
    const action = form.getAttribute('action');
    const nolink = $('#nolink');
    if (!/^https:\/\//.test(action)) { // endpoint не подключён: ничего не отправляем и не обещаем звонок
      nolink.hidden = false; nolink.tabIndex = -1; nolink.scrollIntoView({ block: 'center' }); nolink.focus({ preventScroll: true });
      return;
    }
    nolink.hidden = true;
    if (form.elements.website.value) return; // ловушка для ботов: тихо завершаем, успех не показываем
    busy(true);
    try {
      const res = await fetch(action, { method: 'POST', body: new FormData(form) });
      if (!res.ok) throw new Error(res.status);
      const t = done.dataset.callbackTime; // срок перезвона подставляется здесь, когда он известен
      if (t) $('#callback-time').textContent = ' ' + t;
      form.hidden = true; done.hidden = false; done.classList.add('print'); done.focus();
    } catch {
      fail.hidden = false;
    }
    busy(false);
  });
}
