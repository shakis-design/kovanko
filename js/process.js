import { gsap, ScrollTrigger } from '../vendor/gsap.min.js';
import { $, $$ } from './dom.js';

// Закреплённый блок «Как проходит приём» (M9, M10). Нативный скролл, без snap и перехвата колеса.
export function initProcess() {
  gsap.registerPlugin(ScrollTrigger);
  const sec = $('#process'), stage = $('.process__stage', sec), steps = $$('.step', sec), needle = $('#needle');
  const paper = $('#talon-paper'), tail = () => $('.t-foot', paper).offsetHeight + 28, ROW = 68;
  const count = $('#step-count'), rows = $$('.t-row', paper);
  // спидометр: центр и полный ход стрелки из разметки (кино-превью: 180° и дуга прогресса с метками этапов)
  const dial = needle?.ownerSVGElement, [ox, oy] = (dial?.dataset.origin || '48 50').split(' '), MAX = +(dial?.dataset.max || 150);
  const arc = $('#dial-arc'), marks = arc ? $$('#dial-marks circle') : [], nums = arc ? $$('.dns text', dial) : [];
  const arcs = arc ? $$('.dp', dial) : [], num = $('#dial-num'); // кольцо: дуга со свечением и номер этапа в центре
  const pinEl = stage; // превью: заголовок блока перенесён внутрь stage, закрепляется вместе с этапами

  const setStep = i => {
    steps.forEach((s, k) => (k === i ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')));
    count.textContent = `Этап ${i + 1} из 6`;
    if (num) num.textContent = '0' + (i + 1);
    marks.forEach((m, k) => { m.classList.toggle('done', k < i); m.classList.toggle('on', k === i); nums[k]?.classList.toggle('on', k === i); });
    const printed = i + 1;
    rows.forEach((r, k) => r.classList.toggle('is-next', k > i));
    paper.style.setProperty('--cut', printed < 6 ? (6 - printed) * ROW + tail() + 'px' : '0px');
  };

  ScrollTrigger.config({ ignoreMobileResize: true });
  gsap.matchMedia().add('(min-width:1024px) and (prefers-reduced-motion:no-preference)', () => {
    sec.classList.add('is-pinned');
    const end = () => '+=' + innerHeight * (document.documentElement.dataset.look === 'cine' ? 0.5 : 0.7) * 5; // кино-превью 29.10: короче на экран (аудит P1-2)
    const common = { trigger: pinEl, start: () => 'top top+=' + $('.site-header').offsetHeight, end, invalidateOnRefresh: true };
    ScrollTrigger.create({ ...common, pin: true, anticipatePin: 1, onUpdate: s => setStep(Math.min(5, Math.floor(s.progress * 6))) });
    gsap.fromTo(needle, { rotation: 0, svgOrigin: `${ox} ${oy}` }, { rotation: MAX, svgOrigin: `${ox} ${oy}`, ease: 'none', scrollTrigger: { ...common, scrub: 0.4 } });
    if (arcs.length) gsap.fromTo(arcs, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, ease: 'none', scrollTrigger: { ...common, scrub: 0.4 } }); // атрибут: GSAP не округляет, как px
    setStep(0);
    return () => { // ширина ушла ниже 1024 или включили reduced-motion: обычный список
      sec.classList.remove('is-pinned');
      steps.forEach(s => s.removeAttribute('aria-current'));
      paper.style.removeProperty('--cut');
    };
  });
}
