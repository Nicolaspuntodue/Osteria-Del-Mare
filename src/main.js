import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initVetrina } from './vetrina.js';
import { initBanco } from './banco.js';
import { status } from './today.js';

gsap.registerPlugin(ScrollTrigger);
// a phone's address bar showing or hiding is not a real resize: recalculating then is what made the scroll catch
ScrollTrigger.config({ ignoreMobileResize: true });
const root = document.documentElement;
root.classList.add('js');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Display lines sized so their widest line runs margin to margin.
const fit = () => document.querySelectorAll('[data-fit]').forEach((el) => {
  el.style.fontSize = '100px';
  const r = document.createRange();
  r.selectNodeContents(el);
  el.style.fontSize = `${(100 * el.clientWidth) / r.getBoundingClientRect().width * 0.97}px`;
});
fit();
document.fonts.ready.then(() => { fit(); ScrollTrigger.refresh(); });
let fitW = innerWidth;
addEventListener('resize', () => { if (innerWidth !== fitW) { fitW = innerWidth; fit(); } });

// Open now?
const st = document.querySelector('[data-status]');
const tick = () => { const s = status(); st.textContent = `${s.text}.`; st.classList.toggle('is-open', s.open); };
tick();
setInterval(tick, 60_000);

// The press sentence: one name lit at a time
const names = [...document.querySelectorAll('[data-cycle] span:not(.lead)')];
let lit = 0;
names[0].classList.add('is-lit');
if (!reduce) setInterval(() => { names[lit].classList.remove('is-lit'); lit = (lit + 1) % names.length; names[lit].classList.add('is-lit'); }, 2000);

// Entrances: heading, then text, then picture, staggered per section
document.querySelectorAll('main section').forEach((sec) => {
  sec.querySelectorAll('h2:not(.people__h), [data-rise], .course__text, .dish, .person').forEach((el, i) => { el.dataset.rise = ''; el.style.setProperty('--d', `${Math.min(i, 4) * 0.08}s`); });
});
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -4% 0px' });
document.querySelectorAll('[data-rise]').forEach((el) => io.observe(el));

// WebGL vitrine; the photograph underneath stays if WebGL is missing
let room = null;
try { room = initVetrina(document.getElementById('room')); root.classList.add('webgl'); } catch (e) { console.warn('WebGL non disponibile', e); }

// The hero is a walk through the vitrine in three steps: the name, Daniele's words, the frollati.
const steps = [...document.querySelectorAll('.hero__step')];
let shown = -1;
const show = (i) => { if (i === shown) return; shown = i; steps.forEach((s, k) => s.classList.toggle('is-on', k === i)); };
show(0);

if (reduce) {
  room?.still(true);
} else {
  // in-page links scroll smoothly from JS; a CSS smooth scroll fights the finger on the way back up
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
  }));
  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (s) => { room?.set(s.progress); show(Math.min(2, Math.floor(s.progress * 3.2))); },
  });
  // keep the room running while any of the hero is on screen; isActive turns false at exactly scroll 0,
  // which froze the camera halfway when coming back to the top
  if (room) new IntersectionObserver(([e]) => room.run(e.isIntersecting)).observe(document.querySelector('.hero'));
  // the school appears with the menu and stays for the rest of the page; the introduction stays still
  try {
    const banco = initBanco(document.getElementById('banco'));
    banco.run(true);
    ScrollTrigger.create({ trigger: '#menu', start: 'top 60%', onEnter: () => banco.show(true), onLeaveBack: () => banco.show(false) });
    if (ScrollTrigger.isInViewport('#menu') || scrollY > document.querySelector('#menu').offsetTop - innerHeight) banco.show(true);
  } catch (e) { console.warn('Banco non disponibile', e); }
  gsap.fromTo('.foot__mark', { scale: 0.93 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  // Scattered pictures drift at their own speeds
  if (innerWidth > 820) document.querySelectorAll('[data-speed]').forEach((el) => {
    gsap.fromTo(el, { yPercent: -el.dataset.speed }, { yPercent: +el.dataset.speed, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}
