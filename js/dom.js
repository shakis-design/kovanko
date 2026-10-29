export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const root = document.documentElement;
export const icon = id => `<svg class="ic" aria-hidden="true"><use href="${new URL('../img/sprite.svg', import.meta.url).pathname}#i-${id}"/></svg>`;
