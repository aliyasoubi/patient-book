/* The landing page’s chart, scroll story and navigation. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  root.classList.add('js');

  const countFormat = new Intl.NumberFormat('fa-IR');

  // The app's drawings (tooth-shapes.ts), on a 40 × 64 box, roots up.
  const SHAPES = {
    incisor: {
      root: 'M15 32 C14 21 16 9 20 1.5 C24 9 26 21 25 32 Z',
      crown:
        'M13 30 C11.8 30.6 11.3 32.5 11.3 34.5 C11 44 11.2 52 12.6 58 C13.6 61.6 16.2 62.8 20 62.8 C23.8 62.8 26.4 61.6 27.4 58 C28.8 52 29 44 28.7 34.5 C28.7 32.5 28.2 30.6 27 30 C22.5 31.6 17.5 31.6 13 30 Z',
      detail: 'M16.2 36 C15.6 44 15.7 51.5 16.6 57',
      shade:
        'M25.5 33 C27.5 40 27.6 50 26 57.5 C25.4 60 24 61.6 22.5 62.2 C24.6 55 25 44 25.5 33 Z',
      width: 34,
    },
    lateral: {
      root: 'M15.5 32 C14.5 22 16.5 10 20 3 C23.5 10 25.5 22 24.5 32 Z',
      crown:
        'M13.5 30 C12.3 30.6 11.8 32.4 11.8 34.4 C11.6 43 11.9 50.5 13.2 56 C14.2 59.8 16.6 61.3 20 61.3 C23.4 61.3 25.8 59.8 26.8 56 C28.1 50.5 28.4 43 28.2 34.4 C28.2 32.4 27.7 30.6 26.5 30 C22.3 31.5 17.7 31.5 13.5 30 Z',
      detail: 'M16.6 36 C16 43 16.1 50 17 55',
      shade:
        'M25.6 33 C27.4 40 27.4 49 26 55.5 C25.4 58.3 24.1 60 22.6 60.8 C24.6 54 25 43 25.6 33 Z',
      width: 30,
    },
    canine: {
      root: 'M14.5 32 C13.5 19 16 6.5 20 0.5 C24 6.5 26.5 19 25.5 32 Z',
      crown:
        'M12.5 30 C11 31 10.4 33.8 10.4 37 C10.4 46 12 53 15 57.8 C16.9 60.8 18.5 63.2 20 63.8 C21.5 63.2 23.1 60.8 25 57.8 C28 53 29.6 46 29.6 37 C29.6 33.8 29 31 27.5 30 C22.9 31.6 17.1 31.6 12.5 30 Z',
      detail: 'M20 36 C19.6 44 19.7 52 20 60',
      shade: 'M26 33 C28.4 41 28 50 25.2 56 C23.8 59 22.4 61.6 21 63 C23.6 55 25.2 44 26 33 Z',
      width: 35,
    },
    premolar: {
      root: 'M12 32 C11.8 21 13.8 10 17 3.5 C18.6 8.5 19.6 14.5 20 18.5 C20.4 14.5 21.4 8.5 23 3.5 C26.2 10 28.2 21 28 32 Z',
      crown:
        'M10 30 C8.2 31 7.2 34 7.2 38 C7.2 46 8.2 52.6 11.2 56.8 C13 59.4 15.2 60.2 17.1 58.8 C18.5 57.7 19.3 58.1 20 59.1 C20.7 58.1 21.5 57.7 22.9 58.8 C24.8 60.2 27 59.4 28.8 56.8 C31.8 52.6 32.8 46 32.8 38 C32.8 34 31.8 31 30 30 C23.8 31.7 16.2 31.7 10 30 Z',
      detail: 'M13.8 54.4 C16.6 52.2 23.4 52.2 26.2 54.4',
      shade:
        'M28.5 33 C31 40 31 49 28.6 55 C27.6 57.4 26.4 58.8 25 59.4 C27.6 52 28.4 42 28.5 33 Z',
      width: 36,
    },
    molar: {
      root: 'M6.5 32 C6 21.5 7.6 10.5 10.6 3.5 C13.2 9.5 15.2 19.5 16.6 32 Z M23.4 32 C24.8 19.5 26.8 9.5 29.4 3.5 C32.4 10.5 34 21.5 33.5 32 Z M16.6 32 C17.4 23 18.6 16 20 11.5 C21.4 16 22.6 23 23.4 32 Z',
      crown:
        'M5 30 C3.2 31 2.6 35 2.6 39 C2.6 47 3.6 53 6.6 57 C8.6 59.6 11.2 60.2 13.2 58.2 C14.6 56.9 15.6 57.6 16.6 59 C18 60.6 20 60.6 21.4 59 C22.6 57.6 23.8 56.9 25.4 58.2 C27.8 60.2 31 59.6 33.4 57 C36.4 53 37.4 47 37.4 39 C37.4 35 36.8 31 35 30 C27 31.9 13 31.9 5 30 Z',
      detail: 'M8.8 54.2 C12.6 51.4 16.6 52.2 20 54.2 C23.4 52.2 27.4 51.4 31.2 54.2',
      shade: 'M33 33 C36 40 36 49 33.4 55.4 C32.4 57.4 31 58.8 29.4 59.4 C32 52 33 42 33 33 Z',
      width: 44,
    },
  };
  const LOWER = {
    incisor: { width: 26 },
    lateral: { width: 28 },
    premolar: { root: 'M14 32 C13.4 20 16 8.5 20 2.5 C24 8.5 26.6 20 26 32 Z', width: 34 },
    molar: {
      root: 'M6.5 32 C6 21 8.4 10 12 3.5 C14.8 10 16.8 20 17.8 32 Z M22.2 32 C23.2 20 25.2 10 28 3.5 C31.6 10 34 21 33.5 32 Z',
      width: 42,
    },
  };
  const kindOf = (p) =>
    p === 1 ? 'incisor' : p === 2 ? 'lateral' : p === 3 ? 'canine' : p <= 5 ? 'premolar' : 'molar';

  const mouth = $('[data-mouth]');
  const marked = new Set();
  const svgNS = 'http://www.w3.org/2000/svg';

  function path(cls, d) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    if (cls === 'crown' || cls === 'root') p.setAttribute('pathLength', '1');
    return p;
  }

  function buildJaw(lower) {
    const row = document.createElement('div');
    row.className = lower ? 'jaw jaw--lower' : 'jaw';
    // The patient's right (viewer's left) then left: 8 → 1, 1 → 8 (no 8s drawn).
    const order = [7, 6, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 6, 7];
    order.forEach((position, i) => {
      const side = i < 7 ? -1 : 1;
      const quadrant = lower ? (side < 0 ? 4 : 3) : side < 0 ? 1 : 2;
      const kind = kindOf(position);
      const shape = { ...SHAPES[kind], ...(lower ? LOWER[kind] : {}) };
      const tooth = document.createElement('button');
      tooth.type = 'button';
      tooth.className = 'tooth';
      tooth.dataset.fdi = String(quadrant * 10 + position);
      tooth.style.setProperty('--lift', `${Math.round((position - 1) ** 2 * 0.55)}px`);
      tooth.style.setProperty('--tilt', `${(lower ? -side : side) * (position - 1) * 1.6}deg`);
      tooth.style.setProperty('--i', String(lower ? 14 + i : i));
      tooth.setAttribute('aria-pressed', 'false');
      tooth.setAttribute('aria-label', 'دندان ' + countFormat.format(quadrant * 10 + position));
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 40 64');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.setProperty('--w', String(shape.width));
      svg.setAttribute('aria-hidden', 'true');
      svg.append(
        path('root', shape.root),
        path('crown', shape.crown),
        path('shade', shape.shade),
        path('detail', shape.detail),
      );
      tooth.append(svg);
      tooth.addEventListener('click', () => {
        stopDemo();
        toggle(tooth);
      });
      row.append(tooth);
    });
    return row;
  }

  function toggle(tooth, on = !tooth.classList.contains('is-on')) {
    tooth.classList.toggle('is-on', on);
    tooth.setAttribute('aria-pressed', String(on));
    if (on) marked.add(tooth.dataset.fdi);
    else marked.delete(tooth.dataset.fdi);
    updateCount();
  }

  function updateCount() {
    const out = $('[data-hero-count]');
    if (!out) return;
    const n = marked.size;
    out.textContent =
      n === 0 ? 'دندان‌ها را انتخاب کنید' : countFormat.format(n) + ' دندان انتخاب شده';
  }

  // The chart demonstrates itself once — three teeth for a bridge — until touched.
  let demoTimers = [];
  function stopDemo() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
  }

  if (mouth) {
    mouth.append(buildJaw(false), buildJaw(true));
    updateCount();
    const teeth = $$('.tooth', mouth);
    const pick = (fdi) => teeth.find((el) => el.dataset.fdi === fdi);
    if (!reduceMotion) {
      // Drawn on as the card comes into view, then the demo.
      requestAnimationFrame(() => requestAnimationFrame(() => mouth.classList.add('is-drawn')));
      setTimeout(() => mouth.classList.add('is-drawn'), 160);
      ['14', '15', '16'].forEach((fdi, k) =>
        demoTimers.push(setTimeout(() => toggle(pick(fdi), true), 1900 + k * 380)),
      );
    } else {
      mouth.classList.add('is-drawn');
    }
  }

  // Reveal, header and scroll story.

  const revealables = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    revealables.forEach((el) => observer.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-visible'));
  }

  const nav = $('[data-nav]');
  const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // The story: whichever step crosses the middle of the screen lights its screen.
  const steps = $$('[data-step]');
  const screens = $$('[data-screen]');
  let current = 0;
  function show(index) {
    if (index === current) return;
    current = index;
    steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
    screens.forEach((s, i) => {
      s.classList.toggle('is-active', i === index);
      s.classList.toggle('is-past', i < index);
    });
    if (index === 2) typeSearch();
  }
  if ('IntersectionObserver' in window) {
    const storyObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) show(Number(entry.target.dataset.step));
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    steps.forEach((s) => storyObserver.observe(s));
  }

  // The number typed into the search, one key at a time.
  const typed = $('[data-typed]');
  let typing;
  function typeSearch() {
    if (!typed || reduceMotion) return;
    clearInterval(typing);
    const full = '۰۹۱۲';
    let n = 0;
    typed.textContent = '';
    typing = setInterval(() => {
      n += 1;
      typed.textContent = full.slice(0, n);
      if (n >= full.length) clearInterval(typing);
    }, 140);
  }

  // The current section's link, underlined.
  const sectionLinks = $$('.nav__links a');
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          sectionLinks.forEach((a) =>
            a.classList.toggle('is-current', a.getAttribute('href') === `#${entry.target.id}`),
          );
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    sectionLinks.forEach((link) => {
      const section = document.getElementById(link.hash.slice(1));
      if (section) sectionObserver.observe(section);
    });
  }

  // Two frames so the hidden state paints first; a timer as well, for a tab
  // that is not drawing frames yet.
  const ready = () => root.classList.add('is-ready');
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 120);
})();
