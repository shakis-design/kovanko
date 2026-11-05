// /shkaly/: подсчёт ASES и PDF в браузере, на сервер ничего не уходит (05.11.2026)
// ASES = (10 − боль) × 5 + сумма 10 вопросов (0–3) × 5/3, итог 0–100 (Richards 1994)
// PDF: jsPDF (vendor/jspdf.umd.min.js) и шрифт Geologica TTF (fonts/pdf) грузятся только по нажатию кнопки.
const form = document.getElementById('ases');
if (form) {
  const total = form.querySelector('#ases-total'), left = form.querySelector('#ases-left'), bands = [...form.querySelectorAll('.sc-bands li')];
  const msg = form.querySelector('#ases-msg'), date = form.elements['ases-date'];
  const today = () => { if (!date.value) date.value = new Date().toISOString().slice(0, 10); };
  today();
  const val = n => { const r = form.querySelector(`input[name="${n}"]:checked`); return r ? +r.value : null; };
  const scored = () => ['ases-pain', ...Array.from({ length: 10 }, (_, i) => 'ases-adl' + i)];
  let score = null;
  const calc = () => {
    const pain = val('ases-pain'), adl = Array.from({ length: 10 }, (_, i) => val('ases-adl' + i));
    const miss = (pain === null) + adl.filter(v => v === null).length;
    bands.forEach(b => b.classList.remove('on'));
    if (miss) { score = null; total.textContent = '—'; left.textContent = `Осталось ответить: ${miss} из 11 (интенсивность боли и вопросы 8–17).`; return; }
    score = Math.round(((10 - pain) * 5 + adl.reduce((a, b) => a + b, 0) * 5 / 3) * 10) / 10;
    total.textContent = String(score).replace('.', ',');
    left.textContent = '';
    (bands.find(b => +b.dataset.min === 80 ? score > 80 : score >= +b.dataset.min) || bands.at(-1)).classList.add('on');
  };
  form.addEventListener('change', () => { calc(); if (score !== null) msg.textContent = ''; });
  form.addEventListener('reset', () => setTimeout(() => { today(); calc(); msg.textContent = ''; }));
  calc();

  // ---------- PDF ----------
  const base = new URL('../', import.meta.url);
  let lib = null;
  const loadLib = () => lib ||= Promise.all([
    window.jspdf ? null : new Promise((ok, no) => { const s = document.createElement('script'); s.src = new URL('vendor/jspdf.umd.min.js', base); s.onload = ok; s.onerror = no; document.head.append(s); }),
    ...[400, 600].map(w => fetch(new URL(`fonts/pdf/geologica-${w}.ttf`, base)).then(r => r.arrayBuffer())),
  ]).then(([, r400, r600]) => ({ r400, r600 }));
  const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();

  const answers = () => [...form.querySelectorAll('.sc-list > li')].map(li => {
    const q = text(li.querySelector('.sc-q')), inp = li.querySelector('input.input');
    if (inp) return [q, inp.value.trim() || '—'];
    const r = li.querySelector('input[type=radio]:checked');
    return [q, r ? text(r.nextElementSibling) : '—'];
  });

  const makePdf = async () => {
    const { r400, r600 } = await loadLib();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.addFileToVFS('g400.ttf', b64(r400)); doc.addFont('g400.ttf', 'G', 'normal');
    doc.addFileToVFS('g600.ttf', b64(r600)); doc.addFont('g600.ttf', 'G', 'bold');
    const M = 18, Wd = 210 - M * 2, BOTTOM = 297 - 16; let y = M;
    const put = (str, { size = 10, bold = false, gray = false, gap = 1.6, x = M, w = Wd } = {}) => {
      doc.setFont('G', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(gray ? 110 : 20);
      const lines = doc.splitTextToSize(str, w), lh = size * 0.42;
      for (const l of lines) { if (y + lh > BOTTOM) { doc.addPage(); y = M; } doc.text(l, x, y + lh * .8); y += lh; }
      y += gap;
    };
    put('Шкала ASES', { size: 18, bold: true, gap: 1 });
    put('Адаптированный на русский язык опросник ASES', { size: 11, gap: 1 });
    const src = form.querySelector('.sc-source'), doi = src.querySelector('a')?.href || '';
    put(text(src).replace(/^.*?Источник:\s*/, 'Источник: ').replace(/\s*doi$/, '') + (doi ? ` ${doi}` : ''), { size: 8, gray: true, gap: 6 });
    put('Паспортная часть', { size: 12, bold: true, gap: 2 });
    for (const [k, n] of [['ФИО', 'ases-name'], ['Возраст', 'ases-age'], ['Дата заполнения', 'ases-date']]) {
      let v = form.elements[n].value.trim(); if (n === 'ases-date' && v) v = v.split('-').reverse().join('.');
      put(`${k}: ${v || '—'}`, { gap: 1 });
    }
    y += 4; put('Общая часть', { size: 12, bold: true, gap: 2 });
    answers().forEach(([q, a], i) => { if (y + 14 > BOTTOM) { doc.addPage(); y = M; } put(`${i + 1}) ${q}`, { bold: true, gap: .6 }); put(`Ответ: ${a}`, { gap: 2.6, x: M + 5, w: Wd - 5 }); }); // вопрос и ответ на одной странице
    y += 3;
    if (y + 40 > BOTTOM) { doc.addPage(); y = M; }
    put(`Общий балл по ASES: ${score === null ? 'не подсчитан (есть пропущенные вопросы)' : String(score).replace('.', ',')}`, { size: 13, bold: true, gap: 2 });
    bands.forEach(b => { const on = b.classList.contains('on'); doc.setDrawColor(on ? 20 : 150); doc.setFillColor(20); doc.circle(M + 1.4, y + 2.3, 1.1, on ? 'FD' : 'S'); put(text(b), { bold: on, gray: !on, gap: .8, x: M + 5, w: Wd - 5 }); });
    put('Максимальное значение 100 баллов, минимальное 0 баллов.', { size: 9, gray: true, gap: 6 });
    put(`Сформировано на сайте ${location.host} ${new Date().toLocaleDateString('ru-RU')}. Файл создан на вашем устройстве, ответы на сайт не отправлялись. Кованько Вячеслав Николаевич, травматолог-ортопед. Результат шкалы не диагноз: его оценивает врач на очном приёме.`, { size: 8, gray: true, gap: 0 });
    return doc.output('blob');
  };
  const fileName = () => `ASES-${(date.value || new Date().toISOString().slice(0, 10))}.pdf`;
  const ready = () => {
    if (score !== null) return true;
    msg.textContent = 'Ответьте на вопрос 7 и вопросы 8–17, чтобы посчитать балл.';
    const first = scored().find(n => val(n) === null); form.querySelector(`input[name="${first}"]`)?.closest('li')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  };
  const busy = (btn, on) => { btn.disabled = on; btn.setAttribute('aria-busy', on); };

  const dl = form.querySelector('[data-pdf]');
  dl.addEventListener('click', async () => {
    if (!ready()) return; busy(dl, true); msg.textContent = 'Готовим PDF…';
    try {
      const url = URL.createObjectURL(await makePdf()), a = Object.assign(document.createElement('a'), { href: url, download: fileName() });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      msg.textContent = 'PDF сохранён на устройство.';
    } catch { msg.textContent = 'Не получилось собрать PDF. Попробуйте ещё раз или распечатайте страницу.'; }
    busy(dl, false);
  });

  // «Отправить PDF»: системное меню «Поделиться» (почта, мессенджеры). Есть не во всех браузерах: где нет, кнопку не показываем
  const sh = form.querySelector('[data-share]');
  const probe = typeof File === 'function' && navigator.canShare?.({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] });
  if (sh && probe) {
    sh.hidden = false; form.querySelector('.sc-share-hint').hidden = false;
    sh.addEventListener('click', async () => {
      if (!ready()) return; busy(sh, true); msg.textContent = 'Готовим PDF…';
      try {
        const file = new File([await makePdf()], fileName(), { type: 'application/pdf' });
        await navigator.share({ files: [file], title: 'Шкала ASES' }); msg.textContent = '';
      } catch (e) { msg.textContent = e?.name === 'AbortError' ? '' : 'Не получилось открыть «Поделиться». Скачайте PDF и отправьте его как обычный файл.'; }
      busy(sh, false);
    });
  }
}
