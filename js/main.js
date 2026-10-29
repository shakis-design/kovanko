import { root, $ } from './dom.js';
import { initUi } from './ui.js';
import { initForm } from './form.js';
import { initCookie } from './cookie.js';
import { initJoints } from './joints.js';

window.__ok = 1; // head-скрипт снимает js-ready, если модуль не загрузился
initUi();
initForm();
initCookie();
if ($("#joints-stage")) initJoints(); // на страницах разделов блока нет

const whenLoaded = f => (document.readyState === 'complete' ? f() : addEventListener('load', f, { once: true }));
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 300));
const back = () => { root.dataset.hero = 'poster'; };

// Three.js: после первого рендера и load, только при data-hero="3d" (режим выбирает head-скрипт, без видеокарты там же ставится постер).
// Любая ошибка (нет WebGL2, сеть) возвращает постер.
// Сборка 3D (модель, шейдеры, первый кадр) занимает поток на 50–350 мс: ждём, пока строки заголовка доедут, иначе въезд дёргается (28.10).
const afterIntro = f => Promise.race([
  Promise.all([...document.querySelectorAll('.hero h1 .line>span')].flatMap(s => s.getAnimations().map(a => a.finished))),
  new Promise(r => setTimeout(r, 1600)), // запас: анимации нет или она не закончилась
]).then(f, f);
if (root.dataset.hero === '3d' && $('#hero-edge')) {
  whenLoaded(() => afterIntro(() => idle(() => import('./hero-3d.js').then(m => m.initHero3d()).catch(back))));
}
// GSAP + ScrollTrigger: только от 1024 px и без reduced-motion, только где есть #process. Закреплённый блок меняет высоту страницы,
// поэтому поднимаем его сразу после load, а клик по якорю до этого момента ждёт инициализации.
const pinQuery = matchMedia('(min-width:1024px) and (prefers-reduced-motion:no-preference)');
const hasProcess = !!$('#process');
let procP = null;
const loadProcess = () => (procP ||= hasProcess && pinQuery.matches ? import('./process.js').then(m => m.initProcess()).catch(() => { $('#process').classList.remove('is-pinned'); }) : null); // не загрузилось: обычный список этапов
const jump = hash => { const t = hash.length > 1 && document.querySelector(hash); if (t) t.scrollIntoView({ behavior: 'instant' }); };
if (hasProcess) {
  // компьютер: раскладка закреплённого блока сразу, ещё до загрузки GSAP — иначе при переходе по /#process полсекунды виден список этапов, как на телефоне (29.10)
  if (pinQuery.matches) $('#process').classList.add('is-pinned');
  // тоже после въезда заголовка; но если пришли по ссылке с якорем (например «Все этапы приёма» → /#process), сразу:
  // иначе браузер ставит страницу к якорю, а через секунду закрепление меняет раскладку и она прыгает второй раз (29.10)
  // .jumping (ставит head-скрипт при якоре в адресе): содержимое скрыто, пока страница не встанет к якорю, без мигания верха (29.10)
  const startProcess = () => { const p = loadProcess(); if (!p) return root.classList.remove('jumping'); p.then(() => { if (location.hash) jump(location.hash); root.classList.remove('jumping'); }); };
  whenLoaded(() => (location.hash ? startProcess() : afterIntro(startProcess)));
  pinQuery.addEventListener('change', loadProcess);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || procP || !pinQuery.matches) return;
    e.preventDefault(); const h = a.getAttribute('href');
    loadProcess().then(() => jump(h));
  });
}
